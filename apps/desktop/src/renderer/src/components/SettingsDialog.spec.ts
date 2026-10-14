import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import SettingsDialog from '@/components/SettingsDialog.vue';
import { useUpdater } from '@/composables/useUpdater';

const mocks = vi.hoisted(() => ({
  onMessage: vi.fn(),
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  getVersion: vi.fn()
}));

vi.mock('@/api', () => ({
  config: {},
  default: {
    config: {},
    user: { updateUserName: vi.fn(), updateUserPass: vi.fn(), logout: vi.fn() }
  }
}));

// 设备检测面板依赖 AudioContext（jsdom 无）：本 spec 只关心许可节，整体打桩
vi.mock('@/components/LandingPage/EquipmentTestPanel.vue', () => ({
  default: { name: 'EquipmentTestPanel', template: '<div class="stub-equip" />' }
}));

async function mountDialog() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  });
  const w = mount(SettingsDialog, {
    props: { modelValue: true },
    global: {
      plugins: [router, ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return w;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useUpdater().resetUpdater();
  Object.assign(window, {
    electronAPI: { ...mocks } as unknown as ElectronApi
  });
  mocks.getVersion.mockResolvedValue('0.5.0');
});

describe('SettingsDialog 开源许可节（F3.4/F3.5 批5）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it('正向：菜单含「开源许可」入口', async () => {
    const w = await mountDialog();
    const labels = w.findAll('.el-menu-item').map(i => i.text());
    expect(labels.some(t => t.includes('开源许可'))).toBe(true);
  });

  it('正向：许可区渲染 GPL 字样与 CircuitJS1/3Dmol 源码链接', async () => {
    const w = await mountDialog();
    const sec = w.find('#section-licenses');
    expect(sec.exists()).toBe(true);
    const text = sec.text();
    expect(text).toContain('GPL-2.0-or-later');
    expect(text).toContain('CircuitJS1');
    expect(text).toContain('3Dmol');
    const hrefs = sec.findAll('a').map(a => a.attributes('href'));
    expect(hrefs).toContain('https://github.com/pfalstad/circuitjs1');
    expect(hrefs).toContain('https://github.com/3dmol/3Dmol.js');
  });

  it('正向：许可区含 GPL 全文来源与本地 NOTICE 提示', async () => {
    const w = await mountDialog();
    const text = w.find('#section-licenses').text();
    expect(text).toContain('GPL-2.0');
    expect(text).toContain('NOTICE');
  });
});

describe('SettingsDialog 软件更新节', () => {
  it('正向：菜单含「软件更新」入口且展示当前版本', async () => {
    const w = await mountDialog();
    const labels = w.findAll('.el-menu-item').map(i => i.text());
    expect(labels.some(t => t.includes('软件更新'))).toBe(true);

    const sec = w.find('#section-update');
    expect(sec.exists()).toBe(true);
    expect(sec.text()).toContain('当前版本');
    expect(sec.text()).toContain('v0.5.0');
    expect(mocks.getVersion).toHaveBeenCalled();
  });

  it('正向：点击检查更新触发 IPC 并进入检查中态', async () => {
    const w = await mountDialog();
    const btn = w.findAll('button').find(b => b.text().includes('检查更新'));
    expect(btn).toBeTruthy();
    await btn!.trigger('click');
    expect(mocks.checkForUpdate).toHaveBeenCalled();
    await flushPromises();
    expect(w.find('#section-update').text()).toContain('正在检查更新');
  });

  it('正向：手动检查无更新回显「已是最新版本」', async () => {
    const w = await mountDialog();
    useUpdater().check(true);
    useUpdater().handleUpdateEvent({ type: 'update-not-available' });
    await flushPromises();
    expect(w.find('#section-update').text()).toContain('已是最新版本');
  });

  it('正向：发现新版本后按钮变为「立即更新」并触发下载', async () => {
    const w = await mountDialog();
    useUpdater().handleUpdateEvent({ type: 'update-available', message: '0.6.0' });
    await flushPromises();
    expect(w.find('#section-update').text()).toContain('发现新版本');
    expect(w.find('#section-update').text()).toContain('v0.6.0');

    const btn = w.findAll('button').find(b => b.text().includes('立即更新'));
    expect(btn).toBeTruthy();
    await btn!.trigger('click');
    expect(mocks.downloadUpdate).toHaveBeenCalled();
  });

  it('正向：检查失败回显错误信息', async () => {
    const w = await mountDialog();
    const btn = w.findAll('button').find(b => b.text().includes('检查更新'));
    await btn!.trigger('click');
    useUpdater().handleUpdateEvent({ type: 'error', message: 'boom' });
    await flushPromises();
    expect(w.find('#section-update').text()).toContain('boom');
  });
});
