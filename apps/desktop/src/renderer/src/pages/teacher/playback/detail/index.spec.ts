import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import type { ElectronApi } from '@yunyan-live/ipc';
import { formatCnDateTime } from '@yunyan-live/utils';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import Detail from '@/pages/teacher/playback/detail/index.vue';
import type { VideoItem } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  videoDetail: vi.fn(),
  videoIdsDelete: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    video_detail: (params: unknown) => mocks.videoDetail(params),
    videoids_delete: (params: unknown) => mocks.videoIdsDelete(params)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

const item: VideoItem = {
  roomId: 'R1',
  id: 'V1',
  duration: 3600,
  address: 'http://video/1',
  createTime: '1600000000000'
};

interface DetailVm {
  centerDialogVisible: boolean;
  videoIdList: string[];
  multiDeleteClick: () => void;
  submitDelete: () => Promise<void>;
  multipleSelection: VideoItem[];
  handleSelectionChange: (val: VideoItem[]) => void;
  playClick: (row: VideoItem) => void;
}

function vm(wrapper: VueWrapper): DetailVm {
  return wrapper.vm as unknown as DetailVm;
}

function mountPage() {
  return mountSharedPage(Detail, {
    routes: [
      { path: '/teacher/playback', component: { template: '<div />' } },
      { path: '/teacher/playback/detail', component: { template: '<div />' } },
      { path: '/teacher/playback/detail/playback', component: { template: '<div />' } }
    ],
    initialRoute: { path: '/teacher/playback/detail', query: { roomId: 'R1', name: '数学课' } }
  });
}

beforeEach(() => {
  Object.assign(window, {
    electronAPI: {
      onMessage: vi.fn(() => () => undefined)
    } as unknown as ElectronApi
  });
  mocks.videoDetail.mockResolvedValue(ok({ list: [item], pageInfo: { totalElements: 1 } }));
  mocks.videoIdsDelete.mockResolvedValue(ok(null));
});

describe('回放详情 playback/detail/index.vue', () => {
  it('渲染房间标题、视频信息并格式化时长', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('V1');
    expect(wrapper.text()).toContain('60分0秒');
    expect(mocks.videoDetail).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'R1', pageNum: 1, pageSize: 6 })
    );
  });

  it('点击播放跳转回放播放页并携带视频信息', async () => {
    const { wrapper, router } = await mountPage();
    vm(wrapper).playClick(item);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/playback/detail/playback');
    expect(router.currentRoute.value.query).toEqual({
      roomId: 'R1',
      videoId: 'http://video/1',
      recordType: '1',
      title: `窗口录制 - ${formatCnDateTime(1600000000000)}`,
      duration: '3600',
      createTime: '1600000000000',
      filePath: ''
    });
  });

  it('批量删除收集全部视频 id', async () => {
    const { wrapper } = await mountPage();
    const other: VideoItem = { ...item, id: 'V2' };
    vm(wrapper).handleSelectionChange([item, other]);
    vm(wrapper).multiDeleteClick();
    expect(vm(wrapper).videoIdList).toEqual(['V1', 'V2']);
    await vm(wrapper).submitDelete();
    expect(mocks.videoIdsDelete).toHaveBeenCalledWith({
      videoIds: ['V1', 'V2']
    });
  });

  it('分页 current-change 触发查询', async () => {
    const { wrapper } = await mountPage();
    const pagination = wrapper.findComponent({ name: 'ElPagination' });
    pagination.vm.$emit('current-change', 2);
    await flushPromises();
    expect(mocks.videoDetail).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNum: 2 })
    );
  });
});
