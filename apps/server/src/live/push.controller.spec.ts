import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { FORBID_CHANNEL, forbidKey, UpdateForbidDto } from '@yunyan-live/nest-shared';
import { PushController } from './push.controller';

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1)
  };
}

function makeDto(overrides: Partial<UpdateForbidDto> = {}): UpdateForbidDto {
  return Object.assign(
    new UpdateForbidDto(),
    { roomId: 'r1', liveUserId: 'u1', status: 0 },
    overrides
  );
}

function makeReq(role: number): { user: { role: number } } {
  return { user: { role } };
}

describe('PushController.updateForbid', () => {
  it('教师（role 1）写入教室禁言状态并广播到房间', async () => {
    const mock = makeRedis();
    const controller = new PushController(mock as unknown as Redis);
    const result = await controller.updateForbid(makeDto({ status: 0 }), makeReq(1));
    expect(result).toEqual({ updated: true });
    expect(mock.set).toHaveBeenCalledWith(forbidKey('r1'), '0');
    expect(mock.publish).toHaveBeenCalledWith(
      FORBID_CHANNEL,
      JSON.stringify({ roomId: 'r1', status: 0 })
    );
  });

  it('教师解除禁言写入状态 1', async () => {
    const mock = makeRedis();
    const controller = new PushController(mock as unknown as Redis);
    await controller.updateForbid(makeDto({ status: 1 }), makeReq(1));
    expect(mock.set).toHaveBeenCalledWith(forbidKey('r1'), '1');
  });

  it('学生（role 0）被拒且不写入 Redis', async () => {
    const mock = makeRedis();
    const controller = new PushController(mock as unknown as Redis);
    await expect(controller.updateForbid(makeDto({ status: 0 }), makeReq(0))).rejects.toThrow(
      '仅教师可修改禁言状态'
    );
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.publish).not.toHaveBeenCalled();
  });

  it('非 1 角色（role 2）同样被拒', async () => {
    const mock = makeRedis();
    const controller = new PushController(mock as unknown as Redis);
    await expect(controller.updateForbid(makeDto({ status: 1 }), makeReq(2))).rejects.toThrow(
      '仅教师可修改禁言状态'
    );
  });
});

describe('UpdateForbidDto 校验', () => {
  it('status 仅接受 0 或 1', async () => {
    const { validateSync } = await import('class-validator');
    const invalid = makeDto({ status: 2 });
    expect(validateSync(invalid).length).toBeGreaterThan(0);
    expect(validateSync(makeDto({ status: 0 }))).toHaveLength(0);
    expect(validateSync(makeDto({ status: 1 }))).toHaveLength(0);
  });

  it('roomId 必填、liveUserId 可选', async () => {
    const { validateSync } = await import('class-validator');
    expect(validateSync(makeDto({ roomId: '' })).length).toBeGreaterThan(0);
    expect(validateSync(makeDto({ liveUserId: undefined }))).toHaveLength(0);
  });
});
