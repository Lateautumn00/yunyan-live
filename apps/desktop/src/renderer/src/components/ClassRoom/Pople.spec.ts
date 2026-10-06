import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import Pople from '@/components/ClassRoom/Pople.vue';

function mountPople(props: { liveUserId: string }) {
  return mount(Pople, {
    props,
    global: { plugins: [ElementPlus], components: { ...ElementPlusIconsVue } }
  });
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
    const wrapper = mountPople({ liveUserId: 'u1' });
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
    const wrapper = mountPople({ liveUserId: 'u1' });
    vmOf(wrapper).updatePopleList([{ userName: '其他人', opaqueId: 'u2' }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('我');
  });
});
