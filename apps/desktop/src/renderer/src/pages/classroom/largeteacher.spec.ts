import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import LargeTeacher from '@/pages/classroom/largeteacher.vue';

const stubs = {
  Top: { template: '<div class="top-stub" />', props: ['isTeacher', 'roomInfo', 'roomId', 'liveType', 'type', 'btn'] },
  WhiteBoard: { template: '<div class="wb-stub" />', props: ['isTeacher', 'isDisplay', 'roomId', 'opaqueId', 'teacherStage', 'layouts'] },
  Video: { template: '<div class="video-stub" />', props: ['roomInfo', 'isTeacher', 'opaqueId', 'roomId', 'userName', 'isInteraction'] },
  Chat: { template: '<div class="chat-stub" />', props: ['roomId', 'liveUserId', 'userName', 'isTeacher', 'isInteraction', 'btn'] },
  Pople: { template: '<div class="pople-stub" />', props: ['liveUserId'] },
  History: { template: '<div class="history-stub" />', props: ['isTeacher'] },
  Apply: { template: '<div class="apply-stub" />', props: ['isTeacher', 'isInteraction'] },
  HistoryVideo: { template: '<div class="hv-stub" />', props: ['opaqueId', 'id'] }
};

vi.mock('@/api', () => ({
  default: {
    show_room_info: vi.fn().mockResolvedValue({ data: { code: 1000, data: { status: 0, videoList: [], updateTime: '' }, msg: '' } }),
    getNowTime: vi.fn().mockResolvedValue({ data: { code: 1000, data: { nowTime: '' }, msg: '' } })
  }
}));

function createWrapper() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/classroom/largeteacher', component: { template: '<div />' } }]
  });
  return mount(LargeTeacher, {
    props: { roomId: 'room1', nickName: 'test' },
    global: { plugins: [router, ElementPlus], components: stubs }
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('classroom/largeteacher.vue', () => {
  it('renders without throwing', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    expect(wrapper.find('.large-teacher').exists()).toBe(true);
  });

  it('has correct initial state', () => {
    const wrapper = createWrapper();
    const vm = wrapper.vm as unknown as { isTeacher: boolean; activeName: string; layoutNum: number };
    expect(vm.isTeacher).toBe(true);
    expect(vm.activeName).toBe('chat');
    expect(vm.layoutNum).toBe(3);
  });

  it('handleClick switches active tab', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { handleClick: (tab: string) => void; activeName: string };
    vm.handleClick('people');
    expect(vm.activeName).toBe('people');
    vm.handleClick('playback');
    expect(vm.activeName).toBe('playback');
  });

  it('getRoomInfo populates roomInfo', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { roomInfo: Record<string, unknown>; getRoomInfo: () => Promise<void> };
    await vm.getRoomInfo();
    expect(vm.roomInfo).toBeDefined();
  });

  it('onBroadcastStop stop 显示暂停直播', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { onBroadcastStop: (status?: string) => void };
    vm.onBroadcastStop('stop');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('暂停直播');
  });
});
