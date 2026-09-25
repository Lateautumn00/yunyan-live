import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import { formatDate } from '@yunyan-live/utils';
import Mylive from '@/pages/teacher/mylive/index.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  liveList: vi.fn(),
  liveDelete: vi.fn(),
  updateCode: vi.fn(),
  clipboardWriteText: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    live_list: (params: unknown) => mocks.liveList(params),
    live_delete: (params: unknown) => mocks.liveDelete(params),
    update_code: (params: unknown) => mocks.updateCode(params)
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
  params: { pageNum: number; pageSize: number };
  handleOptionChange: (option: string, row: LiveRoom) => void;
  submitDelete: () => Promise<void>;
  updateCode: () => Promise<void>;
  copyLink: (content?: string) => void;
  goLiveRoom: (identity: number) => void;
  deleteDialogVisible: boolean;
  shareDialogVisible: boolean;
  roomDialogVisible: boolean;
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
  Object.assign(window, {
    electronAPI: {
      clipboardWriteText: mocks.clipboardWriteText
    } as unknown as ElectronApi
  });
  mocks.liveList.mockResolvedValue(ok({ list: [room], pageInfo: { totalElements: 1 } }));
  mocks.liveDelete.mockResolvedValue(ok(null));
  mocks.updateCode.mockResolvedValue(ok('NEW123'));
});

describe('我的直播 mylive/index.vue', () => {
  it('渲染直播列表并格式化时间/类型/状态', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('张老师');
    expect(wrapper.text()).toContain('CODE123');
    expect(wrapper.text()).toContain('小班教学');
    expect(wrapper.text()).toContain('直播中');
    expect(wrapper.text()).toContain(formatDate(1600000000000));
    expect(mocks.liveList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 6, status: null })
    );
  });

  it('搜索触发列表刷新', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).searchName = '数学';
    const inputs = wrapper.findAll('.el-input__inner');
    await inputs[0]!.trigger('change');
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
    expect(mocks.liveList).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 })
    );
  });

  it('删除确认后调用 live_delete 并刷新', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).handleOptionChange('delete', room);
    expect(vm(wrapper).deleteDialogVisible).toBe(true);
    await vm(wrapper).submitDelete();
    expect(mocks.liveDelete).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(document.body.textContent).toContain('删除成功');
  });

  it('分享弹窗更新教师参加码', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).handleOptionChange('share', room);
    expect(vm(wrapper).shareDialogVisible).toBe(true);
    await vm(wrapper).updateCode();
    expect(mocks.updateCode).toHaveBeenCalledWith({
      roomId: 'R1'
    });
    expect(document.body.textContent).toContain('更新成功');
  });

  it('复制参加码调用剪贴板', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).copyLink('CODE123');
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith('CODE123');
    expect(document.body.textContent).toContain('复制成功');
  });

  it('点击视频跳转回放详情页', async () => {
    const { wrapper, router } = await mountPage();
    const hasVideo = wrapper.findAll('.has-video')[0]!;
    await hasVideo.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/playback/detail');
    expect(router.currentRoute.value.query).toEqual({ roomId: 'R1', name: '数学课' });
  });

  it('进入房间以听众身份跳转首页', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper, router } = await mountPage();
      vm(wrapper).handleOptionChange('gotoroom', room);
      expect(vm(wrapper).roomDialogVisible).toBe(true);
      vm(wrapper).goLiveRoom(0);
      vi.advanceTimersByTime(500);
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/classroom/smallstudent');
      expect(router.currentRoute.value.query).toEqual({
        roomId: 'R1',
        code: 'CODE123',
        identity: 'student'
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
