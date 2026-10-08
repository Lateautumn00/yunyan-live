import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import Classroom from '@/pages/classroom/Classroom.vue';

const stubs = {
  Top: {
    template: '<div class="top-stub" />',
    props: ['isTeacher', 'roomInfo', 'roomId', 'liveType', 'type', 'btn']
  },
  WhiteBoard: {
    template: '<div class="wb-stub" />',
    props: ['isTeacher', 'isDisplay', 'roomId', 'opaqueId', 'layouts']
  },
  Video: {
    template: '<div class="video-stub" />',
    props: ['roomInfo', 'isTeacher', 'opaqueId', 'roomId', 'userName', 'isInteraction']
  },
  Chat: {
    template: '<div class="chat-stub" />',
    props: ['roomId', 'liveUserId', 'userName', 'isTeacher', 'isInteraction', 'btn']
  },
  Pople: { template: '<div class="pople-stub" />', props: ['liveUserId'] },
  History: { template: '<div class="history-stub" />', props: ['isTeacher'] },
  Apply: { template: '<div class="apply-stub" />', props: ['isTeacher', 'isInteraction'] },
  HistoryVideo: { template: '<div class="hv-stub" />', props: ['opaqueId', 'id'] },
  VideoList: {
    template: '<div class="videolist-stub" />',
    props: ['isTeacher', 'opaqueId', 'isInteraction']
  },
  VideoPlayer: { template: '<div class="vp-stub" />', props: ['isMuted'] }
};

vi.mock('@/api', () => ({
  default: {
    show_room_info: vi.fn().mockResolvedValue({
      code: 1000,
      data: { status: 0, videoList: [], updateTime: '' },
      msg: ''
    }),
    getNowTime: vi.fn().mockResolvedValue({ code: 1000, data: { nowTime: '' }, msg: '' })
  }
}));

function createWrapper() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/classroom/smallteacher', component: { template: '<div />' } }]
  });
  return mount(Classroom, {
    props: { role: 'teacher', size: 'small' },
    global: { plugins: [router, ElementPlus], components: stubs }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Classroom small-teacher', () => {
  it('renders without throwing', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    expect(wrapper.find('.small-teacher').exists()).toBe(true);
  });

  it('has correct initial state', () => {
    const wrapper = createWrapper();
    const vm = wrapper.vm as unknown as {
      isTeacher: boolean;
      activeName: string;
      layoutNum: number;
    };
    expect(vm.isTeacher).toBe(true);
    expect(vm.activeName).toBe('chat');
    expect(vm.layoutNum).toBe(2);
  });

  it('handleClick switches active tab', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { handleClick: (tab: string) => void; activeName: string };
    vm.handleClick('people');
    expect(vm.activeName).toBe('people');
    vm.handleClick('raisehands');
    expect(vm.activeName).toBe('raisehands');
  });

  it('setLayouts changes layout number', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const vm = wrapper.vm as unknown as { setLayouts: (n: number) => void; layoutNum: number };
    vm.setLayouts(1);
    expect(vm.layoutNum).toBe(1);
  });
});
