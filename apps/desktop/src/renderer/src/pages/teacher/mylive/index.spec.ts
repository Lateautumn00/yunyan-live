import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { formatDate } from '@yunyan-live/utils';
import Mylive from '@/pages/teacher/mylive/index.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  liveList: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    live_list: (params: unknown) => mocks.liveList(params)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

function ok<T>(data: T) {
  return { data: { code: 1000, msg: undefined, data } };
}

const room: LiveRoom = {
  roomId: 'R1',
  title: '数学课',
  speakerName: '张老师',
  type: 0,
  joinCode: 'CODE123',
  startTime: '1600000000000',
  status: 2,
  hasVideo: 1
};

interface MyliveVm {
  searchName: string;
}

function vm(wrapper: VueWrapper): MyliveVm {
  return wrapper.vm as unknown as MyliveVm;
}

async function mountPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div class="route-home" />' } },
      { path: '/teacher/mylive/watchlist', component: { template: '<div />' } },
      { path: '/teacher/playback/detail', component: { template: '<div />' } },
      { path: '/teacher/mylive', component: { template: '<div />' } },
      { path: '/classroom/smallstudent', component: { template: '<div />' } },
      { path: '/classroom/largestudent', component: { template: '<div />' } },
      { path: '/classroom/smallteacher', component: { template: '<div />' } },
      { path: '/classroom/largeteacher', component: { template: '<div />' } }
    ]
  });
  await router.push('/teacher/mylive');
  await router.isReady();
  const wrapper = mount(Mylive, {
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
  mocks.liveList.mockResolvedValue(ok({ list: [room], total: 1 }));
});

describe('我的直播 mylive/index.vue', () => {
  it('渲染直播列表并格式化时间/类型/状态', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('CODE123');
    expect(wrapper.text()).toContain('小班教学');
    expect(wrapper.text()).toContain('直播中');
    expect(wrapper.text()).toContain(formatDate(1600000000000));
    expect(mocks.liveList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10, status: null })
    );
  });

  it('搜索触发列表刷新', async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('input[placeholder="请输入直播名称"]').setValue('数学');
    const searchButton = wrapper.findAll('button').find(btn => btn.text().includes('搜索'));
    expect(searchButton).toBeTruthy();
    await searchButton!.trigger('click');
    await flushPromises();
    expect(mocks.liveList).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchName: '数学' })
    );
  });

  it('分页 current-change 触发查询', async () => {
    const { wrapper } = await mountPage();
    const pagination = wrapper.findComponent({ name: 'ElPagination' });
    pagination.vm.$emit('current-change', 2);
    await flushPromises();
    expect(mocks.liveList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('点击视频跳转回放详情页', async () => {
    mocks.liveList.mockResolvedValue(ok({ list: [{ ...room, status: 3 }], total: 1 }));
    const { wrapper, router } = await mountPage();
    const hasVideo = wrapper.findAll('.has-video')[0]!;
    await hasVideo.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/playback/detail');
    expect(router.currentRoute.value.query).toEqual({ roomId: 'R1', name: '数学课' });
  });

  it('无数据且无筛选时展示空状态', async () => {
    mocks.liveList.mockResolvedValue(ok({ list: [], total: 0 }));
    const { wrapper } = await mountPage();
    expect(wrapper.find('.el-empty').exists()).toBe(true);
    expect(wrapper.text()).toContain('暂无直播数据');
    expect(wrapper.text()).not.toContain('清空筛选');
    expect(wrapper.find('.el-table').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ElPagination' }).isVisible()).toBe(false);
  });

  it('筛选无结果时展示未找到提示与清空筛选', async () => {
    mocks.liveList.mockResolvedValue(ok({ list: [], total: 0 }));
    const { wrapper } = await mountPage();
    await wrapper.find('input[placeholder="请输入直播名称"]').setValue('不存在');
    const searchButton = wrapper.findAll('button').find(btn => btn.text().includes('搜索'));
    await searchButton!.trigger('click');
    await flushPromises();
    expect(mocks.liveList).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchName: '不存在' })
    );
    expect(wrapper.text()).toContain('未找到符合条件的直播');

    const clearButton = wrapper.findAll('button').find(btn => btn.text().includes('清空筛选'));
    expect(clearButton).toBeTruthy();
    await clearButton!.trigger('click');
    await flushPromises();
    expect(vm(wrapper).searchName).toBe('');
    expect(mocks.liveList).toHaveBeenLastCalledWith(expect.objectContaining({ searchName: '' }));
    expect(wrapper.text()).toContain('暂无直播数据');
    expect(wrapper.text()).not.toContain('清空筛选');
  });
});
