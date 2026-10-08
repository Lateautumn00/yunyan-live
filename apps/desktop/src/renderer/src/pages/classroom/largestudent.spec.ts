import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import Classroom from '@/pages/classroom/Classroom.vue';

const stubs = {
  Top: { template: '<div class="top-stub" />', props: ['isTeacher', 'roomInfo', 'roomId', 'btn'] },
  WhiteBoard: {
    template: '<div class="wb-stub" />',
    props: ['isTeacher', 'isDisplay', 'roomId', 'opaqueId', 'userName', 'layouts']
  },
  Video: {
    template: '<div class="video-stub" />',
    props: ['roomInfo', 'isInteraction', 'opaqueId', 'isTeacher', 'roomId', 'userName']
  },
  Chat: {
    template: '<div class="chat-stub" />',
    props: ['roomId', 'liveUserId', 'userName', 'isTeacher', 'isInteraction', 'btn']
  },
  Pople: { template: '<div class="pople-stub" />', props: ['liveUserId'] },
  History: { template: '<div class="history-stub" />', props: ['isTeacher'] },
  Apply: { template: '<div class="apply-stub" />', props: ['isTeacher', 'isInteraction'] },
  HistoryVideo: { template: '<div class="hv-stub" />', props: ['opaqueId', 'id'] }
};

vi.mock('@/api', () => ({
  default: {
    show_room_info: vi.fn().mockResolvedValue({
      code: 1000,
      data: { status: 0, videoList: [], updateTime: '' },
      msg: ''
    })
  }
}));

function createWrapper() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/classroom/largestudent', component: { template: '<div />' } }]
  });
  return mount(Classroom, {
    props: { role: 'student', size: 'large' },
    global: { plugins: [router, ElementPlus], components: stubs }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Classroom large-student', () => {
  it('renders without throwing', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    expect(wrapper.find('.large-student').exists()).toBe(true);
  });

  it('has correct initial state', () => {
    const wrapper = createWrapper();
    const vm = wrapper.vm as unknown as {
      isTeacher: boolean;
      activeName: string;
      layoutNum: number;
    };
    expect(vm.isTeacher).toBe(false);
    expect(vm.activeName).toBe('chat');
    expect(vm.layoutNum).toBe(3);
  });

  it('handleClick switches active tab', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { handleClick: (tab: string) => void; activeName: string };
    vm.handleClick('people');
    expect(vm.activeName).toBe('people');
    vm.handleClick('chat');
    expect(vm.activeName).toBe('chat');
  });

  it('onBroadcastStop stop 显示暂停直播', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { onBroadcastStop: (status?: string) => void };
    vm.onBroadcastStop('stop');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('暂停直播');
    expect(wrapper.text()).not.toContain('直播已结束');
  });
});
