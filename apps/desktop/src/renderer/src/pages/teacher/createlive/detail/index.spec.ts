import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import type { ElectronApi } from '@yunyan-live/ipc';
import { formatDate } from '@yunyan-live/utils';
import Detail from '@/pages/teacher/createlive/detail/index.vue';
import type { LiveRoom } from '@/types/pages/teacher/live';

const mocks = vi.hoisted(() => ({
  roomDetail: vi.fn(),
  updateCode: vi.fn(),
  clipboardWriteText: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    room_detail: (params: unknown) => mocks.roomDetail(params),
    update_code: (params: unknown) => mocks.updateCode(params)
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

interface DetailVm {
  roomId: string;
  roomDetail: LiveRoom;
  updateCode: () => Promise<void>;
  copyLink: (content?: string) => void;
}

function vm(wrapper: VueWrapper): DetailVm {
  return wrapper.vm as unknown as DetailVm;
}

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
  Object.assign(window, {
    electronAPI: {
      clipboardWriteText: mocks.clipboardWriteText
    } as unknown as ElectronApi
  });
  mocks.roomDetail.mockResolvedValue(ok(room));
  mocks.updateCode.mockResolvedValue(ok('TEA002'));
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

  it('更新教师参加码', async () => {
    const { wrapper } = await mountPage();
    await vm(wrapper).updateCode();
    expect(mocks.updateCode).toHaveBeenCalledWith({
      roomId: 'R1'
    });
    expect(vm(wrapper).roomDetail.joinCode).toBe('CODE002');
    expect(document.body.textContent).toContain('更新成功');
  });

  it('复制参加码调用剪贴板', async () => {
    const { wrapper } = await mountPage();
    vm(wrapper).copyLink('CODE001');
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith('CODE001');
    expect(document.body.textContent).toContain('复制成功');
  });
});
