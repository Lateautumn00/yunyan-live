import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { LiveAdminService } from './live-admin.service';

function makeService() {
  const query = vi.fn();
  const service = new LiveAdminService({ query } as unknown as DataSource);
  return { service, query };
}

describe('LiveAdminService（批次 7c 全局只读模型）', () => {
  it('listLiveRooms：分页/关键字/状态/类型全部进 where，返回 camelCase 映射', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([
      {
        roomId: 'r1',
        title: '高数',
        liveUserId: 't1',
        speakerName: '张老师',
        joinCode: '123456',
        status: 2,
        type: 1,
        startTime: new Date('2026-10-01T00:00:00.000Z'),
        duration: 60,
        liveNums: 12,
        createdAt: new Date('2026-09-30T00:00:00.000Z')
      }
    ]);

    const res = await service.listLiveRooms({
      page: 2,
      pageSize: 10,
      keyword: '高数',
      status: 2,
      type: 1,
      startTimeMs: String(Date.parse('2026-09-01T00:00:00Z'))
    });

    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      roomId: 'r1',
      speakerName: '张老师',
      status: 2,
      startTime: '2026-10-01T00:00:00.000Z'
    });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql, pageParams] = query.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain('r."deletedAt" IS NULL');
    // users.id 是 uuid、live_rooms."liveUserId" 是 varchar，必须显式 cast（否则 PG 报 operator does not exist）
    expect(countSql).toContain('u.id::text = r."liveUserId"');
    expect(countSql).toContain('r.title ILIKE');
    expect(countSql).toContain('u.username ILIKE');
    expect(countSql).toContain('r.status =');
    expect(countSql).toContain('r.type =');
    expect(countSql).toContain('r."startTime" >=');
    expect(countParams).toHaveLength(5);
    // 计数查询不得带 limit/offset
    expect(countParams).not.toContain(10);
    expect(pageSql).toContain('ORDER BY r."createdAt" DESC');
    expect(pageParams).toHaveLength(7);
    expect(pageParams.slice(-2)).toEqual([10, 10]);
  });

  it('listLiveRooms：pageSize 上限 100、page 下限 1', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await service.listLiveRooms({ page: 0, pageSize: 9999 });

    expect((query.mock.calls[1] as [string, unknown[]])[1]).toEqual([100, 0]);
  });

  it('getLiveRoom：软删/不存在返回 null', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]);
    expect(await service.getLiveRoom('missing')).toBeNull();
  });

  it('listRecordings：按房间过滤 + 文件名/房间名/主讲人模糊匹配', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await service.listRecordings({ page: 1, pageSize: 20, keyword: 'v1', roomId: 'r1' });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('v."fileName" ILIKE');
    expect(countSql).toContain('r.title ILIKE');
    expect(countSql).toContain('v."teacherName" ILIKE');
    expect(countSql).toContain('v."roomId" =');
    expect(countParams).toEqual(['%v1%', '%v1%', '%v1%', 'r1']);
  });

  it('listCoursewares：关键字同时匹配文件名与房间标题', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await service.listCoursewares({ page: 1, pageSize: 20, keyword: '课件' });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('c.filename ILIKE');
    expect(countSql).toContain('r.title ILIKE');
    expect(countParams).toEqual(['%课件%', '%课件%']);
  });
});
