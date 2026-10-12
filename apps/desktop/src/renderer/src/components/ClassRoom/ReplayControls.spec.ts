import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import ReplayControls from './ReplayControls.vue';

function mountCtrl(props: Record<string, unknown> = {}) {
  return mount(ReplayControls, {
    props: {
      total: 0,
      cursor: 0,
      playing: false,
      speed: 1,
      segments: [] as Array<{ seq: number; pageIndex: number }>,
      disabled: false,
      ...props
    },
    global: { plugins: [ElementPlus] }
  });
}

describe('ReplayControls 回放播放条（F6.4）', () => {
  it('正向：空流空态——禁用播放并显示说明', () => {
    const w = mountCtrl({ disabled: true, total: 0 });
    expect(w.text()).toContain('暂无过程回放');
    expect(w.find('.rc-play').exists()).toBe(false);
  });

  it('正向：正常态渲染进度与总数，点击播放/倍速/拖动发事件，分段标记渲染', async () => {
    const w = mountCtrl({
      total: 10,
      cursor: 3,
      segments: [
        { seq: 0, pageIndex: 0 },
        { seq: 5, pageIndex: 1 }
      ]
    });
    expect(w.find('.rc-num').text()).toBe('3/10');
    await w.find('.rc-play').trigger('click');
    expect(w.emitted('toggle')).toBeTruthy();
    await w.find('.rc-speed').setValue('2');
    expect(w.emitted('speed')![0]).toEqual([2]);
    await w.find('.rc-track').trigger('click', { clientX: 0 });
    expect(w.emitted('seek')![0]).toEqual([0]);
    expect(w.findAll('.rc-seg')).toHaveLength(2);
  });

  it('正向：playing 时按钮显示暂停', () => {
    const w = mountCtrl({ total: 5, playing: true });
    expect(w.find('.rc-play').text()).toBe('暂停');
  });
});
