import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import Watchlist from '@/pages/teacher/mylive/watchlist/index.vue';
import type { WatchItem } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  watchTimeList: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    watchtime_list: (params: unknown) => mocks.watchTimeList(params)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

function ok<T>(data: T) {
  return { data: { code: 1000, msg: 'ok', data } };
}

const items: WatchItem[] = [
  { userId: 'u1', nickName: '小明', watchTime: 300, joinedAt: '2026-09-01T10:00:00.000Z', leftAt: '2026-09-01T10:05:00.000Z' },
  { userId: 'u2', nickName: '小红', watchTime: 600, joinedAt: '2026-09-01T10:00:00.000Z', leftAt: '2026-09-01T10:10:00.000Z' }
];

async function mountPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/teacher/mylive/watchlist', component: { template: '<div />' } }]
  });
  await router.push({
    path: '/teacher/mylive/watchlist',
    query: { roomId: 'R1', name: '数学课' }
  });
  await router.isReady();
  const wrapper = mount(Watchlist, {
    global: {
      plugins: [pinia, router, ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.watchTimeList.mockResolvedValue(
    ok({
      list: items,
      pageInfo: { totalElements: 2 }
    })
  );
});

describe('观看时长列表 mylive/watchlist/index.vue', { timeout: 10000 }, () => {
  it('渲染房间标题、昵称与观看时长', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('小明');
    expect(wrapper.text()).toContain('小红');
    expect(wrapper.text()).toContain('5分');
    expect(mocks.watchTimeList).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'R1', pageNum: 1, pageSize: 6 })
    );
  });

  it('分页 current-change 触发查询', async () => {
    const { wrapper } = await mountPage();
    const pagination = wrapper.findComponent({ name: 'ElPagination' });
    pagination.vm.$emit('current-change', 2);
    await flushPromises();
    expect(mocks.watchTimeList).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNum: 2 })
    );
  });
});
