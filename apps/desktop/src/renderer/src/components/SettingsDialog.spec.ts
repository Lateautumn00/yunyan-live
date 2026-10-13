import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import SettingsDialog from '@/components/SettingsDialog.vue';

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
