import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { grpcError } from '@yunyan-live/nest-shared';
import {
  CheckinRecord,
  CheckinSession,
  LiveParticipant,
  LiveRoom,
  UserWatchTime
} from '@yunyan-live/shared';

/** 签到记录 method 取值 */
export const CHECKIN_METHOD_AUTO = 1;
export const CHECKIN_METHOD_MAKEUP = 2;

/** 允许的签到窗口（秒） */
export const CHECKIN_DURATIONS = [30, 60, 120] as const;

export interface CheckinSessionView {
  sessionId: string;
  roomId: string;
  teacherId: string;
  startedAt: string;
  deadlineAt: string;
  endedAt: string;
  attendeeCount: number;
  signedCount: number;
  makeupOpen: boolean;
  /** 1=进行中（未手动结束且未过期），2=已结束 */
  status: 1 | 2;
  mySigned: boolean;
  myMethod: number;
}

export interface CheckinRecordsView {
  items: Array<{
    userId: string;
    inDenominator: boolean;
    signed: boolean;
    method: number;
    respondedAt: string;
  }>;
  total: number;
  attendeeCount: number;
  signedCount: number;
  attendedCount: number;
}

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    @InjectRepository(CheckinSession)
    private sessionRepo: Repository<CheckinSession>,
    @InjectRepository(CheckinRecord)
    private recordRepo: Repository<CheckinRecord>,
    @InjectRepository(LiveRoom)
    private roomRepo: Repository<LiveRoom>,
    @InjectRepository(LiveParticipant)
    private participantRepo: Repository<LiveParticipant>,
    private dataSource: DataSource
  ) {}

  /** Q13 严格归属：房间所有者校验（gRPC 内执行，不信任网关） */
  private async requireOwnedRoom(roomId: string, teacherId: string): Promise<LiveRoom> {
    if (!roomId || !teacherId) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'roomId and userId are required');
    }
    const room = await this.roomRepo.findOne({ where: { roomId } });
    if (!room) throw grpcError(GrpcStatus.NOT_FOUND, '房间不存在');
    if (room.liveUserId !== teacherId) {
      throw grpcError(GrpcStatus.PERMISSION_DENIED, '仅房间所有者可操作签到');
    }
    return room;
  }

  private async isMember(roomId: string, userId: string): Promise<boolean> {
    const participant = await this.participantRepo.findOne({ where: { roomId, userId } });
    return Boolean(participant);
  }

  private deriveStatus(session: CheckinSession, now = new Date()): 1 | 2 {
    return session.endedAt || now >= session.deadlineAt ? 2 : 1;
  }

  private iso(value: Date | null | undefined): string {
    if (!value) return '';
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toView(
    session: CheckinSession,
    signedCount: number,
    mySigned = false,
    myMethod = 0
  ): CheckinSessionView {
    return {
      sessionId: session.id,
      roomId: session.roomId,
      teacherId: session.teacherId,
      startedAt: this.iso(session.startedAt),
      deadlineAt: this.iso(session.deadlineAt),
      endedAt: this.iso(session.endedAt),
      attendeeCount: session.attendeeCount,
      signedCount,
      makeupOpen: session.makeupOpen,
      status: this.deriveStatus(session),
      mySigned,
      myMethod
    };
  }

  private async signedCount(sessionId: string): Promise<number> {
    return this.recordRepo.count({ where: { sessionId } });
  }

  /**
   * 发起一轮签到：归属校验 → 同事务关闭未结束旧轮（Q11）→ 快照在线分母
   * （user_watch_times left_at IS NULL 且排除教师，评审修订⑤）→ 插入 session。
   */
  async create(roomId: string, duration: number, teacherId: string): Promise<CheckinSessionView> {
    const room = await this.requireOwnedRoom(roomId, teacherId);
    if (!(CHECKIN_DURATIONS as readonly number[]).includes(duration)) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'duration 仅支持 30/60/120 秒');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const now = new Date();
      await queryRunner.manager.update(
        CheckinSession,
        { roomId: room.roomId, endedAt: IsNull() },
        { endedAt: now }
      );

      const raw = await queryRunner.manager
        .getRepository(UserWatchTime)
        .createQueryBuilder('w')
        .select('DISTINCT w."userId"', 'userId')
        .where('w."roomId" = :roomId AND w."leftAt" IS NULL AND w."userId" <> :teacherId', {
          roomId: room.roomId,
          teacherId: room.liveUserId
        })
        .getRawMany<{ userId: string }>();
      const attendeeIds = raw.map(r => r.userId).filter(Boolean);

      const session = queryRunner.manager.create(CheckinSession, {
        roomId: room.roomId,
        teacherId: room.liveUserId,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + duration * 1000),
        endedAt: null,
        attendeeIds,
        attendeeCount: attendeeIds.length,
        makeupOpen: false
      });
      const saved = await queryRunner.manager.save(session);
      await queryRunner.commitTransaction();

      this.logger.log(`checkin started: room=${room.roomId} attendees=${attendeeIds.length}`);
      return this.toView(saved, 0);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 学生签到：membership 校验 → 窗口内/补签分支 → ON CONFLICT 幂等插入。
   * 关闭（endedAt 或过期）后仅 makeup=true 且 makeupOpen 允许补签（method=2）。
   */
  async respond(
    dto: { roomId: string; sessionId: string; makeup?: boolean },
    userId: string
  ): Promise<{ sessionId: string; signedCount: number; alreadySigned: boolean; makeup: boolean }> {
    if (!dto.sessionId || !userId) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'sessionId and userId are required');
    }
    const session = await this.sessionRepo.findOne({ where: { id: dto.sessionId } });
    if (!session || session.roomId !== dto.roomId) {
      throw grpcError(GrpcStatus.NOT_FOUND, '签到不存在');
    }
    if (!(await this.isMember(dto.roomId, userId))) {
      throw grpcError(GrpcStatus.PERMISSION_DENIED, '仅教室内学生可签到');
    }

    const now = new Date();
    const closed = Boolean(session.endedAt) || now >= session.deadlineAt;
    let method: number = CHECKIN_METHOD_AUTO;
    if (closed) {
      if (!dto.makeup) throw grpcError(GrpcStatus.FAILED_PRECONDITION, '签到已截止');
      if (!session.makeupOpen) throw grpcError(GrpcStatus.FAILED_PRECONDITION, '本轮未开启补签');
      method = CHECKIN_METHOD_MAKEUP;
    }

    const existing = await this.recordRepo.findOne({
      where: { sessionId: session.id, userId }
    });
    if (existing) {
      return {
        sessionId: session.id,
        signedCount: await this.signedCount(session.id),
        alreadySigned: true,
        makeup: existing.method === CHECKIN_METHOD_MAKEUP
      };
    }

    // UQ (sessionId,userId) + ON CONFLICT 幂等兜底并发重复提交
    await this.recordRepo
      .createQueryBuilder()
      .insert()
      .values({ sessionId: session.id, userId, respondedAt: now, method })
      .orIgnore()
      .execute();

    return {
      sessionId: session.id,
      signedCount: await this.signedCount(session.id),
      alreadySigned: false,
      makeup: method === CHECKIN_METHOD_MAKEUP
    };
  }

  /** 教师手动结束本轮（幂等：已 endedAt 不回写） */
  async end(roomId: string, sessionId: string, teacherId: string): Promise<CheckinSessionView> {
    const session = await this.requireSession(sessionId, roomId, teacherId);
    if (!session.endedAt) {
      session.endedAt = new Date();
      await this.sessionRepo.save(session);
    }
    return this.toView(session, await this.signedCount(session.id));
  }

  /** 教师为已关闭轮次开启补签（进行中不可开） */
  async openMakeup(
    roomId: string,
    sessionId: string,
    teacherId: string
  ): Promise<CheckinSessionView> {
    const session = await this.requireSession(sessionId, roomId, teacherId);
    const now = new Date();
    if (!session.endedAt && now < session.deadlineAt) {
      throw grpcError(GrpcStatus.FAILED_PRECONDITION, '签到进行中，无需补签');
    }
    if (!session.makeupOpen) {
      session.makeupOpen = true;
      await this.sessionRepo.save(session);
    }
    return this.toView(session, await this.signedCount(session.id));
  }

  private async requireSession(
    sessionId: string,
    roomId: string,
    teacherId: string
  ): Promise<CheckinSession> {
    if (!sessionId || !roomId || !teacherId) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'sessionId and userId are required');
    }
    await this.requireOwnedRoom(roomId, teacherId);
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.roomId !== roomId) {
      throw grpcError(GrpcStatus.NOT_FOUND, '签到不存在');
    }
    return session;
  }

  /** 初态水合：房间所有者或成员可读（照 CheckRoomAccess 口径） */
  async state(
    roomId: string,
    userId: string
  ): Promise<{ hasSession: boolean; isOwner: boolean; session: CheckinSessionView | null }> {
    if (!roomId || !userId) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'roomId and userId are required');
    }
    const room = await this.roomRepo.findOne({ where: { roomId } });
    if (!room) throw grpcError(GrpcStatus.NOT_FOUND, '房间不存在');
    const isOwner = room.liveUserId === userId;

    const session = await this.sessionRepo.findOne({
      where: { roomId },
      order: { startedAt: 'DESC' }
    });
    if (!session) return { hasSession: false, isOwner, session: null };
    if (!isOwner && !(await this.isMember(roomId, userId))) {
      throw grpcError(GrpcStatus.PERMISSION_DENIED, '无权查看该签到');
    }

    const record = await this.recordRepo.findOne({ where: { sessionId: session.id, userId } });
    return {
      hasSession: true,
      isOwner,
      session: this.toView(
        session,
        await this.signedCount(session.id),
        Boolean(record),
        record?.method ?? 0
      )
    };
  }

  /** 轮次列表（房间所有者，分页；签名计数按页聚合避免 N+1） */
  async listSessions(
    roomId: string,
    page: number,
    pageSize: number,
    teacherId: string
  ): Promise<{ items: CheckinSessionView[]; total: number }> {
    await this.requireOwnedRoom(roomId, teacherId);
    const [sessions, total] = await this.sessionRepo.findAndCount({
      where: { roomId },
      order: { startedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    if (sessions.length === 0) return { items: [], total };

    const counts = await this.recordRepo
      .createQueryBuilder('r')
      .select('r."sessionId"', 'sessionId')
      .addSelect('COUNT(*)', 'cnt')
      .where('r."sessionId" IN (:...ids)', { ids: sessions.map(s => s.id) })
      .groupBy('r."sessionId"')
      .getRawMany<{ sessionId: string; cnt: string }>();
    const countMap = new Map(counts.map(c => [c.sessionId, Number(c.cnt)]));

    return {
      items: sessions.map(s => this.toView(s, countMap.get(s.id) ?? 0)),
      total
    };
  }

  /** 明细：应到名单为行 + 分母外签到附加行（评审修订⑤出勤率口径） */
  async records(sessionId: string, userId: string): Promise<CheckinRecordsView> {
    if (!sessionId || !userId) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'sessionId and userId are required');
    }
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw grpcError(GrpcStatus.NOT_FOUND, '签到不存在');
    const isOwner =
      (await this.roomRepo.findOne({ where: { roomId: session.roomId } }))?.liveUserId === userId;
    if (!isOwner && !(await this.isMember(session.roomId, userId))) {
      throw grpcError(GrpcStatus.PERMISSION_DENIED, '无权查看签到明细');
    }

    const records = await this.recordRepo.find({ where: { sessionId } });
    const recordMap = new Map(records.map(r => [r.userId, r]));
    const attendees = session.attendeeIds ?? [];

    const items: CheckinRecordsView['items'] = attendees.map(userId => {
      const record = recordMap.get(userId);
      return {
        userId,
        inDenominator: true,
        signed: Boolean(record),
        method: record?.method ?? 0,
        respondedAt: this.iso(record?.respondedAt)
      };
    });
    const attendeeSet = new Set(attendees);
    for (const record of records) {
      if (attendeeSet.has(record.userId)) continue;
      items.push({
        userId: record.userId,
        inDenominator: false,
        signed: true,
        method: record.method,
        respondedAt: this.iso(record.respondedAt)
      });
    }

    const attendedCount = items.filter(i => i.inDenominator && i.signed).length;
    return {
      items,
      total: items.length,
      attendeeCount: session.attendeeCount,
      signedCount: records.length,
      attendedCount
    };
  }
}
