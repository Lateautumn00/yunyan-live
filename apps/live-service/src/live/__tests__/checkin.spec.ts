import { status as GrpcStatus } from '@grpc/grpc-js';
import { describe, expect, it, vi } from 'vitest';
import { CheckinService } from '../checkin.service';
import { expectGrpcError } from './test-utils';

type Mock = ReturnType<typeof vi.fn>;

function makeQb(result: unknown = undefined): Record<string, Mock> {
  const qb: Record<string, Mock> = {
    select: vi.fn(() => qb),
    addSelect: vi.fn(() => qb),
    where: vi.fn(() => qb),
    groupBy: vi.fn(() => qb),
    insert: vi.fn(() => qb),
    values: vi.fn(() => qb),
    orIgnore: vi.fn(() => qb),
    execute: vi.fn().mockResolvedValue({ affected: 1 }),
    getRawMany: vi.fn().mockResolvedValue(result ?? []),
    getManyAndCount: vi.fn().mockResolvedValue([[], 0])
  };
  return qb;
}

type Harness = {
  service: CheckinService;
  session: Record<string, Mock>;
  record: Record<string, Mock>;
  room: Record<string, Mock>;
  participant: Record<string, Mock>;
  queryRunner: {
    connect: Mock;
    startTransaction: Mock;
    commitTransaction: Mock;
    rollbackTransaction: Mock;
    release: Mock;
    manager: Record<string, Mock>;
  };
  snapshotQb: Record<string, Mock>;
  insertQb: Record<string, Mock>;
};

function makeService(overrides: Partial<Harness> = {}): Harness {
  const snapshotQb = makeQb([{ userId: 'u1' }, { userId: 'u2' }]);
  const insertQb = makeQb();

  const manager: Record<string, Mock> = {
    update: vi.fn().mockResolvedValue(undefined),
    create: vi.fn((_entity: unknown, input: unknown) => ({ id: 's1', ...(input as object) })),
    save: vi.fn((input: unknown) => Promise.resolve(input)),
    getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => snapshotQb) }))
  };
  const queryRunner = {
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    manager
  };

  const session: Record<string, Mock> = {
    findOne: vi.fn(),
    findAndCount: vi.fn().mockResolvedValue([[], 0]),
    save: vi.fn((input: unknown) => Promise.resolve(input)),
    count: vi.fn().mockResolvedValue(0)
  };
  const record: Record<string, Mock> = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    createQueryBuilder: vi.fn(() => insertQb)
  };
  const room: Record<string, Mock> = {
    findOne: vi.fn().mockResolvedValue({ roomId: 'r1', liveUserId: 't1' })
  };
  const participant: Record<string, Mock> = {
    findOne: vi.fn().mockResolvedValue({ id: 'p1' })
  };

  const service = new CheckinService(
    session as never,
    record as never,
    room as never,
    participant as never,
    { createQueryRunner: vi.fn(() => queryRunner) } as never
  );

  return {
    service,
    session,
    record,
    room,
    participant,
    queryRunner,
    snapshotQb,
    insertQb,
    ...overrides
  };
}

const openSession = {
  id: 's1',
  roomId: 'r1',
  teacherId: 't1',
  startedAt: new Date('2026-10-15T08:00:00Z'),
  deadlineAt: new Date(Date.now() + 60_000),
  endedAt: null as Date | null,
  attendeeIds: ['u1', 'u2'],
  attendeeCount: 2,
  makeupOpen: false
};

const closedSession = {
  ...openSession,
  endedAt: new Date('2026-10-15T08:01:00Z')
};

