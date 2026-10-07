import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import EmojiPicker from './EmojiPicker.vue';

function fakeRect(over: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    toJSON: () => ({}),
    ...over
  } as DOMRect;
}

async function openPanel(over: Partial<DOMRect>) {
  const wrapper = mount(EmojiPicker, { attachTo: document.body });
  const btn = wrapper.find('.emoji-btn');
  vi.spyOn(btn.element, 'getBoundingClientRect').mockReturnValue(fakeRect(over));
  await btn.trigger('click');
  await wrapper.vm.$nextTick();
  return { wrapper, panel: wrapper.find('.emoji-panel') };
}

describe('ClassRoom EmojiPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('打开后面板为 fixed 且坐标钳制在视口内', async () => {
    const { wrapper, panel } = await openPanel({ left: 950, top: 700, bottom: 732 });
    expect(panel.exists()).toBe(true);
    expect((panel.element as HTMLElement).style.position).toBe('fixed');
    const left = parseFloat((panel.element as HTMLElement).style.left);
    const top = parseFloat((panel.element as HTMLElement).style.top);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top).toBeLessThanOrEqual(window.innerHeight - 8);
    wrapper.unmount();
  });

  it('按钮贴右缘时 left 向内钳制', async () => {
    const { wrapper, panel } = await openPanel({ left: window.innerWidth + 20, bottom: 300 });
    const left = parseFloat((panel.element as HTMLElement).style.left);
    expect(left).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(left).toBeGreaterThanOrEqual(8);
    wrapper.unmount();
  });

  it('按钮贴顶部上方放不下时翻转到按钮下方', async () => {
    const { wrapper, panel } = await openPanel({ left: 10, top: 4, bottom: 36 });
    expect(parseFloat((panel.element as HTMLElement).style.top)).toBe(40);
    wrapper.unmount();
  });

  it('打开状态下窗口 resize 重新定位', async () => {
    const { wrapper, panel } = await openPanel({ left: 100, top: 700, bottom: 732 });
    expect(parseFloat((panel.element as HTMLElement).style.left)).toBe(100);
    vi.spyOn(wrapper.find('.emoji-btn').element, 'getBoundingClientRect').mockReturnValue(
      fakeRect({ left: 300, top: 700, bottom: 732 })
    );
    window.dispatchEvent(new Event('resize'));
    await wrapper.vm.$nextTick();
    expect(parseFloat((panel.element as HTMLElement).style.left)).toBe(300);
    wrapper.unmount();
  });
});
