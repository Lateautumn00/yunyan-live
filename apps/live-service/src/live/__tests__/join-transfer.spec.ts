import { afterEach, describe, expect, it, vi } from 'vitest';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { createLiveService, expectGrpcError } from './test-utils';

describe('LiveService.join', () => {
  it('房间不存在时抛 NotFound 并回滚事务', async () => {
    const { service, manager, queryRunner } = createLiveService();
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.join({ joinCode: 'SX9' })).rejects.toThrow('房间不存在');
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('学生首次进入：登记参与者、开启在线时长并按在线数重算 liveNums', async () => {
    const { service, manager, queryRunner } = createLiveService();
    const room = {
      roomId: 'r1',
      joinCode: 'SA1',
      liveUserId: 't1',
      type: 0,
      status: 2,
      liveNums: 0
    };
    manager.findOne
      .mockResolvedValueOnce(room)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    manager.count.mockResolvedValueOnce(1);
    const res = await service.join({ joinCode: 'SA1', liveUserId: 'u1' });
    expect(res).toEqual({
      liveUserId: 'u1',
      roomId: 'r1',
      roleName: 'student',
      joinCode: 'SA1',
      liveType: 'smallClass',
      status: 2
    });
    expect(manager.findOne).toHaveBeenCalledTimes(3);
    expect(manager.save).toHaveBeenCalledTimes(3);
    expect(manager.save).toHaveBeenNthCalledWith(1, { userId: 'u1', roomId: 'r1' });
    expect(room.liveNums).toBe(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('join 时按在线时长重算修正漂移的 liveNums', async () => {
    const { service, manager } = createLiveService();
    const room = {
      roomId: 'r1',
      joinCode: 'SA3',
      liveUserId: 't1',
      type: 0,
      status: 2,
      liveNums: 9
    };
    manager.findOne
      .mockResolvedValueOnce(room)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    manager.count.mockResolvedValueOnce(1);
    await service.join({ joinCode: 'SA3', liveUserId: 'u1' });
    expect(room.liveNums).toBe(1);
    expect(manager.count).toHaveBeenCalled();
  });

  it('老师重复进入：已有参与者与在线记录时不重复写入', async () => {
    const { service, manager, queryRunner } = createLiveService();
    const room = {
      roomId: 'r1',
      joinCode: 'SL1',
      liveUserId: 't1',
      type: 1,
      status: 2,
      liveNums: 5
    };
    manager.findOne
      .mockResolvedValueOnce(room)
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 'w1' });
    const res = await service.join({ joinCode: 'SL1', liveUserId: 't1' });
    expect(res).toEqual({
      liveUserId: 't1',
      roomId: 'r1',
      roleName: 'teacher',
      joinCode: 'SL1',
      liveType: 'largeClass',
      status: 2
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(room.liveNums).toBe(5);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('未带 liveUserId 时只提交事务，不登记参与者', async () => {
    const { service, manager } = createLiveService();
    const room = {
      roomId: 'r1',
      joinCode: 'SA2',
      liveUserId: 't1',
      type: 0,
      status: 2,
      liveNums: 2
    };
    manager.findOne.mockResolvedValueOnce(room);
    const res = await service.join({ joinCode: 'SA2' });
    expect(res.roleName).toBe('student');
    expect(res.liveUserId).toBeUndefined();
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('运行时异常向上抛出并回滚事务', async () => {
    const { service, manager, queryRunner } = createLiveService();
    manager.findOne.mockRejectedValueOnce(new Error('db down'));
    await expect(service.join({ joinCode: 'SX9' })).rejects.toThrow('db down');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });
});

describe('LiveService.generateRoomTransferCode', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('房间不存在抛 NOT_FOUND', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce(null);
    await expectGrpcError(
      service.generateRoomTransferCode('rx', 'u2'),
      GrpcStatus.NOT_FOUND,
      '房间不存在'
    );
  });

  it('非未开播房间禁止转移', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 2 });
    await expectGrpcError(
      service.generateRoomTransferCode('r1', 'u2'),
      GrpcStatus.INVALID_ARGUMENT,
      '只有未开播的房间才能转移'
    );
  });

  it('生成转移码：旧码作废、新码一小时有效', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'));
    const { service, room, transfer } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 1 });
    transfer.repo.findOne.mockResolvedValueOnce(null);
    const res = await service.generateRoomTransferCode('r1', 'u2');
    expect(transfer.repo.update).toHaveBeenCalledWith(
      { roomId: 'r1', targetUserId: 'u2', status: 0 },
      { status: 2 }
    );
    expect(res.code).toMatch(/^T[A-Z0-9]+$/);
    expect(res.expiresAt).toBe('2024-06-01T01:00:00.000Z');
    expect(transfer.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'r1', targetUserId: 'u2', status: 0 })
    );
    expect(transfer.repo.save).toHaveBeenCalledTimes(1);
  });
});

