import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SharedViewOverlay from './SharedViewOverlay.vue';

/* eslint-disable @typescript-eslint/no-explicit-any */
function stubApi(url = 'atom:///vendor/x.html') {
  (window as any).electronAPI = { vendorGetUrl: async () => url };
}

beforeEach(() => {
  stubApi();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

const TITLE: Record<string, string> = { circuit: '电路实验室', molecule: '分子模型' };

describe('SharedViewOverlay（F3.4/F3.5 页内拖拽浮层）', () => {
  it('正向：kind=null 不渲染', () => {
    const w = mount(SharedViewOverlay, { props: { kind: null, isTeacher: true } });
    expect(w.find('.shared-view-overlay').exists()).toBe(false);
  });

  it('正向：circuit 渲染标题与 iframe（src 经 vendor 寻址）', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    await vi.waitFor(() => {
      expect(w.find('.sv-title').text()).toBe(TITLE['circuit']);
      expect(w.find('iframe').attributes('src')).toContain('atom:///vendor');
    });
  });

  it('正向：教师可关闭，emit close', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'molecule', isTeacher: true } });
    await w.find('.sv-close').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('负向：学生端无关闭入口（跟随教师开关）', () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'molecule', isTeacher: false } });
    expect(w.find('.sv-close').exists()).toBe(false);
  });

  it('正向：iframe 加载完成移除加载占位', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    expect(w.find('.sv-loading').exists()).toBe(true);
    // src 经异步 vendor 寻址后才挂 iframe（jsdom 不自动 load）
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    await w.find('iframe').trigger('load');
    expect(w.find('.sv-loading').exists()).toBe(false);
  });

  it('正向：教师端 iframe 内 Esc → emit close（Esc 桥注入）', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    // jsdom 对非 about:blank src 不给 contentDocument——桩一份验证注入链路（Electron 实机为同源真文档/跨域降级）
    const frame = w.find('iframe').element as HTMLIFrameElement;
    const stubDoc = document.implementation.createHTMLDocument();
    Object.defineProperty(frame, 'contentDocument', { value: stubDoc });
    await w.find('iframe').trigger('load');
    stubDoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('负向：学生端不注入 Esc 桥（跟随教师开关，本地 Esc 不关）', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: false } });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    const frame = w.find('iframe').element as HTMLIFrameElement;
    const stubDoc = document.implementation.createHTMLDocument();
    Object.defineProperty(frame, 'contentDocument', { value: stubDoc });
    await w.find('iframe').trigger('load');
    stubDoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toBeUndefined();
  });

  it('正向：focusFrame 聚焦 iframe（Tab 键盘入口，jsdom focus 为 no-op 不抛）', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    expect(() => w.vm.focusFrame()).not.toThrow();
  });

  it('正向：focusFrame 落焦到 iframe 内首个可聚焦元素（可见焦点环路径）', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    const frame = w.find('iframe').element as HTMLIFrameElement;
    const stubDoc = document.implementation.createHTMLDocument();
    const btn = stubDoc.createElement('button');
    stubDoc.body.appendChild(btn);
    const btnFocus = vi.spyOn(btn, 'focus');
    const winFocus = vi.fn();
    Object.defineProperty(frame, 'contentWindow', {
      value: { focus: winFocus, document: stubDoc }
    });
    w.vm.focusFrame();
    expect(winFocus).toHaveBeenCalledTimes(1);
    expect(btnFocus).toHaveBeenCalledTimes(1);
  });

  it('负向：vendor 寻址失败 → 降级错误态且有重试', async () => {
    (window as any).electronAPI = {
      vendorGetUrl: async () => {
        throw new Error('非法 vendor 路径');
      }
    };
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    await vi.waitFor(() => {
      expect(w.find('.sv-error').exists()).toBe(true);
      expect(w.find('iframe').exists()).toBe(false);
    });
    expect(w.find('.sv-retry').exists()).toBe(true);
  });

  it('正向：全屏切换类名（教师/学生均可）', async () => {
    const w = mount(SharedViewOverlay, { props: { kind: 'circuit', isTeacher: true } });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    await w.find('.sv-fullscreen').trigger('click');
    expect(w.find('.shared-view-overlay').classes()).toContain('fullscreen');
    await w.find('.sv-fullscreen').trigger('click');
    expect(w.find('.shared-view-overlay').classes()).not.toContain('fullscreen');
  });

  it('正向：header 拖拽更新位置（pointerdown/move/up）', async () => {
    const w = mount(SharedViewOverlay, {
      props: { kind: 'circuit', isTeacher: true },
      attachTo: document.body
    });
    await vi.waitFor(() => expect(w.find('.sv-header').exists()).toBe(true));
    // jsdom 无 PointerEvent（VTU trigger 写 clientX 炸、派发事件无法稳定触达 handler），
    // 与实现同构：经 vm 直调三个处理器
    (w.vm as any).onHeaderPointerDown({
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      currentTarget: {}
    });
    const before = w.find('.sv-panel').attributes('style') ?? '';
    (w.vm as any).onDragMove({ clientX: 160, clientY: 140, pointerId: 1 });
    // vm 直调不走 VTU trigger 的 nextTick：等一拍再读 DOM
    await w.vm.$nextTick();
    const after = w.find('.sv-panel').attributes('style') ?? '';
    expect(after).not.toBe(before);
    (w.vm as any).onDragEnd({ pointerId: 1 });
    w.unmount();
  });

  it('正向：教师「插入画布」取 iframe canvas 并 emit capture', async () => {
    // jsdom：iframe 须挂入文档才有 contentDocument，且 atom: scheme 不给文档 → about:blank
    const w = mount(SharedViewOverlay, {
      props: { kind: 'circuit', isTeacher: true, resolveUrl: async () => 'about:blank' },
      attachTo: document.body
    });
    await vi.waitFor(() => expect(w.find('.sv-frame').exists()).toBe(true));
    const frame = w.find('iframe').element as HTMLIFrameElement;
    const doc = frame.contentDocument;
    expect(doc).toBeTruthy();
    const canvas = doc!.createElement('canvas');
    canvas.toDataURL = () => 'data:image/png;base64,CAP';
    doc!.body.appendChild(canvas);
    await w.find('.sv-capture').trigger('click');
    expect(w.emitted('capture')?.[0]).toEqual(['data:image/png;base64,CAP']);
    w.unmount();
  });

  it('负向：学生端无「插入画布」入口（只读跟随）', async () => {
    const w = mount(SharedViewOverlay, {
      props: { kind: 'circuit', isTeacher: false, resolveUrl: async () => 'about:blank' },
      attachTo: document.body
    });
    await vi.waitFor(() => expect(w.find('.sv-frame').exists()).toBe(true));
    expect(w.find('.sv-capture').exists()).toBe(false);
    w.unmount();
  });

  it('负向：iframe 无 canvas 时不 emit capture', async () => {
    const w = mount(SharedViewOverlay, {
      props: { kind: 'circuit', isTeacher: true, resolveUrl: async () => 'about:blank' },
      attachTo: document.body
    });
    await vi.waitFor(() => expect(w.find('.sv-frame').exists()).toBe(true));
    await w.find('.sv-capture').trigger('click');
    expect(w.emitted('capture')).toBeUndefined();
    w.unmount();
  });
});
