import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { DashboardAdminService } from './dashboard-admin.service';

describe('DashboardAdminService（批次 7c 看板口径）', () => {
  it('单条 SQL 出全部卡片，pg bigint 字符串转数字', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        totalUsers: '120',
        todayNewUsers: '3',
        bannedUsers: '4',
        totalLiveRooms: '30',
        activeLiveRooms: '2',
        totalRecords: '88',
        totalCoursewares: '9',
        todayNewRooms: '1'
      }
    ]);
    const service = new DashboardAdminService({ query } as unknown as DataSource);

    const stats = await service.stats();

    expect(stats).toEqual({
      totalUsers: 120,
      todayNewUsers: 3,
      bannedUsers: 4,
      totalLiveRooms: 30,
      activeLiveRooms: 2,
      totalRecords: 88,
      totalCoursewares: 9,
      todayNewRooms: 1
    });
    const sql = (query.mock.calls[0] as [string])[0];
    expect(sql).toContain('banned_at IS NOT NULL');
    expect(sql).toContain('status = 2');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain("date_trunc('day', now())");
  });

  it('空结果按 0 处理', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new DashboardAdminService({ query } as unknown as DataSource);
    const stats = await service.stats();
    expect(Object.values(stats).every(v => v === 0)).toBe(true);
  });
});
