import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, Not, In } from 'typeorm';
import { decodeCursor, grpcError, normalizePageQuery } from '@yunyan-live/nest-shared';
import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  BoardSnapshot,
  BoardToolUsage,
  Courseware,
  LiveParticipant,
  LiveRoom,
  LiveTransferCode,
  UserWatchTime,
  VideoRecording
} from '@yunyan-live/shared';
import { JanusService } from '../janus/janus.service';

// 快照滚动保留：每房间保留最近 N 条（Q8 拍板后固化口径，暂按报告默认 10）
const BOARD_SNAPSHOT_KEEP = Math.max(1, Number(process.env.BOARD_SNAPSHOT_KEEP) || 10);

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    @InjectRepository(LiveRoom)
    private repo: Repository<LiveRoom>,
    @InjectRepository(LiveParticipant)
    private participantRepo: Repository<LiveParticipant>,
    @InjectRepository(LiveTransferCode)
    private transferCodeRepo: Repository<LiveTransferCode>,
    @InjectRepository(VideoRecording)
    private videoRepo: Repository<VideoRecording>,
    @InjectRepository(UserWatchTime)
    private watchTimeRepo: Repository<UserWatchTime>,
    @InjectRepository(Courseware)
    private coursewareRepo: Repository<Courseware>,
    @InjectRepository(BoardSnapshot)
    private boardSnapshotRepo: Repository<BoardSnapshot>,
    @InjectRepository(BoardToolUsage)
    private boardToolUsageRepo: Repository<BoardToolUsage>,
    private dataSource: DataSource,
    private janusService: JanusService
  ) {}

  private generateRoomId(): string {
    return `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async generateJoinCode(type: number): Promise<string> {
    const prefix = type === 0 ? 'S' : 'L';
    let code: string;
    let exists: boolean;
    do {
      const body = Math.random().toString(36).slice(2, 10).toUpperCase();
      code = prefix + body;
      const room = await this.repo.findOne({ where: { joinCode: code } });
      exists = !!room;
    } while (exists);
    return code;
  }

  async create(
    dto: {
      title: string;
      type?: number;
      startTime: string;
      duration?: number;
      roomId?: string;
    },
    userId: string
  ): Promise<LiveRoom> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const roomId = dto.roomId || this.generateRoomId();
      const joinCode = await this.generateJoinCode(dto.type ?? 0);

      const room = this.repo.create({
        roomId,
        title: dto.title,
        joinCode,
        type: dto.type ?? 0,
        status: 1,
        startTime: new Date(Number(dto.startTime)),
        duration: dto.duration ?? 60,
        liveUserId: userId
      });

      await queryRunner.manager.save(room);
      await queryRunner.commitTransaction();

      await this.janusService.createRoom(roomId, dto.title);

      return room;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(dto: {
    roomId: string;
    title?: string;
    type?: number;
    startTime?: string;
    duration?: number;
  }): Promise<LiveRoom> {
    const room = await this.repo.findOne({ where: { roomId: dto.roomId } });
    if (!room) {
      throw grpcError(GrpcStatus.NOT_FOUND, '房间不存在');
    }
    if (room.status !== 1) {
      throw grpcError(GrpcStatus.FAILED_PRECONDITION, '只有未开播的房间才能编辑');
    }

    if (dto.title !== undefined) room.title = dto.title;
    if (dto.type !== undefined) room.type = dto.type;
    if (dto.startTime !== undefined) room.startTime = new Date(Number(dto.startTime));
    if (dto.duration !== undefined) room.duration = dto.duration;

    return this.repo.save(room);
  }

  async join(dto: { joinCode: string; liveUserId?: string }) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const room = await queryRunner.manager.findOne(LiveRoom, {
        where: { joinCode: dto.joinCode }
      });

      if (!room) throw new NotFoundException('房间不存在');

      if (dto.liveUserId) {
        const existing = await queryRunner.manager.findOne(LiveParticipant, {
          where: { userId: dto.liveUserId, roomId: room.roomId }
        });
        if (!existing) {
          const participant = this.participantRepo.create({
            userId: dto.liveUserId,
            roomId: room.roomId
          });
          await queryRunner.manager.save(participant);
        }

        const openWatchTime = await queryRunner.manager.findOne(UserWatchTime, {
          where: { userId: dto.liveUserId, roomId: room.roomId, leftAt: null }
        });
        if (!openWatchTime) {
          const wt = this.watchTimeRepo.create({
            userId: dto.liveUserId,
            roomId: room.roomId,
            joinedAt: new Date()
          });
          await queryRunner.manager.save(wt);
          const online = await queryRunner.manager.count(UserWatchTime, {
            where: { roomId: room.roomId, leftAt: null }
          });
          if (room.liveNums !== online) {
            room.liveNums = online;
            await queryRunner.manager.save(room);
          }
        }
      }

      await queryRunner.commitTransaction();

      const roleName = dto.liveUserId && room.liveUserId === dto.liveUserId ? 'teacher' : 'student';
      return {
        liveUserId: dto.liveUserId,
        roomId: room.roomId,
        roleName,
        joinCode: room.joinCode,
        liveType: room.type === 0 ? 'smallClass' : 'largeClass',
        status: room.status
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async showRoom(roomId: string) {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) throw new NotFoundException('房间不存在');
    return {
      ...room,
      videoList: [],
      teacherCode: room.joinCode,
      studentCode: room.joinCode
    };
  }

  async changeStatus(dto: { roomId: string; status: number }) {
    const room = await this.repo.findOne({ where: { roomId: dto.roomId } });
    if (!room) throw new NotFoundException('房间不存在');

    room.status = dto.status;
    if (dto.status === 2) {
      room.liveStartedAt = new Date();
    }
    await this.repo.save(room);
    return room;
  }

  async cmsList(
    page = 1,
    pageSize = 10,
    status?: number,
    liveUserId?: string,
    searchName?: string,
    startTime?: string,
    endTime?: string,
    type?: number
  ) {
    const qb = this.repo.createQueryBuilder('live');
    if (status !== undefined && status > 0) {
      qb.andWhere('live.status = :status', { status });
    }
    if (liveUserId) {
      qb.andWhere('live.liveUserId = :liveUserId', { liveUserId });
    }
    if (searchName) {
      qb.andWhere('live.title LIKE :searchName', { searchName: `%${searchName}%` });
    }
    if (startTime) {
      qb.andWhere('live.startTime >= :startTime', { startTime: new Date(Number(startTime)) });
    }
    if (endTime) {
      qb.andWhere('live.startTime <= :endTime', { endTime: new Date(Number(endTime)) });
    }
    if (type !== undefined && type !== null && type >= 0) {
      qb.andWhere('live.type = :type', { type });
    }
    qb.orderBy('live.createdAt', 'DESC');
    qb.skip((page - 1) * pageSize);
    qb.take(pageSize);
    const [rawList, total] = await qb.getManyAndCount();
    const list = rawList.map(item => ({
      ...item,
      teacherCode: item.joinCode,
      studentCode: item.joinCode
    }));
    return { list, total, page, pageSize };
  }

  async cmsDetail(roomId: string) {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) throw new NotFoundException('房间不存在');
    return {
      ...room,
      teacherCode: room.joinCode,
      studentCode: room.joinCode
    };
  }

  async delete(roomId: string) {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) throw new NotFoundException('房间不存在');

    await this.janusService.destroyRoom(roomId);
    await this.repo.softDelete(roomId);
    return { success: true };
  }

  async updateCode(roomId: string): Promise<string> {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) throw new NotFoundException('房间不存在');

    room.joinCode = await this.generateJoinCode(room.type);
    await this.repo.save(room);
    return room.joinCode;
  }

  async getStudentRooms(userId: string, page = 1, pageSize = 10, cursor?: string) {
    // F16 SQL 化：JOIN 过滤软删房间（旧实现 total 含软删房间导致 total 与页内容不一致）；
    // 排序补 id tiebreaker；cursor 走 keyset（(joined_at,id)<cursor），非法 cursor 回落 OFFSET。
    const pager = normalizePageQuery({ page, pageSize });
    const decoded = decodeCursor(cursor);

    const baseParams: unknown[] = [userId];
    let keyset = '';
    if (decoded) {
      baseParams.push(new Date(decoded.timeMs), decoded.id);
      keyset = ' AND (p."joinedAt", p.id) < ($2::timestamptz, $3::uuid)';
    }
    const from = `
      FROM live_participants p
      JOIN live_rooms r ON r."roomId" = p."roomId" AND r."deletedAt" IS NULL
      WHERE p."userId" = $1${keyset}`;
    const countSql = `SELECT COUNT(*)::int AS total ${from}`;

    const pageParams = [...baseParams, pager.pageSize, (pager.page - 1) * pager.pageSize];
    const limitIdx = baseParams.length + 1;
    const offsetIdx = baseParams.length + 2;
    const pageSql = `
      SELECT p."joinedAt", r."roomId", r.title, r."liveUserId", r."joinCode",
             r.status, r."startTime", r.type
      ${from}
      ORDER BY p."joinedAt" DESC, p.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const [pageRows, countRows] = await Promise.all([
      this.dataSource.manager.query(pageSql, pageParams),
      this.dataSource.manager.query(countSql, baseParams)
    ]);
    const rows = (pageRows ?? []) as Record<string, unknown>[];
    const items = rows.map(r => ({
      id: r.roomId as string,
      roomId: r.roomId as string,
      title: r.title as string,
      liveUserId: r.liveUserId as string,
      joinCode: r.joinCode as string,
      status: r.status as number,
      startTime: r.startTime as Date,
      type: r.type as number,
      joinedAt: new Date(r.joinedAt as string | Date)
    }));
    return { items, total: Number((countRows as Record<string, unknown>[])[0]?.total ?? 0) };
  }

  async leaveRoom(userId: string, roomId: string) {
    const wt = await this.watchTimeRepo.findOne({
      where: { userId, roomId, leftAt: null }
    });
    if (wt) {
      wt.leftAt = new Date();
      await this.watchTimeRepo.save(wt);
      await this.syncLiveNums(roomId);
    }

    return { success: true };
  }

  private async syncLiveNums(roomId: string) {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) return;
    const online = await this.watchTimeRepo.count({ where: { roomId, leftAt: null } });
    if (room.liveNums !== online) {
      room.liveNums = online;
      await this.repo.save(room);
    }
  }

  async batchLeave(userId: string, roomIds: string[]) {
    const participants = await this.participantRepo.find({
      where: roomIds.map(roomId => ({ userId, roomId }))
    });
    if (participants.length > 0) {
      await this.participantRepo.remove(participants);
    }
    for (const roomId of roomIds) {
      const wt = await this.watchTimeRepo.findOne({
        where: { userId, roomId, leftAt: null }
      });
      if (wt) {
        wt.leftAt = new Date();
        await this.watchTimeRepo.save(wt);
        await this.syncLiveNums(roomId);
      }
    }
    return { success: true };
  }

  async getParticipants(roomId: string) {
    const participants = await this.participantRepo.find({
      where: { roomId },
      order: { joinedAt: 'DESC' }
    });
    return participants;
  }

  private async generateTransferCode(): Promise<string> {
    let code: string;
    let exists: boolean;
    do {
      const body = Math.random().toString(36).slice(2, 10).toUpperCase();
      code = 'T' + body;
      const existing = await this.transferCodeRepo.findOne({ where: { code } });
      exists = !!existing;
    } while (exists);
    return code;
  }

  async generateRoomTransferCode(roomId: string, targetUserId: string) {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) throw grpcError(GrpcStatus.NOT_FOUND, '房间不存在');
    if (room.status !== 1) throw grpcError(GrpcStatus.INVALID_ARGUMENT, '只有未开播的房间才能转移');

    await this.transferCodeRepo.update({ roomId, targetUserId, status: 0 }, { status: 2 });

    const code = await this.generateTransferCode();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const transferCode = this.transferCodeRepo.create({
      code,
      roomId,
      targetUserId,
      status: 0,
      expiresAt
    });
    await this.transferCodeRepo.save(transferCode);

    return { code, expiresAt: expiresAt.toISOString() };
  }

  async executeRoomTransfer(roomId: string, code: string, fromUserId: string) {
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) throw grpcError(GrpcStatus.NOT_FOUND, '房间不存在');
    if (room.status !== 1) throw grpcError(GrpcStatus.INVALID_ARGUMENT, '只有未开播的房间才能转移');
    if (room.liveUserId !== fromUserId)
      throw grpcError(GrpcStatus.PERMISSION_DENIED, '只能转移自己的直播间');

    const transferCode = await this.transferCodeRepo.findOne({ where: { code } });
    if (!transferCode) throw grpcError(GrpcStatus.INVALID_ARGUMENT, '转移码无效');
    if (transferCode.status !== 0)
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, '转移码已使用或已过期');
    if (transferCode.expiresAt < new Date())
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, '转移码已过期');
    if (transferCode.roomId !== roomId)
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, '转移码与房间不匹配');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      room.liveUserId = transferCode.targetUserId;
      await queryRunner.manager.save(room);

      transferCode.status = 1;
      await queryRunner.manager.save(transferCode);

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async saveVideoRecording(dto: {
    roomId: string;
    filePath: string;
    fileName: string;
    fileSize: number;
    duration: number;
    recordType: number;
    teacherName: string;
  }) {
    const recording = this.videoRepo.create({
      roomId: dto.roomId,
      filePath: dto.filePath,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      duration: dto.duration,
      recordType: dto.recordType,
      teacherName: dto.teacherName
    });
    await this.videoRepo.save(recording);
    return { success: true };
  }

  async getVideoList(dto: {
    page?: number;
    pageSize?: number;
    liveUserId?: string;
    searchName?: string;
    startTime?: string;
    endTime?: string;
    type?: number;
    cursor?: string;
  }) {
    // F16 SQL 化（口径经产品拍板）：仅含 ≥1 条录制的房间（INNER JOIN，0 录制房间不出现）；
    // 排序保持 r.created_at DESC（补 room_id tiebreaker）；count/min 直接进 SQL，不再全量捞内存。
    const pager = normalizePageQuery({ page: dto.page, pageSize: dto.pageSize });
    const filters: string[] = ['r."deletedAt" IS NULL'];
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (dto.liveUserId) filters.push(`r."liveUserId" = ${add(dto.liveUserId)}`);
    if (dto.searchName) filters.push(`r.title LIKE ${add(`%${dto.searchName}%`)}`);
    if (dto.startTime) {
      filters.push(`r."startTime" >= ${add(new Date(Number(dto.startTime)))}`);
    }
    if (dto.endTime) filters.push(`r."startTime" <= ${add(new Date(Number(dto.endTime)))}`);
    if (dto.type !== undefined && dto.type !== null && dto.type >= 0) {
      filters.push(`r.type = ${add(dto.type)}`);
    }
    const where = `WHERE ${filters.join(' AND ')}`;
    const groupBase = `
      FROM live_rooms r
      JOIN video_recordings v ON v."roomId" = r."roomId"
      ${where}`;

    // total = 过滤后有录制的房间数（不随 cursor 截断）
    const countSql = `
      SELECT COUNT(*)::int AS total FROM (
        SELECT r."roomId"
        ${groupBase}
        GROUP BY r."roomId", r.title, r.type, r."createdAt"
      ) g`;

    // keyset 只进页查询
    const pageParams = [...params];
    const decoded = decodeCursor(dto.cursor);
    let keyset = '';
    if (decoded) {
      pageParams.push(new Date(decoded.timeMs), decoded.id);
      keyset = ` AND (r."createdAt", r."roomId") < ($${pageParams.length - 1}::timestamptz, $${pageParams.length}::text)`;
    }
    pageParams.push(pager.pageSize, (pager.page - 1) * pager.pageSize);
    const limitIdx = pageParams.length - 1;
    const offsetIdx = pageParams.length;
    const pageSql = `
      SELECT r."roomId", r.title, r.type, COUNT(*)::int AS count,
             (EXTRACT(EPOCH FROM MIN(v."createdAt")) * 1000)::bigint AS first_recorded_ms
      ${groupBase}${keyset}
      GROUP BY r."roomId", r.title, r.type, r."createdAt"
      ORDER BY r."createdAt" DESC, r."roomId" DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const [pageRows, countRows] = await Promise.all([
      this.dataSource.manager.query(pageSql, pageParams),
      this.dataSource.manager.query(countSql, params)
    ]);
    const rows = (pageRows ?? []) as Record<string, unknown>[];
    const items = rows.map(r => ({
      roomId: r.roomId as string,
      title: r.title as string,
      teacherName: '',
      type: r.type as number,
      startTime: r.first_recorded_ms != null ? String(Number(r.first_recorded_ms)) : '',
      count: Number(r.count)
    }));
    return { items, total: Number((countRows as Record<string, unknown>[])[0]?.total ?? 0) };
  }

  async getVideoDetail(dto: { roomId: string; startTime?: string; endTime?: string }) {
    const qb = this.videoRepo
      .createQueryBuilder('v')
      .where('v.roomId = :roomId', { roomId: dto.roomId });

    if (dto.startTime) {
      qb.andWhere('v.createdAt >= :startTime', { startTime: new Date(Number(dto.startTime)) });
    }
    if (dto.endTime) {
      qb.andWhere('v.createdAt <= :endTime', { endTime: new Date(Number(dto.endTime)) });
    }

    qb.orderBy('v.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map(v => ({
        id: v.id,
        roomId: v.roomId,
        filePath: v.filePath,
        fileName: v.fileName,
        fileSize: v.fileSize,
        duration: v.duration,
        recordType: v.recordType,
        teacherName: v.teacherName,
        createdAt:
          v.createdAt instanceof Date ? v.createdAt.getTime().toString() : String(v.createdAt || '')
      })),
      total
    };
  }

  async deleteVideoByRoomIds(roomIds: string[]) {
    if (roomIds.length === 0) return { success: true };
    await this.videoRepo.delete(roomIds.map(id => ({ roomId: id })));
    return { success: true };
  }

  async deleteVideoByVideoIds(videoIds: string[]) {
    if (videoIds.length === 0) return { success: true };
    await this.videoRepo.delete(videoIds);
    return { success: true };
  }

  /** S4 归属映射：video_ids → {video_id, room_id}（网关侧删除/下载前房间归属断言） */
  async getVideoRoomMap(videoIds: string[]) {
    if (videoIds.length === 0) return [] as Array<{ videoId: string; roomId: string }>;
    const rows = await this.videoRepo.find({
      where: { id: In(videoIds) },
      select: { id: true, roomId: true }
    });
    return rows.map(r => ({ videoId: r.id, roomId: r.roomId }));
  }

  /** S4 归属映射：courseware id → room_id；不存在 NOT_FOUND（网关映射 404） */
  async getCoursewareRoom(id: string) {
    const cw = await this.coursewareRepo.findOne({
      where: { id },
      select: { id: true, roomId: true }
    });
    if (!cw) throw grpcError(GrpcStatus.NOT_FOUND, '课件不存在');
    return cw.roomId;
  }

  async saveCourseware(dto: {
    roomId: string;
    filename: string;
    filext: string;
    filesize: number;
    fileurl: string;
    createUserId?: string;
  }) {
    const courseware = this.coursewareRepo.create({
      roomId: dto.roomId,
      filename: dto.filename,
      filext: dto.filext,
      filesize: dto.filesize,
      fileurl: dto.fileurl,
      createUserId: dto.createUserId || ''
    });
    await this.coursewareRepo.save(courseware);
    return { id: courseware.id };
  }

  async listCoursewares(roomId: string) {
    const items = await this.coursewareRepo.find({
      where: { roomId },
      order: { createdAt: 'ASC' }
    });
    return {
      items: items.map(c => ({
        id: c.id,
        roomId: c.roomId,
        filename: c.filename,
        filext: c.filext,
        filesize: c.filesize,
        fileurl: c.fileurl,
        createdAt:
          c.createdAt instanceof Date ? c.createdAt.getTime().toString() : String(c.createdAt || '')
      })),
      total: items.length
    };
  }

  async deleteCourseware(id: string) {
    if (!id) throw new Error('courseware id is required');
    const result = await this.coursewareRepo.delete(id);
    // affected=0 视为「没删到」，抛错让调用方看到失败，避免静默成功
    if (!result?.affected) throw new Error('courseware not found or already deleted');
    return { success: true };
  }

  async saveBoardSnapshot(dto: {
    roomId: string;
    lessonId?: string;
    formatVersion?: number;
    data: Uint8Array;
  }) {
    if (!dto.roomId) throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'roomId is required');
    const bytes = Buffer.from(dto.data);
    const snapshot = this.boardSnapshotRepo.create({
      roomId: dto.roomId,
      lessonId: dto.lessonId || null,
      formatVersion: dto.formatVersion || 1,
      data: bytes,
      size: bytes.length
    });
    await this.boardSnapshotRepo.save(snapshot);

    // 滚动保留：仅当达到上限才裁剪，裁掉「同房间且不在最新 N 条内」的旧快照
    const keep = await this.boardSnapshotRepo.find({
      where: { roomId: dto.roomId },
      order: { createdAt: 'DESC' },
      select: ['id'],
      take: BOARD_SNAPSHOT_KEEP
    });
    if (keep.length >= BOARD_SNAPSHOT_KEEP) {
      await this.boardSnapshotRepo.delete({
        roomId: dto.roomId,
        id: Not(In(keep.map(s => s.id)))
      });
    }

    return { id: snapshot.id };
  }

  async listBoardSnapshots(dto: { roomId: string; cursor?: string; limit?: number }) {
    if (!dto.roomId) throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'roomId is required');
    const limit = Math.min(Math.max(Number(dto.limit) || 20, 1), 100);
    const where: Record<string, unknown> = { roomId: dto.roomId };
    if (dto.cursor) where.createdAt = LessThan(new Date(dto.cursor));
    const rows = await this.boardSnapshotRepo.find({
      where,
      order: { createdAt: 'DESC' },
      select: ['id', 'roomId', 'lessonId', 'formatVersion', 'size', 'createdAt'],
      take: limit + 1
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(s => ({
      id: s.id,
      roomId: s.roomId,
      lessonId: s.lessonId,
      formatVersion: s.formatVersion,
      size: s.size,
      createdAt:
        s.createdAt instanceof Date ? s.createdAt.getTime().toString() : String(s.createdAt || '')
    }));
    return { items, hasMore };
  }

  async getBoardSnapshot(id: string) {
    if (!id) throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'snapshot id is required');
    const snapshot = await this.boardSnapshotRepo.findOne({ where: { id } });
    if (!snapshot) throw grpcError(GrpcStatus.NOT_FOUND, 'board snapshot not found');
    return this.mapBoardSnapshot(snapshot);
  }

  async getLatestBoardSnapshot(roomId: string) {
    if (!roomId) throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'roomId is required');
    const snapshot = await this.boardSnapshotRepo.findOne({
      where: { roomId },
      order: { createdAt: 'DESC' }
    });
    if (!snapshot) throw grpcError(GrpcStatus.NOT_FOUND, 'board snapshot not found');
    return this.mapBoardSnapshot(snapshot);
  }

  private mapBoardSnapshot(snapshot: BoardSnapshot) {
    return {
      id: snapshot.id,
      roomId: snapshot.roomId,
      lessonId: snapshot.lessonId,
      formatVersion: snapshot.formatVersion,
      data: snapshot.data,
      createdAt:
        snapshot.createdAt instanceof Date
          ? snapshot.createdAt.getTime().toString()
          : String(snapshot.createdAt || '')
    };
  }

  /**
   * D8 白板房间访问校验：教师 = rooms.liveUserId 匹配，学生 = live_participants 存在。
   * 房间不存在（含软删）或两者皆不匹配 → 拒绝；调用方（yjs-ws）用于握手 4403 与写权限判定。
   */
  async checkRoomAccess(roomId: string, userId: string) {
    if (!roomId || !userId) {
      throw grpcError(GrpcStatus.INVALID_ARGUMENT, 'roomId and userId are required');
    }
    const room = await this.repo.findOne({ where: { roomId } });
    if (!room) return { allowed: false, isTeacher: false };
    if (room.liveUserId === userId) return { allowed: true, isTeacher: true };
    const participant = await this.participantRepo.findOne({ where: { roomId, userId } });
    return { allowed: Boolean(participant), isTeacher: false };
  }

  async getUserWatchTimeList(dto: {
    page?: number;
    pageSize?: number;
    roomId?: string;
    searchName?: string;
    cursor?: string;
  }) {
    // F16 SQL 化：Q1=当页行（LIMIT/OFFSET 或 keyset）；Q2=过滤全量聚合（total+totalTime）。
    // totalTime 是全量口径，绝不可随分页截断（旧实现靠"先全量捞再 slice"偶然成立，大表不可用）。
    const pager = normalizePageQuery({ page: dto.page, pageSize: dto.pageSize });
    const filters: string[] = ['r."deletedAt" IS NULL'];
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (dto.roomId) filters.push(`w.room_id = ${add(dto.roomId)}`);
    if (dto.searchName) filters.push(`r.title LIKE ${add('%' + dto.searchName + '%')}`);
    const from = `
      FROM user_watch_times w
      JOIN live_rooms r ON r."roomId" = w.room_id AND r."deletedAt" IS NULL
      WHERE ${filters.join(' AND ')}`;

    // Q2 聚合（全量口径，与旧 JS reduce 语义等价：left_at NULL 计至 now）
    const aggSql = `
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(
               CASE WHEN w.left_at IS NULL
                 THEN floor(EXTRACT(EPOCH FROM (now() - w.joined_at)))
                 ELSE floor(EXTRACT(EPOCH FROM (w.left_at - w.joined_at)))
               END
             ), 0)::bigint AS total_time
      ${from}`;

    // Q1 分页（补 id tiebreaker 保证页间稳定；cursor 走 keyset）
    const pageParams = [...params];
    const decoded = decodeCursor(dto.cursor);
    let keyset = '';
    if (decoded) {
      pageParams.push(new Date(decoded.timeMs), decoded.id);
      keyset = ` AND (w.created_at, w.id) < ($${pageParams.length - 1}::timestamptz, $${pageParams.length}::uuid)`;
    }
    pageParams.push(pager.pageSize, (pager.page - 1) * pager.pageSize);
    const limitIdx = pageParams.length - 1;
    const offsetIdx = pageParams.length;
    const pageSql = `
      SELECT w.id, w.user_id, w.room_id, w.joined_at, w.left_at, w.created_at,
             r.title AS room_title, (w.left_at IS NULL) AS is_online
      ${from}${keyset}
      ORDER BY w.created_at DESC, w.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const [pageRows, aggRows] = await Promise.all([
      this.dataSource.manager.query(pageSql, pageParams),
      this.dataSource.manager.query(aggSql, params)
    ]);
    const rows = (pageRows ?? []) as Record<string, unknown>[];
    const agg = (aggRows as Record<string, unknown>[])[0] ?? {};
    const items = rows.map(i => ({
      id: i.id as string,
      userId: i.user_id as string,
      roomId: i.room_id as string,
      joinedAt: new Date(i.joined_at as string | Date),
      leftAt: i.left_at ? new Date(i.left_at as string | Date) : null,
      createdAt: new Date(i.created_at as string | Date),
      roomTitle: i.room_title as string,
      isOnline: i.is_online === true || i.is_online === 'true'
    }));
    return {
      items,
      total: Number(agg.total ?? 0),
      totalTime: Number(agg.total_time ?? 0)
    };
  }

  // F1：教师数据统计（口径见台账 GAP-F1）。
  // 总观看人数 = 去重 userId；总直播时长 = Σ(left−joined)，left_at NULL 计至统计时刻；
  // 断线重连 = 多条不重叠区间，DISTINCT/SUM 天然不重复累加；日期范围同时作用于卡片与 series；
  // 教师仅见本人场次（r."liveUserId" = $1，身份来自 gRPC metadata）。
  async getTeacherStatistics(userId: string, startTime?: string, endTime?: string) {
    const params: unknown[] = [userId];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const dateFilters: string[] = [];
    if (startTime) dateFilters.push(`w.joined_at >= ${add(new Date(Number(startTime)))}`);
    if (endTime) dateFilters.push(`w.joined_at <= ${add(new Date(Number(endTime)))}`);
    const where = `WHERE r."liveUserId" = $1${
      dateFilters.length ? ' AND ' + dateFilters.join(' AND ') : ''
    }`;
    const durationExpr = `CASE WHEN w.left_at IS NULL
                 THEN floor(EXTRACT(EPOCH FROM (now() - w.joined_at)))
                 ELSE floor(EXTRACT(EPOCH FROM (w.left_at - w.joined_at)))
               END`;
    const from = `
      FROM user_watch_times w
      JOIN live_rooms r ON r."roomId" = w.room_id AND r."deletedAt" IS NULL
      ${where}`;

    const cardsSql = `
      SELECT COUNT(DISTINCT w.user_id)::int AS total_viewers,
             COUNT(DISTINCT w.room_id)::int AS total_rooms,
             COUNT(*)::int AS row_count,
             COALESCE(SUM(${durationExpr}), 0)::bigint AS total_seconds
      ${from}`;
    const seriesSql = `
      SELECT to_char(w.joined_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
             COALESCE(SUM(${durationExpr}), 0)::bigint AS seconds,
             COUNT(*)::int AS person_times,
             COUNT(DISTINCT w.user_id)::int AS viewers
      ${from}
      GROUP BY 1
      ORDER BY 1`;

    const [cardRows, seriesRows] = await Promise.all([
      this.dataSource.manager.query(cardsSql, params),
      this.dataSource.manager.query(seriesSql, params)
    ]);
    const c = ((cardRows ?? []) as Record<string, unknown>[])[0] ?? {};
    return {
      totalViewers: Number(c.total_viewers ?? 0),
      totalSeconds: Number(c.total_seconds ?? 0),
      totalRooms: Number(c.total_rooms ?? 0),
      hasData: Number(c.row_count ?? 0) > 0,
      series: ((seriesRows ?? []) as Record<string, unknown>[]).map(r => ({
        date: r.date as string,
        seconds: Number(r.seconds ?? 0),
        personTimes: Number(r.person_times ?? 0),
        viewers: Number(r.viewers ?? 0)
      }))
    };
  }

  // F1 附带埋点：白板工具切换落库（F12 触发条件数据源；fire-and-forget 由调用侧兜底）
  async recordToolUsage(userId: string, roomId: string, tool: string) {
    await this.boardToolUsageRepo.insert({
      roomId,
      userId,
      tool: String(tool || '')
        .trim()
        .slice(0, 40)
    });
    return { success: true };
  }
} // class LiveService
