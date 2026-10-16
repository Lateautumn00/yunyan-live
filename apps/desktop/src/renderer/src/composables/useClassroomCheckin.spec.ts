import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ok } from '@/testing/utils';
import {
  useClassroomCheckin,
  type CheckinRecordItem,
  type CheckinRecordsData,
  type CheckinSessionInfo
} from './useClassroomCheckin';

const mocks = vi.hoisted(() => ({
  checkinState: vi.fn(),
  checkinStart: vi.fn(),
  checkinEnd: vi.fn(),
  checkinOpenMakeup: vi.fn(),
  checkinRespond: vi.fn(),
  checkinRecords: vi.fn(),
  getNowTime: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    checkin_state: (params: unknown) => mocks.checkinState(params),
    checkin_start: (params: unknown) => mocks.checkinStart(params),
    checkin_end: (params: unknown) => mocks.checkinEnd(params),
    checkin_open_makeup: (params: unknown) => mocks.checkinOpenMakeup(params),
    checkin_respond: (params: unknown) => mocks.checkinRespond(params),
    checkin_records: (sessionId: unknown) => mocks.checkinRecords(sessionId),
    getNowTime: () => mocks.getNowTime()
  }
}));

function makeSession(overrides: Partial<CheckinSessionInfo> = {}): CheckinSessionInfo {
  return {
    sessionId: 's1',
    roomId: 'R1',
    startedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    endedAt: null,
    attendeeCount: 10,
    signedCount: 3,
    makeupOpen: false,
    status: 1,
    mySigned: false,
    myMethod: 0,
    ...overrides
  };
}

function hydrateState(session: CheckinSessionInfo | null, isOwner = false) {
  mocks.checkinState.mockResolvedValue(ok({ hasSession: session !== null, isOwner, session }));
}

function recordsData(items: CheckinRecordItem[] = []): CheckinRecordsData {
  return { items, total: items.length, attendeeCount: 0, signedCount: 0, attendedCount: 0 };
}

function makeRecord(overrides: Partial<CheckinRecordItem> = {}): CheckinRecordItem {
  return {
    userId: 'u1',
    nickName: '甲',
    inDenominator: true,
    signed: true,
    method: 1,
    respondedAt: '2026-10-15T08:00:30.000Z',
    ...overrides
  };
}

const c = useClassroomCheckin();

beforeEach(() => {
  vi.clearAllMocks();
  c.reset();
  mocks.getNowTime.mockResolvedValue(ok({ nowTime: String(Date.now()) }));
  mocks.checkinRecords.mockResolvedValue(ok(recordsData()));
});

afterEach(() => {
  c.reset();
});

