import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import StudentRooms from '@/pages/student/rooms/index.vue';

const mocks = vi.hoisted(() => ({
  studentRooms: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    student_rooms: (params: unknown) => mocks.studentRooms(params),
    join_live: vi.fn(),
    batch_leave: vi.fn()
  }
}));

vi.mock('@/components/SettingsDialog.vue', () => ({
  default: {
    name: 'SettingsDialogStub',
    template: '<div class="settings-dialog-stub" />'
  }
}));

const room = {
  id: '1',
  roomId: 'R1',
  title: '数学课',
  speakerName: '张老师',
  liveUserId: 'U1',
  joinCode: 'CODE123',
  status: 2,
  startTime: '1600000000000',
  type: 0,
  joinedAt: ''
};

function mountPage() {
  return mountSharedPage(StudentRooms, {
    routes: [
      { path: '/', component: { template: '<div class="route-home" />' } },
      { path: '/classroom/smallstudent', component: { template: '<div />' } },
      { path: '/classroom/largestudent', component: { template: '<div />' } },
      { path: '/classroom/smallteacher', component: { template: '<div />' } },
      { path: '/classroom/largeteacher', component: { template: '<div />' } }
    ],
    initialRoute: '/'
  });
}

beforeEach(() => {
  mocks.studentRooms.mockResolvedValue(ok({ list: [room], total: 1 }));
});

describe('学生端直播列表 student/rooms/index.vue', () => {
  it('渲染直播列表并请求分页数据', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(wrapper.text()).toContain('张老师');
    expect(wrapper.text()).toContain('CODE123');
    expect(wrapper.find('.el-empty').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ElPagination' }).isVisible()).toBe(true);
    expect(mocks.studentRooms).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it('无数据时展示空状态并隐藏表格与分页', async () => {
    mocks.studentRooms.mockResolvedValue(ok({ list: [], total: 0 }));
    const { wrapper } = await mountPage();
    expect(wrapper.find('.el-empty').exists()).toBe(true);
    expect(wrapper.text()).toContain('暂无直播数据');
    expect(wrapper.text()).toContain('可在上方输入并加入直播');
    expect(wrapper.find('.el-table').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ElPagination' }).isVisible()).toBe(false);
  });
});