describe('CheckinService.create', () => {
  it('归属校验通过后：关闭旧轮 + 快照分母（排除教师）+ 同事务插入', async () => {
    const h = makeService();
    const view = await h.service.create('r1', 60, 't1');

    expect(h.queryRunner.connect).toHaveBeenCalled();
    expect(h.queryRunner.startTransaction).toHaveBeenCalled();
    expect(h.queryRunner.manager.update).toHaveBeenCalledTimes(1);
    expect(h.queryRunner.commitTransaction).toHaveBeenCalled();
    expect(h.queryRunner.release).toHaveBeenCalled();

    expect(h.snapshotQb.where).toHaveBeenCalledWith(
      'w.roomId = :roomId AND w.leftAt IS NULL AND w.userId <> :teacherId',
      { roomId: 'r1', teacherId: 't1' }
    );
    const created = h.queryRunner.manager.create.mock.calls[0][1] as Record<string, unknown>;
    expect(created.attendeeIds).toEqual(['u1', 'u2']);
    expect(created.attendeeCount).toBe(2);
    expect(created.makeupOpen).toBe(false);
    expect((created.deadlineAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(view).toMatchObject({
      sessionId: 's1',
      roomId: 'r1',
      status: 1,
      signedCount: 0,
      mySigned: false
    });
  });

  it('非房主抛 PERMISSION_DENIED', async () => {
    const h = makeService();
    h.room.findOne.mockResolvedValue({ roomId: 'r1', liveUserId: 'other' });
    await expectGrpcError(
      h.service.create('r1', 60, 't1'),
      GrpcStatus.PERMISSION_DENIED,
      '仅房间所有者可操作签到'
    );
    expect(h.queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('duration 非法抛 INVALID_ARGUMENT（不进事务）', async () => {
    const h = makeService();
    await expectGrpcError(
      h.service.create('r1', 45, 't1'),
      GrpcStatus.INVALID_ARGUMENT,
      'duration 仅支持 30/60/120 秒'
    );
    expect(h.queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('失败时回滚并释放 queryRunner', async () => {
    const h = makeService();
    h.queryRunner.manager.save.mockRejectedValue(new Error('db down'));
    await expect(h.service.create('r1', 60, 't1')).rejects.toThrow('db down');
    expect(h.queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(h.queryRunner.release).toHaveBeenCalled();
    expect(h.queryRunner.commitTransaction).not.toHaveBeenCalled();
  });
});

describe('CheckinService.respond', () => {
  it('窗口内正常签到：method=1、返回累计签名数', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    h.record.count.mockResolvedValue(3);
    const res = await h.service.respond({ roomId: 'r1', sessionId: 's1' }, 'u3');
    expect(h.insertQb.values).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', userId: 'u3', method: 1 })
    );
    expect(res).toEqual({
      sessionId: 's1',
      signedCount: 3,
      alreadySigned: false,
      makeup: false
    });
  });

  it('重复签到：已有记录 → alreadySigned 且不再插入', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    h.record.findOne.mockResolvedValue({ userId: 'u1', method: 1 });
    h.record.count.mockResolvedValue(2);
    const res = await h.service.respond({ roomId: 'r1', sessionId: 's1' }, 'u1');
    expect(res.alreadySigned).toBe(true);
    expect(res.signedCount).toBe(2);
    expect(h.insertQb.values).not.toHaveBeenCalled();
  });

  it('窗口已过且未带 makeup → FAILED_PRECONDITION', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession });
    await expectGrpcError(
      h.service.respond({ roomId: 'r1', sessionId: 's1' }, 'u1'),
      GrpcStatus.FAILED_PRECONDITION,
      '签到已截止'
    );
  });

  it('补签未开启 → FAILED_PRECONDITION', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession });
    await expectGrpcError(
      h.service.respond({ roomId: 'r1', sessionId: 's1', makeup: true }, 'u1'),
      GrpcStatus.FAILED_PRECONDITION,
      '本轮未开启补签'
    );
  });

  it('补签已开启 → method=2、makeup=true', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession, makeupOpen: true });
    h.record.count.mockResolvedValue(5);
    const res = await h.service.respond({ roomId: 'r1', sessionId: 's1', makeup: true }, 'u9');
    expect(h.insertQb.values).toHaveBeenCalledWith(
      expect.objectContaining({ method: 2, userId: 'u9' })
    );
    expect(res.makeup).toBe(true);
    expect(res.signedCount).toBe(5);
  });

  it('非教室成员抛 PERMISSION_DENIED', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    h.participant.findOne.mockResolvedValue(null);
    await expectGrpcError(
      h.service.respond({ roomId: 'r1', sessionId: 's1' }, 'x'),
      GrpcStatus.PERMISSION_DENIED,
      '仅教室内学生可签到'
    );
  });

  it('会话不存在或跨房间抛 NOT_FOUND', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue(null);
    await expectGrpcError(
      h.service.respond({ roomId: 'r1', sessionId: 'missing' }, 'u1'),
      GrpcStatus.NOT_FOUND,
      '签到不存在'
    );
  });
});

