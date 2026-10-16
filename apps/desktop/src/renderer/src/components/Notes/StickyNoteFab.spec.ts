import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { useStickyNotes } from '@/composables/useStickyNotes';
import StickyNoteFab from './StickyNoteFab.vue';

const POS_KEY = 'sticky-fab-pos';

describe('StickyNoteFab — 悬浮入口', () => {
  const sticky = useStickyNotes();

  beforeEach(() => {
    sticky.reset();
    localStorage.removeItem(POS_KEY);
  });

  afterEach(() => {
    sticky.reset();
  });

  it('渲染固定定位图标按钮，默认停靠右下角', async () => {
    const wrapper = mount(StickyNoteFab);
    const el = wrapper.find('.sticky-note-fab');
    expect(el.exists()).toBe(true);
    expect(el.attributes('role')).toBe('button');
    expect(wrapper.classes()).toContain('sticky-note-fab');
    expect(wrapper.element.style.left).toMatch(/^\d+px$/);
    expect(wrapper.element.style.top).toMatch(/^\d+px$/);
    await flushPromises();
    wrapper.unmount();
  });

  it('单击开关便签面板', async () => {
    const wrapper = mount(StickyNoteFab);
    await wrapper.trigger('click');
    await flushPromises();
    expect(sticky.open.value).toBe(true);
    await wrapper.trigger('click');
    await flushPromises();
    expect(sticky.open.value).toBe(false);
    wrapper.unmount();
  });

  it('拖拽移动位置并持久化，拖拽后的 click 不触发开关', async () => {
    const wrapper = mount(StickyNoteFab);
    const el = wrapper.element as HTMLElement;
    el.dispatchEvent(
      new MouseEvent('pointerdown', { button: 0, clientX: 300, clientY: 300, bubbles: true })
    );
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: 340, clientY: 320, bubbles: true }));
    el.dispatchEvent(new MouseEvent('pointerup', { clientX: 340, clientY: 320, bubbles: true }));
    expect(localStorage.getItem(POS_KEY)).toBeTruthy();
    expect(sticky.open.value).toBe(false);

    await wrapper.trigger('click');
    await flushPromises();
    expect(sticky.open.value).toBe(false);

    await wrapper.trigger('click');
    await flushPromises();
    expect(sticky.open.value).toBe(true);
    wrapper.unmount();
  });

  it('localStorage 位置损坏时回退默认位置', () => {
    localStorage.setItem(POS_KEY, '{broken json');
    const wrapper = mount(StickyNoteFab);
    expect(wrapper.element.style.left).toMatch(/^\d+px$/);
    wrapper.unmount();
  });

  it('记住的位置越界时钳制回视口内', async () => {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: 99999, y: -50 }));
    const wrapper = mount(StickyNoteFab);
    await flushPromises();
    const left = Number.parseInt(wrapper.element.style.left, 10);
    const top = Number.parseInt(wrapper.element.style.top, 10);
    expect(left).toBeLessThanOrEqual(window.innerWidth - 48 - 16);
    expect(top).toBeGreaterThanOrEqual(16);
    wrapper.unmount();
  });
});
