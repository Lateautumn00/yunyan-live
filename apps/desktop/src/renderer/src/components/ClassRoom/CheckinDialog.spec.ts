import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { ok } from '@/testing/utils';
import CheckinDialog from './CheckinDialog.vue';
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

function hydrateState(session: CheckinSessionInfo | null, isOwner = false) {
  mocks.checkinState.mockResolvedValue(ok({ hasSession: session !== null, isOwner, session }));
}

const c = useClassroomCheckin();

function mountDialog() {
  return mount(CheckinDialog, {
    props: { roomId: 'R1' },
    global: { plugins: [ElementPlus], components: { ...ElementPlusIconsVue } }
  });
}

type DialogWrapper = ReturnType<typeof mountDialog>;

function button(wrapper: DialogWrapper, text: string) {
  const btn = wrapper.findAll('button').find(b => b.text().includes(text));
  expect(btn, `按钮「${text}」应存在`).toBeDefined();
  return btn!;
}

function dialogModel(wrapper: DialogWrapper): boolean {
  return wrapper.findComponent({ name: 'ElDialog' }).props('modelValue') as boolean;
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

describe('components/ClassRoom/CheckinDialog.vue', () => {
  it('进行中未签自动弹窗，点「我已到」完成签到', async () => {
    hydrateState(makeSession());
    const wrapper = mountDialog();
    await flushPromises();
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(dialogModel(wrapper)).toBe(true);
    expect(wrapper.text()).toContain('老师发起了签到');

    mocks.checkinRespond.mockResolvedValue(
      ok({ signedCount: 4, alreadySigned: false, makeup: false })
    );
    await button(wrapper, '我已到').trigger('click');
    expect(mocks.checkinRespond).toHaveBeenCalledWith({
      roomId: 'R1',
      sessionId: 's1',
      makeup: false
    });
    await flushPromises();
    expect(wrapper.text()).toContain('你已签到 ✓');
    expect(document.body.textContent).toContain('签到成功');
  });

  it('进行中已签不自动弹窗', async () => {
    hydrateState(makeSession({ mySigned: true, myMethod: 1 }));
    const wrapper = mountDialog();
    await flushPromises();
    expect(dialogModel(wrapper)).toBe(false);
    expect(wrapper.find('.checkin-pill').exists()).toBe(false);
  });

  it('无签到轮次不弹窗也不显示 pill', async () => {
    const wrapper = mountDialog();
    await flushPromises();
    expect(mocks.checkinState).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(dialogModel(wrapper)).toBe(false);
    expect(wrapper.find('.checkin-pill').exists()).toBe(false);
  });

  it('已关闭开补签 → pill 兜底，可补签', async () => {
    hydrateState(makeSession({ endedAt: new Date().toISOString(), makeupOpen: true }));
    const wrapper = mountDialog();
    await flushPromises();
    expect(dialogModel(wrapper)).toBe(false);
    const pill = wrapper.find('.checkin-pill');
    expect(pill.exists()).toBe(true);

    await pill.trigger('click');
    await flushPromises();
    expect(dialogModel(wrapper)).toBe(true);
    expect(wrapper.text()).toContain('老师开启了补签');

    mocks.checkinRespond.mockResolvedValue(
      ok({ signedCount: 9, alreadySigned: false, makeup: true })
    );
    await button(wrapper, '补签').trigger('click');
    expect(mocks.checkinRespond).toHaveBeenCalledWith({
      roomId: 'R1',
      sessionId: 's1',
      makeup: true
    });
    await flushPromises();
    expect(wrapper.text()).toContain('你已签到 ✓');
    expect(document.body.textContent).toContain('补签成功');
  });

  it('已关闭未开补签显示不可补签', async () => {
    hydrateState(makeSession({ endedAt: new Date().toISOString(), makeupOpen: false }));
    const wrapper = mountDialog();
    await flushPromises();
    expect(wrapper.find('.checkin-pill').exists()).toBe(false);
    c.dialogVisible.value = true;
    await flushPromises();
    expect(wrapper.text()).toContain('签到已结束');
    expect(wrapper.text()).toContain('本轮不支持补签');
    expect(wrapper.findAll('button').some(b => b.text().includes('补签'))).toBe(false);
  });

  it('最小化后未签显示 pill，点击可重开', async () => {
    hydrateState(makeSession());
    const wrapper = mountDialog();
    await flushPromises();
    expect(dialogModel(wrapper)).toBe(true);

    await button(wrapper, '最小化').trigger('click');
    wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('closed');
    await flushPromises();
    expect(c.minimized.value).toBe(true);
    const pill = wrapper.find('.checkin-pill');
    expect(pill.exists()).toBe(true);

    await pill.trigger('click');
    await flushPromises();
    expect(dialogModel(wrapper)).toBe(true);
    expect(c.minimized.value).toBe(false);
  });

  it('已签到后最小化关闭不显示 pill', async () => {
    hydrateState(makeSession({ mySigned: true, myMethod: 1 }));
    const wrapper = mountDialog();
    await flushPromises();
    c.dialogVisible.value = true;
    await flushPromises();
    await button(wrapper, '最小化').trigger('click');
    wrapper.findComponent({ name: 'ElDialog' }).vm.$emit('closed');
    await flushPromises();
    expect(c.minimized.value).toBe(false);
    expect(wrapper.find('.checkin-pill').exists()).toBe(false);
  });
});
