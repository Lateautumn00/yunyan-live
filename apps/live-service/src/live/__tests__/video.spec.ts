import { describe, expect, it, vi } from 'vitest';
import { chainCalls, createLiveService, mockRepo } from './test-utils';

describe('LiveService.getVideoList', () => {
  function stubQueries(manager: Record<string, unknown>, pageRows: unknown[], total: number) {
    const q = manager.query as ReturnType<typeof vi.fn>;
    q.mockReset().mockResolvedValueOnce(pageRows).mockResolvedValueOnce([{ total }]);
    return q;
  }

  it('空结果返回空列表；SQL 为 INNER JOIN（口径：仅含 ≥1 录制房间）', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], 0);
    await expect(service.getVideoList({})).resolves.toEqual({ items: [], total: 0 });
    expect(q).toHaveBeenCalledTimes(2);
    const pageSql = q.mock.calls[0][0] as string;
    expect(pageSql).toContain('JOIN video_recordings v');
    expect(pageSql).toContain('r."deletedAt" IS NULL');
    expect(pageSql).toContain('ORDER BY r."createdAt" DESC, r."roomId" DESC');
    const countSql = q.mock.calls[1][0] as string;
    expect(countSql).toContain('COUNT(*)');
    expect(countSql).not.toContain('LIMIT');
  });

  it('聚合字段映射：count 与首录毫秒来自 SQL，teacherName 保持空串', async () => {
    const { service, manager } = createLiveService();
    stubQueries(
      manager,
      [
        {
          roomId: 'r1',
          title: '第一课',
          type: 0,
          count: '3',
          first_recorded_ms: '1704067200000'
        },
        {
          roomId: 'r2',
          title: '第二课',
          type: 1,
          count: 1,
          first_recorded_ms: '1704072200000'
        }
      ],
      2
    );
    const res = await service.getVideoList({ page: 1, pageSize: 10 });
    expect(res.total).toBe(2);
    expect(res.items[0]).toEqual({
      roomId: 'r1',
      title: '第一课',
      teacherName: '',
      type: 0,
      startTime: '1704067200000',
      count: 3
    });
    expect(res.items[1]).toMatchObject({
      roomId: 'r2',
      type: 1,
      startTime: '1704072200000',
      count: 1
    });
  });

  it('分页 LIMIT/OFFSET 下推并钳制 pageSize 上限', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], 0);
    await service.getVideoList({ page: 2, pageSize: 999999 });
    expect(q.mock.calls[0][1].slice(-2)).toEqual([100, 100]);
  });

  it('过滤条件参数化下推（type 负数不过滤）', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], 0);
    await service.getVideoList({
      liveUserId: 't1',
      searchName: '数学',
      startTime: '1704067200000',
      endTime: '1704153600000',
      type: 0
    });
    const pageSql = q.mock.calls[0][0] as string;
    expect(pageSql).toContain('r."liveUserId" = $1');
    expect(pageSql).toContain('r.title LIKE $2');
    expect(pageSql).toContain('r."startTime" >= $3');
    expect(pageSql).toContain('r."startTime" <= $4');
    expect(pageSql).toContain('r.type = $5');
    expect(q.mock.calls[0][1].slice(0, 5)).toEqual([
      't1',
      '%数学%',
      new Date(1704067200000),
      new Date(1704153600000),
      0
    ]);
    stubQueries(manager, [], 0);
    await service.getVideoList({ type: -1 });
    expect(q.mock.calls[0][0]).not.toContain('r.type =');
  });

  it('cursor keyset 只进页查询不进 total', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(manager, [], 0);
    await service.getVideoList({ cursor: '1704067200000|room-x' });
    expect(q.mock.calls[0][0]).toContain('(r."createdAt", r."roomId") <');
    expect(q.mock.calls[1][0]).not.toContain('(r."createdAt", r."roomId") <');
  });
});

describe('LiveService.getVideoDetail', () => {
  it('时间筛选转 Date，createdAt 序列化毫秒字符串并透传 duration 秒', async () => {
    const created = new Date('2024-03-05T06:07:08.900Z');
    const video = mockRepo({
      getManyAndCount: [
        [
          {
            id: 'v1',
            roomId: 'r1',
            filePath: '/recordings/v1.mp4',
            fileName: 'v1.mp4',
            fileSize: 1024,
            duration: 3600,
            recordType: 'janus',
            teacherName: '张老师',
            createdAt: created
          }
        ],
        1
      ]
    });
    const { service } = createLiveService({ video });
    const res = await service.getVideoDetail({
      roomId: 'r1',
      startTime: '1704067200000',
      endTime: '1704153600000'
    });
    expect(res.total).toBe(1);
    expect(res.items[0]).toEqual({
      id: 'v1',
      roomId: 'r1',
      filePath: '/recordings/v1.mp4',
      fileName: 'v1.mp4',
      fileSize: 1024,
      duration: 3600,
      recordType: 'janus',
      teacherName: '张老师',
      createdAt: String(created.getTime())
    });
    expect(chainCalls(video.qb, 'where')).toContainEqual(['v.roomId = :roomId', { roomId: 'r1' }]);
    expect(chainCalls(video.qb, 'andWhere')).toEqual([
      ['v.createdAt >= :startTime', { startTime: new Date(1704067200000) }],
      ['v.createdAt <= :endTime', { endTime: new Date(1704153600000) }]
    ]);
    expect(chainCalls(video.qb, 'orderBy')).toContainEqual(['v.createdAt', 'DESC']);
  });

  it('createdAt 为字符串时按原样序列化', async () => {
    const video = mockRepo({
      getManyAndCount: [[{ id: 'v1', roomId: 'r1', createdAt: '2024-03-05T06:07:08.900Z' }], 1]
    });
    const { service } = createLiveService({ video });
    const res = await service.getVideoDetail({ roomId: 'r1' });
    expect(res.items[0]).toMatchObject({
      createdAt: '2024-03-05T06:07:08.900Z'
    });
  });
});

describe('LiveService 批量删除录像', () => {
  it('deleteVideoByRoomIds 空数组短路不触库', async () => {
    const { service, video } = createLiveService();
    await expect(service.deleteVideoByRoomIds([])).resolves.toEqual({ success: true });
    expect(video.repo.delete).not.toHaveBeenCalled();
  });

  it('deleteVideoByRoomIds 按 roomId 逐条删除', async () => {
    const { service, video } = createLiveService();
    await expect(service.deleteVideoByRoomIds(['r1', 'r2'])).resolves.toEqual({
      success: true
    });
    expect(video.repo.delete).toHaveBeenCalledWith([{ roomId: 'r1' }, { roomId: 'r2' }]);
  });

  it('deleteVideoByVideoIds 空数组短路不触库', async () => {
    const { service, video } = createLiveService();
    await expect(service.deleteVideoByVideoIds([])).resolves.toEqual({ success: true });
    expect(video.repo.delete).not.toHaveBeenCalled();
  });

  it('deleteVideoByVideoIds 按视频 id 删除', async () => {
    const { service, video } = createLiveService();
    await expect(service.deleteVideoByVideoIds(['v1', 'v2'])).resolves.toEqual({
      success: true
    });
    expect(video.repo.delete).toHaveBeenCalledWith(['v1', 'v2']);
  });
});
