import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, Not, In } from 'typeorm';
import { grpcError } from '@yunyan-live/nest-shared';
import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  BoardSnapshot,
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

  async getStudentRooms(userId: string, page = 1, pageSize = 10) {
    const participants = await this.participantRepo.find({
      where: { userId },
      order: { joinedAt: 'DESC' }
    });

    if (participants.length === 0) return { items: [], total: 0 };

    const total = participants.length;
    const paged = participants.slice((page - 1) * pageSize, page * pageSize);
    const roomIds = paged.map(p => p.roomId);
    const rooms = await this.repo.findByIds(roomIds);
    const roomMap = new Map(rooms.map(r => [r.roomId, r]));

    const items = paged
      .map(p => {
        const room = roomMap.get(p.roomId);
        if (!room) return null;
        return {
          id: room.roomId,
          roomId: room.roomId,
          title: room.title,
          liveUserId: room.liveUserId,
          joinCode: room.joinCode,
          status: room.status,
          startTime: room.startTime,
          type: room.type,
          joinedAt: p.joinedAt
        };
      })
      .filter(Boolean);
    return { items, total };
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
  }) {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 10;

    const qb = this.videoRepo
      .createQueryBuilder('v')
      .select('v.roomId', 'roomId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MIN(v.createdAt)', 'firstRecordedAt')
      .groupBy('v.roomId');

    const recordings = await qb.getRawMany();
    const roomIds = recordings.map((r: { roomId: string }) => r.roomId);

    if (roomIds.length === 0) {
      return { items: [], total: 0 };
    }

    const roomQb = this.repo
      .createQueryBuilder('r')
      .where('r.roomId IN (:...roomIds)', { roomIds });

    if (dto.liveUserId) {
      roomQb.andWhere('r.liveUserId = :liveUserId', { liveUserId: dto.liveUserId });
    }
    if (dto.searchName) {
      roomQb.andWhere('r.title LIKE :searchName', { searchName: `%${dto.searchName}%` });
    }
    if (dto.startTime) {
      roomQb.andWhere('r.startTime >= :startTime', { startTime: new Date(Number(dto.startTime)) });
    }
    if (dto.endTime) {
      roomQb.andWhere('r.startTime <= :endTime', { endTime: new Date(Number(dto.endTime)) });
    }
    if (dto.type !== undefined && dto.type !== null && dto.type >= 0) {
      roomQb.andWhere('r.type = :type', { type: dto.type });
    }

    roomQb.orderBy('r.createdAt', 'DESC');
    const [rooms, total] = await roomQb.getManyAndCount();

    const countMap = new Map(
      recordings.map((r: { roomId: string; count: string }) => [r.roomId, Number(r.count)])
    );
    const firstRecordedAtMap = new Map(
      recordings.map((r: { roomId: string; firstRecordedAt: string | Date }) => {
        const raw =
          r.firstRecordedAt instanceof Date
            ? r.firstRecordedAt
            : new Date(String(r.firstRecordedAt));
        return [r.roomId, String(raw.getTime())];
      })
    );

    const items = rooms.map(room => ({
      roomId: room.roomId,
      title: room.title,
      teacherName: '',
      type: room.type,
      startTime: firstRecordedAtMap.get(room.roomId) || '',
      count: countMap.get(room.roomId) || 0
    }));

    const paged = items.slice((page - 1) * pageSize, page * pageSize);
    return { items: paged, total };
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
  }) {
    const page = dto.page || 1;
    const pageSize = dto.pageSize || 10;
    const qb = this.watchTimeRepo
      .createQueryBuilder('w')
      .innerJoin(LiveRoom, 'r', 'r.roomId = w.roomId AND r.deletedAt IS NULL');
    if (dto.roomId) qb.andWhere('w.roomId = :roomId', { roomId: dto.roomId });
    if (dto.searchName)
      qb.andWhere('r.title LIKE :searchName', { searchName: '%' + dto.searchName + '%' });
    qb.select([
      'w.id',
      'w.userId',
      'w.roomId',
      'w.joinedAt',
      'w.leftAt',
      'w.createdAt',
      'r.title',
      'CASE WHEN w."leftAt" IS NULL THEN true ELSE false END AS is_online'
    ])
      .groupBy('w.id, r.title')
      .orderBy('w.createdAt', 'DESC');
    const [rawItems, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    const now = Date.now();
    const totalTime = rawItems.reduce((s, i) => {
      const left = i.w_left_at ? new Date(i.w_left_at).getTime() : now;
      return s + Math.floor((left - new Date(i.w_joined_at).getTime()) / 1000);
    }, 0);
    const items = rawItems.map(i => ({
      id: i.w_id,
      userId: i.w_user_id,
      roomId: i.w_room_id,
      joinedAt: new Date(i.w_joined_at),
      leftAt: i.w_left_at ? new Date(i.w_left_at) : null,
      createdAt: new Date(i.w_created_at),
      roomTitle: i.r_title,
      isOnline: i.is_online === true || i.is_online === 'true'
    }));
    const paged = items.slice((page - 1) * pageSize, page * pageSize);
    return { items: paged, total, totalTime };
  }
} // class LiveService
