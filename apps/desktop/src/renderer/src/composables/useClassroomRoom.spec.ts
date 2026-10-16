import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { ok, mountPage } from '@/testing/utils';
import { useClassroomRoom } from './useClassroomRoom';

const mocks = vi.hoisted(() => ({
  showRoomInfo: vi.fn(),
  joinLive: vi.fn(),
  leaveRoom: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    show_room_info: (params: unknown) => mocks.showRoomInfo(params),
    join_live: (params: unknown) => mocks.joinLive(params),
    leave_room: (roomId: unknown) => mocks.leaveRoom(roomId)
  }
}));

const routes = [
  { path: '/classroom/smallstudent', component: { render: () => h('div') } },
  { path: '/classroom/smallteacher', component: { render: () => h('div') } }
];

function makeHarness(role: 'teacher' | 'student') {
  const top = { setsTime: vi.fn() };
  const video = { setInit: vi.fn() };
  const chat = { createTutorSocket: vi.fn() };
  const component = defineComponent({
    setup() {
      useClassroomRoom({
        role,
        top: ref(top),
        video: ref(video),
        chat: ref(chat),
        updateNum: () => undefined
      });
      return () => h('div');
    }
  });
  return { component, top, video, chat };
}

const studentRoute = {
  path: '/classroom/smallstudent',
  query: { roomId: 'R1', nickName: '张三' }
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.showRoomInfo.mockResolvedValue(
    ok({ roomId: 'R1', joinCode: 'J1', status: 1, videoList: [], liveStartedAt: '0' })
  );
  mocks.joinLive.mockResolvedValue(ok({ roomId: 'R1', roleName: 'student' }));
  mocks.leaveRoom.mockResolvedValue(ok({ success: true }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('composables/useClassroomRoom', () => {
  it('学生挂载：getRoomInfo 后携带 joinCode/nickName 调用 join_live', async () => {
    const { component } = makeHarness('student');
    await mountPage(component, { routes, initialRoute: studentRoute });
    await flushPromises();
    expect(mocks.showRoomInfo).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(mocks.joinLive).toHaveBeenCalledWith({ joinCode: 'J1', nickName: '张三' });
  });

  it('教师挂载：不调用 join_live，正常初始化房间信息', async () => {
    const { component, chat } = makeHarness('teacher');
    await mountPage(component, {
      routes,
      initialRoute: { path: '/classroom/smallteacher', query: { roomId: 'R1' } }
    });
    await flushPromises();
    expect(mocks.joinLive).not.toHaveBeenCalled();
    expect(chat.createTutorSocket).toHaveBeenCalledTimes(1);
  });

  it('join_live 失败仅告警，不阻塞进教室', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.joinLive.mockRejectedValue(new Error('net down'));
    const { component } = makeHarness('student');
    const { wrapper } = await mountPage(component, { routes, initialRoute: studentRoute });
    await flushPromises();
    expect(mocks.showRoomInfo).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(warnSpy).toHaveBeenCalledWith('join_live on entry failed:', expect.any(Error));
    expect(wrapper.find('div').exists()).toBe(true);
    warnSpy.mockRestore();
  });

  it('无 roomId 时不调用 join_live；学生卸载调用 leave_room', async () => {
    const { component } = makeHarness('student');
    const { wrapper } = await mountPage(component, {
      routes,
      initialRoute: { path: '/classroom/smallstudent', query: {} }
    });
    await flushPromises();
    expect(mocks.joinLive).not.toHaveBeenCalled();

    const { component: withRoom } = makeHarness('student');
    const mounted = await mountPage(withRoom, { routes, initialRoute: studentRoute });
    await flushPromises();
    expect(mocks.joinLive).toHaveBeenCalledTimes(1);
    mounted.wrapper.unmount();
    expect(mocks.leaveRoom).toHaveBeenCalledWith('R1');
    wrapper.unmount();
  });
});
