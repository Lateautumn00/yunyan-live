import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Between } from 'typeorm';
import type { LiveRoom } from '@yunyan-live/shared';
import { ReminderService } from '../reminder.service';

type Mock = ReturnType<typeof vi.fn>;

function room(overrides: Partial<LiveRoom> = {}): LiveRoom {
  return {
    roomId: 'r1',
    title: '初二数学',
    joinCode: 'ABC1',
    type: 0,
    status: 1,
    startTime: new Date(Date.now() + 5 * 60_000),
    duration: 60,
    liveUserId: 't1',
    liveNums: 0,
    liveStartedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    ...overrides
  } as LiveRoom;
}

function makeService(opts: {
  rooms?: LiveRoom[];
  teacherEmails?: Array<{ email: string }>;
  studentEmails?: Array<{ email: string }>;
  isReady?: boolean;
  findImpl?: Mock;
  queryImpl?: Mock;
}) {
  const find = opts.findImpl ?? vi.fn().mockResolvedValue(opts.rooms ?? []);
  const teacherRows = opts.teacherEmails ?? [];
  const studentRows = opts.studentEmails ?? [];
  const query = opts.queryImpl ?? vi.fn();
  if (!opts.queryImpl) {
    query
      .mockResolvedValueOnce(teacherRows)
      .mockResolvedValueOnce(studentRows)
      .mockResolvedValue(teacherRows);
  }
  const rooms = { find };
  const db = { query };
  const notify = {
    isReady: vi.fn().mockReturnValue(opts.isReady ?? true),
    publish: vi.fn()
  };
  const service = new ReminderService(rooms as never, db as never, notify as never);
  return { service, find, query, notify };
}

const originalLead = process.env.NOTIFY_REMINDER_LEAD_MIN;

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLead === undefined) delete process.env.NOTIFY_REMINDER_LEAD_MIN;
  else process.env.NOTIFY_REMINDER_LEAD_MIN = originalLead;
});

describe('ReminderService（F9 开课提醒触发点）', () => {
  it('窗口内场次：教师 + 学生（email 非空）逐收件人发布 class_reminder', async () => {
    const { service, find, query, notify } = makeService({
      rooms: [room()],
      teacherEmails: [{ email: 'teacher@example.com' }],
      studentEmails: [{ email: 's1@example.com' }, { email: 's2@example.com' }]
    });
    await service.tick();

    // status=1 + [now, now+lead) 窗口查询
    expect(find).toHaveBeenCalledTimes(1);
    const arg = find.mock.calls[0]?.[0] as {
      where: { status: number; startTime: unknown };
      take: number;
    };
    expect(arg.where.status).toBe(1);
    expect(arg.where.startTime).toEqual(Between(expect.any(Date), expect.any(Date)));
    expect(arg.take).toBe(50);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain('r."liveUserId"');
    expect(query.mock.calls[1]?.[0]).toContain('p."roomId"');
    expect(notify.publish).toHaveBeenCalledTimes(3);
    expect(notify.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'class_reminder',
        to: 'teacher@example.com',
        scope: expect.stringContaining('r1:')
      })
    );
    expect(notify.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'class_reminder', to: 's1@example.com' })
    );
  });

  it('同场次重复 tick：内存去重不重发', async () => {
    const { service, query, notify } = makeService({
      rooms: [room()],
      teacherEmails: [{ email: 'teacher@example.com' }],
      studentEmails: []
    });
    await service.tick();
    await service.tick();
    expect(notify.publish).toHaveBeenCalledTimes(1);
    // 第二次 tick 窗口查询仍执行，但不再查收件人 SQL
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('publisher 未就绪 → 整轮跳过（不查窗口不占去重位）', async () => {
    const { service, find, notify } = makeService({
      rooms: [room()],
      teacherEmails: [{ email: 't@example.com' }],
      isReady: false
    });
    await service.tick();
    expect(find).not.toHaveBeenCalled();
    expect(notify.publish).not.toHaveBeenCalled();

    // 恢复就绪后同一场次仍会发出（未被占去重位）
    notify.isReady.mockReturnValue(true);
    await service.tick();
    expect(notify.publish).toHaveBeenCalledTimes(1);
  });

  it('窗口内无场次 → 不发布', async () => {
    const { service, query, notify } = makeService({ rooms: [] });
    await service.tick();
    expect(query).not.toHaveBeenCalled();
    expect(notify.publish).not.toHaveBeenCalled();
  });

  it('教师与学生同一邮箱 → 去重后仅发布一次', async () => {
    const { service, notify } = makeService({
      rooms: [room()],
      teacherEmails: [{ email: 'same@example.com' }],
      studentEmails: [{ email: 'same@example.com' }, { email: 's@example.com' }]
    });
    await service.tick();
    const tos = notify.publish.mock.calls.map(call => (call[0] as { to: string }).to);
    expect(tos.sort()).toEqual(['s@example.com', 'same@example.com']);
  });

  it('收件人上限 500：超出截断', async () => {
    const students = Array.from({ length: 600 }, (_, i) => ({ email: `s${i}@example.com` }));
    const { service, notify } = makeService({
      rooms: [room()],
      teacherEmails: [],
      studentEmails: students
    });
    await service.tick();
    expect(notify.publish).toHaveBeenCalledTimes(500);
  });

  it('无任何收件人：场次标记已处理，不发布，SQL 仍只查一次', async () => {
    const { service, query, notify } = makeService({
      rooms: [room()],
      teacherEmails: [],
      studentEmails: []
    });
    await service.tick();
    expect(notify.publish).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);

    await service.tick();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('DB 查询抛错 → 捕获记日志不外抛', async () => {
    const findImpl = vi.fn().mockRejectedValue(new Error('db down'));
    const { service } = makeService({ findImpl });
    await expect(service.tick()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('reminder tick failed: db down')
    );
  });

  it('lead 分钟可由 NOTIFY_REMINDER_LEAD_MIN 覆盖', async () => {
    process.env.NOTIFY_REMINDER_LEAD_MIN = '30';
    const { service, find } = makeService({ rooms: [] });
    await service.tick();
    const arg = find.mock.calls[0]?.[0] as { where: { startTime: { value: unknown } } };
    const raw = arg.where.startTime.value;
    expect(Array.isArray(raw)).toBe(true);
    const [from, to] = raw as [Date, Date];
    const spanMs = to.getTime() - from.getTime();
    expect(spanMs).toBeGreaterThan(29 * 60_000);
    expect(spanMs).toBeLessThanOrEqual(31 * 60_000);
  });

  it('改期场次（startTime 变化）按新场次重发', async () => {
    const start1 = new Date(Date.now() + 5 * 60_000);
    const start2 = new Date(Date.now() + 40 * 60_000);
    const find = vi
      .fn()
      .mockResolvedValueOnce([room({ roomId: 'r1', startTime: start1 })])
      .mockResolvedValueOnce([room({ roomId: 'r1', startTime: start2 })]);
    const queryImpl = vi.fn().mockResolvedValue([{ email: 't@example.com' }]);
    const { service, notify } = makeService({ findImpl: find, queryImpl });

    await service.tick();
    await service.tick();

    expect(notify.publish).toHaveBeenCalledTimes(2);
    const scopes = notify.publish.mock.calls.map(call => (call[0] as { scope: string }).scope);
    expect(new Set(scopes).size).toBe(2);
  });
});
