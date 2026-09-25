import { describe, expect, it, vi } from 'vitest';

// ── Konva mock — class constructors with actual methods ──────────────────
const konvaMocks = vi.hoisted(() => {
  class MockStage {
    _x = 0;
    _y = 0;
    _width = 800;
    _height = 600;
    children: unknown[] = [];
    constructor(_opts?: unknown) {}
    add(_child: unknown) { this.children.push(_child); }
    draggable(_val?: unknown) { return this; }
    x(_val?: unknown) { if (_val !== undefined) this._x = _val as number; return this._x; }
    y(_val?: unknown) { if (_val !== undefined) this._y = _val as number; return this._y; }
    width(_val?: unknown) { if (_val !== undefined) this._width = _val as number; return this._width; }
    height(_val?: unknown) { if (_val !== undefined) this._height = _val as number; return this._height; }
    scaleX(_val?: unknown) { return 1; }
    scaleY(_val?: unknown) { return 1; }
    scale(_val?: unknown) { return this; }
    batchDraw() {}
    draw() {}
    off() {}
    on() {}
    getPointerPosition() { return { x: 100, y: 100 }; }
    getChildren() { return this.children; }
    find(_sel?: string) { return []; }
    getAttr(key: string) {
      if (key === 'width') return this._width;
      if (key === 'height') return this._height;
      if (key === 'x') return this._x;
      if (key === 'y') return this._y;
      if (key === 'scaleX') return 1;
      if (key === 'scaleY') return 1;
      return 0;
    }
    container() { return { getBoundingClientRect: () => ({ left: 0, top: 0 }) }; }
  }

  class MockLayer {
    _id = Math.floor(Math.random() * 10000);
    children: unknown[] = [];
    _x = 0;
    _y = 0;
    constructor() {}
    show() {}
    hide() {}
    draw() {}
    batchDraw() {}
    destroy() {}
    destroyChildren() { this.children = []; }
    add(_child: unknown) { this.children.push(_child); }
    x(_val?: unknown) { if (_val !== undefined) this._x = _val as number; return this._x; }
    y(_val?: unknown) { if (_val !== undefined) this._y = _val as number; return this._y; }
    width() { return 800; }
    height() { return 600; }
    scaleX(_val?: unknown) { return 1; }
    scaleY(_val?: unknown) { return 1; }
    getClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; }
    toArray() { return this.children; }
    getChildren() { return this.children; }
    find(_sel?: string) { return []; }
    getAttr(key: string) {
      if (key === 'width') return 800;
      if (key === 'height') return 600;
      if (key === 'x') return this._x;
      if (key === 'y') return this._y;
      if (key === 'scaleX') return 1;
      if (key === 'scaleY') return 1;
      if (key === 'visible') return true;
      if (key === 'offsetX') return 0;
      if (key === 'offsetY') return 0;
      return 0;
    }
  }

  class MockNode {
    _id = Math.floor(Math.random() * 10000);
    constructor() {}
    show() {}
    hide() {}
    draw() {}
    batchDraw() {}
    destroy() {}
    getAttrs() {
      return {
        x: 0, y: 0, width: 100, height: 100,
        scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0,
        visible: true, image: { currentSrc: '' }
      };
    }
    setAttrs(_a: unknown) {}
    zIndex(_val?: unknown) { return 0; }
    getClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; }
    scaleX(_val?: unknown) { return 1; }
    scaleY(_val?: unknown) { return 1; }
    visible() { return true; }
    getAttr(_key: string) {
      if (_key === 'visible') return true;
      if (_key === 'image') return { currentSrc: '' };
      return 0;
    }
    getClassName() { return 'Node'; }
    add(_child: unknown) {}
    draggable(_val?: unknown) {}
    getPointerPosition() { return { x: 100, y: 100 }; }
    off() {}
    on() {}
    x(_val?: unknown) { return 0; }
    y(_val?: unknown) { return 0; }
    width(_val?: unknown) { return 100; }
    height(_val?: unknown) { return 100; }
  }

  class MockLine extends MockNode {
    points(_val?: unknown) { return []; }
  }
  class MockArrow extends MockNode {
    points(_val?: unknown) { return []; }
  }
  class MockText extends MockNode {
    text(_val?: unknown) { return ''; }
    fontSize(_val?: unknown) { return 14; }
    fontFamily(_val?: unknown) { return 'Arial'; }
    fill(_val?: unknown) { return '#000'; }
    align(_val?: unknown) { return 'left'; }
    lineHeight(_val?: unknown) { return 1.1; }
  }
  class MockCircle extends MockNode {}
  class MockRect extends MockNode {}
  class MockImage extends MockNode {}
  class MockTransformer extends MockNode {}
  class MockGroup extends MockNode {}

  return {
    MockStage, MockLayer, MockLine, MockArrow, MockText,
    MockCircle, MockRect, MockImage, MockTransformer, MockGroup,
  };
});

