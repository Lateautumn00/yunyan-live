import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { DataSource } from 'typeorm';
import { grpcError } from '@yunyan-live/nest-shared';

/**
 * 批次 7c：直播间 / 录像 / 课件全局只读模型。
 *
 * 为什么直连共享库而不是转发 live-service：
 * admin-service 已是管理面读模型（`users-admin` 直接读 users），全服务共用同一 PG；
 * 一次 JOIN 即可带出主讲人/房间标题，免去网关逐条 gRPC 回查。
 * 删除同样在本服务内完成：直播间先 best-effort 通知 Janus 销毁，再软删；
 * 录像/课件为物理删除（与 live-service 同语义）。
 *
 * SQL 注意：live_rooms / video_recordings / coursewares 为 camelCase 引号列
 * （`db/schema-baseline.sql:240-269,305-318,212-224`），users 为 snake_case。
 */

export interface ListLiveRoomsQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number; // 0 = 全部
  type?: number; // -1 = 全部
  startTimeMs?: string;
  endTimeMs?: string;
}

export interface ListRecordingsQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  roomId?: string;
}

export interface ListCoursewaresQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  roomId?: string;
}

export interface LiveRoomRow {
  roomId: string;
  title: string;
  liveUserId: string;
  speakerName: string;
  joinCode: string;
  status: number;
  type: number;
  startTime: string;
  duration: number;
  liveNums: number;
  createdAt: string;
}

export interface RecordingRow {
  id: string;
  roomId: string;
  roomTitle: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  duration: number;
  recordType: number;
  teacherName: string;
  createdAt: string;
}

export interface CoursewareRow {
  id: string;
  roomId: string;
  roomTitle: string;
  filename: string;
  filext: string;
  filesize: number;
  fileurl: string;
  createUserId: string;
  createdAt: string;
}

function clampPage(page: number, pageSize: number): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit, offset: (safePage - 1) * limit };
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : '';
}

