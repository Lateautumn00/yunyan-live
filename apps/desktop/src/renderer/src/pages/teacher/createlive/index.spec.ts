import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import type { ElectronApi } from '@yunyan-live/ipc';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import Createlive from '@/pages/teacher/createlive/index.vue';

const apiMocks = vi.hoisted(() => ({
  getNowTime: vi.fn(),
  createLive: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    getNowTime: () => apiMocks.getNowTime()
  },
  config: {
    liveServer: 'ws://janus.test',
    smallClassNum: 10
  }
}));

vi.mock('@/api/backstage', () => ({
  default: {
    create_live: (params: unknown) => apiMocks.createLive(params)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

vi.mock('@/vendor/live/adapter/adapter.min', () => ({}));

const vendorState = vi.hoisted(() => {
  const plugin = { send: vi.fn(), data: vi.fn(), createAnswer: vi.fn(), hangup: vi.fn() };
  const board = { send: vi.fn(), data: vi.fn(), createAnswer: vi.fn(), hangup: vi.fn() };
  return {
    initCb: undefined as (() => void) | undefined,
    ctorOpts: undefined as { success: () => void } | undefined,
    attachOpts: [] as Array<{
      plugin: string;
      success: (h: unknown) => void;
      ondata?: (d: string) => void;
    }>,
    plugin,
    board
  };
});

vi.mock('@/vendor/live/live', () => {
  class MockLive {
    static init(opts: { debug: string; callback: () => void }) {
      vendorState.initCb = opts.callback;
    }
    static useDefaultDependencies(): Record<string, unknown> {
      return {};
    }
    constructor(opts: { success: () => void; error: (e: unknown) => void }) {
      vendorState.ctorOpts = opts;
    }
    attach(opts: {
      plugin: string;
      success: (h: unknown) => void;
      ondata?: (d: string) => void;
    }) {
      vendorState.attachOpts.push(opts);
    }
  }
  return { default: MockLive };
});

interface CreateVm {
  liveForm: {
    title: string;
    startTime: string | Date | null;
    type: number;
    roomId: string;
    duration: number | null;
  };
  submitForm: () => void;
  validateTitle: (
    rule: unknown,
    value: string,
    callback: (error?: Error) => void
  ) => void;
  validateDuration: (
    rule: unknown,
    value: number,
    callback: (error?: Error) => void
  ) => void;
}

function vm(wrapper: VueWrapper): CreateVm {
  return wrapper.vm as unknown as CreateVm;
}

function mountPage() {
  return mountSharedPage(Createlive, {
    routes: [
      { path: '/teacher/createlive', component: { template: '<div />' } },
      { path: '/teacher/createlive/detail', component: { template: '<div />' } }
    ],
    initialRoute: '/teacher/createlive'
  });
}

beforeEach(() => {
  vendorState.initCb = undefined;
  vendorState.ctorOpts = undefined;
  vendorState.attachOpts = [];
  Object.assign(window, {
    electronAPI: {
      onMessage: vi.fn(() => () => undefined)
    } as unknown as ElectronApi
  });
  apiMocks.getNowTime.mockResolvedValue(ok({ nowTime: '1600000000' }));
  apiMocks.createLive.mockResolvedValue(ok(null));
});

describe('创建直播 createlive/index.vue', () => {
  it('渲染表单并切换直播类型', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('基本信息');
    expect(wrapper.text()).toContain('直播名称');
    expect(wrapper.text()).toContain('小班教学');
    expect(wrapper.text()).toContain('大班教学');
    const big = wrapper.findAll('.class-type.big')[0]!;
    await big.trigger('click');
    await flushPromises();
    expect(vm(wrapper).liveForm.type).toBe(1);
    expect(big.classes()).toContain('checked');
  });

  it('校验器拒绝空直播名称、空时长并接受合法值', async () => {
    const { wrapper } = await mountPage();
    const c = vm(wrapper);
    const errCb = vi.fn();
    c.validateTitle({}, '', errCb);
    expect(errCb).toHaveBeenCalledTimes(1);
    expect((errCb.mock.calls[0]![0] as Error).message).toBe('请输入直播名称');
    const okCb = vi.fn();
    c.validateTitle({}, '数学课', okCb);
    expect(okCb).toHaveBeenCalledWith();
    const durErrCb = vi.fn();
    c.validateDuration({}, 0, durErrCb);
    expect(durErrCb).toHaveBeenCalledTimes(1);
    expect((durErrCb.mock.calls[0]![0] as Error).message).toBe('请输入直播时长');
    const durOkCb = vi.fn();
    c.validateDuration({}, 60, durOkCb);
    expect(durOkCb).toHaveBeenCalledWith();
  });

  it('填写表单后创建 Janus 房间与白板并跳转详情', async () => {
    const { wrapper, router } = await mountPage();
    vendorState.initCb?.();
    vendorState.ctorOpts?.success();
    await flushPromises();
    const [videoOpts, textOpts] = vendorState.attachOpts;
    expect(videoOpts!.plugin).toBe('janus.plugin.videoroom');
    expect(textOpts!.plugin).toBe('janus.plugin.textroom');
    videoOpts!.success(vendorState.plugin);
    textOpts!.success(vendorState.board);
    await flushPromises();

    vm(wrapper).liveForm.title = '数学课';
    vm(wrapper).liveForm.startTime = new Date(Date.now() + 3600_000);
    vm(wrapper).liveForm.duration = 60;
    await flushPromises();

    const buttons = wrapper.findAll('button');
    const createBtn = buttons.find((b) => b.text().includes('创建'))!;
    await createBtn.trigger('click');
    await flushPromises();

    expect(apiMocks.getNowTime).toHaveBeenCalled();
    const sendCalls = vendorState.plugin.send.mock.calls;
    const createCall = sendCalls[0]![0] as {
      message: { request: string; publishers: number };
      success: (result: { videoroom?: string }) => void;
      error: () => void;
    };
    expect(createCall.message.request).toBe('create');
    expect(createCall.message.publishers).toBe(11);

    createCall.success({ videoroom: 'created' });
    await flushPromises();
    expect(vendorState.board.data).toHaveBeenCalled();

    textOpts!.ondata?.(JSON.stringify({ textroom: 'success' }));
    await flushPromises();

    expect(apiMocks.createLive).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '数学课',
        type: 0,
        roomId: expect.stringMatching(/^1600000000\d{2}$/)
      })
    );
    expect(router.currentRoute.value.path).toBe('/teacher/createlive/detail');
  });
});
