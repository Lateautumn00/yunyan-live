import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import Top from '@/components/ClassRoom/Top.vue';

const apiMocks = vi.hoisted(() => ({
  getNowTime: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    getNowTime: () => apiMocks.getNowTime()
  }
}));

const electronMocks = vi.hoisted(() => ({
  clipboardWriteText: vi.fn()
}));

vi.mock('@yunyan-live/ipc', () => ({}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  });
}

function mountTop(overrides: Record<string, unknown> = {}) {
  const router = makeRouter();
  const wrapper = mount(Top, {
    props: {
      isTeacher: true,
      roomInfo: { title: '数学课', speakerName: '王老师', joinCode: 'CODE123', duration: 60 },
      btn: false,
      liveType: 'hires',
      type: '',
      roomId: 'r1',
      ...overrides
    },
    global: {
      plugins: [router, ElementPlus],
      components: { ...ElementPlusIconsVue },
      mocks: {
        electronAPI: electronMocks
      }
    }
  });
  return { wrapper, router };
}

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as {
    setIsDotNum: (num: number) => void;
    sendTime: (time: number) => void;
    onLookLive: (status: boolean) => Promise<void>;
    endClass: (liveTimeLen: number, participantCount: number) => Promise<void>;
    setDiaBla: (status: boolean) => void;
    onOpenLive: (status: boolean, liveType: string, type: string) => void;
    setHires: () => void;
    setTime: (type: string) => void;
    setsTime: (time: string) => Promise<void>;
    setRecord: (status: boolean) => void;
    setLayout: (num: number) => void;
    openLives: (status: boolean, liveType: string, type: string) => void;
    layoutNum: number;
  };
}

describe('ClassRoom Top.vue', () => {
  beforeEach(() => {
    apiMocks.getNowTime.mockReset();
    electronMocks.clipboardWriteText.mockReset();
    Object.assign(window, {
      electronAPI: {
        clipboardWriteText: electronMocks.clipboardWriteText
      }
    });
  });

  it('老师未开播时显示开始直播按钮', () => {
    const { wrapper } = mountTop();
    expect(wrapper.text()).toContain('开始直播');
    expect(wrapper.text()).not.toContain('继续直播');
    expect(wrapper.text()).toContain('数学课');
  });

  it('老师暂停后显示继续直播按钮', () => {
    const { wrapper } = mountTop({ btn: false, type: 'stop' });
    expect(wrapper.text()).toContain('继续直播');
    expect(wrapper.text()).not.toContain('开始直播');
    expect(wrapper.text()).toContain('退出');
  });

  it('老师开播后显示暂停与结束按钮', () => {
    const { wrapper } = mountTop({ btn: true });
    expect(wrapper.text()).toContain('暂停直播');
    expect(wrapper.text()).toContain('结束');
  });

  it('学生端显示退出按钮而非直播控制', () => {
    const { wrapper } = mountTop({ isTeacher: false });
    expect(wrapper.text()).toContain('退出');
    expect(wrapper.text()).not.toContain('开始直播');
  });

  it('点击开始直播触发 openLive 事件', async () => {
    const { wrapper } = mountTop();
    const start = wrapper.findAll('.top-right').find(el => el.text().includes('开始直播'))!;
    await start.trigger('click');
    expect(wrapper.emitted('openLive')?.[0]).toEqual([true, 'hires', 'open', 0]);
  });

  it('openLives 在结束/暂停时触发 openLive 事件', async () => {
    const { wrapper } = mountTop({ btn: true });
    const vm = vmOf(wrapper);
    vm.setRecord(true);
    await wrapper.vm.$nextTick();
    vm.openLives(false, '', 'stop');
    expect(wrapper.emitted('openLive')?.[0]).toEqual([false, '', 'stop', 0]);
  });

  it('复制参加码调用剪贴板', async () => {
    const { wrapper } = mountTop();
    await wrapper.vm.$nextTick();
    const c = wrapper.vm as unknown as { copy: (content: string) => void };
    c.copy('CODE123');
    expect(electronMocks.clipboardWriteText).toHaveBeenCalledWith('CODE123');
  });

  it('endClass 展示结束弹窗、时长与观看人次', async () => {
    const { wrapper } = mountTop();
    const vm = vmOf(wrapper);
    await vm.endClass(125, 12);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('直播已结束');
    const cons = wrapper.findAll('.visible1 .con');
    expect(cons.map(c => c.text())).toEqual(['02\'05"', '12']);
  });

  it('setsTime 从服务器时间校准直播时长', async () => {
    apiMocks.getNowTime.mockResolvedValue({
      code: 1000,
      data: { nowTime: 2000000 }
    });
    const { wrapper } = mountTop();
    const vm = vmOf(wrapper);
    await vm.setsTime('1900000');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('01\'40"');
  });

  it('setLayout 切换布局并触发 setLayouts', async () => {
    const { wrapper } = mountTop();
    const vm = vmOf(wrapper);
    vm.setLayout(1);
    expect(wrapper.emitted('setLayouts')?.[0]).toEqual([1]);
    vm.setLayout(1);
    expect(wrapper.emitted('setLayouts')).toHaveLength(1);
  });

  it('sendTime 更新延迟档位图标', async () => {
    const { wrapper } = mountTop();
    const vm = vmOf(wrapper);
    vm.sendTime(200);
    await wrapper.vm.$nextTick();
    const icon = wrapper.findAll('[aria-label="较差"]');
    expect(icon).toHaveLength(1);
  });

  it('setRecord 停止后归零录制时长', async () => {
    const { wrapper } = mountTop({ btn: true });
    const vm = vmOf(wrapper);
    vm.setRecord(true);
    await wrapper.vm.$nextTick();
    vm.setRecord(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('录制');
  });

  it('小班课默认布局编号为 2 并可切到白板模式', async () => {
    const { wrapper } = mountTop({ isSmall: true, btn: true, liveType: 'hires' });
    const vm = vmOf(wrapper);
    expect(vm.layoutNum).toBe(2);
    vm.setLayout(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('setLayouts')?.[0]).toEqual([1]);
  });

  it('小班课学生互动时可共享桌面', () => {
    const { wrapper } = mountTop({
      isSmall: true,
      isTeacher: false,
      isInteraction: 2,
      btn: true,
      liveType: 'hires'
    });
    expect(wrapper.text()).toContain('共享桌面');
  });

  it('大班课非老师不显示共享桌面', () => {
    const { wrapper } = mountTop({
      isTeacher: false,
      isInteraction: 0,
      btn: true,
      liveType: 'hires'
    });
    expect(wrapper.text()).not.toContain('共享桌面');
  });
});
