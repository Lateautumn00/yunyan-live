import 'reflect-metadata';
import type { Redis } from 'ioredis';
import { Metadata } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  FORBID_CHANNEL,
  forbidKey,
  JwtAuthGuard,
  MODERATION_CHANNEL,
  RECALL_CHANNEL,
  RolesGuard,
  UpdateForbidDto,
  ModerationMuteDto,
  ModerationKickDto,
  ModerationReleaseDto,
  RecallMessageDto
} from '@yunyan-live/nest-shared';
import { PushController } from './push.controller';

const TEACHER = 'teacher-1';

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    publish: vi.fn().mockResolvedValue(1)
  };
}

function makeClient(
  overrides: {
    moderateCode?: string;
    moderateMsg?: string;
    recallCode?: string;
    recallMsg?: string;
  } = {}
) {
  // S4 域层下沉：归属判定走 CheckRoomAccess（默认调用者=房主教师）
  const checkRoomAccess = vi.fn(
    (_data: { room_id: string; user_id: string }, _metadata?: unknown) =>
      of({ code: '0', msg: 'success', data: { allowed: true, is_teacher: true } })
  );
  const moderateUser = vi.fn(
    (
      _data: { room_id: string; user_id: string; kind: string; op: string; minutes: number },
      _metadata?: unknown
    ) =>
      of({
        code: overrides.moderateCode ?? '0',
        msg: overrides.moderateMsg ?? 'success'
      })
  );
  const recallMessage = vi.fn((_data: { room_id: string; msg_id: string }, _metadata?: unknown) =>
    of({ code: overrides.recallCode ?? '0', msg: overrides.recallMsg ?? 'success' })
  );
  const liveService = { checkRoomAccess, moderateUser, recallMessage };
  const liveClient = { getService: vi.fn(() => liveService) };
  return { checkRoomAccess, moderateUser, recallMessage, liveClient };
}

