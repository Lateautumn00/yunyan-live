import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKIN_CHANNEL,
  CheckinSessionActionDto,
  StartCheckinDto,
  RespondCheckinDto
} from '@yunyan-live/nest-shared';
import { CheckinController } from './checkin.controller';

const grpcSession = {
  session_id: 's1',
  room_id: 'r1',
  teacher_id: 't1',
  started_at: '2026-10-15T08:00:00.000Z',
  deadline_at: '2026-10-15T08:01:00.000Z',
  ended_at: '',
  attendee_count: 5,
  signed_count: 2,
  makeup_open: false,
  status: 1,
  my_signed: false,
  my_method: 0
};

function makeController() {
  const live = {
    createCheckin: vi.fn().mockReturnValue(of({ code: '0', msg: 'success', data: grpcSession })),
    respondCheckin: vi
      .fn()
      .mockReturnValue(
        of({ code: '0', msg: 'success', signed_count: 3, already_signed: false, makeup: false })
      ),
    endCheckin: vi
      .fn()
      .mockReturnValue(
        of({
          code: '0',
          msg: 'success',
          data: { ...grpcSession, ended_at: '2026-10-15T08:01:00.000Z' }
        })
      ),
    openCheckinMakeup: vi
      .fn()
      .mockReturnValue(
        of({ code: '0', msg: 'success', data: { ...grpcSession, makeup_open: true } })
      ),
    getCheckinState: vi
      .fn()
      .mockReturnValue(
        of({
          code: '0',
          msg: 'success',
          data: { has_session: true, is_owner: true, session: grpcSession }
        })
      ),
    listCheckinSessions: vi
      .fn()
      .mockReturnValue(of({ code: '0', msg: 'success', data: { items: [grpcSession], total: 7 } })),
    getCheckinRecords: vi.fn().mockReturnValue(
      of({
        code: '0',
        msg: 'success',
        data: {
          items: [
            {
              user_id: 'u1',
              in_denominator: true,
              signed: true,
              method: 1,
              responded_at: '2026-10-15T08:00:30.000Z'
            },
            {
              user_id: 'u2',
              in_denominator: false,
              signed: false,
              method: 0,
              responded_at: ''
            }
          ],
          total: 2,
          attendee_count: 5,
          signed_count: 1,
          attended_count: 1
        }
      })
    )
  };
  const auth = {
    batchGetUsers: vi
      .fn()
      .mockReturnValue(of({ code: '0', msg: 'success', data: [{ id: 'u1', username: '张三' }] }))
  };
  const redis = { publish: vi.fn().mockResolvedValue(1) };
  const liveClient = { getService: vi.fn(() => live) };
  const authClient = { getService: vi.fn(() => auth) };
  const controller = new CheckinController(
    liveClient as never,
    authClient as never,
    redis as never
  );
  controller.onModuleInit();
  return { controller, live, auth, redis };
}

function req(userId = 't1') {
  return { user: { userId } };
}

