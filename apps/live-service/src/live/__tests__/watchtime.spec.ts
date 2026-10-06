import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chainCalls, createLiveService, mockRepo } from './test-utils';

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    w_id: 1,
    w_user_id: 'u1',
    w_room_id: 'r1',
    w_joined_at: '2024-05-31T23:57:00Z',
    w_left_at: '2024-05-31T23:58:00Z',
    w_created_at: '2024-05-31T23:57:00Z',
    r_title: '第一课',
    is_online: false,
    ...overrides
  };
}

describe('LiveService.getUserWatchTimeList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leftAt 为空视为在线，totalTime 从入会累计到当前时间', async () => {
    const watch = mockRepo({
      getRawMany: [rawRow({ w_left_at: null, is_online: true })],
      getCount: 1
    });
    const { service } = createLiveService({ watchTime: watch });
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
  });

  it('leftAt 存在时按入会到离会区间计时并标记非在线', async () => {
    const watch = mockRepo({
      getRawMany: [rawRow({ is_online: false })],
      getCount: 1
    });
    const { service } = createLiveService({ watchTime: watch });
    const res = await service.getUserWatchTimeList({});
    expect(res.totalTime).toBe(60);
    expect(res.items[0]).toMatchObject({ isOnline: false });
    expect(res.items[0].leftAt).toBeInstanceOf(Date);
  });

  it("is_online 为字符串 'true' 时也识别为在线", async () => {
    const watch = mockRepo({
      getRawMany: [rawRow({ w_left_at: null, is_online: 'true' })],
      getCount: 1
    });
    const { service } = createLiveService({ watchTime: watch });
    const res = await service.getUserWatchTimeList({});
    expect(res.items[0]).toMatchObject({ isOnline: true, leftAt: null });
  });

  it('totalTime 跨多行求和', async () => {
    const watch = mockRepo({
      getRawMany: [rawRow({ w_id: 1 }), rawRow({ w_id: 2, w_joined_at: '2024-05-31T23:55:00Z' })],
      getCount: 2
    });
    const { service } = createLiveService({ watchTime: watch });
    const res = await service.getUserWatchTimeList({});
    expect(res.totalTime).toBe(240);
    expect(res.total).toBe(2);
  });

  it('roomId 与 searchName 下推过滤并保留联表与排序', async () => {
    const watch = mockRepo({ getRawMany: [], getCount: 0 });
    const { service } = createLiveService({ watchTime: watch });
    await service.getUserWatchTimeList({ roomId: 'r1', searchName: '数学' });
    expect(chainCalls(watch.qb, 'innerJoin')[0]).toEqual([
      expect.any(Function),
      'r',
      'r.roomId = w.roomId AND r.deletedAt IS NULL'
    ]);
    expect(chainCalls(watch.qb, 'andWhere')).toEqual([
      ['w.roomId = :roomId', { roomId: 'r1' }],
      ['r.title LIKE :searchName', { searchName: '%数学%' }]
    ]);
    expect(chainCalls(watch.qb, 'orderBy')).toContainEqual(['w.createdAt', 'DESC']);
    expect(chainCalls(watch.qb, 'groupBy')).toContainEqual(['w.id, r.title']);
  });

  it('按页码切片，total 来自 getCount', async () => {
    const watch = mockRepo({
      getRawMany: [rawRow({ w_id: 1 }), rawRow({ w_id: 2 }), rawRow({ w_id: 3 })],
      getCount: 3
    });
    const { service } = createLiveService({ watchTime: watch });
    const res = await service.getUserWatchTimeList({ page: 2, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ roomId: 'r1' });
  });
});