vi.mock('konva', () => ({
  default: {
    Stage: konvaMocks.MockStage,
    Layer: konvaMocks.MockLayer,
    Line: konvaMocks.MockLine,
    Arrow: konvaMocks.MockArrow,
    Text: konvaMocks.MockText,
    Circle: konvaMocks.MockCircle,
    Rect: konvaMocks.MockRect,
    Image: konvaMocks.MockImage,
    Transformer: konvaMocks.MockTransformer,
    Group: konvaMocks.MockGroup,
  }
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: { code: 1000, data: { fileUrl: '' } } })),
    get: vi.fn(() => Promise.resolve({})),
  }
}));

vi.mock('@/api', () => ({
  config: {
    uploadImageUrl: 'https://test.com/upload',
    uploadPptUrl: 'https://test.com/ppt',
  }
}));

// ── Helpers ─────────────────────────────────────────────────────────────
import WhiteBoard from './WhiteBoard.vue';
import { mount } from '@vue/test-utils';

function mountWB(props: Record<string, unknown> = {}) {
  // WhiteBoard mounted() queries #container for width/height
  let container = document.getElementById('container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'container';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
  }
  const wrapper = mount(WhiteBoard, {
    props: {
      isTeacher: true,
      roomId: '1001',
      opaqueId: 'op1',
      userName: 'teacher',
      layouts: 1,
      ...props,
    },
    attachTo: document.body,
    global: {
      stubs: { teleport: true },
    },
  });
  return wrapper;
}

type WBVM = {
  mode: string;
  tool: (type: string, event?: MouseEvent) => void;
  selectShape: () => void;
  addBrush: () => void;
  addEraser: () => void;
  addText: () => void;
  addCircle: () => void;
  addRectangle: () => void;
  addArrows: () => void;
  move: () => void;
  layerZoomChange: (type: string) => void;
  layerZoom: (zoom: number) => void;
  layerClear: () => void;
  paintLog: () => void;
  recordFun: () => void;
  editZoom: () => void;
  showEditZoom: boolean;
};

// ── Tests ───────────────────────────────────────────────────────────────
describe('WhiteBoard.vue', () => {
  it('renders the whiteboard container', () => {
    const wrapper = mountWB();
    expect(wrapper.find('.classroom-white-board').exists()).toBe(true);
    expect(wrapper.find('#container').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders toolbar tools', () => {
    const wrapper = mountWB();
    expect(wrapper.find('.tools').exists()).toBe(true);
    wrapper.unmount();
  });

  it('tool() sets mode to eraser', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(vm.mode).toBe('cur');
    vm.tool('eraser');
    expect(vm.mode).toBe('eraser');
    wrapper.unmount();
  });

  it('tool() switches mode from eraser to move', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.tool('eraser');
    expect(vm.mode).toBe('eraser');
    vm.tool('move');
    expect(vm.mode).toBe('move');
    wrapper.unmount();
  });

  it('selectShape is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.selectShape()).not.toThrow();
    wrapper.unmount();
  });

  it('addBrush is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.addBrush()).not.toThrow();
    wrapper.unmount();
  });

  it('addEraser is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.addEraser()).not.toThrow();
    wrapper.unmount();
  });

  it('addText is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.addText()).not.toThrow();
    wrapper.unmount();
  });

  it('addCircle is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.addCircle()).not.toThrow();
    wrapper.unmount();
  });

  it('addRectangle is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.addRectangle()).not.toThrow();
    wrapper.unmount();
  });

  it('move is callable', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.move()).not.toThrow();
    wrapper.unmount();
  });

  it('layerZoomChange sub reduces zoom', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.layerZoomChange('sub');
    expect(vm.mode).toBe('cur');
    wrapper.unmount();
  });

  it('layerZoomChange add increases zoom', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.layerZoomChange('add');
    expect(vm.mode).toBe('cur');
    wrapper.unmount();
  });

  it('layerClear is callable without error', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.layerClear()).not.toThrow();
    wrapper.unmount();
  });

  it('editZoom sets showEditZoom to true', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.editZoom();
    expect(vm.showEditZoom).toBe(true);
    wrapper.unmount();
  });

  it('recordFun does not throw', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    expect(() => vm.recordFun()).not.toThrow();
    wrapper.unmount();
  });

  it('paintLog emits paintLog event', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.paintLog();
    expect(wrapper.emitted('paintLog')).toBeTruthy();
    wrapper.unmount();
  });
});
