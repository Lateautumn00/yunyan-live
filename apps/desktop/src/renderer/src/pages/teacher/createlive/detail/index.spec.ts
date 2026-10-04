import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '@yunyan-live/utils';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import Detail from '@/pages/teacher/createlive/detail/index.vue';
import RoomActions from '@/components/teacher/RoomActions.vue';
import ShareLinks from '@/components/teacher/ShareLinks.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  roomDetail: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    room_detail: (params: unknown) => mocks.roomDetail(params)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

const room: LiveRoom = {
  title: '数学课',
  speakerName: '张老师',
  startTime: '1600000000000',
  type: 0,
  duration: 60,
  joinCode: 'CODE001'
};

function mountPage() {
  return mountSharedPage(Detail, {
    routes: [{ path: '/teacher/createlive/detail', component: { template: '<div />' } }],
    initialRoute: { path: '/teacher/createlive/detail', query: { roomId: 'R1' } }
  });
}

beforeEach(() => {
  mocks.roomDetail.mockResolvedValue(ok(room));
});

describe('创建直播详情 createlive/detail/index.vue', () => {
  it('渲染直播概况并格式化时间', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('直播概况');
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('张老师');
    expect(wrapper.text()).toContain('小班教学');
    expect(wrapper.text()).toContain(formatDate(1600000000000));
    expect(wrapper.text()).toContain('60min');
    expect(wrapper.text()).toContain('CODE001');
    expect(mocks.roomDetail).toHaveBeenCalledWith('R1');
  });

  it('头部接入 RoomActions 按钮组与 ShareLinks', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.findComponent(RoomActions).exists()).toBe(true);
    expect(wrapper.findComponent(ShareLinks).exists()).toBe(true);
    expect(wrapper.text()).toContain('进入房间');
  });
});
