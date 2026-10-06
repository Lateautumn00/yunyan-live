import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import NavMenu from '@/components/layouts/NavMenu.vue';

async function mountNavMenu(activeKey: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/teacher/createlive', component: { template: '<div />' } },
      { path: '/teacher/mylive', component: { template: '<div />' } },
      { path: '/teacher/playback', component: { template: '<div />' } },
      { path: '/teacher/transfer', component: { template: '<div />' } },
      { path: '/teacher/statistics', component: { template: '<div />' } }
    ]
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(NavMenu, {
    props: { activeKey },
    global: {
      plugins: [router, ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return { wrapper, router };
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

describe('NavMenu.vue', () => {
  it('渲染 logo 与五个菜单项', async () => {
    const { wrapper } = await mountNavMenu('1');
    expect(wrapper.text()).toContain('云砚直播');
    const items = wrapper.findAll('.el-menu-item');
    expect(items.map(i => i.text())).toEqual([
      '创建直播',
      '我的直播',
      '回放管理',
      '转让管理',
      '数据统计'
    ]);
  });

  it('activeKey=2 时我的直播高亮', async () => {
    const { wrapper } = await mountNavMenu('2');
    expect(wrapper.find('.el-menu-item.is-active').text()).toBe('我的直播');
  });

  it('点击菜单跳转到对应路由', async () => {
    const { wrapper, router } = await mountNavMenu('1');
    const items = wrapper.findAll('.el-menu-item');
    await items[1]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/mylive');
    await items[2]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/playback');
    await items[4]!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/statistics');
  });
});