function makeAudit() {
  return { publish: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
}

function makeController(
  opts: {
    moderateCode?: string;
    moderateMsg?: string;
    recallCode?: string;
    recallMsg?: string;
    /** 调用者非房主（CheckRoomAccess 判定 is_teacher=false） */
    callerIsOwner?: boolean;
  } = {}
) {
  const redis = makeRedis();
  const client = makeClient({
    moderateCode: opts.moderateCode,
    moderateMsg: opts.moderateMsg,
    recallCode: opts.recallCode,
    recallMsg: opts.recallMsg
  });
  if (opts.callerIsOwner === false) {
    client.checkRoomAccess.mockImplementation(() =>
      of({ code: '0', msg: 'success', data: { allowed: true, is_teacher: false } })
    );
  }
  const audit = makeAudit();
  const controller = new PushController(
    redis as unknown as Redis,
    client.liveClient as never,
    audit as never
  );
  controller.onModuleInit();
  return {
    controller,
    redis,
    checkRoomAccess: client.checkRoomAccess,
    moderateUser: client.moderateUser,
    recallMessage: client.recallMessage,
    audit
  };
}

function makeReq(role: number, userId = TEACHER) {
  return { user: { userId, role }, requestId: 'req-1', ip: '127.0.0.1' };
}

function muteDto(overrides: Partial<ModerationMuteDto> = {}): ModerationMuteDto {
  return Object.assign(
    new ModerationMuteDto(),
    { roomId: 'r1', userId: 'u1', minutes: 5 },
    overrides
  );
}

function kickDto(overrides: Partial<ModerationKickDto> = {}): ModerationKickDto {
  return Object.assign(new ModerationKickDto(), { roomId: 'r1', userId: 'u1' }, overrides);
}

function releaseDto(overrides: Partial<ModerationReleaseDto> = {}): ModerationReleaseDto {
  return Object.assign(
    new ModerationReleaseDto(),
    { roomId: 'r1', userId: 'u1', kind: 'mute' },
    overrides
  );
}

function makeForbidDto(overrides: Partial<UpdateForbidDto> = {}): UpdateForbidDto {
  return Object.assign(
    new UpdateForbidDto(),
    { roomId: 'r1', liveUserId: 'u1', status: 0 },
    overrides
  );
}

const MSG_ID = '3f1c9a02-1d4e-4b7a-9c2f-8e5d6a4b3c21';

function recallDto(overrides: Partial<RecallMessageDto> = {}): RecallMessageDto {
  return Object.assign(new RecallMessageDto(), { roomId: 'r1', msgId: MSG_ID }, overrides);
}

describe('PushController.updateForbid', () => {
  it('房间所有者教师写入禁言状态并广播到房间', async () => {
    const { controller, redis, checkRoomAccess } = makeController();
    const result = await controller.updateForbid(makeForbidDto({ status: 0 }), makeReq(1));
    expect(result).toEqual({ updated: true });
    expect(checkRoomAccess).toHaveBeenCalledWith(
      { room_id: 'r1', user_id: TEACHER },
      expect.any(Metadata)
    );
    expect(redis.set).toHaveBeenCalledWith(forbidKey('r1'), '0');
    expect(redis.publish).toHaveBeenCalledWith(
      FORBID_CHANNEL,
      JSON.stringify({ roomId: 'r1', status: 0 })
    );
  });

  it('学生（role 0）被拒且不查房/不写 Redis', async () => {
    const { controller, redis, checkRoomAccess } = makeController();
    await expect(controller.updateForbid(makeForbidDto(), makeReq(0, 'stu-1'))).rejects.toThrow(
      '仅教师可修改禁言状态'
    );
    expect(checkRoomAccess).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('他房教师（CheckRoomAccess is_teacher=false）被 403 拒绝（归属断言落域层）', async () => {
    const { controller, redis, checkRoomAccess } = makeController({ callerIsOwner: false });
    await expect(controller.updateForbid(makeForbidDto(), makeReq(1))).rejects.toThrow('Forbidden');
    expect(checkRoomAccess).toHaveBeenCalledWith(
      { room_id: 'r1', user_id: TEACHER },
      expect.any(Metadata)
    );
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.publish).not.toHaveBeenCalled();
  });
});

describe('PushController.mute / kick / release（F3 单用户管控）', () => {
  it('mute：gRPC ModerateUser + 发布 live:moderation + 审计 moderation.mute', async () => {
    const { controller, redis, moderateUser, audit } = makeController();
    const res = await controller.mute(muteDto({ minutes: 10 }), makeReq(1));
    expect(res).toEqual({ updated: true });
    const [payload, metadata] = moderateUser.mock.calls[0] as [
      { room_id: string; user_id: string; kind: string; op: string; minutes: number },
      { get: (k: string) => unknown[] }
    ];
    expect(payload).toEqual({ room_id: 'r1', user_id: 'u1', kind: 'mute', op: 'set', minutes: 10 });
    expect(metadata.get('user-id')?.[0]).toBe(TEACHER);
    const channel = redis.publish.mock.calls[0]?.[0] as string;
    const body = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
    expect(channel).toBe(MODERATION_CHANNEL);
    expect(body).toMatchObject({ roomId: 'r1', userId: 'u1', kind: 'mute', op: 'set' });
    expect(typeof body.untilMs).toBe('number');
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: TEACHER,
        action: 'moderation.mute',
        targetId: 'r1',
        detail: { userId: 'u1', minutes: 10 }
      })
    );
  });

  it('kick：发布不带 untilMs，审计 moderation.kick', async () => {
    const { controller, redis, moderateUser, audit } = makeController();
    await controller.kick(kickDto(), makeReq(1));
    expect(moderateUser.mock.calls[0][0]).toEqual({
      room_id: 'r1',
      user_id: 'u1',
      kind: 'kick',
      op: 'set',
      minutes: 0
    });
    const body = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
    expect(body).toEqual({ roomId: 'r1', userId: 'u1', kind: 'kick', op: 'set' });
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'moderation.kick', detail: { userId: 'u1' } })
    );
  });

  it('release：kind 透传（mute/kick），审计 moderation.release', async () => {
    const { controller, redis, moderateUser, audit } = makeController();
    await controller.release(releaseDto({ kind: 'kick' }), makeReq(1));
    expect(moderateUser.mock.calls[0][0]).toEqual({
      room_id: 'r1',
      user_id: 'u1',
      kind: 'kick',
      op: 'release',
      minutes: 0
    });
    expect(JSON.parse(redis.publish.mock.calls[0]?.[1] as string)).toEqual({
      roomId: 'r1',
      userId: 'u1',
      kind: 'kick',
      op: 'release'
    });
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'moderation.release',
        detail: { userId: 'u1', kind: 'kick' }
      })
    );
  });

  it('mute/kick/release 挂载 JwtAuthGuard+RolesGuard+@Roles(教师)（学生边缘拒绝，装饰器元数据回归）', async () => {
    const guard = new RolesGuard();
    const handlerOf = (m: 'mute' | 'kick' | 'release') =>
      (PushController.prototype as never as Record<string, () => void>)[m];
    const ctxOf = (m: 'mute' | 'kick' | 'release', role?: number) =>
      ({
        getHandler: () => handlerOf(m),
        switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'stu-1', role } }) })
      }) as never;
    for (const m of ['mute', 'kick', 'release'] as const) {
      expect(guard.canActivate(ctxOf(m, 0)), `${m} role=0 应拒`).toBe(false);
      expect(guard.canActivate(ctxOf(m, 2)), `${m} role=2 应拒`).toBe(false);
      expect(guard.canActivate(ctxOf(m, undefined)), `${m} 缺 role 应拒`).toBe(false);
      expect(guard.canActivate(ctxOf(m, 1)), `${m} 教师应放行`).toBe(true);
      const guards = Reflect.getMetadata('__guards__', handlerOf(m));
      expect(guards, `${m} guards`).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
      expect(Reflect.getMetadata('roles', handlerOf(m)), `${m} @Roles`).toEqual([1]);
    }
  });

  it('他房教师：域层 ModerateUser PERMISSION_DENIED（code=7）→ 403，不广播不审计', async () => {
    const { controller, moderateUser, redis, audit } = makeController();
    moderateUser.mockReturnValueOnce(throwError(() => ({ code: 7, message: 'not room owner' })));
    await expect(controller.kick(kickDto(), makeReq(1))).rejects.toMatchObject({ status: 403 });
    expect(moderateUser).toHaveBeenCalledWith(
      { room_id: 'r1', user_id: 'u1', kind: 'kick', op: 'set', minutes: 0 },
      expect.any(Metadata)
    );
    expect(redis.publish).not.toHaveBeenCalled();
    expect(audit.publish).not.toHaveBeenCalled();
  });

  it('gRPC 落库失败（code=1）→ 502，不广播不审计', async () => {
    const { controller, redis, audit } = makeController({
      moderateCode: '1',
      moderateMsg: 'db down'
    });
    await expect(controller.mute(muteDto(), makeReq(1))).rejects.toThrow('db down');
    expect(redis.publish).not.toHaveBeenCalled();
    expect(audit.publish).not.toHaveBeenCalled();
  });
});

