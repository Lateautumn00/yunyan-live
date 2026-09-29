import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import RoomActions from '@/components/teacher/RoomActions.vue';
import { useUserStore } from '@/store/user';
import type { LiveRoom } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  liveDelete: vi.fn(),
  updateLive: vi.fn(),
  executeTransfer: vi.fn(),
  updateCode: vi.fn(),
  coursewareList: vi.fn(),
  saveCourseware: vi.fn(),
  deleteCourseware: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    live_delete: (params: unknown) => mocks.liveDelete(params),
    update_live: (params: unknown) => mocks.updateLive(params),
    execute_transfer: (params: unknown) => mocks.executeTransfer(params),
    update_code: (params: unknown) => mocks.updateCode(params),
    courseware_list: (params: unknown) => mocks.coursewareList(params),
    save_courseware: (params: unknown) => mocks.saveCourseware(params),
    delete_courseware: (params: unknown) => mocks.deleteCourseware(params)
  }
}));

function ok<T>(data: T) {
  return { data: { code: 1000, msg: undefined, data } };
}

const room: LiveRoom = {
  roomId: 'R1',
  title: '数学课',
  speakerName: '张老师',
  type: 0,
  joinCode: 'CODE123',
  startTime: '1600000000000',
  status: 1,
  duration: 60
};

interface RoomActionsVm {
  menuItems: Array<{ command: string; label: string }>;
  roomDialogVisible: boolean;
  deleteDialogVisible: boolean;
  shareDialogVisible: boolean;
  transferDialogVisible: boolean;
  editDialogVisible: boolean;
  coursewareDialogVisible: boolean;
  transferCode: string;
  editForm: { roomId: string; title: string; type: number; duration: number };
  onCommand: (command: string) => void;
  goLiveRoom: (identity: number) => void;
  submitDelete: () => Promise<void>;
  submitTransfer: () => Promise<void>;
  submitEdit: () => Promise<void>;
}

function vm(wrapper: VueWrapper): RoomActionsVm {
  return wrapper.vm as unknown as RoomActionsVm;
}

async function mountActions(
  roomProps: LiveRoom = room,
  variant: 'dropdown' | 'buttons' = 'dropdown'
) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div class="route-home" />' } },
      { path: '/teacher/mylive/watchlist', component: { template: '<div />' } },
      { path: '/teacher/playback/detail', component: { template: '<div />' } },
      { path: '/classroom/smallstudent', component: { template: '<div />' } },
      { path: '/classroom/largestudent', component: { template: '<div />' } },
      { path: '/classroom/smallteacher', component: { template: '<div />' } },
      { path: '/classroom/largeteacher', component: { template: '<div />' } }
    ]
  });
  await router.push('/');
  await router.isReady();
  useUserStore(pinia).setUserInfo({
    guid: '',
    token: '',
    userName: '张老师',
    email: '',
    role: 1
  });
  const wrapper = mount(RoomActions, {
    props: { room: roomProps, variant },
    global: {
      plugins: [pinia, router, ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
  });
  await flushPromises();
  return { wrapper, router };
}

function emitted(wrapper: VueWrapper, name: string) {
  return wrapper.emitted(name) ?? [];
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.liveDelete.mockResolvedValue(ok(null));
  mocks.updateLive.mockResolvedValue(ok(null));
  mocks.executeTransfer.mockResolvedValue(ok(null));
  mocks.updateCode.mockResolvedValue(ok('NEW123'));
  mocks.coursewareList.mockResolvedValue(ok({ list: [], pageInfo: { totalElements: 0 } }));
  mocks.saveCourseware.mockResolvedValue(ok(null));
  mocks.deleteCourseware.mockResolvedValue(ok(null));
});

