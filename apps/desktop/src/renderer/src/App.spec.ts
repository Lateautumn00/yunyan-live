import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import App from '@/App.vue';

const mocks = vi.hoisted(() => ({
  userMsg: vi.fn(),
  onMessage: vi.fn(),
  checkForUpdate: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    user_msg: () => mocks.userMsg(),
    user_login: () => Promise.resolve({ data: { code: 1000 } }),
    user_logout: () => Promise.resolve({ data: { code: 1000 } })
  }
}));

function ok<T>(data: T) {
  return { data: { code: 1000, msg: 'ok', data } };
}

let messageCb: ((payload: { type: string; message?: unknown }) => void) | undefined;

async function mountApp() {
  mocks.onMessage.mockImplementation(
    (cb: (payload: { type: string; message?: unknown }) => void) => {
      messageCb = cb;
      return () => undefined;
    }
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div class="root" />' } }]
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(App, {
    global: {
      plugins: [pinia, router, ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  messageCb = undefined;
  Object.assign(window, {
    electronAPI: {
      onMessage: mocks.onMessage,
      checkForUpdate: mocks.checkForUpdate
    } as unknown as ElectronApi
  });
  mocks.userMsg.mockResolvedValue(ok({ guid: 'G1', token: 'T1', userName: 'u', email: 'a@b.com' }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App.vue', () => {
  it('启动时恢复用户信息并注册更新监听与检测', async () => {
    vi.useFakeTimers();
    await mountApp();
    expect(mocks.userMsg).toHaveBeenCalled();
    expect(mocks.onMessage).toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    await flushPromises();
    expect(mocks.checkForUpdate).toHaveBeenCalled();
  });

  it('update-available 显示升级弹窗', async () => {
    const wrapper = await mountApp();
    expect(wrapper.find('.el-dialog').exists()).toBe(false);
    messageCb?.({ type: 'update-available' });
    await flushPromises();
    expect(wrapper.find('.el-dialog').exists()).toBe(true);
    expect(wrapper.text()).toContain('正在更新版本');
  });

  it('download-progress 更新进度百分比', async () => {
    const wrapper = await mountApp();
    messageCb?.({ type: 'update-available' });
    await flushPromises();
    messageCb?.({ type: 'download-progress', message: 42.3 });
    await flushPromises();
    expect(wrapper.find('.el-dialog').text()).toContain('42');
  });

  it('error 时关闭弹窗', async () => {
    const wrapper = await mountApp();
    messageCb?.({ type: 'update-available' });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true);
    messageCb?.({ type: 'error', message: 'boom' });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(false);
  });
});