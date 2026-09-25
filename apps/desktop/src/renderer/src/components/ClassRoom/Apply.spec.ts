import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Apply from '@/components/ClassRoom/Apply.vue';

function vmOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.vm as unknown as {
    applyList: (status: boolean, data: { userName: string; opaqueId: string }) => void;
    agree: (status: boolean, item: string | undefined, index: number, num: number) => void;
    setAudioAll: (user: string[]) => void;
  };
}

describe('ClassRoom Apply.vue', () => {
  it('老师端显示举手申请列表', async () => {
    const wrapper = mount(Apply, { props: { isTeacher: true, isInteraction: 0 } });
    vmOf(wrapper).applyList(true, { userName: '张三', opaqueId: 'p1' });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('张三');
    expect(wrapper.text()).toContain('同意');
    expect(wrapper.text()).toContain('拒绝');
  });

  it('学生取消举手后老师端移除', async () => {
    const wrapper = mount(Apply, { props: { isTeacher: true, isInteraction: 0 } });
    const vm = vmOf(wrapper);
    vm.applyList(true, { userName: '张三', opaqueId: 'p1' });
    vm.applyList(true, { userName: '李四', opaqueId: 'p2' });
    vm.applyList(false, { userName: '张三', opaqueId: 'p1' });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('张三');
    expect(wrapper.text()).toContain('李四');
  });

  it('老师同意举手清空列表并触发 agree 事件', async () => {
    const wrapper = mount(Apply, { props: { isTeacher: true, isInteraction: 0 } });
    const vm = vmOf(wrapper);
    vm.applyList(true, { userName: '张三', opaqueId: 'p1' });
    vm.agree(true, 'display', 0, 4);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('li')).toHaveLength(0);
    expect(wrapper.emitted('agree')?.[0]).toEqual([true, 'display', 0, 4]);
  });

  it('老师拒绝举手移除该学生并触发 agree 事件', async () => {
    const wrapper = mount(Apply, { props: { isTeacher: true, isInteraction: 0 } });
    const vm = vmOf(wrapper);
    vm.applyList(true, { userName: '张三', opaqueId: 'p1' });
    vm.applyList(true, { userName: '李四', opaqueId: 'p2' });
    vm.agree(false, 'display', 0, 5);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('李四');
    expect(wrapper.text()).toContain('张三');
    expect(wrapper.emitted('agree')?.[0]).toEqual([false, 'display', 0, 5]);
  });

  it('setAudioAll 更新发言人名与禁麦状态', async () => {
    const wrapper = mount(Apply, { props: { isTeacher: true, isInteraction: 2 } });
    vmOf(wrapper).setAudioAll(['id', 'name', '王五', 'on']);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('王五');
    expect(wrapper.text()).toContain('发言中...');
  });

  it('禁麦/开麦与退出触发事件', async () => {
    const wrapper = mount(Apply, { props: { isTeacher: true, isInteraction: 2 } });
    vmOf(wrapper).setAudioAll(['id', 'name', '王五', 'on']);
    await wrapper.vm.$nextTick();
    const buttons = wrapper.findAll('span');
    const muted = buttons.find((b) => b.text() === '禁麦');
    expect(muted).toBeTruthy();
    await muted!.trigger('click');
    expect(wrapper.emitted('isTalking')?.[0]).toEqual(['off']);
    const exit = buttons.find((b) => b.text() === '退出');
    await exit!.trigger('click');
    expect(wrapper.emitted('stopApplication')).toHaveLength(1);
  });
});