describe('LiveService.executeRoomTransfer', () => {
  function codeFixture(overrides: Record<string, unknown> = {}) {
    return {
      code: 'TA1B2C3D',
      roomId: 'r1',
      targetUserId: 'u2',
      status: 0,
      expiresAt: new Date(Date.now() + 3600_000),
      ...overrides
    };
  }

  it('房间不存在抛 NOT_FOUND', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce(null);
    await expectGrpcError(
      service.executeRoomTransfer('rx', 'TA', 't1'),
      GrpcStatus.NOT_FOUND,
      '房间不存在'
    );
  });

  it('非未开播房间禁止转移', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 3, liveUserId: 't1' });
    await expectGrpcError(
      service.executeRoomTransfer('r1', 'TA', 't1'),
      GrpcStatus.INVALID_ARGUMENT,
      '只有未开播的房间才能转移'
    );
  });

  it('非房主无权转移', async () => {
    const { service, room } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 1, liveUserId: 't1' });
    await expectGrpcError(
      service.executeRoomTransfer('r1', 'TA', 'intruder'),
      GrpcStatus.PERMISSION_DENIED,
      '只能转移自己的直播间'
    );
  });

  it('转移码不存在抛无效', async () => {
    const { service, room, transfer } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 1, liveUserId: 't1' });
    transfer.repo.findOne.mockResolvedValueOnce(null);
    await expectGrpcError(
      service.executeRoomTransfer('r1', 'TA', 't1'),
      GrpcStatus.INVALID_ARGUMENT,
      '转移码无效'
    );
  });

  it('转移码已使用抛已使用或已过期', async () => {
    const { service, room, transfer } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 1, liveUserId: 't1' });
    transfer.repo.findOne.mockResolvedValueOnce(codeFixture({ status: 1 }));
    await expectGrpcError(
      service.executeRoomTransfer('r1', 'TA1B2C3D', 't1'),
      GrpcStatus.INVALID_ARGUMENT,
      '转移码已使用或已过期'
    );
  });

  it('转移码过期抛已过期', async () => {
    const { service, room, transfer } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 1, liveUserId: 't1' });
    transfer.repo.findOne.mockResolvedValueOnce(
      codeFixture({ expiresAt: new Date(Date.now() - 1000) })
    );
    await expectGrpcError(
      service.executeRoomTransfer('r1', 'TA1B2C3D', 't1'),
      GrpcStatus.INVALID_ARGUMENT,
      '转移码已过期'
    );
  });

  it('转移码与房间不匹配抛不匹配', async () => {
    const { service, room, transfer } = createLiveService();
    room.repo.findOne.mockResolvedValueOnce({ roomId: 'r1', status: 1, liveUserId: 't1' });
    transfer.repo.findOne.mockResolvedValueOnce(codeFixture({ roomId: 'other' }));
    await expectGrpcError(
      service.executeRoomTransfer('r1', 'TA1B2C3D', 't1'),
      GrpcStatus.INVALID_ARGUMENT,
      '转移码与房间不匹配'
    );
  });

  it('转移成功：改主、核销转移码并在事务内提交', async () => {
    const { service, room, transfer, manager, queryRunner } = createLiveService();
    const roomRow = { roomId: 'r1', status: 1, liveUserId: 't1' };
    const code = codeFixture();
    room.repo.findOne.mockResolvedValueOnce(roomRow);
    transfer.repo.findOne.mockResolvedValueOnce(code);
    const res = await service.executeRoomTransfer('r1', 'TA1B2C3D', 't1');
    expect(res).toEqual({ success: true });
    expect(roomRow.liveUserId).toBe('u2');
    expect(code.status).toBe(1);
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(manager.save).toHaveBeenNthCalledWith(1, roomRow);
    expect(manager.save).toHaveBeenNthCalledWith(2, code);
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
