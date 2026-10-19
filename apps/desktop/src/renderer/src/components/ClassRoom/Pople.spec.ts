import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { createPinia } from 'pinia';
import Pople from '@/components/ClassRoom/Pople.vue';
import { useRoomStore } from '@/store/room';
import { useUserStore } from '@/store/user';
import api from '@/api';

vi.mock('@/api', () => ({
  default: {
    mute: vi.fn(async () => ({})),
    kick: vi.fn(async () => ({})),
    releaseModeration: vi.fn(async () => ({}))
  }
}));

function mountPople(props: { liveUserId: string; roomId?: string }) {
  const pinia = createPinia();
  const wrapper = mount(Pople, {
    props: { roomId: 'r1', ...props },
    global: { plugins: [ElementPlus, pinia], components: { ...ElementPlusIconsVue } }
  });
  return { wrapper, pinia };
}

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as {
    updatePopleList: (
      list: Array<{ userName: string; opaqueId: string; isTeacher?: boolean }>
    ) => void;
  };
}

describe('ClassRoom Pople.vue', () => {
  it('渲染人员列表', async () => {
    const { wrapper } = mountPople({ liveUserId: 'u1' });
    vmOf(wrapper).updatePopleList([
      { userName: '老师', opaqueId: 't1', isTeacher: true },
      { userName: '学生', opaqueId: 'u1' }
    ]);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('老师');
    expect(wrapper.text()).toContain('主讲');
    expect(wrapper.text()).toContain('学生');
    expect(wrapper.text()).toContain('我');
  });

  it('非本人不显示“我”徽标', async () => {
    const { wrapper } = mountPople({ liveUserId: 'u1' });
    vmOf(wrapper).updatePopleList([{ userName: '其他人', opaqueId: 'u2' }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('我');
  });

  it('更新名单双写到 room store', () => {
    const { wrapper, pinia } = mountPople({ liveUserId: 'u1' });
    vmOf(wrapper).updatePopleList([
      { userName: '老师', opaqueId: 't1', isTeacher: true },
      { userName: '学生', opaqueId: 'u1' }
    ]);
    expect(useRoomStore(pinia).members).toEqual([
      { userName: '老师', opaqueId: 't1', isTeacher: true },
      { userName: '学生', opaqueId: 'u1' }
    ]);
  });
});

describe('Pople F3 单用户管控操作', () => {
  function vmOf(wrapper: ReturnType<typeof mount>) {
    return wrapper.vm as unknown as {
      updatePopleList: (
        list: Array<{ userName: string; opaqueId: string; isTeacher?: boolean }>
      ) => void;
      handleModeration: (
        command: string,
        item: { userName?: string; opaqueId?: string; isTeacher?: boolean }
      ) => Promise<void>;
    };
  }

  it('教师 + chat 名册 → 非本人学生行显示操作入口；学生视角不显示', async () => {
    const teacherView = mountPople({ liveUserId: 't1' });
    useUserStore(teacherView.pinia).userInfo.role = 1;
    useRoomStore(teacherView.pinia).setChatRoster([
      { senderId: 'g-s', liveUserId: 'u2', nickName: '学生', isTeacher: false },
      { senderId: 'g-t', liveUserId: 't1', nickName: '老师', isTeacher: true }
    ]);
    vmOf(teacherView.wrapper).updatePopleList([
      { userName: '老师', opaqueId: 't1', isTeacher: true },
      { userName: '学生', opaqueId: 'u2' }
    ]);
    await teacherView.wrapper.vm.$nextTick();
    expect(teacherView.wrapper.findAll('.ops')).toHaveLength(1);

    const studentView = mountPople({ liveUserId: 'u1' });
    useUserStore(studentView.pinia).userInfo.role = 0;
    useRoomStore(studentView.pinia).setChatRoster([
      { senderId: 'g-s', liveUserId: 'u2', nickName: '学生', isTeacher: false }
    ]);
    vmOf(studentView.wrapper).updatePopleList([
      { userName: '自己', opaqueId: 'u1' },
      { userName: '学生', opaqueId: 'u2' }
    ]);
    await studentView.wrapper.vm.$nextTick();
    expect(studentView.wrapper.findAll('.ops')).toHaveLength(0);
  });

  it('无 chat 名册（未入聊天）或目标是教师 → 不显示操作入口', async () => {
    const noRoster = mountPople({ liveUserId: 't1' });
    useUserStore(noRoster.pinia).userInfo.role = 1;
    vmOf(noRoster.wrapper).updatePopleList([{ userName: '学生', opaqueId: 'u2' }]);
    await noRoster.wrapper.vm.$nextTick();
    expect(noRoster.wrapper.findAll('.ops')).toHaveLength(0);

    const teacherTarget = mountPople({ liveUserId: 't1' });
    useUserStore(teacherTarget.pinia).userInfo.role = 1;
    useRoomStore(teacherTarget.pinia).setChatRoster([
      { senderId: 'g-t2', liveUserId: 't2', nickName: '副讲', isTeacher: true }
    ]);
    vmOf(teacherTarget.wrapper).updatePopleList([
      { userName: '副讲', opaqueId: 't2', isTeacher: true }
    ]);
    await teacherTarget.wrapper.vm.$nextTick();
    expect(teacherTarget.wrapper.findAll('.ops')).toHaveLength(0);
  });

  it('moderation 视图驱动徽标（已禁言/已移出）', async () => {
    const { wrapper, pinia } = mountPople({ liveUserId: 't1' });
    useUserStore(pinia).userInfo.role = 1;
    const roomStore = useRoomStore(pinia);
    roomStore.setChatRoster([
      { senderId: 'g-s', liveUserId: 'u2', nickName: '学生', isTeacher: false },
      { senderId: 'g-s2', liveUserId: 'u3', nickName: '同学', isTeacher: false }
    ]);
    roomStore.applyModeration({
      userId: 'g-s',
      kind: 'mute',
      op: 'set',
      untilMs: Date.now() + 1000
    });
    roomStore.applyModeration({ userId: 'g-s2', kind: 'kick', op: 'set' });
    vmOf(wrapper).updatePopleList([
      { userName: '学生', opaqueId: 'u2' },
      { userName: '同学', opaqueId: 'u3' }
    ]);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('已禁言');
    expect(wrapper.text()).toContain('已移出');
  });

  it('handleModeration：禁言 1/5/10、移出、解除按命令调对应 api（userId=roster senderId）', async () => {
    const mute = api.mute as ReturnType<typeof vi.fn>;
    const kick = api.kick as ReturnType<typeof vi.fn>;
    const release = api.releaseModeration as ReturnType<typeof vi.fn>;
    mute.mockClear();
    kick.mockClear();
    release.mockClear();

    const { wrapper, pinia } = mountPople({ liveUserId: 't1', roomId: 'r-1' });
    useUserStore(pinia).userInfo.role = 1;
    useRoomStore(pinia).setChatRoster([
      { senderId: 'g-s', liveUserId: 'u2', nickName: '学生', isTeacher: false }
    ]);
    vmOf(wrapper).updatePopleList([{ userName: '学生', opaqueId: 'u2' }]);
    const target = { userName: '学生', opaqueId: 'u2' };

    await vmOf(wrapper).handleModeration('mute1', target);
    await vmOf(wrapper).handleModeration('mute5', target);
    await vmOf(wrapper).handleModeration('mute10', target);
    expect(mute).toHaveBeenCalledTimes(3);
    expect(mute).toHaveBeenNthCalledWith(1, { roomId: 'r-1', userId: 'g-s', minutes: 1 });
    expect(mute).toHaveBeenNthCalledWith(2, { roomId: 'r-1', userId: 'g-s', minutes: 5 });
    expect(mute).toHaveBeenNthCalledWith(3, { roomId: 'r-1', userId: 'g-s', minutes: 10 });

    await vmOf(wrapper).handleModeration('kick', target);
    expect(kick).toHaveBeenCalledWith({ roomId: 'r-1', userId: 'g-s' });

    await vmOf(wrapper).handleModeration('releaseMute', target);
    expect(release).toHaveBeenCalledWith({ roomId: 'r-1', userId: 'g-s', kind: 'mute' });
    await vmOf(wrapper).handleModeration('releaseKick', target);
    expect(release).toHaveBeenCalledWith({ roomId: 'r-1', userId: 'g-s', kind: 'kick' });
  });
});
