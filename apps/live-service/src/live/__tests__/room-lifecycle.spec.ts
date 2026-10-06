import { afterEach, describe, expect, it, vi } from 'vitest';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { chainCalls, createLiveService, expectGrpcError } from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LiveService.create', () => {
  it('生成 roomId 与 S 前缀 joinCode，默认 type/status/duration 并调 Janus 建房', async () => {
    const { service, room, manager, queryRunner, janus } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    const created = await service.create({ title: '第一课', startTime: '1704067200000' }, 't1');
    expect(created.roomId).toMatch(/^live-\d+-[a-z0-9]+$/);
    expect(created.joinCode).toMatch(/^S[A-Z0-9]+$/);
    expect(created).toMatchObject({
      title: '第一课',
      type: 0,
      status: 1,
      duration: 60,
      liveUserId: 't1'
    });
    expect(created.startTime).toEqual(new Date(1704067200000));
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(janus.createRoom).toHaveBeenCalledWith(created.roomId, '第一课');
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('type 为 1 时 joinCode 使用 L 前缀', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    const created = await service.create({ title: '大班课', startTime: '1', type: 1 }, 't1');
    expect(created.joinCode).toMatch(/^L[A-Z0-9]+$/);
    expect(created.type).toBe(1);
  });

  it('joinCode 撞库时重试直到取到空闲码', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ joinCode: 'SEXIST01' }).mockResolvedValueOnce(null);
    const created = await service.create({ title: 'A', startTime: '1' }, 't1');
    expect(room.repo.findOne).toHaveBeenCalledTimes(2);
    expect(created.joinCode).toMatch(/^S[A-Z0-9]+$/);
    expect(created.joinCode).not.toBe('SEXIST01');
  });

  it('Janus 建房失败：事务已提交，仍进入 catch 尝试 rollback（锁定现状）', async () => {
    const { service, room, queryRunner, janus } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    janus.createRoom.mockRejectedValueOnce(new Error('janus down'));
    await expect(service.create({ title: 'A', startTime: '1' }, 't1')).rejects.toThrow(
      'janus down'
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('落库失败时回滚事务且不调 Janus', async () => {
    const { service, room, manager, queryRunner, janus } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    manager.save.mockRejectedValueOnce(new Error('db down'));
    await expect(service.create({ title: 'A', startTime: '1' }, 't1')).rejects.toThrow('db down');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(janus.createRoom).not.toHaveBeenCalled();
  });
});

describe('LiveService.update', () => {
  it('房间不存在抛 NOT_FOUND', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    await expectGrpcError(
      service.update({ roomId: 'rx', title: 'A' }),
      GrpcStatus.NOT_FOUND,
      '房间不存在'
    );
  });

  it('非未开播房间禁止编辑', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue({ roomId: 'r1', status: 2 });
    await expectGrpcError(
      service.update({ roomId: 'r1', title: 'A' }),
      GrpcStatus.FAILED_PRECONDITION,
      '只有未开播的房间才能编辑'
    );
  });

  it('仅覆盖传入字段，startTime 数字转 Date', async () => {
    const { service, room } = createLiveService();
    const row = {
      roomId: 'r1',
      title: '旧',
      type: 0,
      status: 1,
      startTime: new Date(1704067200000),
      duration: 60
    };
    room.repo.findOne.mockResolvedValue(row);
    room.repo.save.mockResolvedValue(row);
    await service.update({ roomId: 'r1', title: '新', startTime: '1704153600000' });
    expect(row.title).toBe('新');
    expect(row.startTime).toEqual(new Date(1704153600000));
    expect(row.type).toBe(0);
    expect(row.duration).toBe(60);
    expect(room.repo.save).toHaveBeenCalledWith(row);
  });
});

describe('LiveService.showRoom / cmsDetail', () => {
  it('房间不存在抛 NotFound', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    await expect(service.showRoom('rx')).rejects.toThrow('房间不存在');
    await expect(service.cmsDetail('rx')).rejects.toThrow('房间不存在');
  });

  it('showRoom 返回空 videoList 且双码镜像 joinCode', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue({
      roomId: 'r1',
      title: 'A',
      joinCode: 'SA1',
      status: 1
    });
    const res = await service.showRoom('r1');
    expect(res.videoList).toEqual([]);
    expect(res.teacherCode).toBe('SA1');
    expect(res.studentCode).toBe('SA1');
  });

  it('cmsDetail 双码镜像 joinCode 且不带 videoList', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue({
      roomId: 'r1',
      title: 'A',
      joinCode: 'SA1',
      status: 1
    });
    const res = await service.cmsDetail('r1');
    expect(res.teacherCode).toBe('SA1');
    expect(res.studentCode).toBe('SA1');
    expect('videoList' in res).toBe(false);
  });
});

