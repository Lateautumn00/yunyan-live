import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import Statistics from '@/pages/teacher/statistics/index.vue';

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

interface StatisticsVm {
  type: string;
}

function vm(wrapper: VueWrapper): StatisticsVm {
  return wrapper.vm as unknown as StatisticsVm;
}

async function mountPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/teacher/statistics', component: { template: '<div />' } }]
  });
  await router.push('/teacher/statistics');
  await router.isReady();
  const wrapper = mount(Statistics, {
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
  Object.assign(window, {
    electronAPI: {
      onMessage: vi.fn(() => () => undefined)
    } as unknown as ElectronApi
  });
});

describe('直播概况 statistics/index.vue', () => {
  it('渲染概况与整体数据标题', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('直播概况');
    expect(wrapper.text()).toContain('整体数据');
    expect(wrapper.text()).toContain('地域分布');
    expect(wrapper.text()).toContain('总观看人数');
    expect(wrapper.text()).toContain('用户量');
    expect(wrapper.text()).toContain('总直播时长');
  });

  it('切换统计维度', async () => {
    const wrapper = await mountPage();
    expect(vm(wrapper).type).toBe('');
    vm(wrapper).type = '人次概括';
    await flushPromises();
    const active = wrapper.findAll('.el-radio-button.is-active');
    expect(active.length).toBe(1);
    expect(active[0]!.text()).toContain('人次概括');
  });
});
