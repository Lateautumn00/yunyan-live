import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import type { ElectronApi } from '@yunyan-live/ipc';
import dayjs from 'dayjs';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import Detail from '@/pages/teacher/playback/detail/index.vue';
import { useUserStore } from '@/store/user';
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

vi.mock('@/components/ClassRoom/HistoryVideo.vue', () => ({
  default: {
    name: 'HistoryVideoStub',
    props: ['id', 'opaqueId'],
    methods: {
      playStop: () => undefined
    },
    template: '<div class="history-video-stub" />'
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
  opaqueId: string;
  centerDialog: boolean;
  centerDialogVisible: boolean;
  playId: string;
  playTitle: string;
  videoIdList: string[];
  playClick: (row: VideoItem) => void;
  deleteClick: (row: VideoItem) => void;
  multiDeleteClick: () => void;
  submitDelete: () => Promise<void>;
  multipleSelection: VideoItem[];
  handleSelectionChange: (val: VideoItem[]) => void;
}

function vm(wrapper: VueWrapper): DetailVm {
  return wrapper.vm as unknown as DetailVm;
}

function mountPage() {
  return mountSharedPage(Detail, {
    routes: [
      { path: '/teacher/playback', component: { template: '<div />' } },
      { path: '/teacher/playback/detail', component: { template: '<div />' } }
    ],
    initialRoute: { path: '/teacher/playback/detail', query: { roomId: 'R1', name: '数学课' } },
    beforeMount: pinia => {
      setActivePinia(pinia);
      useUserStore().setGuid('G1');
    }
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
    expect(wrapper.text()).toContain('60.00');
    expect(mocks.videoDetail).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'R1', pageNum: 1, pageSize: 6 })
    );
  });

  it('从 store 恢复 opaqueId', async () => {
    const { wrapper } = await mountPage();
    expect(vm(wrapper).opaqueId).toBe('G1');
  });

  it('点击播放打开回放弹窗并传入视频', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).playClick(item);
    await flushPromises();
    expect(vm(wrapper).centerDialog).toBe(true);
    expect(vm(wrapper).playId).toBe('http://video/1');
    expect(vm(wrapper).playTitle).toContain('回放');
    const stub = wrapper.findComponent({ name: 'HistoryVideoStub' });
    expect(stub.props('id')).toBe('http://video/1');
    expect(stub.props('opaqueId')).toBe('G1');
  });

  it('单个删除确认后调用 videoids_delete', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).deleteClick(item);
    expect(vm(wrapper).centerDialogVisible).toBe(true);
    await vm(wrapper).submitDelete();
    expect(mocks.videoIdsDelete).toHaveBeenCalledWith({
      data: { videoIds: ['V1'] }
    });
    expect(document.body.textContent).toContain('删除成功');
  });

  it('批量删除收集全部视频 id', async () => {
    const { wrapper } = await mountPage();
    const other: VideoItem = { ...item, id: 'V2' };
    vm(wrapper).handleSelectionChange([item, other]);
    vm(wrapper).multiDeleteClick();
    expect(vm(wrapper).videoIdList).toEqual(['V1', 'V2']);
    await vm(wrapper).submitDelete();
    expect(mocks.videoIdsDelete).toHaveBeenCalledWith({
      data: { videoIds: ['V1', 'V2'] }
    });
  });

  it('回放标题使用本地时间格式化', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).playClick(item);
    await flushPromises();
    const expected = `回放${dayjs(1600000000000).format('YYYY-MM-DD')}`;
    expect(vm(wrapper).playTitle).toContain(expected);
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