describe('composables/useClassroomCheckin', () => {
  it('hydrate 水合状态与服务器时间', async () => {
    hydrateState(makeSession(), true);
    await c.hydrate('R1');
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(c.hasSession.value).toBe(true);
    expect(c.isOwner.value).toBe(true);
    expect(c.session.value?.sessionId).toBe('s1');
    expect(c.closed.value).toBe(false);
    expect(c.remaining.value).toBeGreaterThan(0);
    expect(c.loading.value).toBe(false);
  });

  it('hydrate 失败不抛出并复位 loading', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.checkinState.mockRejectedValue(new Error('boom'));
    await expect(c.hydrate('R1')).resolves.toBeUndefined();
    expect(c.session.value).toBeNull();
    expect(c.loading.value).toBe(false);
    spy.mockRestore();
  });

  it('hydrate 失败置 error，下次成功后清除', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.checkinState.mockRejectedValue(new Error('boom'));
    await c.hydrate('R1');
    expect(c.error.value).toBe(true);
    hydrateState(makeSession());
    await c.hydrate('R1');
    expect(c.error.value).toBe(false);
    expect(c.session.value?.sessionId).toBe('s1');
    spy.mockRestore();
  });

  it('hydrate 竞态：旧响应晚到不覆盖新 session', async () => {
    let resolveStale!: (v: unknown) => void;
    mocks.checkinState
      .mockReturnValueOnce(new Promise(resolve => (resolveStale = resolve)))
      .mockResolvedValueOnce(ok({ hasSession: true, isOwner: false, session: makeSession() }));
    const stale = c.hydrate('R1');
    await c.hydrate('R1');
    expect(c.session.value?.sessionId).toBe('s1');
    resolveStale(ok({ hasSession: false, isOwner: false, session: null }));
    await stale;
    expect(c.session.value?.sessionId).toBe('s1');
    expect(c.hasSession.value).toBe(true);
    expect(c.loading.value).toBe(false);
  });

  it('三态派生：过期即关，手动结束即关', async () => {
    hydrateState(makeSession({ deadlineAt: new Date(Date.now() - 1000).toISOString() }));
    await c.hydrate('R1');
    expect(c.closed.value).toBe(true);

    c.reset();
    hydrateState(makeSession({ endedAt: new Date().toISOString() }));
    await c.hydrate('R1');
    expect(c.closed.value).toBe(true);
  });

  it('应到为 0 时 attendeeLabel 显示 —', async () => {
    hydrateState(makeSession({ attendeeCount: 0 }));
    await c.hydrate('R1');
    expect(c.attendeeLabel.value).toBe('—');
  });

  it('start 发起并标记负责人口径', async () => {
    mocks.checkinStart.mockResolvedValue(ok(makeSession({ sessionId: 's2' })));
    await c.start('R1', 30);
    expect(mocks.checkinStart).toHaveBeenCalledWith({ roomId: 'R1', duration: 30 });
    expect(c.session.value?.sessionId).toBe('s2');
    expect(c.hasSession.value).toBe(true);
    expect(c.isOwner.value).toBe(true);
    expect(c.submitting.value).toBe(false);
  });

  it('respond 签到成功且旧计数不回退（修订②）', async () => {
    hydrateState(makeSession({ signedCount: 5 }));
    await c.hydrate('R1');
    mocks.checkinRespond.mockResolvedValue(
      ok({ signedCount: 4, alreadySigned: false, makeup: false })
    );
    await c.respond('R1');
    expect(mocks.checkinRespond).toHaveBeenCalledWith({
      roomId: 'R1',
      sessionId: 's1',
      makeup: false
    });
    expect(c.session.value?.mySigned).toBe(true);
    expect(c.session.value?.myMethod).toBe(1);
    expect(c.session.value?.signedCount).toBe(5);
    expect(c.submitting.value).toBe(false);
  });

  it('respond 补签标记 method=2 且新计数生效', async () => {
    hydrateState(makeSession({ signedCount: 5 }));
    await c.hydrate('R1');
    mocks.checkinRespond.mockResolvedValue(
      ok({ signedCount: 7, alreadySigned: false, makeup: true })
    );
    await c.respond('R1', true);
    expect(mocks.checkinRespond).toHaveBeenCalledWith({
      roomId: 'R1',
      sessionId: 's1',
      makeup: true
    });
    expect(c.session.value?.myMethod).toBe(2);
    expect(c.session.value?.signedCount).toBe(7);
  });

  it('respond 无 session 时直接返回', async () => {
    await c.respond('R1');
    expect(mocks.checkinRespond).not.toHaveBeenCalled();
  });

  it('end 结束本轮后本地关闭', async () => {
    hydrateState(makeSession());
    await c.hydrate('R1');
    const endedAt = new Date().toISOString();
    mocks.checkinEnd.mockResolvedValue(ok(makeSession({ endedAt })));
    await c.end('R1');
    expect(mocks.checkinEnd).toHaveBeenCalledWith({ roomId: 'R1', sessionId: 's1' });
    expect(c.session.value?.endedAt).toBe(endedAt);
    expect(c.closed.value).toBe(true);
  });

  it('openMakeup 开启补签', async () => {
    hydrateState(makeSession({ endedAt: new Date().toISOString() }));
    await c.hydrate('R1');
    mocks.checkinOpenMakeup.mockResolvedValue(
      ok(makeSession({ endedAt: new Date().toISOString(), makeupOpen: true }))
    );
    await c.openMakeup('R1');
    expect(mocks.checkinOpenMakeup).toHaveBeenCalledWith({ roomId: 'R1', sessionId: 's1' });
    expect(c.session.value?.makeupOpen).toBe(true);
  });

  it('handleWs started 触发水合并打开弹窗', async () => {
    hydrateState(makeSession());
    c.handleWs({ roomId: 'R1', action: 'started', sessionId: 's1' });
    await flushPromises();
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(c.dialogVisible.value).toBe(true);
    expect(c.minimized.value).toBe(false);
  });

  it('handleWs started 乐观建态：hydrate 挂起时已有 sessionId 与倒计时', async () => {
    mocks.checkinState.mockReturnValue(new Promise(() => {}));
    const deadlineAt = new Date(Date.now() + 30_000).toISOString();
    c.handleWs({ roomId: 'R1', action: 'started', sessionId: 's9', deadlineAt });
    expect(c.dialogVisible.value).toBe(true);
    expect(c.session.value?.sessionId).toBe('s9');
    expect(c.session.value?.deadlineAt).toBe(deadlineAt);
    expect(c.hasSession.value).toBe(true);
    expect(c.closed.value).toBe(false);
    expect(c.remaining.value).toBeGreaterThan(0);
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });
  });

  it('handleWs update 计数只增（修订②）', async () => {
    hydrateState(makeSession({ signedCount: 5 }));
    await c.hydrate('R1');
    c.handleWs({ roomId: 'R1', action: 'update', sessionId: 's1', signedCount: 3 });
    expect(c.session.value?.signedCount).toBe(5);
    c.handleWs({ roomId: 'R1', action: 'update', sessionId: 's1', signedCount: 7 });
    expect(c.session.value?.signedCount).toBe(7);
  });

  it('handleWs ended 关闭本地倒计时', async () => {
    hydrateState(makeSession());
    await c.hydrate('R1');
    c.handleWs({ roomId: 'R1', action: 'ended', sessionId: 's1', signedCount: 6 });
    expect(c.session.value?.endedAt).toBeTruthy();
    expect(c.closed.value).toBe(true);
    expect(c.session.value?.signedCount).toBe(6);
  });

  it('handleWs makeup 标记补签开启', async () => {
    hydrateState(makeSession({ endedAt: new Date().toISOString() }));
    await c.hydrate('R1');
    c.handleWs({ roomId: 'R1', action: 'makeup', sessionId: 's1' });
    expect(c.session.value?.makeupOpen).toBe(true);
  });

  it('handleWs 未知 session 触发重新水合', async () => {
    hydrateState(makeSession());
    c.handleWs({ roomId: 'R1', action: 'update', sessionId: 'other', signedCount: 9 });
    await flushPromises();
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });
  });

  it('handleWs 缺 sessionId 的脏帧被忽略', async () => {
    c.handleWs({ roomId: 'R1', action: 'update', sessionId: '' });
    await flushPromises();
    expect(mocks.checkinState).not.toHaveBeenCalled();
    c.handleWs(undefined);
    expect(c.dialogVisible.value).toBe(false);
  });

  it('owner hydrate 拉取名单并填充，学生端不拉取', async () => {
    hydrateState(makeSession(), true);
    mocks.checkinRecords.mockResolvedValue(ok(recordsData([makeRecord()])));
    await c.hydrate('R1');
    expect(mocks.checkinRecords).toHaveBeenCalledWith('s1');
    expect(c.records.value).toHaveLength(1);
    expect(c.records.value[0]?.nickName).toBe('甲');
    expect(c.recordsLoading.value).toBe(false);

    c.reset();
    hydrateState(makeSession(), false);
    await c.hydrate('R1');
    expect(mocks.checkinRecords).toHaveBeenCalledTimes(1);
    expect(c.records.value).toHaveLength(0);
  });

  it('水合无 session 时清空名单', async () => {
    hydrateState(makeSession(), true);
    mocks.checkinRecords.mockResolvedValue(ok(recordsData([makeRecord()])));
    await c.hydrate('R1');
    expect(c.records.value).toHaveLength(1);

    hydrateState(null, true);
    await c.hydrate('R1');
    expect(c.records.value).toHaveLength(0);
    expect(c.recordsLoading.value).toBe(false);
  });

  it('名单拉取失败仅告警，不影响水合结果', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    hydrateState(makeSession(), true);
    mocks.checkinRecords.mockRejectedValue(new Error('net'));
    await c.hydrate('R1');
    expect(c.session.value?.sessionId).toBe('s1');
    expect(c.records.value).toHaveLength(0);
    expect(c.recordsLoading.value).toBe(false);
    expect(spy).toHaveBeenCalledWith('checkin records failed:', expect.any(Error));
    spy.mockRestore();
  });

  it('名单竞态：旧响应晚到被丢弃', async () => {
    hydrateState(makeSession(), true);
    let resolveStale!: (v: unknown) => void;
    mocks.checkinRecords
      .mockReturnValueOnce(new Promise(resolve => (resolveStale = resolve)))
      .mockResolvedValueOnce(ok(recordsData([makeRecord({ nickName: '新' })])));
    const stale = c.hydrate('R1');
    await flushPromises();
    await c.hydrate('R1');
    expect(c.records.value[0]?.nickName).toBe('新');
    resolveStale(ok(recordsData([makeRecord({ nickName: '旧' })])));
    await stale;
    expect(c.records.value[0]?.nickName).toBe('新');
  });

  it('update/ended 帧在同轮次触发名单刷新（owner），学生端不触发', async () => {
    hydrateState(makeSession(), true);
    await c.hydrate('R1');
    expect(mocks.checkinRecords).toHaveBeenCalledTimes(1);

    c.handleWs({ roomId: 'R1', action: 'update', sessionId: 's1', signedCount: 4 });
    await flushPromises();
    expect(mocks.checkinRecords).toHaveBeenCalledTimes(2);
    expect(mocks.checkinRecords).toHaveBeenLastCalledWith('s1');

    c.handleWs({ roomId: 'R1', action: 'ended', sessionId: 's1', signedCount: 4 });
    await flushPromises();
    expect(mocks.checkinRecords).toHaveBeenCalledTimes(3);

    c.reset();
    hydrateState(makeSession(), false);
    await c.hydrate('R1');
    const studentCalls = mocks.checkinRecords.mock.calls.length;
    c.handleWs({ roomId: 'R1', action: 'update', sessionId: 's1', signedCount: 5 });
    await flushPromises();
    expect(mocks.checkinRecords.mock.calls.length).toBe(studentCalls);
  });

  it('start 清空旧名单并为新轮次拉取', async () => {
    hydrateState(makeSession(), true);
    mocks.checkinRecords.mockResolvedValue(ok(recordsData([makeRecord()])));
    await c.hydrate('R1');
    expect(c.records.value).toHaveLength(1);

    mocks.checkinRecords.mockResolvedValue(ok(recordsData()));
    mocks.checkinStart.mockResolvedValue(ok(makeSession({ sessionId: 's2' })));
    await c.start('R1', 30);
    expect(c.records.value).toHaveLength(0);
    expect(mocks.checkinRecords).toHaveBeenLastCalledWith('s2');
  });

  it('reset 清空全部状态', async () => {
    hydrateState(makeSession(), true);
    mocks.checkinRecords.mockResolvedValue(ok(recordsData([makeRecord()])));
    await c.hydrate('R1');
    expect(c.records.value).toHaveLength(1);
    c.reset();
    expect(c.session.value).toBeNull();
    expect(c.hasSession.value).toBe(false);
    expect(c.isOwner.value).toBe(false);
    expect(c.dialogVisible.value).toBe(false);
    expect(c.minimized.value).toBe(false);
    expect(c.loading.value).toBe(false);
    expect(c.submitting.value).toBe(false);
    expect(c.duration.value).toBe(60);
    expect(c.records.value).toHaveLength(0);
    expect(c.recordsLoading.value).toBe(false);
  });
});
