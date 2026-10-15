import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { ok } from '@/testing/utils';
import CheckinPanel from './CheckinPanel.vue';
import { useClassroomCheckin, type CheckinSessionInfo } from '@/composables/useClassroomCheckin';

const mocks = vi.hoisted(() => ({
  checkinState: vi.fn(),
  checkinStart: vi.fn(),
  checkinEnd: vi.fn(),
  checkinOpenMakeup: vi.fn(),
  checkinRespond: vi.fn(),
  getNowTime: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    checkin_state: (params: unknown) => mocks.checkinState(params),
    checkin_start: (params: unknown) => mocks.checkinStart(params),
    checkin_end: (params: unknown) => mocks.checkinEnd(params),
    checkin_open_makeup: (params: unknown) => mocks.checkinOpenMakeup(params),
    checkin_respond: (params: unknown) => mocks.checkinRespond(params),
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
    attendeeCount: 8,
    signedCount: 3,
    makeupOpen: false,
    status: 1,
    mySigned: false,
    myMethod: 0,
    ...overrides
  };
}

function hydrateState(session: CheckinSessionInfo | null, isOwner = true) {
  mocks.checkinState.mockResolvedValue(ok({ hasSession: session !== null, isOwner, session }));
}

const c = useClassroomCheckin();

function mountPanel() {
  return mount(CheckinPanel, {
    props: { roomId: 'R1' },
    global: { plugins: [ElementPlus] }
  });
}

function button(wrapper: ReturnType<typeof mountPanel>, text: string) {
  const btn = wrapper.findAll('button').find(b => b.text().includes(text));
  expect(btn, `按钮「${text}」应存在`).toBeDefined();
  return btn!;
}

beforeEach(() => {
  vi.clearAllMocks();
  c.reset();
  mocks.getNowTime.mockResolvedValue(ok({ nowTime: String(Date.now()) }));
  hydrateState(null);
});

afterEach(() => {
  c.reset();
});

describe('components/ClassRoom/CheckinPanel.vue', () => {
  it('加载中显示占位', async () => {
    mocks.checkinState.mockReturnValue(new Promise(() => {}));
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('加载中');
  });

  it('无进行中签到时显示发起入口，默认60秒', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('发起签到');
    expect(wrapper.text()).toContain('60秒');
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });

    mocks.checkinStart.mockResolvedValue(ok(makeSession()));
    await button(wrapper, '发起签到').trigger('click');
    expect(mocks.checkinStart).toHaveBeenCalledWith({ roomId: 'R1', duration: 60 });
    await flushPromises();
    expect(wrapper.text()).toContain('签到进行中');
  });

  it('选择30秒后发起携带 duration=30', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const radioInput = wrapper
      .findAll<HTMLInputElement>('input[type=radio]')
      .find(el => el.element.value === '30');
    expect(radioInput, '30秒档位 input 应存在').toBeDefined();
    radioInput!.element.checked = true;
    radioInput!.element.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(c.duration.value).toBe(30);
    expect(wrapper.findAll('.el-radio-button.is-active')[0]?.text()).toContain('30秒');

    mocks.checkinStart.mockResolvedValue(ok(makeSession()));
    await button(wrapper, '发起签到').trigger('click');
    expect(mocks.checkinStart).toHaveBeenCalledWith({ roomId: 'R1', duration: 30 });
  });

  it('进行中显示倒计时与人数，可结束本轮', async () => {
    hydrateState(makeSession({ attendeeCount: 0 }));
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('签到进行中');
    expect(wrapper.text()).toContain('秒');
    expect(wrapper.text()).toContain('已签');
    expect(wrapper.text()).toContain('应到 —');

    mocks.checkinEnd.mockResolvedValue(ok(makeSession({ endedAt: new Date().toISOString() })));
    await button(wrapper, '结束本轮').trigger('click');
    expect(mocks.checkinEnd).toHaveBeenCalledWith({ roomId: 'R1', sessionId: 's1' });
    await flushPromises();
    expect(wrapper.text()).toContain('本轮已结束');
  });

  it('已结束轮次可发起新一轮', async () => {
    hydrateState(makeSession({ endedAt: new Date().toISOString() }));
    const wrapper = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain('本轮已结束');

    mocks.checkinStart.mockResolvedValue(ok(makeSession({ sessionId: 's2' })));
    await button(wrapper, '发起新一轮').trigger('click');
    expect(mocks.checkinStart).toHaveBeenCalledWith({ roomId: 'R1', duration: 60 });
    await flushPromises();
    expect(wrapper.text()).toContain('签到进行中');
  });

  it('未开补签时勾选触发 openMakeup', async () => {
    hydrateState(makeSession({ endedAt: new Date().toISOString(), makeupOpen: false }));
    const wrapper = mountPanel();
    await flushPromises();
    mocks.checkinOpenMakeup.mockResolvedValue(
      ok(makeSession({ endedAt: new Date().toISOString(), makeupOpen: true }))
    );
    const checkbox = wrapper.find('.checkin-makeup');
    expect(checkbox.exists()).toBe(true);
    const cbInput = checkbox.find('input');
    expect(cbInput.exists()).toBe(true);
    cbInput.element.checked = true;
    cbInput.element.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(mocks.checkinOpenMakeup).toHaveBeenCalledWith({ roomId: 'R1', sessionId: 's1' });
  });

  it('发起失败时提示错误且不抛出', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountPanel();
    await flushPromises();
    mocks.checkinStart.mockRejectedValue(new Error('network'));
    await button(wrapper, '发起签到').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('发起签到失败');
    expect(c.submitting.value).toBe(false);
    spy.mockRestore();
  });
});