describe('components/teacher/RoomActions.vue', () => {
  it('dropdown 变体菜单项按 status 显隐', async () => {
    const { wrapper } = await mountActions({ ...room, status: 1 });
    expect(vm(wrapper).menuItems.map(i => i.command)).toEqual([
      'gotoroom',
      'share',
      'watchlist',
      'upload',
      'transfer',
      'edit',
      'delete'
    ]);

    const { wrapper: live } = await mountActions({ ...room, status: 2 });
    expect(vm(live).menuItems.map(i => i.command)).toEqual([
      'gotoroom',
      'share',
      'watchlist',
      'upload',
      'delete'
    ]);
  });

  it('上传课件仅 dropdown 变体提供，命令打开课件弹窗', async () => {
    const { wrapper } = await mountActions();
    expect(vm(wrapper).menuItems.map(i => i.command)).toContain('upload');
    expect(vm(wrapper).menuItems.find(i => i.command === 'upload')?.label).toBe('上传课件');
    vm(wrapper).onCommand('upload');
    expect(vm(wrapper).coursewareDialogVisible).toBe(true);

    const { wrapper: buttons } = await mountActions(room, 'buttons');
    expect(vm(buttons).menuItems.map(i => i.command)).not.toContain('upload');
  });

  it('buttons 变体渲染进入房间，回放按 status 显隐', async () => {
    const { wrapper } = await mountActions({ ...room, status: 2 }, 'buttons');
    expect(wrapper.text()).toContain('进入房间');
    expect(wrapper.text()).not.toContain('回放');

    const { wrapper: ended } = await mountActions({ ...room, status: 3 }, 'buttons');
    expect(ended.text()).toContain('回放');
  });

  it('buttons 变体分享命令向上 emit share', async () => {
    const { wrapper } = await mountActions(room, 'buttons');
    vm(wrapper).onCommand('share');
    expect(emitted(wrapper, 'share')).toHaveLength(1);
    expect(vm(wrapper).shareDialogVisible).toBe(false);
  });

  it('dropdown 变体分享命令打开分享弹窗', async () => {
    const { wrapper } = await mountActions();
    vm(wrapper).onCommand('share');
    expect(vm(wrapper).shareDialogVisible).toBe(true);
  });

  it('弹窗 append-to-body 渲染到 body 而非组件树内', async () => {
    const { wrapper } = await mountActions();
    vm(wrapper).onCommand('gotoroom');
    await flushPromises();
    expect(wrapper.find('.el-overlay').exists()).toBe(false);
    const inBody = Array.from(document.body.querySelectorAll('.el-dialog')).some((el) =>
      (el.textContent ?? '').includes('请选择进入直播间身份')
    );
    expect(inBody).toBe(true);
  });

  it('删除确认后调用 live_delete 并 emit deleted', async () => {
    const { wrapper } = await mountActions();
    vm(wrapper).onCommand('delete');
    expect(vm(wrapper).deleteDialogVisible).toBe(true);
    await vm(wrapper).submitDelete();
    expect(mocks.liveDelete).toHaveBeenCalledWith({ roomId: 'R1' });
    expect(emitted(wrapper, 'deleted')).toHaveLength(1);
    expect(document.body.textContent).toContain('删除成功');
  });

  it('进入房间以听众身份跳转课堂', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper, router } = await mountActions();
      vm(wrapper).onCommand('gotoroom');
      expect(vm(wrapper).roomDialogVisible).toBe(true);
      vm(wrapper).goLiveRoom(0);
      await vi.advanceTimersByTimeAsync(500);
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/classroom/smallstudent');
      expect(router.currentRoute.value.query).toEqual({
        roomId: 'R1',
        code: 'CODE123',
        identity: 'student',
        nickName: '张老师'
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('编辑保存调用 update_live 并 emit updated', async () => {
    const { wrapper } = await mountActions();
    vm(wrapper).onCommand('edit');
    await flushPromises();
    expect(vm(wrapper).editDialogVisible).toBe(true);
    expect(vm(wrapper).editForm.title).toBe('数学课');
    await vm(wrapper).submitEdit();
    expect(mocks.updateLive).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'R1', title: '数学课', type: 0, duration: 60 })
    );
    expect(emitted(wrapper, 'updated')).toHaveLength(1);
    expect(document.body.textContent).toContain('修改成功');
  });

  it('转移确认调用 execute_transfer 并 emit transferred', async () => {
    const { wrapper } = await mountActions();
    vm(wrapper).onCommand('transfer');
    expect(vm(wrapper).transferDialogVisible).toBe(true);
    vm(wrapper).transferCode = 'TC001';
    await vm(wrapper).submitTransfer();
    expect(mocks.executeTransfer).toHaveBeenCalledWith({
      roomId: 'R1',
      transferCode: 'TC001'
    });
    expect(emitted(wrapper, 'transferred')).toHaveLength(1);
    expect(document.body.textContent).toContain('转移成功');
  });
});
