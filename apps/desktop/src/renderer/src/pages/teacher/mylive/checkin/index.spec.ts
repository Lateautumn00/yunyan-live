import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ok, mountPage as mountSharedPage } from '@/testing/utils';
import CheckinRecords from '@/pages/teacher/mylive/checkin/index.vue';

const mocks = vi.hoisted(() => ({
  checkinSessions: vi.fn(),
  checkinRecords: vi.fn()
}));

vi.mock('@/api', () => ({
  default: {
    checkin_sessions: (params: unknown) => mocks.checkinSessions(params),
    checkin_records: (sessionId: unknown) => mocks.checkinRecords(sessionId)
  }
}));

vi.mock('@/layouts/sidebar.vue', () => ({
  default: {
    name: 'SidebarMenuStub',
    template: '<nav class="sidebar-stub" />'
  }
}));

interface SessionRow {
  sessionId: string;
  roomId: string;
  teacherId: string;
  startedAt: string;
  deadlineAt: string;
  endedAt: string | null;
  attendeeCount: number;
  signedCount: number;
  makeupOpen: boolean;
  status: number;
  mySigned: boolean;
  myMethod: number;
}

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    sessionId: 's1',
    roomId: 'R1',
    teacherId: 't1',
    startedAt: '2026-10-01T10:00:00.000Z',
    deadlineAt: '2026-10-01T10:01:00.000Z',
    endedAt: '2026-10-01T10:01:00.000Z',
    attendeeCount: 4,
    signedCount: 3,
    makeupOpen: false,
    status: 2,
    mySigned: false,
    myMethod: 0,
    ...overrides
  };
}

const sessions = [
  makeSession(),
  makeSession({
    sessionId: 's2',
    startedAt: '2026-10-02T09:00:00.000Z',
    deadlineAt: '2026-10-02T09:01:00.000Z',
    endedAt: null,
    status: 1,
    attendeeCount: 0,
    signedCount: 1
  })
];

const recordsS1 = {
  items: [
    {
      userId: 'u1',
      nickName: '小明',
      inDenominator: true,
      signed: true,
      method: 1,
      respondedAt: '2026-10-01T10:00:30.000Z'
    },
    {
      userId: 'u2',
      nickName: '小红',
      inDenominator: true,
      signed: true,
      method: 2,
      respondedAt: '2026-10-01T10:02:00.000Z'
    },
    {
      userId: 'u3',
      nickName: '小刚',
      inDenominator: true,
      signed: false,
      method: 0,
      respondedAt: ''
    },
    {
      userId: 'u4',
      nickName: '旁听生',
      inDenominator: false,
      signed: true,
      method: 1,
      respondedAt: '2026-10-01T10:00:40.000Z'
    }
  ],
  total: 4,
  attendeeCount: 4,
  signedCount: 3,
  attendedCount: 2
};

const recordsS2 = {
  items: [
    {
      userId: 'u5',
      nickName: '旁听乙',
      inDenominator: false,
      signed: true,
      method: 1,
      respondedAt: '2026-10-02T09:00:40.000Z'
    }
  ],
  total: 1,
  attendeeCount: 0,
  signedCount: 1,
  attendedCount: 0
};

function mountPage() {
  return mountSharedPage(CheckinRecords, {
    routes: [{ path: '/teacher/mylive/checkin', component: { template: '<div />' } }],
    initialRoute: { path: '/teacher/mylive/checkin', query: { roomId: 'R1', name: '数学课' } }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkinSessions.mockResolvedValue(ok({ items: sessions, total: 2 }));
  mocks.checkinRecords.mockImplementation((sessionId: unknown) =>
    Promise.resolve(ok(sessionId === 's1' ? recordsS1 : recordsS2))
  );
});

describe('签到记录 mylive/checkin/index.vue', { timeout: 10000 }, () => {
  it('渲染房间标题、状态与出勤率（应到0 → —）', async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('数学课');
    expect(mocks.checkinSessions).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'R1', page: 1, pageSize: 6 })
    );
    expect(mocks.checkinRecords).toHaveBeenCalledWith('s1');
    expect(mocks.checkinRecords).toHaveBeenCalledWith('s2');
    expect(wrapper.text()).toContain('已结束');
    expect(wrapper.text()).toContain('进行中');
    expect(wrapper.text()).toContain('50%');
    expect(wrapper.text()).toContain('—');
  });

  it('展开明细列出名单外签到与补签/未签', async () => {
    const { wrapper } = await mountPage();
    const expandIcon = wrapper.find('.el-table__expand-icon');
    expect(expandIcon.exists()).toBe(true);
    await expandIcon.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('小明');
    expect(wrapper.text()).toContain('旁听生');
    expect(wrapper.text()).toContain('名单外签到');
    expect(wrapper.text()).toContain('补签');
    expect(wrapper.text()).toContain('未签');
    expect(wrapper.text()).toContain('应到');
    expect(wrapper.text()).toContain('名单外');
  });

  it('分页 current-change 触发下一页查询', async () => {
    const { wrapper } = await mountPage();
    const pagination = wrapper.findComponent({ name: 'ElPagination' });
    pagination.vm.$emit('current-change', 2);
    await flushPromises();
    expect(mocks.checkinSessions).toHaveBeenLastCalledWith(
      expect.objectContaining({ roomId: 'R1', page: 2, pageSize: 6 })
    );
  });

  it('单场明细失败时出勤率降级为 - 而非错误值', async () => {
    mocks.checkinRecords.mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountPage();
    expect(wrapper.text()).toContain('-');
    expect(wrapper.text()).not.toContain('%');
    expect(wrapper.text()).not.toContain('NaN');
  });
});
