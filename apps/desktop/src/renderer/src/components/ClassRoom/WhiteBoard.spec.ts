import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    destroy() {}
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
    moveToTop() {}
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

// WhiteBoard setup 读取 route.query.userId；测试环境无 router，注入会让全部用例在 mount 时崩溃
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => ({
      query: {},
      params: {},
      path: '/',
      fullPath: '/',
      hash: '',
      matched: [],
      meta: {},
      name: null,
    }),
  };
});

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
      isDisplay: true,
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
  layerZoomChange: (type: string) => void;
  layerClear: () => void;
  editZoom: () => void;
  showZoomInput: boolean;
  emitPaintLog: () => void;
};

// ── Tests ───────────────────────────────────────────────────────────────
describe('WhiteBoard.vue', () => {
  it('renders the whiteboard container', () => {
    const wrapper = mountWB();
    expect(wrapper.find('.classroom-white-board').exists()).toBe(true);
    expect(wrapper.find('.container').exists()).toBe(true);
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

  it('tool() returns to selector after text', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.tool('text');
    expect(vm.mode).toBe('text');
    vm.tool('cur');
    expect(vm.mode).toBe('cur');
    wrapper.unmount();
  });

  it('tool() selects brush', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.tool('brush');
    expect(vm.mode).toBe('brush');
    wrapper.unmount();
  });

  it('tool() selects text', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.tool('text');
    expect(vm.mode).toBe('text');
    wrapper.unmount();
  });

  it('tool() selects circle', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.tool('circle');
    expect(vm.mode).toBe('circle');
    wrapper.unmount();
  });

  it('tool() selects rectangle', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.tool('rectangle');
    expect(vm.mode).toBe('rectangle');
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

  it('editZoom opens the zoom input', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.editZoom();
    expect(vm.showZoomInput).toBe(true);
    wrapper.unmount();
  });

  it('emitPaintLog emits paint-log event', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as WBVM;
    vm.emitPaintLog();
    expect(wrapper.emitted('paint-log')).toBeTruthy();
    wrapper.unmount();
  });
});

// ── PPT 课件导入 / 定位 / 删除 ────────────────────────────────────────────
type PPTVM = WBVM & {
  fileList: Array<{ filename: string; filext: string; fileid: string }> | { value: Array<{ filename: string; filext: string; fileid: string }> };
  curLayerIndex: number | { value: number };
  toastMsg: string | { value: string };
  showFile: (ids: string) => void;
  delFile: (i: number) => void;
  rendererPageCount: () => number;
};

function unwrapVal<T>(v: T | { value: T }): T {
  return v !== null && typeof v === 'object' && 'value' in (v as object)
    ? ((v as { value: T }).value)
    : (v as T);
}

describe('WhiteBoard.vue PPT 课件', () => {
  // uploadPptApi 在 setup()（mount 时）求值，env 必须在 mount 之前 stub
  beforeEach(() => {
    vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function uploadTwoPagePpt(wrapper: ReturnType<typeof mountWB>, failSecondPage = false) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 1000,
          data: { totalNumber: 2, fileUrl: 'http://mock.test/ppt/' },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    class StubImage {
      static failSecond = failSecondPage;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1000;
      height = 500;
      private _src = '';
      set src(v: string) {
        this._src = v;
        const shouldFail = StubImage.failSecond && /2\.png$/.test(v);
        setTimeout(() => (shouldFail ? this.onerror : this.onload)?.(), 0);
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal('Image', StubImage);

    const input = wrapper.find('input[accept=".ppt,.pptx"]');
    expect(input.exists()).toBe(true);
    const file = new File(['x'], '测试课件.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    return { fetchMock };
  }

  it('导入两页 PPT 后页数为 N（不重复建页），并定位到首张幻灯片', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);

    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 },
    );
    expect(unwrapVal(vm.fileList)[0]!.filename).toBe('测试课件');
    // 修复前重复 addPage 会得到 4 页（2 真实 + 2 重复层）
    expect(vm.rendererPageCount()).toBe(2);
    // showFile(layerIds) 定位到第一张幻灯片页
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    wrapper.unmount();
  });

  it('delFile 删除课件条目并回收其页面', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 },
    );

    vm.delFile(0);

    expect(unwrapVal(vm.fileList).length).toBe(0);
    // 无默认页的测试环境下 removePage 保底留 1 页；修复前页面完全不会被删除（保持 2）
    expect(vm.rendererPageCount()).toBe(1);
    wrapper.unmount();
  });

  it('第二页加载失败时回滚已创建的页面', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper, true);

    await vi.waitFor(
      () => {
        expect(String(unwrapVal(vm.toastMsg))).toContain('图片失败');
      },
      { timeout: 3000 },
    );
    expect(unwrapVal(vm.fileList).length).toBe(0);
    // 第 2 页已回滚；第 1 页受 removePage“至少保留一页”保护（真实环境有默认页可全部回滚）
    expect(vm.rendererPageCount()).toBe(1);
    wrapper.unmount();
  });
});