describe('Moderation DTO 校验', () => {
  it('mute minutes 仅 1/5/10', async () => {
    const { validateSync } = await import('class-validator');
    expect(validateSync(muteDto({ minutes: 7 })).length).toBeGreaterThan(0);
    expect(validateSync(muteDto({ minutes: 1 }))).toHaveLength(0);
    expect(validateSync(muteDto({ minutes: 5 }))).toHaveLength(0);
    expect(validateSync(muteDto({ minutes: 10 }))).toHaveLength(0);
  });

  it('kick/userId 必填；release.kind 仅 mute|kick', async () => {
    const { validateSync } = await import('class-validator');
    expect(validateSync(kickDto({ userId: '' })).length).toBeGreaterThan(0);
    expect(validateSync(kickDto({ roomId: '' })).length).toBeGreaterThan(0);
    expect(validateSync(releaseDto({ kind: 'ban' as never })).length).toBeGreaterThan(0);
    expect(validateSync(releaseDto({ kind: 'kick' }))).toHaveLength(0);
  });
});

describe('PushController.recall（F4 撤回）', () => {
  it('学生自撤成功：gRPC RecallMessage + 发布 live:recall + 审计 message.recall（不走归属断言）', async () => {
    const { controller, redis, checkRoomAccess, recallMessage, audit } = makeController();
    const res = await controller.recall(recallDto(), makeReq(0, 'stu-1'));
    expect(res).toEqual({ recalled: true });
    const [payload, metadata] = recallMessage.mock.calls[0] as [
      { room_id: string; msg_id: string },
      { get: (k: string) => unknown[] }
    ];
    expect(payload).toEqual({ room_id: 'r1', msg_id: MSG_ID });
    expect(metadata.get('user-id')?.[0]).toBe('stu-1');
    expect(checkRoomAccess).not.toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalledWith(
      RECALL_CHANNEL,
      JSON.stringify({ roomId: 'r1', msgId: MSG_ID })
    );
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'stu-1',
        action: 'message.recall',
        targetType: 'message',
        targetId: MSG_ID,
        detail: { roomId: 'r1' }
      })
    );
  });

  it('幂等重复（msg=already_recalled）→ {recalled:true}，不广播不审计', async () => {
    const { controller, redis, recallMessage, audit } = makeController({
      recallMsg: 'already_recalled'
    });
    const res = await controller.recall(recallDto(), makeReq(1));
    expect(res).toEqual({ recalled: true });
    expect(recallMessage).toHaveBeenCalledTimes(1);
    expect(redis.publish).not.toHaveBeenCalled();
    expect(audit.publish).not.toHaveBeenCalled();
  });

  it('forbidden（非发言者且非房主）→ 403，不广播不审计', async () => {
    const { controller, redis, audit } = makeController({
      recallCode: '1',
      recallMsg: 'forbidden'
    });
    const err = await controller.recall(recallDto(), makeReq(1)).catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(403);
    expect(redis.publish).not.toHaveBeenCalled();
    expect(audit.publish).not.toHaveBeenCalled();
  });

  it('not found → 404；expired → 400；其余 gRPC 失败 → 502', async () => {
    const notFound = makeController({ recallCode: '1', recallMsg: 'not found' });
    const err404 = await notFound.controller
      .recall(recallDto(), makeReq(1))
      .catch((e: unknown) => e);
    expect((err404 as { getStatus: () => number }).getStatus()).toBe(404);
    expect(notFound.redis.publish).not.toHaveBeenCalled();

    const expired = makeController({ recallCode: '1', recallMsg: 'expired' });
    const err400 = await expired.controller
      .recall(recallDto(), makeReq(1))
      .catch((e: unknown) => e);
    expect((err400 as { getStatus: () => number }).getStatus()).toBe(400);

    const down = makeController({ recallCode: '1', recallMsg: 'db down' });
    const err502 = await down.controller.recall(recallDto(), makeReq(1)).catch((e: unknown) => e);
    expect((err502 as { getStatus: () => number }).getStatus()).toBe(502);
    expect(down.redis.publish).not.toHaveBeenCalled();
    expect(down.audit.publish).not.toHaveBeenCalled();
  });
});

describe('Recall DTO 校验', () => {
  it('msgId 必须是 uuid；roomId 必填', async () => {
    const { validateSync } = await import('class-validator');
    expect(validateSync(recallDto())).toHaveLength(0);
    expect(validateSync(recallDto({ msgId: 'not-a-uuid' })).length).toBeGreaterThan(0);
    expect(validateSync(recallDto({ msgId: '' })).length).toBeGreaterThan(0);
    expect(validateSync(recallDto({ roomId: '' })).length).toBeGreaterThan(0);
  });
});
