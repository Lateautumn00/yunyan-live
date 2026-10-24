import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 批次 7c：全平台数据看板。
 *
 * 口径：
 * - 用户数走 users（admin-service 既有读模型）；`banned_at` 由 0008 迁移加列。
 * - `active_live_rooms` = status=2（直播中，见 `apps/live-service/src/live/live.service.ts:216`），
 *   且未软删；软删房间一律不计入（`"deletedAt" IS NULL`）。
 * - "今日" 以数据库 `now()` 的本地日为界（users.created_at 为 timestamp without tz）。
 */
export interface DashboardStatsRow {
  totalUsers: number;
  todayNewUsers: number;
  bannedUsers: number;
  totalLiveRooms: number;
  activeLiveRooms: number;
  totalRecords: number;
  totalCoursewares: number;
  todayNewRooms: number;
}

@Injectable()
export class DashboardAdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async stats(): Promise<DashboardStatsRow> {
    const rows = (await this.dataSource.query(`
      SELECT
        (SELECT COUNT(*) FROM users)::bigint AS "totalUsers",
        (SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('day', now()))::bigint AS "todayNewUsers",
        (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL)::bigint AS "bannedUsers",
        (SELECT COUNT(*) FROM live_rooms WHERE "deletedAt" IS NULL)::bigint AS "totalLiveRooms",
        (SELECT COUNT(*) FROM live_rooms WHERE "deletedAt" IS NULL AND status = 2)::bigint AS "activeLiveRooms",
        (SELECT COUNT(*) FROM video_recordings)::bigint AS "totalRecords",
        (SELECT COUNT(*) FROM coursewares)::bigint AS "totalCoursewares",
        (SELECT COUNT(*) FROM live_rooms
          WHERE "deletedAt" IS NULL AND "createdAt" >= date_trunc('day', now()))::bigint AS "todayNewRooms"
    `)) as Record<string, unknown>[];
    const row = rows[0] ?? {};
    const num = (v: unknown) => Number(v ?? 0);
    return {
      totalUsers: num(row.totalUsers),
      todayNewUsers: num(row.todayNewUsers),
      bannedUsers: num(row.bannedUsers),
      totalLiveRooms: num(row.totalLiveRooms),
      activeLiveRooms: num(row.activeLiveRooms),
      totalRecords: num(row.totalRecords),
      totalCoursewares: num(row.totalCoursewares),
      todayNewRooms: num(row.todayNewRooms)
    };
  }
}
