import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { formatDate } from '@yunyan-live/utils';
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

function ok<T>(data: T) {
  return { data: { code: 1000, msg: undefined, data } };
}

const room: LiveRoom = {
  title: '数学课',
  speakerName: '张老师',
  startTime: '1600000000000',
  type: 0,
  duration: 60,
  joinCode: 'CODE001'
};

async function mountPage() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/teacher/createlive/detail', component: { template: '<div />' } }]
  });
  await router.push({
    path: '/teacher/createlive/detail',
    query: { roomId: 'R1' }
  });
  await router.isReady();
  const wrapper = mount(Detail, {
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
