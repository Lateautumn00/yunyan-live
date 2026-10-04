import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import History from '@/components/ClassRoom/History.vue';

const apiBackstageMocks = vi.hoisted(() => ({
  videoids_delete: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    videoids_delete: (params: unknown) => apiBackstageMocks.videoids_delete(params)
  }
}));

function mountHistory(props: Record<string, unknown> = {}) {
  return mount(History, {
    props,
    global: { plugins: [ElementPlus], components: { ...ElementPlusIconsVue } }
  });
}

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as {
    videoLists: (
      status: boolean,
      data: { id: string; address?: string; duration: number; createTime: number }
    ) => void;
    setSplice: (index: number) => void;
    delVideoList: (id: string | undefined, index: number) => void;
  };
}

describe('ClassRoom History.vue', () => {
  beforeEach(() => {
    apiBackstageMocks.videoids_delete.mockReset();
  });

  it('渲染回放列表并显示格式化时长', async () => {
    const wrapper = mountHistory({ isTeacher: true });
    vmOf(wrapper).videoLists(true, { id: 'v1', duration: 125, createTime: new Date(2026, 0, 1, 10, 0, 0).getTime() });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('时长:');
    expect(wrapper.text()).toContain("2'05\"");
  });

  it('duration 为 0 时显示 00\'00"', async () => {
    const wrapper = mountHistory({ isTeacher: false });
    vmOf(wrapper).videoLists(true, { id: 'v1', duration: 0, createTime: new Date().getTime() });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("00'00\"");
  });

  it('老师点击删除调用接口并触发 delList', async () => {
    apiBackstageMocks.videoids_delete.mockResolvedValue({ code: 1000 });
    const wrapper = mountHistory({ isTeacher: true });
    vmOf(wrapper).videoLists(true, { id: 'v1', duration: 60, createTime: new Date().getTime() });
    await wrapper.vm.$nextTick();
    const delIcon = wrapper.find('[aria-label="删除"]');
    expect(delIcon.exists()).toBe(true);
    await delIcon.trigger('click');
    await flushPromises();
    expect(apiBackstageMocks.videoids_delete).toHaveBeenCalledWith({
      data: { videoIds: ['v1'] }
    });
    expect(wrapper.emitted('delList')?.[0]).toEqual(['v1', 0]);
  });

  it('非老师不显示删除按钮', async () => {
    const wrapper = mountHistory({ isTeacher: false });
    vmOf(wrapper).videoLists(true, { id: 'v1', duration: 60, createTime: new Date().getTime() });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="删除"]').exists()).toBe(false);
  });

  it('点击回放触发 palyHistoryVideo', async () => {
    const wrapper = mountHistory({ isTeacher: false });
    vmOf(wrapper).videoLists(true, { id: 'v1', address: 'addr1', duration: 60, createTime: new Date().getTime() });
    await wrapper.vm.$nextTick();
    const playIcon = wrapper.find('[aria-label="回放"]');
    await playIcon.trigger('click');
    const args = wrapper.emitted('palyHistoryVideo')?.[0];
    expect(args?.[0]).toBe('addr1');
    expect(String(args?.[1])).toContain('回放');
  });

  it('setSplice 移除指定项', async () => {
    const wrapper = mountHistory({ isTeacher: true });
    const vm = vmOf(wrapper);
    vm.videoLists(true, { id: 'v1', duration: 60, createTime: new Date().getTime() });
    vm.videoLists(true, { id: 'v2', duration: 60, createTime: new Date().getTime() });
    vm.setSplice(0);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('li')).toHaveLength(1);
  });
});