import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { ElMessageBox } from 'element-plus';
import type { ElectronApi } from '@yunyan-live/ipc';
import { formatDate } from '@yunyan-live/utils';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import Playback from '@/pages/teacher/playback/index.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  videoList: vi.fn(),
  roomIdsDelete: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    video_list: (params: unknown) => mocks.videoList(params),
    roomids_delete: (params: unknown) => mocks.roomIdsDelete(params)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

const room: LiveRoom = {
  roomId: 'R1',
  title: '数学课',
  speakerName: '张老师',
  type: 0,
  startTime: '1600000000000',
  time: '1600000000000',
  count: 2
};

interface PlaybackVm {
  params: { pageNum: number; pageSize: number };
  multipleSelection: LiveRoom[];
  handleSelectionChange: (val: LiveRoom[]) => void;
  handleClick: (row: LiveRoom) => void;
}

function vm(wrapper: VueWrapper): PlaybackVm {
  return wrapper.vm as unknown as PlaybackVm;
}

function mountPage() {
  return mountSharedPage(Playback, {
    routes: [
      { path: '/teacher/playback', component: { template: '<div />' } },
      { path: '/teacher/playback/detail', component: { template: '<div />' } }
    ],
    initialRoute: '/teacher/playback'
  });
}

beforeEach(() => {
  Object.assign(window, {
    electronAPI: {
      onMessage: vi.fn(() => () => undefined)
    } as unknown as ElectronApi
  });
  mocks.videoList.mockResolvedValue(ok({ list: [room], pageInfo: { totalElements: 1 } }));
  mocks.roomIdsDelete.mockResolvedValue(ok(null));
});

describe('回放管理 playback/index.vue', () => {
  it('渲染列表并映射直播类型与录制时间', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('小班教学');
    expect(wrapper.text()).toContain(formatDate(1600000000000));
  });

  it('大班教学显示对应类型', async () => {
    mocks.videoList.mockResolvedValue(
      ok({ list: [{ ...room, type: 1 }], pageInfo: { totalElements: 1 } })
    );
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('大班教学');
  });

  it('查看详情跳转回放详情页', async () => {
    const { wrapper, router } = await mountPage();
    vm(wrapper).handleClick(room);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/teacher/playback/detail');
    expect(router.currentRoute.value.query).toEqual({ roomId: 'R1', name: '数学课' });
  });

  it('批量删除确认后调用 roomids_delete 并刷新', async () => {
    // ElMessageBox 是可调用对象，直接 spy 其 confirm 属性会走函数重载，需先收窄为普通对象类型
    const boxed = ElMessageBox as unknown as { confirm: (message?: string) => Promise<unknown> };
    const confirmSpy = vi.spyOn(boxed, 'confirm').mockResolvedValue('confirm');
    try {
      const { wrapper } = await mountPage();
      vm(wrapper).handleSelectionChange([room, { ...room, roomId: 'R2' }]);
      await flushPromises();
      const buttons = wrapper.findAll('button');
      const deleteBtn = buttons.find(b => b.text().includes('批量删除'))!;
      await deleteBtn.trigger('click');
      await flushPromises();
      expect(mocks.roomIdsDelete).toHaveBeenCalledWith({
        roomIds: ['R1', 'R2']
      });
      expect(document.body.textContent).toContain('删除成功');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('未选择时批量删除按钮禁用', async () => {
    const { wrapper } = await mountPage();
    const buttons = wrapper.findAll('button');
    const deleteBtn = buttons.find(b => b.text().includes('批量删除'))!;
    expect(deleteBtn.attributes('disabled')).toBeDefined();
  });

  it('分页 current-change 触发查询', async () => {
    const { wrapper } = await mountPage();
    const pagination = wrapper.findComponent({ name: 'ElPagination' });
    pagination.vm.$emit('current-change', 2);
    await flushPromises();
    expect(mocks.videoList).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 }));
  });
});