@Injectable()
export class LiveAdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listLiveRooms(query: ListLiveRoomsQuery): Promise<{ total: number; items: LiveRoomRow[] }> {
    const { limit, offset } = clampPage(query.page, query.pageSize);
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = [`r."deletedAt" IS NULL`];
    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      where.push(`(r.title ILIKE ${add(kw)} OR u.username ILIKE ${add(kw)})`);
    }
    if (query.status && query.status > 0) where.push(`r.status = ${add(query.status)}`);
    if (query.type !== undefined && query.type !== null && query.type >= 0) {
      where.push(`r.type = ${add(query.type)}`);
    }
    if (query.startTimeMs) {
      where.push(`r."startTime" >= ${add(new Date(Number(query.startTimeMs)))}`);
    }
    if (query.endTimeMs) {
      where.push(`r."startTime" <= ${add(new Date(Number(query.endTimeMs)))}`);
    }
    const from = `FROM live_rooms r LEFT JOIN users u ON u.id::text = r."liveUserId" WHERE ${where.join(' AND ')}`;

    const countSql = `SELECT COUNT(*)::int AS total ${from}`;
    const pageSql = `
      SELECT r."roomId" AS "roomId",
             r.title,
             r."liveUserId" AS "liveUserId",
             COALESCE(u.username, '') AS "speakerName",
             r."joinCode" AS "joinCode",
             r.status,
             r.type,
             r."startTime" AS "startTime",
             r.duration,
             r."liveNums" AS "liveNums",
             r."createdAt" AS "createdAt"
      ${from}
      ORDER BY r."createdAt" DESC, r."roomId" DESC
      LIMIT ${add(limit)} OFFSET ${add(offset)}`;

    const [countRows, pageRows] = await Promise.all([
      this.dataSource.query(countSql, params.slice(0, -2)),
      this.dataSource.query(pageSql, params)
    ]);
    const total = Number((countRows as { total: number }[])[0]?.total ?? 0);
    const items = (pageRows as Record<string, unknown>[]).map(row => ({
      roomId: String(row.roomId ?? ''),
      title: String(row.title ?? ''),
      liveUserId: String(row.liveUserId ?? ''),
      speakerName: String(row.speakerName ?? ''),
      joinCode: String(row.joinCode ?? ''),
      status: Number(row.status ?? 0),
      type: Number(row.type ?? 0),
      startTime: iso(row.startTime),
      duration: Number(row.duration ?? 0),
      liveNums: Number(row.liveNums ?? 0),
      createdAt: iso(row.createdAt)
    }));
    return { total, items };
  }

  async getLiveRoom(roomId: string): Promise<LiveRoomRow | null> {
    const rows = (await this.dataSource.query(
      `SELECT r."roomId" AS "roomId", r.title, r."liveUserId" AS "liveUserId",
              COALESCE(u.username, '') AS "speakerName", r."joinCode" AS "joinCode",
              r.status, r.type, r."startTime" AS "startTime", r.duration,
              r."liveNums" AS "liveNums", r."createdAt" AS "createdAt"
       FROM live_rooms r LEFT JOIN users u ON u.id::text = r."liveUserId"
       WHERE r."roomId" = $1 AND r."deletedAt" IS NULL`,
      [roomId]
    )) as Record<string, unknown>[];
    const row = rows[0];
    if (!row) return null;
    return {
      roomId: String(row.roomId ?? ''),
      title: String(row.title ?? ''),
      liveUserId: String(row.liveUserId ?? ''),
      speakerName: String(row.speakerName ?? ''),
      joinCode: String(row.joinCode ?? ''),
      status: Number(row.status ?? 0),
      type: Number(row.type ?? 0),
      startTime: iso(row.startTime),
      duration: Number(row.duration ?? 0),
      liveNums: Number(row.liveNums ?? 0),
      createdAt: iso(row.createdAt)
    };
  }

  async listRecordings(
    query: ListRecordingsQuery
  ): Promise<{ total: number; items: RecordingRow[] }> {
    const { limit, offset } = clampPage(query.page, query.pageSize);
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = [`r."deletedAt" IS NULL`];
    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      where.push(
        `(v."fileName" ILIKE ${add(kw)} OR r.title ILIKE ${add(kw)} OR v."teacherName" ILIKE ${add(kw)})`
      );
    }
    if (query.roomId) where.push(`v."roomId" = ${add(query.roomId)}`);
    const from = `FROM video_recordings v LEFT JOIN live_rooms r ON r."roomId" = v."roomId" WHERE ${where.join(' AND ')}`;

    const countSql = `SELECT COUNT(*)::int AS total ${from}`;
    const pageSql = `
      SELECT v.id, v."roomId" AS "roomId", COALESCE(r.title, '') AS "roomTitle",
             v."fileName" AS "fileName", v."filePath" AS "filePath", v."fileSize" AS "fileSize",
             v.duration, v."recordType" AS "recordType", v."teacherName" AS "teacherName",
             v."createdAt" AS "createdAt"
      ${from}
      ORDER BY v."createdAt" DESC, v.id DESC
      LIMIT ${add(limit)} OFFSET ${add(offset)}`;

    const [countRows, pageRows] = await Promise.all([
      this.dataSource.query(countSql, params.slice(0, -2)),
      this.dataSource.query(pageSql, params)
    ]);
    const total = Number((countRows as { total: number }[])[0]?.total ?? 0);
    const items = (pageRows as Record<string, unknown>[]).map(row => ({
      id: String(row.id ?? ''),
      roomId: String(row.roomId ?? ''),
      roomTitle: String(row.roomTitle ?? ''),
      fileName: String(row.fileName ?? ''),
      filePath: String(row.filePath ?? ''),
      fileSize: Number(row.fileSize ?? 0),
      duration: Number(row.duration ?? 0),
      recordType: Number(row.recordType ?? 0),
      teacherName: String(row.teacherName ?? ''),
      createdAt: iso(row.createdAt)
    }));
    return { total, items };
  }

  async listCoursewares(
    query: ListCoursewaresQuery
  ): Promise<{ total: number; items: CoursewareRow[] }> {
    const { limit, offset } = clampPage(query.page, query.pageSize);
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = [`r."deletedAt" IS NULL`];
    if (query.keyword) {
      const kw = `%${query.keyword}%`;
      where.push(`(c.filename ILIKE ${add(kw)} OR r.title ILIKE ${add(kw)})`);
    }
    if (query.roomId) where.push(`c."roomId" = ${add(query.roomId)}`);
    const from = `FROM coursewares c LEFT JOIN live_rooms r ON r."roomId" = c."roomId" WHERE ${where.join(' AND ')}`;

    const countSql = `SELECT COUNT(*)::int AS total ${from}`;
    const pageSql = `
      SELECT c.id, c."roomId" AS "roomId", COALESCE(r.title, '') AS "roomTitle",
             c.filename, c.filext, c.filesize, c.fileurl,
             c."createUserId" AS "createUserId", c."createdAt" AS "createdAt"
      ${from}
      ORDER BY c."createdAt" DESC, c.id DESC
      LIMIT ${add(limit)} OFFSET ${add(offset)}`;

    const [countRows, pageRows] = await Promise.all([
      this.dataSource.query(countSql, params.slice(0, -2)),
      this.dataSource.query(pageSql, params)
    ]);
    const total = Number((countRows as { total: number }[])[0]?.total ?? 0);
    const items = (pageRows as Record<string, unknown>[]).map(row => ({
      id: String(row.id ?? ''),
      roomId: String(row.roomId ?? ''),
      roomTitle: String(row.roomTitle ?? ''),
      filename: String(row.filename ?? ''),
      filext: String(row.filext ?? ''),
      filesize: Number(row.filesize ?? 0),
      fileurl: String(row.fileurl ?? ''),
      createUserId: String(row.createUserId ?? ''),
      createdAt: iso(row.createdAt)
    }));
    return { total, items };
  }

  // ---------- 管理面删除（单进程直连 DB，替代原网关 → live-service gRPC） ----------

  /** 删除直播间：软删（Janus 销毁由控制器先行 best-effort 调用，失败不阻断） */
  async deleteRoom(roomId: string): Promise<{ roomId: string }> {
    const rows = (await this.dataSource.query(
      `UPDATE live_rooms SET "deletedAt" = now()
       WHERE "roomId" = $1 AND "deletedAt" IS NULL
       RETURNING "roomId"`,
      [roomId]
    )) as { roomId: string }[];
    if (rows.length === 0) throw grpcError(GrpcStatus.NOT_FOUND, 'room not found');
    return { roomId: rows[0]!.roomId };
  }

  /** 按录像 id 批量删除（物理删除，与 live-service deleteVideoByVideoIds 同语义） */
  async deleteVideosByIds(ids: string[]): Promise<{ deleted: number }> {
    if (ids.length === 0) return { deleted: 0 };
    const rows = (await this.dataSource.query(
      `DELETE FROM video_recordings WHERE id = ANY($1::uuid[]) RETURNING id`,
      [ids]
    )) as { id: string }[];
    return { deleted: rows.length };
  }

  /** 按房间批量删除录像（与 live-service deleteVideoByRoomIds 同语义） */
  async deleteVideosByRoomIds(roomIds: string[]): Promise<{ deleted: number }> {
    if (roomIds.length === 0) return { deleted: 0 };
    const rows = (await this.dataSource.query(
      `DELETE FROM video_recordings WHERE "roomId" = ANY($1::text[]) RETURNING id`,
      [roomIds]
    )) as { id: string }[];
    return { deleted: rows.length };
  }

  /** 删除课件（物理删除；未命中抛 NOT_FOUND，避免静默成功） */
  async deleteCourseware(id: string): Promise<{ deleted: number }> {
    const rows = (await this.dataSource.query(
      `DELETE FROM coursewares WHERE id = $1::uuid RETURNING id`,
      [id]
    )) as { id: string }[];
    if (rows.length === 0) throw grpcError(GrpcStatus.NOT_FOUND, 'courseware not found');
    return { deleted: rows.length };
  }
}
