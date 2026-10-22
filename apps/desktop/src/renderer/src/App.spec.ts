import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import type { ElectronApi } from '@yunyan-live/ipc';
import { ok, mountPage } from '@/testing/utils';
import { useUpdater } from '@/composables/useUpdater';
import { useSharedViewVisible } from '@/composables/useSharedViewVisible';
import StickyNoteDialog from '@/components/Notes/StickyNoteDialog.vue';
import App from '@/App.vue';

const mocks = vi.hoisted(() => ({
  userMsg: vi.fn(),
  onMessage: vi.fn(),
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  getVersion: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    user_msg: () => mocks.userMsg(),
    user_login: () => Promise.resolve({ code: 1000 }),
    user_logout: () => Promise.resolve({ code: 1000 })
  }
}));

let messageCb: ((payload: { type: string; message?: unknown }) => void) | undefined;
let wrapper: VueWrapper | undefined;

async function mountApp() {
  mocks.onMessage.mockImplementation(
    (cb: (payload: { type: string; message?: unknown }) => void) => {
      messageCb = cb;
      return () => undefined;
    }
  );
  const mounted = await mountPage(App, {
    routes: [{ path: '/', component: { template: '<div class="root" />' } }],
    initialRoute: '/',
    beforeMount: pinia => {
      setActivePinia(pinia);
    }
  });
  wrapper = mounted.wrapper;
  return mounted.wrapper;
}

function findButton(text: string) {
  return wrapper?.findAll('button').find(b => b.text().includes(text));
}

beforeEach(() => {
  messageCb = undefined;
  useUpdater().resetUpdater();
  Object.assign(window, {
    electronAPI: {
      onMessage: mocks.onMessage,
      checkForUpdate: mocks.checkForUpdate,
      downloadUpdate: mocks.downloadUpdate,
      installUpdate: mocks.installUpdate,
      getVersion: mocks.getVersion
    } as unknown as ElectronApi
  });
  mocks.getVersion.mockResolvedValue('0.5.0');
  mocks.userMsg.mockResolvedValue(ok({ guid: 'G1', token: 'T1', userName: 'u', email: 'a@b.com' }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  useSharedViewVisible().setSharedViewVisible(false);
  vi.useRealTimers();
  vi.clearAllMocks();
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

  it('发现新版本弹出确认框，点击立即更新触发下载并显示进度', async () => {
    const w = await mountApp();
    expect(w.find('.el-dialog').exists()).toBe(false);
    messageCb?.({ type: 'update-available', message: '0.6.0' });
    await flushPromises();
    expect(w.text()).toContain('发现新版本');
    expect(w.text()).toContain('v0.6.0');
    expect(w.text()).toContain('当前版本 v0.5.0');

    await findButton('立即更新')?.trigger('click');
    expect(mocks.downloadUpdate).toHaveBeenCalled();

    messageCb?.({ type: 'download-progress', message: 42.3 });
    await flushPromises();
    expect(w.find('.el-dialog').text()).toContain('42');
  });

  it('下载完成后点击重启安装触发 installUpdate', async () => {
    const w = await mountApp();
    messageCb?.({ type: 'update-available', message: '0.6.0' });
    await flushPromises();
    messageCb?.({ type: 'update-downloaded', message: '0.6.0' });
    await flushPromises();
    expect(w.text()).toContain('新版本已就绪');
    expect(w.text()).toContain('已下载完成');

    await findButton('立即重启安装')?.trigger('click');
    expect(mocks.installUpdate).toHaveBeenCalled();
  });

  it('稍后按钮关闭提示弹窗', async () => {
    const w = await mountApp();
    messageCb?.({ type: 'update-available', message: '0.6.0' });
    await flushPromises();
    expect(w.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true);

    await findButton('稍后')?.trigger('click');
    await flushPromises();
    expect(w.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(false);
  });

  it('后台检查失败时关闭弹窗', async () => {
    const w = await mountApp();
    messageCb?.({ type: 'update-available', message: '0.6.0' });
    await flushPromises();
    expect(w.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(true);

    messageCb?.({ type: 'error', message: 'boom' });
    await flushPromises();
    expect(w.findComponent({ name: 'ElDialog' }).props('modelValue')).toBe(false);
  });

  it('便签入口按登录态渲染', async () => {
    const w1 = await mountApp();
    expect(w1.find('.sticky-note-fab').exists()).toBe(false);
    w1.unmount();
    wrapper = undefined;

    localStorage.setItem('token', 'T1');
    const w2 = await mountApp();
    expect(w2.find('.sticky-note-fab').exists()).toBe(true);
  });

  it('/login 路由不渲染便签入口', async () => {
    localStorage.setItem('token', 'T1');
    const mounted = await mountPage(App, {
      routes: [
        { path: '/login', component: { template: '<div class="login" />' } },
        { path: '/', component: { template: '<div class="root" />' } }
      ],
      initialRoute: '/login',
      beforeMount: pinia => {
        setActivePinia(pinia);
      }
    });
    wrapper = mounted.wrapper;
    expect(wrapper.find('.sticky-note-fab').exists()).toBe(false);
  });

  it('外挂视图打开期间隐藏便签入口（对话框保持挂载）', async () => {
    localStorage.setItem('token', 'T1');
    useSharedViewVisible().setSharedViewVisible(true);
    const w = await mountApp();
    expect(w.find('.sticky-note-fab').exists()).toBe(false);
    expect(w.findComponent(StickyNoteDialog).exists()).toBe(true);
  });
});
