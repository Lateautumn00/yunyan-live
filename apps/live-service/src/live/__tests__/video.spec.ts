import { describe, expect, it } from 'vitest';
import { chainCalls, createLiveService, mockRepo } from './test-utils';

describe('LiveService.getVideoList', () => {
  it('无录制记录时返回空列表且不查房间表', async () => {
    const video = mockRepo({ getRawMany: [] });
    const { service, room } = createLiveService({ video });
    await expect(service.getVideoList({})).resolves.toEqual({ items: [], total: 0 });
    expect(video.repo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(room.repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('按 roomId 聚合录制次数与首录时间并映射字段', async () => {
    const video = mockRepo({
      getRawMany: [
        { roomId: 'r1', count: '3', firstRecordedAt: '2024-01-01T00:00:00.000Z' },
        { roomId: 'r2', count: '1', firstRecordedAt: new Date('2024-01-02T00:00:00.000Z') }
      ]
    });
    const room = mockRepo({
      getManyAndCount: [
        [
          { roomId: 'r1', title: '第一课', type: 0 },
          { roomId: 'r2', title: '第二课', type: 1 }
        ],
        2
      ]
    });
    const { service } = createLiveService({ video, room });
    const res = await service.getVideoList({ page: 1, pageSize: 10 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toEqual({
      roomId: 'r1',
      title: '第一课',
      teacherName: '',
      type: 0,
      startTime: String(Date.parse('2024-01-01T00:00:00.000Z')),
      count: 3
    });
    expect(res.items[1]).toEqual({
      roomId: 'r2',
      title: '第二课',
      teacherName: '',
      type: 1,
      startTime: String(Date.parse('2024-01-02T00:00:00.000Z')),
      count: 1
    });
  });

  it('按页码切片返回，total 为过滤后的房间总数', async () => {
    const video = mockRepo({
      getRawMany: ['r1', 'r2', 'r3'].map(roomId => ({
        roomId,
        count: '1',
        firstRecordedAt: '2024-01-01T00:00:00.000Z'
      }))
    });
    const room = mockRepo({
      getManyAndCount: [
        [
          { roomId: 'r1', title: 'A', type: 0 },
          { roomId: 'r2', title: 'B', type: 0 },
          { roomId: 'r3', title: 'C', type: 0 }
        ],
        3
      ]
    });
    const { service } = createLiveService({ video, room });
    const res = await service.getVideoList({ page: 2, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ roomId: 'r3', title: 'C' });
  });

  it('过滤条件下推到房间查询构造器', async () => {
    const video = mockRepo({
      getRawMany: [{ roomId: 'r1', count: '1', firstRecordedAt: '2024-01-01T00:00:00.000Z' }]
    });
    const room = mockRepo({ getManyAndCount: [[], 0] });
    const { service } = createLiveService({ video, room });
    await service.getVideoList({
      page: 1,
      pageSize: 10,
      liveUserId: 't1',
      searchName: '数学',
      startTime: '1704067200000',
      endTime: '1704153600000',
      type: 0
    });
    expect(chainCalls(room.qb, 'where')).toContainEqual([
      'r.roomId IN (:...roomIds)',
      { roomIds: ['r1'] }
    ]);
    expect(chainCalls(room.qb, 'andWhere')).toEqual([
      ['r.liveUserId = :liveUserId', { liveUserId: 't1' }],
      ['r.title LIKE :searchName', { searchName: '%数学%' }],
      ['r.startTime >= :startTime', { startTime: new Date(1704067200000) }],
      ['r.startTime <= :endTime', { endTime: new Date(1704153600000) }],
      ['r.type = :type', { type: 0 }]
    ]);
    expect(chainCalls(room.qb, 'orderBy')).toContainEqual(['r.createdAt', 'DESC']);
  });

  it('type 为负数时不下推 type 过滤', async () => {
    const video = mockRepo({
      getRawMany: [{ roomId: 'r1', count: '1', firstRecordedAt: '2024-01-01T00:00:00.000Z' }]
    });
    const room = mockRepo({ getManyAndCount: [[], 0] });
    const { service } = createLiveService({ video, room });
    await service.getVideoList({ page: 1, pageSize: 10, type: -1 });
    const hasTypeFilter = chainCalls(room.qb, 'andWhere').some(
      args => args[0] === 'r.type = :type'
    );
    expect(hasTypeFilter).toBe(false);
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
