import { describe, expect, it, vi } from 'vitest';
import { createLiveService } from './test-utils';

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w-1',
    user_id: 'u1',
    room_id: 'r1',
    joined_at: '2024-05-31T23:57:00Z',
    left_at: '2024-05-31T23:58:00Z',
    created_at: '2024-05-31T23:57:00Z',
    room_title: '第一课',
    is_online: false,
    ...overrides
  };
}

function stubQueries(
  manager: Record<string, unknown>,
  pageRows: unknown[],
  agg: { total: number; total_time: number }
) {
  const q = manager.query as ReturnType<typeof vi.fn>;
  q.mockReset().mockResolvedValueOnce(pageRows).mockResolvedValueOnce([agg]);
  return q;
}

describe('LiveService.getUserWatchTimeList', () => {
  it('leftAt 为空视为在线；totalTime 来自全量聚合 SQL（now 分支）', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [pageRow({ left_at: null, is_online: true })], {
      total: 1,
      total_time: 180
    });
    const res = await service.getUserWatchTimeList({});
    expect(res.total).toBe(1);
    expect(res.totalTime).toBe(180);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      userId: 'u1',
      roomId: 'r1',
      roomTitle: '第一课',
      isOnline: true
    });
    expect(res.items[0].leftAt).toBeNull();
    expect(res.items[0].joinedAt).toBeInstanceOf(Date);
    const aggSql = q.mock.calls[1][0] as string;
    expect(aggSql).toContain('now() - w.joined_at');
    expect(aggSql).toContain('floor(EXTRACT(EPOCH');
    expect(aggSql).not.toContain('LIMIT');
  });

  it('leftAt 存在时标记非在线，聚合按区间透传', async () => {
    const { service, manager } = createLiveService();
    stubQueries(manager, [pageRow({ is_online: false })], { total: 1, total_time: 60 });
    const res = await service.getUserWatchTimeList({});
    expect(res.totalTime).toBe(60);
    expect(res.items[0]).toMatchObject({ isOnline: false });
    expect(res.items[0].leftAt).toBeInstanceOf(Date);
  });

  it("is_online 为字符串 'true' 时也识别为在线", async () => {
    const { service, manager } = createLiveService();
    stubQueries(manager, [pageRow({ left_at: null, is_online: 'true' })], {
      total: 1,
      total_time: 0
    });
    const res = await service.getUserWatchTimeList({});
    expect(res.items[0]).toMatchObject({ isOnline: true });
    expect(res.items[0].leftAt).toBeNull();
  });

  it('totalTime 是过滤全量口径，与分页行数无关', async () => {
    const { service, manager } = createLiveService();
    stubQueries(manager, [pageRow({ id: 'w-1' }), pageRow({ id: 'w-2' })], {
      total: 2,
      total_time: 240
    });
    const res = await service.getUserWatchTimeList({ page: 1, pageSize: 2 });
    expect(res.total).toBe(2);
    expect(res.totalTime).toBe(240);
  });

  it('roomId 与 searchName 参数化下推到分页与聚合两条查询', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], { total: 0, total_time: 0 });
    await service.getUserWatchTimeList({ roomId: 'r1', searchName: '数学' });
    const pageSql = q.mock.calls[0][0] as string;
    const aggSql = q.mock.calls[1][0] as string;
    expect(pageSql).toContain('w.room_id = $1');
    expect(pageSql).toContain('r.title LIKE $2');
    expect(pageSql).toContain('ORDER BY w.created_at DESC, w.id DESC');
    expect(aggSql).toContain('w.room_id = $1');
    expect(aggSql).toContain('r.title LIKE $2');
    expect(q.mock.calls[0][1]).toEqual(['r1', '%数学%', 10, 0]);
    expect(q.mock.calls[1][1]).toEqual(['r1', '%数学%']);
  });

  it('按页码下推 LIMIT/OFFSET，total 来自聚合', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [pageRow({ id: 'w-3' })], { total: 3, total_time: 90 });
    const res = await service.getUserWatchTimeList({ page: 2, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.items).toHaveLength(1);
    expect(q.mock.calls[0][1].slice(-2)).toEqual([2, 2]);
  });

  it('cursor 走 keyset 且只进页查询；非法 cursor 回落 OFFSET', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], { total: 0, total_time: 0 });
    await service.getUserWatchTimeList({ cursor: '1717171717000|w-9' });
    expect(q.mock.calls[0][0]).toContain('(w.created_at, w.id) <');
    expect(q.mock.calls[0][1]).toEqual([new Date(1717171717000), 'w-9', 10, 0]);
    expect(q.mock.calls[1][0]).not.toContain('(w.created_at, w.id) <');
    stubQueries(manager, [], { total: 0, total_time: 0 });
    await service.getUserWatchTimeList({ cursor: 'not-a-cursor' });
    expect(q.mock.calls[0][0]).not.toContain('(w.created_at, w.id) <');
    expect(q.mock.calls[0][1]).toEqual([10, 0]);
  });

  it('pageSize 钳制上限 100', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], { total: 0, total_time: 0 });
    await service.getUserWatchTimeList({ pageSize: 999999 });
    expect(q.mock.calls[0][1]).toEqual([100, 0]);
  });
});