describe('CheckinController', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start：gRPC 创建 + 广播 started（含 deadlineAt）+ camelCase envelope', async () => {
    const { controller, live, redis } = makeController();
    const dto = Object.assign(new StartCheckinDto(), { roomId: 'r1', duration: 60 });
    const res = await controller.start(dto, req());
    expect(live.createCheckin).toHaveBeenCalledWith(
      { room_id: 'r1', duration: 60 },
      expect.anything()
    );
    expect(res.code).toBe(1000);
    expect(res.data).toMatchObject({
      sessionId: 's1',
      roomId: 'r1',
      deadlineAt: '2026-10-15T08:01:00.000Z',
      endedAt: null,
      signedCount: 2
    });
    expect(redis.publish).toHaveBeenCalledTimes(1);
    const [channel, raw] = redis.publish.mock.calls[0];
    expect(channel).toBe(CHECKIN_CHANNEL);
    expect(JSON.parse(raw)).toEqual({
      roomId: 'r1',
      action: 'started',
      sessionId: 's1',
      deadlineAt: '2026-10-15T08:01:00.000Z'
    });
  });

  it('respond：gRPC makeup 透传 + 广播 update（signedCount）', async () => {
    const { controller, live, redis } = makeController();
    const dto = Object.assign(new RespondCheckinDto(), {
      roomId: 'r1',
      sessionId: 's1',
      makeup: true
    });
    const res = await controller.respond(dto, req('u1'));
    expect(live.respondCheckin).toHaveBeenCalledWith(
      { room_id: 'r1', session_id: 's1', makeup: true },
      expect.anything()
    );
    expect(res.data).toEqual({ signedCount: 3, alreadySigned: false, makeup: false });
    const [channel, raw] = redis.publish.mock.calls[0];
    expect(channel).toBe(CHECKIN_CHANNEL);
    expect(JSON.parse(raw)).toEqual({
      roomId: 'r1',
      action: 'update',
      sessionId: 's1',
      signedCount: 3
    });
  });

  it('respond：Redis publish 失败仅告警，HTTP 结果不受影响（评审修订①）', async () => {
    const { controller, redis } = makeController();
    redis.publish.mockRejectedValue(new Error('redis down'));
    const dto = Object.assign(new RespondCheckinDto(), { roomId: 'r1', sessionId: 's1' });
    const res = await controller.respond(dto, req('u1'));
    expect(res.code).toBe(1000);
    expect(res.data).toMatchObject({ signedCount: 3 });
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('end：广播 ended 并返回结束后的会话', async () => {
    const { controller, redis } = makeController();
    const res = await controller.end(
      Object.assign(new CheckinSessionActionDto(), { roomId: 'r1', sessionId: 's1' }),
      req()
    );
    expect(res.data.endedAt).toBe('2026-10-15T08:01:00.000Z');
    const [channel, raw] = redis.publish.mock.calls[0];
    expect(channel).toBe(CHECKIN_CHANNEL);
    expect(JSON.parse(raw)).toMatchObject({ action: 'ended', sessionId: 's1' });
  });

  it('openMakeup：广播 makeup', async () => {
    const { controller, redis } = makeController();
    const dto = Object.assign(new CheckinSessionActionDto(), { roomId: 'r1', sessionId: 's1' });
    const res = await controller.openMakeup(dto, req());
    expect(res.data.makeupOpen).toBe(true);
    const [, raw] = redis.publish.mock.calls[0];
    expect(JSON.parse(raw)).toMatchObject({ action: 'makeup', sessionId: 's1' });
  });

  it('state：水合数据且不广播', async () => {
    const { controller, redis } = makeController();
    const res = await controller.state('r1', req('t1'));
    expect(res.data).toMatchObject({ hasSession: true, isOwner: true });
    expect(res.data.session).toMatchObject({ sessionId: 's1' });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('state：无会话时 session 为 null', async () => {
    const { controller, live } = makeController();
    live.getCheckinState.mockReturnValue(
      of({ code: '0', msg: 'success', data: { has_session: false, is_owner: false } })
    );
    const res = await controller.state('r1', req('u1'));
    expect(res.data).toEqual({ hasSession: false, isOwner: false, session: null });
  });

  it('sessions：分页透传 + 会话 camelCase 列表', async () => {
    const { controller, live } = makeController();
    const res = await controller.sessions('r1', '2', '10', req());
    expect(live.listCheckinSessions).toHaveBeenCalledWith(
      { room_id: 'r1', page: 2, page_size: 10 },
      expect.anything()
    );
    expect(res.data.total).toBe(7);
    expect(res.data.items[0]).toMatchObject({ sessionId: 's1', attendeeCount: 5 });
  });

  it('records：用户名解析回填 nickName，缺失时回退 user_id', async () => {
    const { controller, auth } = makeController();
    const res = await controller.records('s1', req('t1'));
    expect(auth.batchGetUsers).toHaveBeenCalledWith({ user_ids: ['u1', 'u2'] });
    expect(res.data.items[0]).toMatchObject({
      userId: 'u1',
      nickName: '张三',
      inDenominator: true
    });
    expect(res.data.items[1]).toMatchObject({ userId: 'u2', nickName: 'u2' });
    expect(res.data).toMatchObject({ attendeeCount: 5, signedCount: 1, attendedCount: 1 });
  });

  it('records：auth 失败时降级（不抛错）', async () => {
    const { controller, auth } = makeController();
    auth.batchGetUsers.mockReturnValue(throwError(() => new Error('auth down')));
    const res = await controller.records('s1', req('t1'));
    expect(res.data.items[0].nickName).toBe('u1');
  });
});

describe('Checkin DTO 校验', () => {
  it('StartCheckinDto.duration 仅 30/60/120', async () => {
    const { validateSync } = await import('class-validator');
    const invalid = Object.assign(new StartCheckinDto(), { roomId: 'r1', duration: 45 });
    expect(validateSync(invalid).length).toBeGreaterThan(0);
    for (const duration of [30, 60, 120]) {
      const dto = Object.assign(new StartCheckinDto(), { roomId: 'r1', duration });
      expect(validateSync(dto)).toHaveLength(0);
    }
  });

  it('RespondCheckinDto.makeup 可选布尔', async () => {
    const { validateSync } = await import('class-validator');
    const dto = Object.assign(new RespondCheckinDto(), { roomId: 'r1', sessionId: 's1' });
    expect(validateSync(dto)).toHaveLength(0);
    const bad = Object.assign(new RespondCheckinDto(), {
      roomId: 'r1',
      sessionId: 's1',
      makeup: 'yes'
    });
    expect(validateSync(bad).length).toBeGreaterThan(0);
  });
});