describe('LiveService.changeStatus', () => {
  it('房间不存在抛 NotFound', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    await expect(service.changeStatus({ roomId: 'rx', status: 2 })).rejects.toThrow('房间不存在');
  });

  it('status=2 开播时记录 liveStartedAt', async () => {
    const { service, room } = createLiveService();
    const row = { roomId: 'r1', status: 1, liveStartedAt: undefined as Date | undefined };
    room.repo.findOne.mockResolvedValue(row);
    await service.changeStatus({ roomId: 'r1', status: 2 });
    expect(row.status).toBe(2);
    expect(row.liveStartedAt).toBeInstanceOf(Date);
    expect(room.repo.save).toHaveBeenCalledWith(row);
  });

  it('其他状态只改 status 不写 liveStartedAt', async () => {
    const { service, room } = createLiveService();
    const row = { roomId: 'r1', status: 2, liveStartedAt: undefined as Date | undefined };
    room.repo.findOne.mockResolvedValue(row);
    await service.changeStatus({ roomId: 'r1', status: 3 });
    expect(row.status).toBe(3);
    expect(row.liveStartedAt).toBeUndefined();
  });
});

describe('LiveService.cmsList', () => {
  it('全条件下推、skip/take 分页并镜像双码', async () => {
    const { service, room } = createLiveService();
    const qb = room.qb;
    (qb.getManyAndCount as ReturnType<typeof vi.fn>).mockResolvedValue([
      [{ roomId: 'r1', title: 'A', joinCode: 'SA1', liveUserId: 't1' }],
      1
    ]);
    const res = await service.cmsList(2, 5, 2, 't1', '数学', '1704000000000', '1704999999000', 0);
    expect(chainCalls(qb, 'andWhere')).toEqual([
      ['live.status = :status', { status: 2 }],
      ['live.liveUserId = :liveUserId', { liveUserId: 't1' }],
      ['live.title LIKE :searchName', { searchName: '%数学%' }],
      ['live.startTime >= :startTime', { startTime: new Date(1704000000000) }],
      ['live.startTime <= :endTime', { endTime: new Date(1704999999000) }],
      ['live.type = :type', { type: 0 }]
    ]);
    expect(chainCalls(qb, 'skip')).toContainEqual([5]);
    expect(chainCalls(qb, 'take')).toContainEqual([5]);
    expect(chainCalls(qb, 'orderBy')).toContainEqual(['live.createdAt', 'DESC']);
    expect(res).toEqual({
      list: [
        {
          roomId: 'r1',
          title: 'A',
          joinCode: 'SA1',
          liveUserId: 't1',
          teacherCode: 'SA1',
          studentCode: 'SA1'
        }
      ],
      total: 1,
      page: 2,
      pageSize: 5
    });
  });

  it('status=0 与负 type 不生成过滤条件，默认分页 1/10', async () => {
    const { service, room } = createLiveService();
    await service.cmsList(1, 10, 0, undefined, undefined, undefined, undefined, -1);
    const hasStatus = chainCalls(room.qb, 'andWhere').some(
      args => args[0] === 'live.status = :status'
    );
    const hasType = chainCalls(room.qb, 'andWhere').some(args => args[0] === 'live.type = :type');
    expect(hasStatus).toBe(false);
    expect(hasType).toBe(false);
    expect(chainCalls(room.qb, 'skip')).toContainEqual([0]);
    expect(chainCalls(room.qb, 'take')).toContainEqual([10]);
  });
});

describe('LiveService.delete / updateCode', () => {
  it('删除房间：先销毁 Janus 房间再软删，返回 success', async () => {
    const { service, room, janus } = createLiveService();
    room.repo.findOne.mockResolvedValue({ roomId: 'r1' });
    const res = await service.delete('r1');
    expect(res).toEqual({ success: true });
    expect(janus.destroyRoom).toHaveBeenCalledWith('r1');
    expect(room.repo.softDelete).toHaveBeenCalledWith('r1');
    expect(janus.destroyRoom.mock.invocationCallOrder[0]!).toBeLessThan(
      room.repo.softDelete.mock.invocationCallOrder[0]!
    );
  });

  it('删除不存在的房间抛 NotFound', async () => {
    const { service, room, janus } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    await expect(service.delete('rx')).rejects.toThrow('房间不存在');
    expect(janus.destroyRoom).not.toHaveBeenCalled();
  });

  it('updateCode 重新生成空闲码并保存', async () => {
    const { service, room } = createLiveService();
    const row = { roomId: 'r1', type: 0, joinCode: 'SOLDOLD1' };
    room.repo.findOne.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    const code = await service.updateCode('r1');
    expect(code).toMatch(/^S[A-Z0-9]+$/);
    expect(code).not.toBe('SOLDOLD1');
    expect(row.joinCode).toBe(code);
    expect(room.repo.save).toHaveBeenCalledWith(row);
  });

  it('updateCode 房间不存在抛 NotFound', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValue(null);
    await expect(service.updateCode('rx')).rejects.toThrow('房间不存在');
  });
});