describe('CheckinService.end / openMakeup', () => {
  it('end：未结束时写 endedAt 幂等保存', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    await h.service.end('r1', 's1', 't1');
    expect(h.session.save).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: expect.any(Date) })
    );
  });

  it('end：已结束不回写', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession });
    await h.service.end('r1', 's1', 't1');
    expect(h.session.save).not.toHaveBeenCalled();
  });

  it('end：非房主抛 PERMISSION_DENIED（严格归属）', async () => {
    const h = makeService();
    h.room.findOne.mockResolvedValue({ roomId: 'r1', liveUserId: 'other' });
    await expectGrpcError(
      h.service.end('r1', 's1', 't1'),
      GrpcStatus.PERMISSION_DENIED,
      '仅房间所有者可操作签到'
    );
  });

  it('openMakeup：进行中不可开', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    await expectGrpcError(
      h.service.openMakeup('r1', 's1', 't1'),
      GrpcStatus.FAILED_PRECONDITION,
      '签到进行中，无需补签'
    );
  });

  it('openMakeup：已关闭时置 makeupOpen=true', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession });
    await h.service.openMakeup('r1', 's1', 't1');
    expect(h.session.save).toHaveBeenCalledWith(expect.objectContaining({ makeupOpen: true }));
  });

  it('openMakeup：已开启时幂等不保存', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession, makeupOpen: true });
    await h.service.openMakeup('r1', 's1', 't1');
    expect(h.session.save).not.toHaveBeenCalled();
  });
});

describe('CheckinService.state', () => {
  it('无历史会话 → hasSession=false 且带 isOwner', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue(null);
    const res = await h.service.state('r1', 't1');
    expect(res).toEqual({ hasSession: false, isOwner: true, session: null });
  });

  it('房主水合：状态派生 + 计数 + 我的记录', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...closedSession });
    h.record.count.mockResolvedValue(1);
    h.record.findOne.mockResolvedValue({ userId: 't1', method: 2 });
    const res = await h.service.state('r1', 't1');
    expect(res.isOwner).toBe(true);
    expect(res.session).toMatchObject({
      sessionId: 's1',
      status: 2,
      signedCount: 1,
      mySigned: true,
      myMethod: 2
    });
  });

  it('非房主且非成员 → PERMISSION_DENIED', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    h.participant.findOne.mockResolvedValue(null);
    await expectGrpcError(
      h.service.state('r1', 'x'),
      GrpcStatus.PERMISSION_DENIED,
      '无权查看该签到'
    );
  });

  it('非房主成员可水合', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    const res = await h.service.state('r1', 'u1');
    expect(res).toMatchObject({ hasSession: true, isOwner: false });
    expect(res.session).toMatchObject({ status: 1, mySigned: false });
  });
});

describe('CheckinService.listSessions / records', () => {
  it('listSessions：分页透传 + 按页聚合计数', async () => {
    const h = makeService();
    h.session.findAndCount.mockResolvedValue([
      [{ ...openSession }, { ...openSession, id: 's2' }],
      7
    ]);
    const countsQb = makeQb([
      { sessionId: 's1', cnt: '3' },
      { sessionId: 's2', cnt: '4' }
    ]);
    h.record.createQueryBuilder.mockReturnValue(countsQb);
    const res = await h.service.listSessions('r1', 2, 10, 't1');
    const args = h.session.findAndCount.mock.calls[0][0] as Record<string, unknown>;
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(res.total).toBe(7);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({ sessionId: 's1', signedCount: 3 });
    expect(res.items[1]).toMatchObject({ sessionId: 's2', signedCount: 4 });
  });

  it('records：应到行 + 分母外附加行 + 出勤口径计数', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession, attendeeIds: ['u1', 'u2'] });
    h.record.find.mockResolvedValue([
      { sessionId: 's1', userId: 'u1', method: 1, respondedAt: new Date('2026-10-15T08:00:30Z') },
      { sessionId: 's1', userId: 'u9', method: 2, respondedAt: new Date('2026-10-15T08:05:00Z') }
    ]);
    const res = await h.service.records('s1', 't1');
    expect(res.attendeeCount).toBe(2);
    expect(res.signedCount).toBe(2);
    expect(res.attendedCount).toBe(1);
    expect(res.items).toHaveLength(3);
    expect(res.items[0]).toMatchObject({
      userId: 'u1',
      inDenominator: true,
      signed: true,
      method: 1
    });
    expect(res.items[1]).toMatchObject({ userId: 'u2', inDenominator: true, signed: false });
    expect(res.items[2]).toMatchObject({ userId: 'u9', inDenominator: false, signed: true });
  });

  it('records：非房主非成员抛 PERMISSION_DENIED', async () => {
    const h = makeService();
    h.session.findOne.mockResolvedValue({ ...openSession });
    h.room.findOne.mockResolvedValue({ roomId: 'r1', liveUserId: 't1' });
    h.participant.findOne.mockResolvedValue(null);
    await expectGrpcError(
      h.service.records('s1', 'x'),
      GrpcStatus.PERMISSION_DENIED,
      '无权查看签到明细'
    );
  });
});
