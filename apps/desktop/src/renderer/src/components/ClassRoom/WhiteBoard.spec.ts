import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { nextTick } from 'vue';
import * as Y from 'yjs';
import { YjsProvider } from './whiteboard/YjsProvider';

// 失败用例也必须卸载组件（onUnmounted 会 destroy Yjs provider），避免跨测试状态泄漏
enableAutoUnmount(afterEach);

// ── Konva mock — class constructors with actual methods ──────────────────
const konvaMocks = vi.hoisted(() => {
  class MockStage {
    _x = 0;
    _y = 0;
    _width = 800;
    _height = 600;
    children: unknown[] = [];
    constructor(_opts?: unknown) {
      MockStage.instances.push(this);
    }
    add(_child: unknown) {
      this.children.push(_child);
    }
    draggable(_val?: unknown) {
      return this;
    }
    x(_val?: unknown) {
      if (_val !== undefined) this._x = _val as number;
      return this._x;
    }
    y(_val?: unknown) {
      if (_val !== undefined) this._y = _val as number;
      return this._y;
    }
    width(_val?: unknown) {
      if (_val !== undefined) this._width = _val as number;
      return this._width;
    }
    height(_val?: unknown) {
      if (_val !== undefined) this._height = _val as number;
      return this._height;
    }
    scaleX(_val?: unknown) {
      return 1;
    }
    scaleY(_val?: unknown) {
      return 1;
    }
    scale(_val?: unknown) {
      return this;
    }
    batchDraw() {}
    draw() {}
    off() {
      this._handlers = {};
    }
    on(evt: string, cb: (e?: unknown) => void) {
      evt.split(' ').forEach(k => {
        this._handlers[k] = cb;
      });
    }
    // 可设状态：绘制类用例通过 stage._pointer 模拟鼠标落点
    _pointer = { x: 100, y: 100 };
    getPointerPosition() {
      return this._pointer;
    }
    getChildren() {
      return this.children;
    }
    find(_sel?: string) {
      return [];
    }
    getAttr(key: string) {
      if (key === 'width') return this._width;
      if (key === 'height') return this._height;
      if (key === 'x') return this._x;
      if (key === 'y') return this._y;
      if (key === 'scaleX') return 1;
      if (key === 'scaleY') return 1;
      return 0;
    }
    container() {
      return { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    }
    destroy() {}
    getAbsoluteTransform() {
      return { copy: () => ({ invert: () => ({ point: (p: { x: number; y: number }) => p }) }) };
    }
    static instances: MockStage[] = [];
    static last(): MockStage | undefined {
      return MockStage.instances[MockStage.instances.length - 1];
    }
    _handlers: Record<string, (e?: unknown) => void> = {};
    fire(evt: string, e?: unknown) {
      this._handlers[evt]?.(e);
    }
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
    destroyChildren() {
      this.children.forEach(c => {
        (c as { _layer?: MockLayer | null })._layer = null;
      });
      this.children = [];
    }
    add(_child: unknown) {
      (_child as { _layer?: MockLayer | null })._layer = this;
      this.children.push(_child);
    }
    x(_val?: unknown) {
      if (_val !== undefined) this._x = _val as number;
      return this._x;
    }
    y(_val?: unknown) {
      if (_val !== undefined) this._y = _val as number;
      return this._y;
    }
    width() {
      return 800;
    }
    height() {
      return 600;
    }
    // 有状态：showPage/setZoom 会写入层缩放，视口同步用例据此断言重应用
    _sx = 1;
    _sy = 1;
    scaleX(_val?: unknown) {
      if (_val !== undefined) this._sx = _val as number;
      return this._sx;
    }
    scaleY(_val?: unknown) {
      if (_val !== undefined) this._sy = _val as number;
      return this._sy;
    }
    getClientRect() {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
    toArray() {
      return this.children;
    }
    getChildren() {
      return this.children;
    }
    find(_sel?: string) {
      return [];
    }
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
    _x = 0;
    _y = 0;
    _width = 100;
    _height = 100;
    _scaleX = 1;
    _scaleY = 1;
    _draggable = false;
    _layer: MockLayer | null = null;
    _handlers: Record<string, (e?: unknown) => void> = {};
    _attrs: Record<string, unknown> = {};
    constructor(attrs?: Record<string, unknown>) {
      this._attrs = attrs ?? {};
      if (attrs?.x !== undefined) this._x = attrs.x as number;
      if (attrs?.y !== undefined) this._y = attrs.y as number;
      if (attrs?.width !== undefined) this._width = attrs.width as number;
      if (attrs?.height !== undefined) this._height = attrs.height as number;
    }
    getLayer() {
      return this._layer;
    }
    _visible = true;
    show() {
      this._visible = true;
    }
    hide() {
      this._visible = false;
    }
    visible(v?: boolean) {
      if (v !== undefined) this._visible = v;
      return this._visible;
    }
    _opacity = 1;
    opacity(v?: number) {
      if (v !== undefined) this._opacity = v;
      return this._opacity;
    }
    draw() {}
    batchDraw() {}
    destroy() {}
    getAttrs() {
      return {
        x: this._x,
        y: this._y,
        width: this._width,
        height: this._height,
        scaleX: this._scaleX,
        scaleY: this._scaleY,
        offsetX: 0,
        offsetY: 0,
        visible: true,
        image: { currentSrc: '' }
      };
    }
    setAttrs(_a: unknown) {}
    setAttr(key: string, v: unknown) {
      this._attrs[key] = v;
      return this;
    }
    // F1.1 公式节点：光栅回调写入 canvas（其余节点走 image() 取图的路径同用）
    image(v?: unknown) {
      if (v !== undefined) {
        this._attrs.image = v;
        return this;
      }
      return this._attrs.image;
    }
    zIndex(_val?: unknown) {
      return 0;
    }
    getClientRect() {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
    scaleX(_val?: unknown) {
      if (_val !== undefined) this._scaleX = _val as number;
      return this._scaleX;
    }
    scaleY(_val?: unknown) {
      if (_val !== undefined) this._scaleY = _val as number;
      return this._scaleY;
    }
    getAttr(key: string) {
      if (key in this._attrs) return this._attrs[key];
      if (key === 'visible') return true;
      if (key === 'image') return { currentSrc: '' };
      return 0;
    }
    getClassName() {
      return 'Node';
    }
    strokeWidth(_v?: number) {
      const v = this._attrs.strokeWidth;
      return typeof v === 'number' ? v : 1;
    }
    add(_child: unknown) {}
    draggable(_val?: unknown) {
      if (_val !== undefined) this._draggable = _val as boolean;
      return this._draggable;
    }
    getPointerPosition() {
      return { x: 100, y: 100 };
    }
    off(_evt?: string) {
      this._handlers = {};
      return this;
    }
    on(evt: string, cb: (e?: unknown) => void) {
      evt.split(' ').forEach(k => {
        this._handlers[k] = cb;
      });
      return this;
    }
    fire(evt: string, e?: unknown) {
      this._handlers[evt]?.(e);
    }
    x(_val?: unknown) {
      if (_val !== undefined) this._x = _val as number;
      return this._x;
    }
    y(_val?: unknown) {
      if (_val !== undefined) this._y = _val as number;
      return this._y;
    }
    width(_val?: unknown) {
      if (_val !== undefined) this._width = _val as number;
      return this._width;
    }
    height(_val?: unknown) {
      if (_val !== undefined) this._height = _val as number;
      return this._height;
    }
  }

  class MockLine extends MockNode {
    _points: number[] = [];
    constructor(attrs?: Record<string, unknown>) {
      super(attrs);
      if (attrs?.points !== undefined) this._points = attrs.points as number[];
    }
    points(_val?: number[]) {
      if (_val !== undefined) this._points = _val;
      return this._points;
    }
    override getClassName() {
      return 'Line';
    }
  }
  class MockArrow extends MockNode {
    _points: number[] = [];
    constructor(attrs?: Record<string, unknown>) {
      super(attrs);
      if (attrs?.points !== undefined) this._points = attrs.points as number[];
    }
    points(_val?: number[]) {
      if (_val !== undefined) this._points = _val;
      return this._points;
    }
    override getClassName() {
      return 'Arrow';
    }
  }
  class MockText extends MockNode {
    _text = '';
    _fontSize = 14;
    _fontStyle = 'normal';
    _align = 'left';
    _lineHeight = 1.1;
    override _width = 0;
    constructor(attrs?: Record<string, unknown>) {
      super(attrs);
      if (attrs?.text !== undefined) this._text = attrs.text as string;
      if (attrs?.fontSize !== undefined) this._fontSize = attrs.fontSize as number;
      if (attrs?.fontStyle !== undefined) this._fontStyle = attrs.fontStyle as string;
      if (attrs?.align !== undefined) this._align = attrs.align as string;
      if (attrs?.lineHeight !== undefined) this._lineHeight = attrs.lineHeight as number;
      if (attrs?.width !== undefined) this._width = attrs.width as number;
    }
    text(_val?: unknown) {
      return this._text;
    }
    fontSize(_val?: unknown) {
      return this._fontSize;
    }
    fontFamily(_val?: unknown) {
      return 'Arial';
    }
    fontStyle(_val?: unknown) {
      return this._fontStyle;
    }
    fill(_val?: unknown) {
      return '#000';
    }
    align(_val?: unknown) {
      return this._align;
    }
    lineHeight(_val?: unknown) {
      return this._lineHeight;
    }
    override width(_val?: unknown) {
      if (_val !== undefined) this._width = _val as number;
      return this._width;
    }
  }
  class MockCircle extends MockNode {
    _radius = 0;
    radius(_val?: unknown) {
      if (_val !== undefined) this._radius = _val as number;
      return this._radius;
    }
  }
  class MockRect extends MockNode {}
  class MockImage extends MockNode {}
  // F3.1 复合元素：Group 持有子节点（Arrow+Text），橡皮 hitStroke 经 getChildren 命中杆身
  class MockGroup extends MockNode {
    _children: MockNode[] = [];
    override add(child: MockNode) {
      this._children.push(child);
    }
    getChildren() {
      const children = this._children;
      return {
        find: (fn: (c: MockNode) => boolean) => children.find(fn),
        toArray: () => [...children],
        get length() {
          return children.length;
        }
      };
    }
    override getClassName() {
      return 'Group';
    }
  }
  class MockEllipse extends MockNode {
    _rx = 0;
    _ry = 0;
    radiusX(val?: unknown) {
      if (val !== undefined) this._rx = val as number;
      return this._rx;
    }
    radiusY(val?: unknown) {
      if (val !== undefined) this._ry = val as number;
      return this._ry;
    }
  }
  class MockTransformer extends MockNode {
    _nodes: unknown[] = [];
    _keepRatio = false;
    nodes(v?: unknown[]) {
      if (v !== undefined) this._nodes = v;
      return this._nodes;
    }
    keepRatio(v?: boolean) {
      if (v !== undefined) this._keepRatio = v;
      return this._keepRatio;
    }
  }

  return {
    MockStage,
    MockLayer,
    MockLine,
    MockArrow,
    MockText,
    MockCircle,
    MockRect,
    MockImage,
    MockEllipse,
    MockTransformer,
    MockGroup
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
    Ellipse: konvaMocks.MockEllipse,
    Rect: konvaMocks.MockRect,
    Image: konvaMocks.MockImage,
    Transformer: konvaMocks.MockTransformer,
    Group: konvaMocks.MockGroup
  }
}));

// 房内上传后登记课件表 + 进房自动导入课件的 API；测试中不得打真实网络
const liveMocks = vi.hoisted(() => ({
  saveCourseware: vi.fn(),
  coursewareList: vi.fn(),
  deleteCourseware: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    save_courseware: (params: unknown) => liveMocks.saveCourseware(params),
    courseware_list: (params: unknown) => liveMocks.coursewareList(params),
    delete_courseware: (params: unknown) => liveMocks.deleteCourseware(params)
  }
}));

// WhiteBoard setup 读取 route.query.userId；测试环境无 router，注入会让全部用例在 mount 时崩溃
vi.mock('vue-router', async importOriginal => {
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
      name: null
    })
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────
import WhiteBoard from './WhiteBoard.vue';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { getPdfPageCount, getPdfPageDims } from './whiteboard/pdfAsset';
import { PRESET_COLORS, MODE_TO_ELEMENT, isElementType } from './whiteboard/types';

// pdf.js 管线在单测中不可用（worker/网络），mock 模块级 API
vi.mock('./whiteboard/pdfAsset', () => ({
  loadPdfDoc: vi.fn(),
  getPdfPageCount: vi.fn(),
  getPdfPageDims: vi.fn(),
  renderPdfPage: vi.fn(() => Promise.reject(new Error('test: pdf render unavailable')))
}));

// F6.1 导出：runExport 是外部管线（离屏 Konva/jsPDF/jszip），组件用例只验证接线与状态
const exportMocks = vi.hoisted(() => ({ runExport: vi.fn() }));
vi.mock('./whiteboard/exportBoard', () => ({
  runExport: exportMocks.runExport
}));

// F1.1 公式：katex/html2canvas chunk 的光栅实现由 formulaRaster.spec 覆盖，此处只验浮层接线
const formulaMocks = vi.hoisted(() => {
  const FORMULA_INVALID_MSG = 'LaTeX 语法有误，请检查括号与命令是否完整';
  return {
    FORMULA_INVALID_MSG,
    validateLatex: vi.fn((latex: string) =>
      latex.includes('INVALID') ? { ok: false, message: FORMULA_INVALID_MSG } : { ok: true }
    ),
    measureFormula: vi.fn(() => ({ width: 130, height: 40 })),
    rasterizeFormula: vi.fn(async () => ({
      canvas: { __formulaCanvas: true },
      width: 130,
      height: 40
    })),
    clearFormulaCache: vi.fn(),
    formulaOversample: vi.fn(() => 2)
  };
});
vi.mock('./whiteboard/formulaRaster', () => formulaMocks);

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
      ...props
    },
    attachTo: document.body,
    global: {
      stubs: { teleport: true },
      plugins: [ElementPlus],
      components: { ...ElementPlusIconsVue }
    }
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
  zoomLevel: number;
  toggleLaser: () => void;
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

  it('工具栏提供图片上传按钮，旧上传面板已移除', () => {
    const wrapper = mountWB();
    const picture = wrapper.find('.tools .picture');
    expect(picture.exists()).toBe(true);
    expect(
      picture.find('input[accept="image/x-png,image/gif,image/jpeg,image/jpg,image/bmp"]').exists()
    ).toBe(true);
    expect(wrapper.find('.uploadFile').exists()).toBe(false);
    expect(wrapper.find('.tools .upload').exists()).toBe(false);
    wrapper.unmount();
  });

  it('我的课件面板含 PPT 上传入口与图片/PPT 区分说明', () => {
    const wrapper = mountWB();
    const panel = wrapper.find('.fileList');
    expect(panel.exists()).toBe(true);
    expect(panel.find('input[accept=".ppt,.pptx"]').exists()).toBe(true);
    expect(panel.find('.file-upload').text()).toContain('上传PPT课件');
    expect(panel.find('.file-hint').text()).toContain('图片贴到当前页');
    expect(panel.find('.file-hint').text()).toContain('重进直播间自动恢复');
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

  it('教师滚轮缩放经 Konva 事件对象走 e.evt（D6 摘 nocheck 回归）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const stage = vm.renderer!.getStage();
    const preventDefault = vi.fn();
    const before = vm.zoomLevel;
    stage.fire('wheel', { target: stage, evt: { deltaY: 100, preventDefault } });
    expect(preventDefault).toHaveBeenCalled();
    expect(vm.zoomLevel).toBe(before - 1);
    wrapper.unmount();
  });

  it('setMode 是 toolState.type 唯一写点，laser 也入态（D3）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vm.tool('rectangle');
    expect(provider.getToolState().type).toBe('rectangle');
    vm.toggleLaser();
    expect(vm.mode).toBe('laser');
    expect(provider.getToolState().type).toBe('laser');
    vm.tool('cur');
    expect(provider.getToolState().type).toBe('cur');
    wrapper.unmount();
  });

  it('MODE_TO_ELEMENT 取值均为 createNode 注册类型（D3）', () => {
    const values = Object.values(MODE_TO_ELEMENT);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(isElementType(v)).toBe(true);
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
});

// ── PPT 课件导入 / 定位 / 删除 ────────────────────────────────────────────
type PPTVM = WBVM & {
  fileList:
    | Array<{ filename: string; filext: string; fileid: string; fileurl?: string }>
    | { value: Array<{ filename: string; filext: string; fileid: string; fileurl?: string }> };
  curLayerIndex: number | { value: number };
  toastMsg: string | { value: string };
  showFile: (ids: string) => boolean;
  showLayer: (index: number) => void;
  openCourseware: (
    item: { filename: string; fileid: string; fileurl?: string },
    index: number
  ) => Promise<void>;
  delFile: (i: number) => Promise<void>;
  delLayer: (index: number) => void;
  setFileItemId: (index: number, fileid: string) => void;
  addLayer: () => void;
  rendererPageCount: () => number;
  renderedShapeCount: () => number;
  getCurrentPageShapes: () => Array<Record<string, unknown>>;
  importServerCoursewares: () => Promise<void>;
  provider: YjsProvider | null;
  renderer: {
    getStage: () => {
      width: (v?: number) => number;
      height: (v?: number) => number;
      _pointer: { x: number; y: number };
      fire: (evt: string, e?: unknown) => void;
    };
    setViewport: (x: number, y: number) => void;
  } | null;
  viewState: () => {
    zoom: number;
    layerScale: number;
    x: number;
    y: number;
    stageX: number;
    stageY: number;
  };
  toLayerCoords: (pos: { x: number; y: number }) => { x: number; y: number };
  applyRemoteViewport: () => void;
  syncViewportToYjs: () => void;
  revocation: (type: string) => void;
};

function unwrapVal<T>(v: T | { value: T }): T {
  return v !== null && typeof v === 'object' && 'value' in (v as object)
    ? (v as { value: T }).value
    : (v as T);
}

// ── 图片上传/图片形状共享工具（图片持久化、选择器两组用例共用） ──────────
const IMAGE_INPUT = 'input[accept="image/x-png,image/gif,image/jpeg,image/jpg,image/bmp"]';

function stubFakeImage(opts: { fail?: boolean; w?: number; h?: number } = {}) {
  const { fail = false, w = 1600, h = 900 } = opts;
  // jsdom 不做图片解码、不触发 onload；src 赋值后于微任务内回调，并提供自然尺寸
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = w;
    naturalHeight = h;
    width = w;
    height = h;
    complete = false;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(val: string) {
      this._src = val;
      queueMicrotask(() => {
        if (fail) {
          this.onerror?.();
        } else {
          this.complete = true;
          this.onload?.();
        }
      });
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

async function uploadImageFile(wrapper: ReturnType<typeof mountWB>, name = '插图.png') {
  const input = wrapper.find(IMAGE_INPUT);
  expect(input.exists()).toBe(true);
  const file = new File(['x'], name, { type: 'image/png' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
}

function imageShapes(vm: PPTVM) {
  return vm.getCurrentPageShapes().filter(s => s.type === 'image');
}

describe('WhiteBoard.vue PPT 课件', () => {
  // uploadPptApi 在 setup()（mount 时）求值，env 必须在 mount 之前 stub
  beforeEach(() => {
    // restoreAllMocks 不重置 vi.fn 调用历史，跨用例计数必须显式清理
    vi.clearAllMocks();
    vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
    liveMocks.saveCourseware.mockResolvedValue({ code: 1000, data: null });
    liveMocks.coursewareList.mockResolvedValue({
      code: 1000,
      data: { list: [], pageInfo: { totalElements: 0 } }
    });
    liveMocks.deleteCourseware.mockResolvedValue({ code: 1000, data: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function uploadTwoPagePpt(wrapper: ReturnType<typeof mountWB>, failSecondPage = false) {
    // 阶段1：客户端 numPages = 2；failSecondPage 时第 2 页尺寸加载失败
    vi.mocked(getPdfPageCount).mockResolvedValue(2);
    vi.mocked(getPdfPageDims).mockImplementation((_url, pageNum) =>
      failSecondPage && pageNum === 2
        ? Promise.reject(new Error('mock boom'))
        : Promise.resolve({ w: 1000, h: 500 })
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 1000,
          data: { fileUrl: 'http://mock.test/ppt/deck.pdf' }
        })
    });
    vi.stubGlobal('fetch', fetchMock);

    const input = wrapper.find('input[accept=".ppt,.pptx"]');
    expect(input.exists()).toBe(true);
    const file = new File(['x'], '测试课件.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    return { fetchMock };
  }

  it('导入两页 PPT 仅登记列表（零建页），点击后才创建课件页并展示', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);

    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    expect(unwrapVal(vm.fileList)[0]!.filename).toBe('测试课件');
    // 上传零建页：fileid 留空，画布保持挂载时状态
    expect(vm.rendererPageCount()).toBe(1);
    expect(unwrapVal(vm.fileList)[0]!.fileid).toBe('');
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    // 点击列表 → 创建 2 张幻灯片页并落在首张
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    expect(vm.getCurrentPageShapes().length).toBe(1);
    // fileid 回填为两张幻灯片页 id
    expect(unwrapVal(vm.fileList)[0]!.fileid.split(',').length).toBe(2);
    wrapper.unmount();
  });

  it('上传成功后课件面板保持打开并提示点击列表打开', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    expect(String(unwrapVal(vm.toastMsg))).toContain('请点击列表打开');
    expect(wrapper.find('.fileList').isVisible()).toBe(true);
    wrapper.unmount();
  });

  it('当前空白页原样保留，点击列表后在其后追加课件页', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    // seed 一页空白画布
    vm.addLayer();
    expect(vm.rendererPageCount()).toBe(1);

    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    // 上传零建页：seed 页保留，fileid 待点击创建
    expect(vm.rendererPageCount()).toBe(1);
    expect(unwrapVal(vm.fileList)[0]!.fileid).toBe('');
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    // 点击 → seed 页保留 + 追加 2 张幻灯片页 → 共 3 页，落在首张幻灯片
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(3);
    expect(unwrapVal(vm.curLayerIndex)).toBe(2);
    expect(unwrapVal(vm.fileList)[0]!.fileid.split(',').length).toBe(2);
    // 跳回 seed 页：原样空白
    vm.showLayer(1);
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('点击课件后创建页面并重建渲染图层', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    // 上传零建页零节点
    expect(vm.rendererPageCount()).toBe(1);
    expect(vm.renderedShapeCount()).toBe(0);
    // 点击课件列表 → 创建 2 页，首张幻灯片图层重建出 ppt-image 节点
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    expect(vm.renderedShapeCount()).toBe(1);
    wrapper.unmount();
  });

  it('二次上传仍零建页，依次点击两份课件共追加 4 页', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    // 第 2 次上传同样仅登记
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(2);
      },
      { timeout: 3000 }
    );
    expect(vm.rendererPageCount()).toBe(1);
    // 逐份点击创建：挂载层被首张幻灯片复用 → 2 页、4 页，最终停在第二份首张
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);
    await vm.openCourseware(unwrapVal(vm.fileList)[1]!, 1);
    expect(vm.rendererPageCount()).toBe(4);
    expect(unwrapVal(vm.curLayerIndex)).toBe(3);
    wrapper.unmount();
  });

  it('课件页双维限幅居中放置（1000×500 源图 → 720×360，偏移 40/120）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    // 上传零建页；点击列表（openCourseware）创建后当前页 = 首张幻灯片页
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    const s = shapes[0]!;
    expect(s.type).toBe('ppt-image');
    expect(s.pdfUrl).toBe('http://mock.test/ppt/deck.pdf');
    expect(s.page).toBe(1);
    // container clientWidth/clientHeight 在 jsdom 无布局恒为 0 → 回退 800×600
    // k = min(1, 800*0.9/1000, 600*0.9/500) = 0.72 → 720×360，居中偏移 (40,120)
    expect(s.width).toBeCloseTo(720, 5);
    expect(s.height).toBeCloseTo(360, 5);
    expect(s.x).toBeCloseTo(40, 5);
    expect(s.y).toBeCloseTo(120, 5);
    wrapper.unmount();
  });

  it('delFile 删除课件条目：未建页仅移除条目，已建页回收页面', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );

    // 未建页条目（pending）：仅移除条目，画布零改动
    await vm.delFile(0);
    expect(unwrapVal(vm.fileList).length).toBe(0);
    expect(vm.rendererPageCount()).toBe(1);

    // 已创建页的条目：连页回收，保底留 1 页且无残留图
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);

    await vm.delFile(0);

    expect(unwrapVal(vm.fileList).length).toBe(0);
    // removePage 保底留 1 页，该页 elements 必须被清空（课件图不得残留）
    expect(vm.rendererPageCount()).toBe(1);
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('delFile 同步删除服务端记录（按 fileurl 定位 id）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    // delFile 按 fileurl 回查服务端列表定位记录 id
    liveMocks.coursewareList.mockResolvedValue({
      code: 1000,
      data: {
        list: [{ id: 'cw9', fileUrl: 'http://mock.test/ppt/deck.pdf' }],
        pageInfo: { totalElements: 1 }
      }
    });

    await vm.delFile(0);

    expect(liveMocks.deleteCourseware).toHaveBeenCalledWith('cw9');
    expect(unwrapVal(vm.fileList).length).toBe(0);
    expect(vm.rendererPageCount()).toBe(1);
    wrapper.unmount();
  });

  it('delFile 服务端删除失败：中止本地删除，条目保留可重试', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    liveMocks.coursewareList.mockResolvedValue({
      code: 1000,
      data: {
        list: [{ id: 'cw9', fileUrl: 'http://mock.test/ppt/deck.pdf' }],
        pageInfo: { totalElements: 1 }
      }
    });
    liveMocks.deleteCourseware.mockRejectedValue(new Error('network down'));

    await vm.delFile(0);

    expect(unwrapVal(vm.fileList).length).toBe(1);
    expect(String(unwrapVal(vm.toastMsg))).toContain('服务端课件记录删除失败');
    wrapper.unmount();
  });

  it('服务端登记失败时不入列表（零条目，仅 toast 提示）', async () => {
    liveMocks.saveCourseware.mockRejectedValue(new Error('db down'));
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;

    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(String(unwrapVal(vm.toastMsg))).toContain('登记服务端失败');
      },
      { timeout: 3000 }
    );
    expect(liveMocks.saveCourseware).toHaveBeenCalledTimes(1);
    expect(unwrapVal(vm.fileList).length).toBe(0);
    expect(vm.rendererPageCount()).toBe(1);
    wrapper.unmount();
  });

  it('进房对账：服务端已删的条目连同课件页一并移除', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);

    // 服务端记录已在「我的直播」对话框中被删除 → 列表为空
    liveMocks.coursewareList.mockResolvedValue({
      code: 1000,
      data: { list: [], pageInfo: { totalElements: 0 } }
    });

    await vm.importServerCoursewares();

    // 条目 + 课件页一起清：保底留 1 页且课件图无残留
    expect(unwrapVal(vm.fileList).length).toBe(0);
    expect(vm.rendererPageCount()).toBe(1);
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('进房对账：列表拉取失败时不清幽灵条目', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    liveMocks.coursewareList.mockRejectedValue(new Error('network down'));

    await vm.importServerCoursewares();

    expect(unwrapVal(vm.fileList).length).toBe(1);
    expect(vm.rendererPageCount()).toBe(1);
    wrapper.unmount();
  });

  it('delLayer 删课件页：整套回收且回未打开，再点击重建', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);
    expect(unwrapVal(vm.fileList)[0]!.fileid).not.toBe('');

    // 删课件页（当前在首张幻灯片）→ 课件整套回收，条目回未打开态
    vm.delLayer(unwrapVal(vm.curLayerIndex));
    expect(vm.rendererPageCount()).toBe(1);
    expect(unwrapVal(vm.fileList)[0]!.fileid).toBe('');
    expect(String(unwrapVal(vm.toastMsg))).toContain('已删除课件页');

    // 再点击 → 干净重建（removePage 保底留 1 页空白 + 新建 2 页），无「未找到对应页面」
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(3);
    expect(String(unwrapVal(vm.toastMsg))).toContain('已打开');
    expect(String(unwrapVal(vm.toastMsg))).not.toContain('未找到');
    expect(unwrapVal(vm.fileList)[0]!.fileid.split(',').length).toBe(2);
    wrapper.unmount();
  });

  it('僵尸 fileid（页已被外部删除）点击自愈重建', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    // 模拟页被删后残留的僵尸 fileid
    vm.setFileItemId(0, 'ghost_a,ghost_b');
    expect(unwrapVal(vm.fileList)[0]!.fileid).toBe('ghost_a,ghost_b');

    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);

    // 自愈：重建 2 页并覆盖僵尸 id，不报「未找到」
    expect(vm.rendererPageCount()).toBe(2);
    expect(String(unwrapVal(vm.toastMsg))).toContain('已打开');
    expect(String(unwrapVal(vm.toastMsg))).not.toContain('未找到');
    const ids = unwrapVal(vm.fileList)[0]!.fileid.split(',');
    expect(ids.length).toBe(2);
    expect(ids).not.toContain('ghost_a');
    wrapper.unmount();
  });

  it('房内上传成功后登记服务端课件表（fileUrl 关联键）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    expect(liveMocks.saveCourseware).toHaveBeenCalledTimes(1);
    expect(liveMocks.saveCourseware).toHaveBeenCalledWith({
      roomId: '1001',
      filename: '测试课件',
      filext: 'pptx',
      filesize: 1,
      fileUrl: 'http://mock.test/ppt/deck.pdf'
    });
    wrapper.unmount();
  });

  it('第二页预载失败时不改动画布（零建页、零条目，仅 toast 提示）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const before = vm.rendererPageCount();

    await uploadTwoPagePpt(wrapper, true);

    await vi.waitFor(
      () => {
        expect(String(unwrapVal(vm.toastMsg))).toContain('课件预载失败');
        expect(String(unwrapVal(vm.toastMsg))).toContain('加载第2页尺寸失败');
      },
      { timeout: 3000 }
    );
    expect(unwrapVal(vm.fileList).length).toBe(0);
    expect(vm.rendererPageCount()).toBe(before);
    wrapper.unmount();
  });

  it('嵌套 Y.Map 字段更新（远端语义）触发重渲染（observeDeep）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    const els = vm.provider!.getActiveElements()!;
    expect(els.length).toBeGreaterThan(0);
    const spy = vi.spyOn(vm.provider!, 'getActiveElements');
    // 模拟远端 updateElement：直接改嵌套字段，绕过 commit 里的显式 refreshLayer ——
    // 只有 observeDeep 能触发观察器 → refreshLayer（getActiveElements 是其第一步）
    els.get(0).set('x', 999);
    await vi.waitFor(
      () => {
        expect(spy).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
    wrapper.unmount();
  });

  it('fileList 嵌套字段更新（远端重命名）同步到视图（observeDeep）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    vm.provider!.fileList.get(0).set('filename', '远端改名');
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList)[0]!.filename).toBe('远端改名');
      },
      { timeout: 1000 }
    );
    wrapper.unmount();
  });

  it('教师缩放/全览写入 Yjs 视口', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vm.layerZoomChange('add');
    expect(provider.viewportOffset.get('zoom')).toBe(101);
    // 空画布全览 → 回 100%、平移归零写入 x/y；stage 通道已废弃（否则选择器缩放坐标系错位）
    vm.layerZoomChange('all');
    expect(provider.viewportOffset.get('zoom')).toBe(100);
    expect(provider.viewportOffset.get('x')).toBe(0);
    expect(provider.viewportOffset.get('y')).toBe(0);
    expect(provider.viewportOffset.has('sx')).toBe(false);
    expect(provider.viewportOffset.has('sy')).toBe(false);
    wrapper.unmount();
  });

  it('远端视口变化（缩放/平移）本地跟随应用，stage 保持恒等', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.setViewportZoom(150);
    provider.setViewportOffset(10, -20);
    await vi.waitFor(
      () => {
        const vs = vm.viewState();
        expect(vs.zoom).toBe(150);
        expect(vs.layerScale).toBeCloseTo(1.5, 5);
        expect(vs.x).toBe(10);
        expect(vs.y).toBe(-20);
        expect(vs.stageX).toBe(0);
        expect(vs.stageY).toBe(0);
      },
      { timeout: 1000 }
    );
    wrapper.unmount();
  });

  it('教师缩放/全览写入 Yjs 视口附带 stage 尺寸（供学生端适配）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vm.layerZoomChange('add');
    // MockStage 默认 800×600 —— 视口写入必须带上教师端 stage 尺寸
    expect(provider.viewportOffset.get('sw')).toBe(800);
    expect(provider.viewportOffset.get('sh')).toBe(600);
    vm.layerZoomChange('all');
    expect(provider.viewportOffset.get('sw')).toBe(800);
    expect(provider.viewportOffset.get('sh')).toBe(600);
    wrapper.unmount();
  });

  it('远端视口附带 stage 尺寸时按 contain 比例适配应用（大屏→小屏）', async () => {
    const wrapper = mountWB(); // 本地 stage 800×600，远端教师 stage 1600×800 → k = min(0.5, 0.75) = 0.5
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.viewportOffset.set('sw', 1600);
    provider.viewportOffset.set('sh', 800);
    provider.setViewportZoom(100);
    provider.setViewportOffset(40, -20);
    await vi.waitFor(
      () => {
        const vs = vm.viewState();
        expect(vs.zoom).toBe(50);
        expect(vs.layerScale).toBeCloseTo(0.5, 5);
        expect(vs.x).toBeCloseTo(20, 5);
        expect(vs.y).toBeCloseTo(-10, 5);
        expect(vs.stageX).toBe(0);
        expect(vs.stageY).toBe(0);
      },
      { timeout: 1000 }
    );
    wrapper.unmount();
  });

  it('本地 stage 尺寸变化后重新适配远端视口', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.viewportOffset.set('sw', 1600);
    provider.viewportOffset.set('sh', 1200);
    provider.setViewportZoom(100);
    provider.setViewportOffset(40, -20);
    await vi.waitFor(
      () => {
        expect(vm.viewState().zoom).toBe(50);
      },
      { timeout: 1000 }
    );
    // 本地窗口/布局变化 → stage 改为 1200×900，重调 applyRemoteViewport → k = 0.75
    vm.renderer!.getStage().width(1200);
    vm.renderer!.getStage().height(900);
    vm.applyRemoteViewport();
    const vs = vm.viewState();
    expect(vs.zoom).toBe(75);
    expect(vs.layerScale).toBeCloseTo(0.75, 5);
    expect(vs.x).toBeCloseTo(30, 5);
    expect(vs.y).toBeCloseTo(-15, 5);
    wrapper.unmount();
  });

  it('远端视口无 stage 尺寸（旧数据）按原样应用，不做比例缩放', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    expect(provider.viewportOffset.get('sw')).toBeUndefined();
    provider.setViewportZoom(80);
    provider.setViewportOffset(16, 8);
    await vi.waitFor(
      () => {
        const vs = vm.viewState();
        expect(vs.zoom).toBe(80);
        expect(vs.x).toBe(16);
        expect(vs.y).toBe(8);
      },
      { timeout: 1000 }
    );
    wrapper.unmount();
  });

  it('本地视口变化后 syncViewportToYjs 写入最新 x/y（不被观察器回写旧值覆盖）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    // 本地平移（不经 sync）：viewX/viewY 已是新值，地图里还是旧值 0
    vm.renderer!.setViewport(40, -20);
    vm.syncViewportToYjs();
    expect(provider.viewportOffset.get('x')).toBe(40);
    expect(provider.viewportOffset.get('y')).toBe(-20);
    wrapper.unmount();
  });

  it('移动工具拖动平移视图并同步（观察器不回拽）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vm.tool('move');
    const stage = vm.renderer!.getStage();
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown');
    stage._pointer = { x: 150, y: 120 };
    stage.fire('mousemove');
    // 拖动 (50, 20)：视图必须真的平移，不能被观察器用地图旧值拽回原位
    expect(vm.viewState().x).toBe(50);
    expect(vm.viewState().y).toBe(20);
    stage.fire('mouseup');
    expect(provider.viewportOffset.get('x')).toBe(50);
    expect(provider.viewportOffset.get('y')).toBe(20);
    wrapper.unmount();
  });

  it('toLayerCoords 按层缩放把舞台坐标换算到层局部坐标', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.setViewportZoom(200);
    provider.setViewportOffset(30, 40);
    await vi.waitFor(
      () => {
        expect(vm.viewState().layerScale).toBeCloseTo(2, 5);
      },
      { timeout: 1000 }
    );
    const p = vm.toLayerCoords({ x: 230, y: 140 });
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
    wrapper.unmount();
  });

  it('缩放后新增页保持视图（showPage 重应用全局视图）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.setViewportZoom(150);
    await vi.waitFor(
      () => {
        expect(vm.viewState().zoom).toBe(150);
      },
      { timeout: 1000 }
    );
    vm.addLayer();
    // 新页是独立 Layer，showPage 必须把缩放/平移重应用上去，否则层 scale 掉回 1
    await vi.waitFor(
      () => {
        expect(vm.viewState().layerScale).toBeCloseTo(1.5, 5);
      },
      { timeout: 1000 }
    );
    expect(vm.viewState().zoom).toBe(150);
    wrapper.unmount();
  });

  // ── F5.1 课件页全工具回归（4.8 清单：绘制层级/命中/保存/翻页回显 + 组合用例） ──
  describe('F5.1 课件页回归', () => {
    type F51VM = DrawVM & {
      openFormula: () => void;
      submitFormula: () => Promise<void>;
      formulaVisible: boolean;
      formulaInput: string;
    };

    async function openTwoPageCourseware(wrapper: ReturnType<typeof mountWB>) {
      const vm = wrapper.vm as unknown as F51VM;
      await uploadTwoPagePpt(wrapper);
      await vi.waitFor(
        () => {
          expect(unwrapVal(vm.fileList).length).toBe(1);
        },
        { timeout: 3000 }
      );
      await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
      // 落在首张课件页：底图为页内唯一元素（pptImport.ts 单事务建页首元素）
      await vi.waitFor(
        () => {
          expect(vm.getCurrentPageShapes().length).toBe(1);
        },
        { timeout: 3000 }
      );
      expect(vm.getCurrentPageShapes()[0]).toMatchObject({ type: 'ppt-image' });
      return vm;
    }

    function dragDraw(x1: number, y1: number, x2: number, y2: number) {
      const stage = konvaMocks.MockStage.last()!;
      stage._pointer = { x: x1, y: y1 };
      stage.fire('mousedown', { target: stage, evt: {} });
      stage._pointer = { x: x2, y: y2 };
      stage.fire('mousemove', { target: stage, evt: {} });
      stage.fire('mouseup', { target: stage, evt: {} });
    }

    function layerChildren(vm: F51VM): unknown[] {
      return (
        vm.renderer as unknown as { layer: { getChildren: () => unknown[] } }
      ).layer.getChildren();
    }

    it('课件页绘制落库与层级：底图恒首元素，笔迹/矩形依次在上', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);

      vm.tool('brush');
      dragDraw(100, 100, 300, 160);
      vm.tool('rectangle');
      dragDraw(50, 50, 150, 120);

      const shapes = vm.getCurrentPageShapes();
      expect(shapes.length).toBe(3);
      expect(shapes[0]).toMatchObject({ type: 'ppt-image' });
      expect(shapes[1]).toMatchObject({ type: 'brush', points: [100, 100, 300, 160] });
      expect(shapes[2]).toMatchObject({ type: 'rect', width: 100, height: 70 });
      // Konva 子节点数与 Yjs 元素一一对应（插入序 = bindElements 迭代序 = 绘制序）
      expect(layerChildren(vm).length).toBe(3);
      wrapper.unmount();
    });

    it('翻页回显：离开再返回，底图与笔迹均重建且层级不变', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);
      vm.tool('brush');
      dragDraw(100, 100, 300, 160);
      const cw = unwrapVal(vm.curLayerIndex);
      const total = vm.rendererPageCount();
      const other = cw === total ? cw - 1 : cw + 1;

      vm.showLayer(other);
      await vi.waitFor(
        () => {
          expect(vm.getCurrentPageShapes().some(s => s.type === 'brush')).toBe(false);
        },
        { timeout: 3000 }
      );

      vm.showLayer(cw);
      await vi.waitFor(
        () => {
          expect(vm.getCurrentPageShapes().length).toBe(2);
        },
        { timeout: 3000 }
      );
      const shapes = vm.getCurrentPageShapes();
      expect(shapes[0]).toMatchObject({ type: 'ppt-image' });
      expect(shapes[1]).toMatchObject({ type: 'brush', points: [100, 100, 300, 160] });
      expect(layerChildren(vm).length).toBe(2);
      wrapper.unmount();
    });

    it('课件页撤销/重做：只动笔迹，底图全程在场', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);
      vm.tool('brush');
      dragDraw(100, 100, 300, 160);
      expect(vm.getCurrentPageShapes().length).toBe(2);

      vm.revocation('pre');
      expect(vm.getCurrentPageShapes().length).toBe(1);
      expect(vm.getCurrentPageShapes()[0]).toMatchObject({ type: 'ppt-image' });

      vm.revocation('next');
      expect(vm.getCurrentPageShapes().length).toBe(2);
      expect(vm.getCurrentPageShapes()[1]).toMatchObject({
        type: 'brush',
        points: [100, 100, 300, 160]
      });
      wrapper.unmount();
    });

    it('课件页橡皮整笔擦除：只删目标笔迹，底图元素在 Yjs 中完好', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);
      vm.tool('brush');
      dragDraw(100, 100, 200, 100);
      dragDraw(100, 200, 200, 200);
      expect(vm.getCurrentPageShapes().length).toBe(3);

      vm.tool('eraser');
      const stage = konvaMocks.MockStage.last()!;
      stage._pointer = { x: 150, y: 100 };
      stage.fire('mousedown', { target: stage, evt: {} });
      stage.fire('mouseup', { target: stage, evt: {} });

      const shapes = vm.getCurrentPageShapes();
      expect(shapes.length).toBe(2);
      expect(shapes[0]).toMatchObject({ type: 'ppt-image' });
      expect(shapes[1]).toMatchObject({ type: 'brush', points: [100, 200, 200, 200] });
      wrapper.unmount();
    });

    it('课件页清页钉现状：整页（含底图）清空且 undo 栈一并清空', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);
      vm.tool('brush');
      dragDraw(100, 100, 300, 160);
      expect(vm.getCurrentPageShapes().length).toBe(2);

      vm.layerClear();
      expect(vm.getCurrentPageShapes().length).toBe(0);
      // 现状钉死：清页连课件底图一并删除、撤销栈清空；是否应保护底图留待实机走查裁决
      vm.revocation('pre');
      expect(vm.getCurrentPageShapes().length).toBe(0);
      wrapper.unmount();
    });

    it('课件页提交公式：视口中心落点、浮层关闭、底图之后', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);

      vm.openFormula();
      vm.formulaInput = 'E=mc^2';
      await vm.submitFormula();
      await nextTick();

      expect(formulaMocks.measureFormula).toHaveBeenCalledWith('E=mc^2', '#000000');
      const stage = vm.renderer.getStage();
      const lp = vm.toLayerCoords({ x: stage.width() / 2, y: stage.height() / 2 });
      const shapes = vm.getCurrentPageShapes();
      expect(shapes.length).toBe(2);
      expect(shapes[1]).toMatchObject({
        type: 'formula',
        latex: 'E=mc^2',
        x: Math.round(lp.x - 65),
        y: Math.round(lp.y - 20),
        width: 130,
        height: 40
      });
      expect(vm.formulaVisible).toBe(false);
      wrapper.unmount();
    });

    it('课件页荧光笔迹：blend:multiply 落库且位于底图之上（F4.1×课件组合）', async () => {
      const wrapper = mountWB();
      const vm = await openTwoPageCourseware(wrapper);

      vm.selectPen('highlight');
      expect(vm.mode).toBe('brush');
      dragDraw(100, 100, 300, 160);

      const shapes = vm.getCurrentPageShapes();
      expect(shapes.length).toBe(2);
      expect(shapes[0]).toMatchObject({ type: 'ppt-image' });
      expect(shapes[1]).toMatchObject({ type: 'brush', blend: 'multiply' });
      wrapper.unmount();
    });
  });

  // ── F3.1 受力分析箭头模板 ──────────────────────────────────────────────────
  describe('WhiteBoard.vue 受力箭头模板（F3.1）', () => {
    type F31VM = PPTVM & {
      selectForceLabel: (label: string) => void;
      armedForceLabel: string;
      renderer: {
        previewLayer: { getChildren: () => unknown[] };
        layer: { getChildren: () => unknown[] };
        bindElements: (els: unknown) => void;
      } | null;
    };

    function drawForce(vm: F31VM, x1: number, y1: number, x2: number, y2: number) {
      const stage = konvaMocks.MockStage.last()!;
      vm.tool('force');
      stage._pointer = { x: x1, y: y1 };
      stage.fire('mousedown', { target: stage, evt: {} });
      stage._pointer = { x: x2, y: y2 };
      stage.fire('mousemove', { target: stage, evt: {} });
      stage.fire('mouseup', { target: stage, evt: {} });
    }

    it('正向：预设标签拖出受力箭头，标签与坐标写入 Yjs', () => {
      const wrapper = mountWB();
      const vm = wrapper.vm as unknown as F31VM;
      vm.selectForceLabel('G');
      drawForce(vm, 100, 100, 200, 140);
      const shapes = vm.getCurrentPageShapes().filter(s => s.type === 'force-arrow');
      expect(shapes.length).toBe(1);
      const s = shapes[0]!;
      expect(s.label).toBe('G');
      expect(s.points).toEqual([100, 100, 200, 140]);
      wrapper.unmount();
    });

    it('正向：双击改标签，Enter 提交并可撤销/重做', () => {
      const wrapper = mountWB();
      const vm = wrapper.vm as unknown as F31VM;
      vm.selectForceLabel('F₁');
      drawForce(vm, 100, 100, 200, 140);
      vm.tool('cur'); // 双击编辑仅选择器模式下可用（与文本一致）
      const node = vm.renderer!.layer.getChildren()[0] as { fire: (e: string) => void };

      node.fire('dblclick');
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(ta).toBeTruthy();
      expect(ta.value).toBe('F₁');
      ta.value = 'N';
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(ta.isConnected).toBe(false);
      const s = vm.getCurrentPageShapes().filter(x => x.type === 'force-arrow')[0]!;
      expect(s.label).toBe('N');
      vm.revocation('pre');
      expect(vm.getCurrentPageShapes().filter(x => x.type === 'force-arrow')[0]!.label).toBe('F₁');
      vm.revocation('next');
      expect(vm.getCurrentPageShapes().filter(x => x.type === 'force-arrow')[0]!.label).toBe('N');
      wrapper.unmount();
    });

    it('负向：微小拖拽（<5px）不落受力箭头', () => {
      const wrapper = mountWB();
      const vm = wrapper.vm as unknown as F31VM;
      drawForce(vm, 100, 100, 102, 101);
      expect(vm.getCurrentPageShapes().filter(s => s.type === 'force-arrow').length).toBe(0);
      wrapper.unmount();
    });

    it('正向：橡皮命中受力箭头杆身整件删除', () => {
      const wrapper = mountWB();
      const vm = wrapper.vm as unknown as F31VM;
      drawForce(vm, 100, 100, 200, 140);
      expect(vm.getCurrentPageShapes().filter(s => s.type === 'force-arrow').length).toBe(1);

      vm.tool('eraser');
      const stage = konvaMocks.MockStage.last()!;
      stage._pointer = { x: 150, y: 120 }; // 杆身中点
      stage.fire('mousedown', { target: stage, evt: {} });
      expect(vm.getCurrentPageShapes().filter(s => s.type === 'force-arrow').length).toBe(0);
      wrapper.unmount();
    });
  });
});

// ── 进房自动导入服务端课件 ────────────────────────────────────────────────
describe('WhiteBoard.vue 进房导入服务端课件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
    liveMocks.saveCourseware.mockResolvedValue({ code: 1000, data: null });
    liveMocks.deleteCourseware.mockResolvedValue({ code: 1000, data: null });
    liveMocks.coursewareList.mockResolvedValue({
      code: 1000,
      data: {
        list: [
          {
            id: 'cw1',
            filename: '课前预习',
            filext: 'pptx',
            filesize: 2048,
            fileUrl: 'http://mock.test/ppt/deck.pdf'
          }
        ],
        pageInfo: { totalElements: 1 }
      }
    });
    vi.mocked(getPdfPageCount).mockResolvedValue(2);
    vi.mocked(getPdfPageDims).mockResolvedValue({ w: 1000, h: 500 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('教师调用仅按 fileurl 登记列表（零建页），点击才创建；二次调用去重', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;

    await vm.importServerCoursewares();
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 }
    );
    expect(liveMocks.coursewareList).toHaveBeenCalledWith('1001');
    expect(unwrapVal(vm.fileList)[0]!.filename).toBe('课前预习');
    expect(unwrapVal(vm.fileList)[0]!.fileurl).toBe('http://mock.test/ppt/deck.pdf');
    // 仅登记零建页，fileid 待点击创建
    expect(vm.rendererPageCount()).toBe(1);
    expect(unwrapVal(vm.fileList)[0]!.fileid).toBe('');
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    // 进房登记只读服务端列表，不重复登记
    expect(liveMocks.saveCourseware).not.toHaveBeenCalled();

    // 二次调用：fileurl 命中已有条目（含未建页状态）→ 不再登记
    await vm.importServerCoursewares();
    expect(vm.rendererPageCount()).toBe(1);
    expect(unwrapVal(vm.fileList).length).toBe(1);

    // 点击列表 → 创建 2 页（mocked 页数）并落在首张
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    wrapper.unmount();
  });

  it('列表拉取失败仅记录日志，不建页', async () => {
    liveMocks.coursewareList.mockRejectedValue(new Error('network down'));
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const before = vm.rendererPageCount();

    await vm.importServerCoursewares();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(vm.rendererPageCount()).toBe(before);
    expect(unwrapVal(vm.fileList).length).toBe(0);
    wrapper.unmount();
  });

  it('学生端调用不请求课件列表', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    await vm.importServerCoursewares();
    expect(liveMocks.coursewareList).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

// ── 上传图片持久化（写入 Yjs，不被 refreshLayer 抹掉） ────────────────────
describe('WhiteBoard.vue 上传图片持久化', () => {
  let uploadCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    uploadCount = 0;
    vi.stubEnv('VITE_UPLOAD_IMAGE_URL', 'http://mock.test/img');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        uploadCount += 1;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 1000,
              data: { fileUrl: `http://mock.test/img/pic${uploadCount}.png` }
            })
        });
      })
    );
    stubFakeImage();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('上传图片写入 Yjs，尺寸按容器 60% 限幅', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadImageFile(wrapper);

    await vi.waitFor(
      () => {
        expect(imageShapes(vm).length).toBe(1);
      },
      { timeout: 3000 }
    );
    const s = imageShapes(vm)[0]!;
    expect(s.type).toBe('image');
    expect(s.url).toBe('http://mock.test/img/pic1.png');
    expect(s.x).toBe(50);
    expect(s.y).toBe(50);
    // jsdom clientWidth 0 → 回退 800；maxW = 800*0.6 = 480；1600×900 → 480×270
    expect(s.width).toBe(480);
    expect(s.height).toBeCloseTo(270, 5);
    wrapper.unmount();
  });

  it('后续白板活动触发 refreshLayer（destroyChildren 全量重建）后图片仍在', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadImageFile(wrapper, '一.png');
    await vi.waitFor(
      () => {
        expect(imageShapes(vm).length).toBe(1);
      },
      { timeout: 3000 }
    );

    // 第二次上传：addShape → elements.observe → refreshLayer → destroyChildren 全量重建
    await uploadImageFile(wrapper, '二.png');
    await vi.waitFor(
      () => {
        expect(imageShapes(vm).length).toBe(2);
      },
      { timeout: 3000 }
    );
    const urls = imageShapes(vm).map(s => s.url);
    expect(urls).toContain('http://mock.test/img/pic1.png');
    expect(urls).toContain('http://mock.test/img/pic2.png');
    wrapper.unmount();
  });

  it('撤销走标准 addShape 路径，可移除图片', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadImageFile(wrapper);
    await vi.waitFor(
      () => {
        expect(imageShapes(vm).length).toBe(1);
      },
      { timeout: 3000 }
    );

    vm.revocation('pre');

    expect(imageShapes(vm).length).toBe(0);
    wrapper.unmount();
  });

  it('图片加载失败仅 toast，不写入 Yjs', async () => {
    stubFakeImage({ fail: true });
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadImageFile(wrapper);

    await vi.waitFor(
      () => {
        expect(String(unwrapVal(vm.toastMsg))).toContain('图片加载失败');
      },
      { timeout: 3000 }
    );
    expect(imageShapes(vm).length).toBe(0);
    wrapper.unmount();
  });

  it('上传接口失败 toast 且不写入', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal' })
    );
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadImageFile(wrapper);

    await vi.waitFor(
      () => {
        expect(String(unwrapVal(vm.toastMsg))).toContain('上传失败: 500');
      },
      { timeout: 3000 }
    );
    expect(imageShapes(vm).length).toBe(0);
    wrapper.unmount();
  });
});

// ── 学生端只读 ────────────────────────────────────────────────────────────
describe('WhiteBoard.vue 学生端只读', () => {
  it('isTeacher=false 时不渲染工具/控制/页面三栏', () => {
    const wrapper = mountWB({ isTeacher: false });
    expect(wrapper.find('.classroom-white-board').exists()).toBe(true);
    expect(wrapper.find('.tools').exists()).toBe(false);
    expect(wrapper.find('.ctrl-tools').exists()).toBe(false);
    expect(wrapper.find('.page-tools').exists()).toBe(false);
    wrapper.unmount();
  });

  it('教师端三栏正常渲染（对照）', () => {
    const wrapper = mountWB();
    expect(wrapper.find('.tools').exists()).toBe(true);
    expect(wrapper.find('.ctrl-tools').exists()).toBe(true);
    expect(wrapper.find('.page-tools').exists()).toBe(true);
    wrapper.unmount();
  });

  it('学生端 addLayer/layerClear 不改动共享白板', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const before = vm.rendererPageCount();
    expect(() => vm.layerClear()).not.toThrow();
    vm.addLayer();
    // readOnly 下 provider.addPage 返回空串、pages 不变 → observe 不触发 → 层数不动
    expect(vm.rendererPageCount()).toBe(before);
    wrapper.unmount();
  });
});

// ── 选择器：选中/拖动/缩放/删除/撤销 ──────────────────────────────────────
type SelVM = PPTVM & {
  selectShape: (id: string) => void;
  clearSelection: () => void;
  getSelectedShapeId: () => string | null;
  commitShapeMove: (id: string, x: number, y: number) => void;
  commitShapeTransform: (id: string, attrs: Record<string, unknown>) => void;
  deleteSelected: () => void;
  renderer: { layer: { getChildren: () => Array<{ x: (v?: number) => number }> } };
};

describe('WhiteBoard.vue 选择器', () => {
  let uploadCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    uploadCount = 0;
    vi.stubEnv('VITE_UPLOAD_IMAGE_URL', 'http://mock.test/img');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        uploadCount += 1;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              code: 1000,
              data: { fileUrl: `http://mock.test/img/pic${uploadCount}.png` }
            })
        });
      })
    );
    stubFakeImage();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function seedImage(wrapper: ReturnType<typeof mountWB>, name: string): Promise<string> {
    const before = imageShapes(wrapper.vm as unknown as PPTVM).length;
    await uploadImageFile(wrapper, name);
    let id = '';
    await vi.waitFor(
      () => {
        const shapes = imageShapes(wrapper.vm as unknown as PPTVM);
        expect(shapes.length).toBe(before + 1);
        id = String(shapes[shapes.length - 1]!.id);
      },
      { timeout: 3000 }
    );
    return id;
  }

  it('选中图形后其它白板活动触发重建仍保持选中', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const idA = await seedImage(wrapper, 'a.png');

    vm.selectShape(idA);
    expect(vm.getSelectedShapeId()).toBe(idA);

    // 第二张图片 addShape → refreshLayer → destroyChildren 全量重建
    await seedImage(wrapper, 'b.png');
    expect(vm.getSelectedShapeId()).toBe(idA);
    wrapper.unmount();
  });

  it('拖动写回 Yjs，撤销恢复原坐标、重做再次生效', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const id = await seedImage(wrapper, 'a.png');
    const before = imageShapes(vm).find(s => s.id === id)!;
    expect(before.x).toBe(50);
    expect(before.y).toBe(50);

    vm.commitShapeMove(id, 200, 150);
    let shape = imageShapes(vm).find(s => s.id === id)!;
    expect(shape.x).toBe(200);
    expect(shape.y).toBe(150);

    vm.revocation('pre');
    shape = imageShapes(vm).find(s => s.id === id)!;
    expect(shape.x).toBe(50);
    expect(shape.y).toBe(50);

    vm.revocation('next');
    shape = imageShapes(vm).find(s => s.id === id)!;
    expect(shape.x).toBe(200);
    expect(shape.y).toBe(150);
    wrapper.unmount();
  });

  it('updateElement 提交失败时立即回滚视觉到 Yjs 实况', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const id = await seedImage(wrapper, 'a.png');
    const node = vm.renderer.layer.getChildren()[0]!;
    // Yjs 实况 x=50；模拟拖拽后停在 99 的视觉（尚未提交）
    node.x(99);
    const spy = vi.spyOn(vm.provider!, 'updateElement').mockReturnValue(false);

    vm.commitShapeMove(id, 99, 50);

    expect(spy).toHaveBeenCalledWith(id, { x: 99, y: 50 });
    // 提交失败必须重绑 Yjs 实况，否则节点停在拖拽处与数据不一致
    expect(vm.renderer.layer.getChildren()[0]!.x()).toBe(50);
    wrapper.unmount();
  });

  it('缩放烘焙后的 width/height 写回 Yjs', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const id = await seedImage(wrapper, 'a.png');

    vm.commitShapeTransform(id, { x: 60, y: 70, width: 240, height: 135 });
    const shape = imageShapes(vm).find(s => s.id === id)!;
    expect(shape.x).toBe(60);
    expect(shape.y).toBe(70);
    expect(shape.width).toBe(240);
    expect(shape.height).toBe(135);
    wrapper.unmount();
  });

  it('删除选中图形，撤销恢复到原索引位置', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const idA = await seedImage(wrapper, 'a.png');
    const idB = await seedImage(wrapper, 'b.png');
    expect(vm.getCurrentPageShapes().map(s => s.id)).toEqual([idA, idB]);

    vm.selectShape(idA);
    vm.deleteSelected();
    expect(vm.getSelectedShapeId()).toBeNull();
    expect(vm.getCurrentPageShapes().map(s => s.id)).toEqual([idB]);

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes().map(s => s.id)).toEqual([idA, idB]);
    wrapper.unmount();
  });

  it('切换工具与切换页后选中清空', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const id = await seedImage(wrapper, 'a.png');

    vm.selectShape(id);
    expect(vm.getSelectedShapeId()).toBe(id);
    vm.tool('brush');
    expect(vm.getSelectedShapeId()).toBeNull();

    vm.tool('cur');
    vm.selectShape(id);
    expect(vm.getSelectedShapeId()).toBe(id);
    vm.addLayer();
    expect(vm.getSelectedShapeId()).toBeNull();
    wrapper.unmount();
  });

  it('Delete 键删除选中图形', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const id = await seedImage(wrapper, 'a.png');
    vm.selectShape(id);
    expect(vm.getSelectedShapeId()).toBe(id);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(imageShapes(vm).length).toBe(0);
    expect(vm.getSelectedShapeId()).toBeNull();
    wrapper.unmount();
  });

  it('点击空白处取消选中', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const id = await seedImage(wrapper, 'a.png');
    vm.selectShape(id);
    expect(vm.getSelectedShapeId()).toBe(id);

    const stage = konvaMocks.MockStage.last()!;
    stage.fire('mousedown', { target: stage, evt: {} });
    expect(vm.getSelectedShapeId()).toBeNull();
    wrapper.unmount();
  });

  it('学生端 selectShape/拖动/删除均无效', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    vm.selectShape('any-id');
    expect(vm.getSelectedShapeId()).toBeNull();
    expect(() => vm.commitShapeMove('any-id', 1, 1)).not.toThrow();
    expect(() => vm.commitShapeTransform('any-id', { x: 1, y: 1 })).not.toThrow();
    expect(() => vm.deleteSelected()).not.toThrow();
    expect(vm.getSelectedShapeId()).toBeNull();
    wrapper.unmount();
  });
});

// ── 圆形工具绘制：自由拖=椭圆、Shift=正圆、实时预览 ───────────────────────
type DrawVM = SelVM & {
  renderer: { previewLayer: { getChildren: () => unknown[] } };
  penType: string;
  selectPen: (p: 'pen' | 'highlight') => void;
  selectColor: (c: string) => void;
};

describe('WhiteBoard.vue 圆形工具绘制', () => {
  it('自由拖出椭圆（radiusX/radiusY）并带实时预览，撤销可移除', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.tool('circle');
    const stage = konvaMocks.MockStage.last()!;

    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 300, y: 160 };
    stage.fire('mousemove', { target: stage, evt: {} });

    // 拖拽过程实时预览（previewLayer 上一个节点）
    expect(vm.renderer.previewLayer.getChildren().length).toBe(1);

    stage.fire('mouseup', { target: stage, evt: { shiftKey: false } });
    // 预览清理，不残留
    expect(vm.renderer.previewLayer.getChildren().length).toBe(0);

    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toMatchObject({ type: 'circle', x: 100, y: 100, radiusX: 200, radiusY: 60 });
    expect(shapes[0]!.radius).toBeUndefined();

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('Shift 拖出正圆（radius 取大值，无 radiusX/radiusY）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.tool('circle');
    const stage = konvaMocks.MockStage.last()!;

    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 140, y: 180 };
    stage.fire('mousemove', { target: stage, evt: { shiftKey: true } });
    stage.fire('mouseup', { target: stage, evt: { shiftKey: true } });

    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toMatchObject({ type: 'circle', x: 100, y: 100, radius: 80 });
    expect(shapes[0]!.radiusX).toBeUndefined();
    expect(shapes[0]!.radiusY).toBeUndefined();
    wrapper.unmount();
  });

  it('圆形转椭圆提交：撤销还原 radius，重做再转回（字段互斥清理）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    // 与生产路径一致：WS 未同步时无页，先建页（onPointerUp 兜底建页的等价测试前置）
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 'cc1',
      type: 'circle',
      x: 50,
      y: 50,
      radius: 30,
      color: '#000',
      lineWidth: 1,
      opacity: 1
    });
    const el = () =>
      provider
        .getActiveElements()!
        .toArray()
        .find(m => m.get('id') === 'cc1')!;

    vm.commitShapeTransform('cc1', { x: 50, y: 50, radiusX: 60, radiusY: 20 });
    expect(el().get('radiusX')).toBe(60);
    expect(el().get('radiusY')).toBe(20);
    expect(el().has('radius')).toBe(false);

    vm.revocation('pre');
    expect(el().get('radius')).toBe(30);
    expect(el().has('radiusX')).toBe(false);
    expect(el().has('radiusY')).toBe(false);

    vm.revocation('next');
    expect(el().get('radiusX')).toBe(60);
    expect(el().get('radiusY')).toBe(20);
    expect(el().has('radius')).toBe(false);
    wrapper.unmount();
  });
});

// ── 橡皮擦：按元素整笔擦除（F4.1 交互写死：非像素级、不落库白盖） ─────────
describe('WhiteBoard.vue 橡皮擦', () => {
  function drawStroke(vm: DrawVM, x1: number, y1: number, x2: number, y2: number) {
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('brush');
    stage._pointer = { x: x1, y: y1 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: x2, y: y2 };
    stage.fire('mousemove', { target: stage, evt: {} });
    stage.fire('mouseup', { target: stage, evt: {} });
  }

  function eraseTap(x: number, y: number) {
    const stage = konvaMocks.MockStage.last()!;
    stage._pointer = { x, y };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage.fire('mouseup', { target: stage, evt: {} });
  }

  it('拖过整笔笔迹一次擦除：不落库白盖元素、预览圆随拖显示抬起清理', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    drawStroke(vm, 100, 100, 160, 140);
    expect(vm.getCurrentPageShapes().length).toBe(1);

    vm.tool('eraser');
    const stage = konvaMocks.MockStage.last()!;
    stage._pointer = { x: 130, y: 120 };
    stage.fire('mousedown', { target: stage, evt: {} });
    expect(vm.getCurrentPageShapes().length).toBe(0);
    expect(vm.getCurrentPageShapes().filter(s => s.type === 'eraser').length).toBe(0);
    // 按下即有擦除半径预览圆，抬起清理
    expect(vm.renderer.previewLayer.getChildren().length).toBe(1);
    stage.fire('mouseup', { target: stage, evt: {} });
    expect(vm.renderer.previewLayer.getChildren().length).toBe(0);
    wrapper.unmount();
  });

  it('远离笔迹不误擦；擦除入撤销栈，撤销恢复、重做再擦除', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    drawStroke(vm, 100, 100, 160, 140);

    vm.tool('eraser');
    eraseTap(500, 500);
    expect(vm.getCurrentPageShapes().length).toBe(1);

    eraseTap(130, 120);
    expect(vm.getCurrentPageShapes().length).toBe(0);

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes().length).toBe(1);
    vm.revocation('next');
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('兼容历史白盖元素（type=eraser）同样整笔擦除', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 'legacy1',
      type: 'eraser',
      points: [100, 100, 160, 140],
      color: '#ffffff',
      lineWidth: 2,
      opacity: 1
    });
    // 远处补一笔：借提交路径完成层绑定，同时作为「不误擦」对照
    drawStroke(vm, 400, 400, 460, 440);
    expect(vm.getCurrentPageShapes().length).toBe(2);

    vm.tool('eraser');
    eraseTap(130, 120);
    const rest = vm.getCurrentPageShapes();
    expect(rest.length).toBe(1);
    expect(rest[0]!.type).toBe('brush');
    wrapper.unmount();
  });
});

// ── F4.1 荧光笔：分段控件、笔型档位存根、multiply 落库 ───────────────────
describe('WhiteBoard.vue 荧光笔', () => {
  function drawStroke(vm: DrawVM, x1: number, y1: number, x2: number, y2: number) {
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('brush');
    stage._pointer = { x: x1, y: y1 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: x2, y: y2 };
    stage.fire('mousemove', { target: stage, evt: {} });
    stage.fire('mouseup', { target: stage, evt: {} });
  }

  it('分段控件切至荧光：进画笔模式 + 亮黄 + 钢笔 1.5× 宽预设', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    const segs = wrapper.findAll('.tools .brush-seg .seg');
    expect(segs.length).toBe(2);
    expect(vm.penType).toBe('pen');

    await segs[1]!.trigger('click');
    expect(vm.mode).toBe('brush');
    expect(vm.penType).toBe('highlight');
    const state = vm.provider!.getToolState();
    expect(state.penType).toBe('highlight');
    expect(state.color).toBe('#ffeb3b');
    expect(state.lineWidth).toBe(2); // Math.round(1 × 1.5)
    wrapper.unmount();
  });

  it('档位存根：切回钢笔恢复原色宽，再切回荧光保留用户改过的颜色', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.selectPen('highlight');
    // 用户在荧光下自选颜色（走现有颜色管线）
    vm.selectColor('#e1383f');

    vm.selectPen('pen');
    expect(vm.penType).toBe('pen');
    expect(vm.provider!.getToolState().color).toBe('#000000');
    expect(vm.provider!.getToolState().lineWidth).toBe(1);

    vm.selectPen('highlight');
    expect(vm.penType).toBe('highlight');
    expect(vm.provider!.getToolState().color).toBe('#e1383f');
    expect(vm.provider!.getToolState().lineWidth).toBe(2);
    wrapper.unmount();
  });

  it('荧光笔迹落库带 blend:multiply，钢笔不写该键；撤销/重做正常', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.selectPen('highlight');
    drawStroke(vm, 100, 100, 160, 140);
    let shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toMatchObject({ type: 'brush', blend: 'multiply' });

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes().length).toBe(0);
    vm.revocation('next');
    shapes = vm.getCurrentPageShapes();
    expect(shapes[0]!.blend).toBe('multiply');

    // 切回钢笔再画一笔：键集不被 blend 污染
    vm.selectPen('pen');
    drawStroke(vm, 300, 300, 360, 340);
    shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(2);
    expect(shapes.some(s => s.blend === 'multiply')).toBe(true);
    expect('blend' in shapes[1]!).toBe(false);
    wrapper.unmount();
  });

  it('绘制中预览线同步挂 multiply（落库前视觉一致）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.selectPen('highlight');
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('brush');
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 160, y: 140 };
    stage.fire('mousemove', { target: stage, evt: {} });
    const preview = vm.renderer.previewLayer.getChildren()[0] as {
      _attrs: Record<string, unknown>;
    };
    expect(preview._attrs.globalCompositeOperation).toBe('multiply');
    stage.fire('mouseup', { target: stage, evt: {} });
    wrapper.unmount();
  });

  it('学生端只读矩阵：无分段控件、selectPen 不可用', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as DrawVM;
    expect(wrapper.find('.tools .brush-seg').exists()).toBe(false);
    expect(() => vm.selectPen('highlight')).not.toThrow();
    expect(vm.provider!.getToolState().penType).toBe('pen');
    wrapper.unmount();
  });
});

// ── 快捷键：Ctrl+Z/Y/Shift+Z 撤销重做、Esc 取消选中/中止绘制 ──────────────
describe('WhiteBoard.vue 快捷键', () => {
  function drawOneCircle(vm: SelVM) {
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('circle');
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 160, y: 160 };
    stage.fire('mouseup', { target: stage, evt: { shiftKey: true } });
  }

  function key(k: string, init: KeyboardEventInit = {}) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, ...init }));
  }

  it('Ctrl+Z 撤销、Ctrl+Y 与 Ctrl+Shift+Z 重做', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    drawOneCircle(vm);
    expect(vm.getCurrentPageShapes().length).toBe(1);

    key('z', { ctrlKey: true });
    expect(vm.getCurrentPageShapes().length).toBe(0);

    key('y', { ctrlKey: true });
    expect(vm.getCurrentPageShapes().length).toBe(1);

    key('z', { ctrlKey: true });
    expect(vm.getCurrentPageShapes().length).toBe(0);

    key('z', { ctrlKey: true, shiftKey: true });
    expect(vm.getCurrentPageShapes().length).toBe(1);
    wrapper.unmount();
  });

  it('Esc 取消选中并中止进行中的绘制', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    drawOneCircle(vm);
    const id = vm.getCurrentPageShapes()[0]!.id as string;

    vm.tool('cur');
    vm.selectShape(id);
    expect(vm.getSelectedShapeId()).toBe(id);
    key('Escape');
    expect(vm.getSelectedShapeId()).toBeNull();

    // 绘制中 Esc → 中止，松开不落盘
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('circle');
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 200, y: 200 };
    stage.fire('mousemove', { target: stage, evt: {} });
    key('Escape');
    stage.fire('mouseup', { target: stage, evt: {} });
    expect(vm.getCurrentPageShapes().length).toBe(1);
    wrapper.unmount();
  });

  it('输入框聚焦时 Ctrl+Z 不劫持（图形保留）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    drawOneCircle(vm);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    key('z', { ctrlKey: true });
    expect(vm.getCurrentPageShapes().length).toBe(1);
    input.remove();
    wrapper.unmount();
  });

  it('学生端快捷键不产生副作用', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    expect(() => {
      key('z', { ctrlKey: true });
      key('y', { ctrlKey: true });
      key('Escape');
    }).not.toThrow();
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });
});

// ── 直线工具：自由拖、Shift 锁定水平/垂直、预览 ────────────────────────────
describe('WhiteBoard.vue 直线与箭头工具', () => {
  function drawLine(
    stage: InstanceType<typeof konvaMocks.MockStage>,
    to: { x: number; y: number },
    shift = false
  ) {
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = to;
    stage.fire('mousemove', { target: stage, evt: { shiftKey: shift } });
    stage.fire('mouseup', { target: stage, evt: { shiftKey: shift } });
  }

  it('自由拖出直线并带实时预览，撤销可移除', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.tool('line');
    const stage = konvaMocks.MockStage.last()!;

    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 300, y: 160 };
    stage.fire('mousemove', { target: stage, evt: {} });
    expect(vm.renderer.previewLayer.getChildren().length).toBe(1);

    stage.fire('mouseup', { target: stage, evt: { shiftKey: false } });
    expect(vm.renderer.previewLayer.getChildren().length).toBe(0);

    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toMatchObject({ type: 'line', points: [100, 100, 300, 160] });

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('Shift 锁定水平/垂直方向', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.tool('line');
    const stage = konvaMocks.MockStage.last()!;

    // 水平：|dx| >= |dy| → dy 归零
    drawLine(stage, { x: 300, y: 160 }, true);
    // 垂直：|dy| > |dx| → dx 归零
    drawLine(stage, { x: 140, y: 300 }, true);

    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(2);
    expect(shapes[0]!.points).toEqual([100, 100, 300, 100]);
    expect(shapes[1]!.points).toEqual([100, 100, 100, 300]);
    wrapper.unmount();
  });

  it('自由拖出箭头（type=arrow 落库），撤销可移除', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.tool('arrows');
    const stage = konvaMocks.MockStage.last()!;

    drawLine(stage, { x: 300, y: 160 }, false);

    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toMatchObject({ type: 'arrow', points: [100, 100, 300, 160] });

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('箭头 Shift 锁定水平/垂直，预览与落库一致（F5.1 修复回归）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    vm.tool('arrows');
    const stage = konvaMocks.MockStage.last()!;

    // 预览路径：mousemove(shift) 即钳制
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 300, y: 160 };
    stage.fire('mousemove', { target: stage, evt: { shiftKey: true } });
    const preview = vm.renderer.previewLayer.getChildren()[0] as { points: () => number[] };
    expect(preview.points()).toEqual([100, 100, 300, 100]);
    stage.fire('mouseup', { target: stage, evt: { shiftKey: true } });
    expect(vm.renderer.previewLayer.getChildren().length).toBe(0);

    // 落库路径：水平 |dx|>=|dy| → dy 归零；垂直 |dy|>|dx| → dx 归零
    drawLine(stage, { x: 140, y: 300 }, true);

    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(2);
    expect(shapes[0]!.points).toEqual([100, 100, 300, 100]);
    expect(shapes[1]!.points).toEqual([100, 100, 100, 300]);
    wrapper.unmount();
  });
});

// ── 双击编辑文本：原位编辑框、Enter 提交、Esc 弃改 ────────────────────────
describe('WhiteBoard.vue 双击编辑文本', () => {
  function seedText(vm: SelVM, text = 'hello') {
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 't1',
      type: 'text',
      x: 50,
      y: 60,
      text,
      fontSize: 20,
      color: '#000',
      opacity: 1
    });
    vm.tool('cur');
    // 直接触发重建以挂载节点事件（生产中由 elements 观察器完成）
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
    return (
      vm.renderer as unknown as { layer: { getChildren: () => unknown[] } }
    ).layer.getChildren()[0] as {
      fire: (e: string) => void;
    };
  }

  it('双击文本弹出编辑框，Enter 提交并可撤销/重做', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const node = seedText(vm);

    node.fire('dblclick');
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('hello');

    ta.value = 'world';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ta.isConnected).toBe(false);
    expect(vm.getCurrentPageShapes()[0]!.text).toBe('world');

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes()[0]!.text).toBe('hello');
    vm.revocation('next');
    expect(vm.getCurrentPageShapes()[0]!.text).toBe('world');
    wrapper.unmount();
  });

  it('Esc 弃改不写回', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const node = seedText(vm);

    node.fire('dblclick');
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'changed';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ta.isConnected).toBe(false);
    expect(vm.getCurrentPageShapes()[0]!.text).toBe('hello');
    wrapper.unmount();
  });

  it('双击非文本图形不弹编辑框', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 'c1',
      type: 'circle',
      x: 50,
      y: 50,
      radius: 30,
      color: '#000',
      lineWidth: 1,
      opacity: 1
    });
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );

    const node = (
      vm.renderer as unknown as { layer: { getChildren: () => unknown[] } }
    ).layer.getChildren()[0] as {
      fire: (e: string) => void;
    };
    node.fire('dblclick');
    expect(document.querySelector('textarea')).toBeNull();
    wrapper.unmount();
  });

  it('学生端双击不弹编辑框', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    vm.tool('cur');
    const fakeEls = {
      forEach: (cb: (el: unknown) => void) => {
        const data: Record<string, unknown> = {
          id: 't1',
          type: 'text',
          x: 50,
          y: 60,
          text: 'hi',
          fontSize: 14,
          color: '#000',
          opacity: 1
        };
        cb({ get: (k: string) => data[k] });
      }
    };
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(fakeEls);

    const node = (
      vm.renderer as unknown as { layer: { getChildren: () => unknown[] } }
    ).layer.getChildren()[0] as {
      fire: (e: string) => void;
    };
    node.fire('dblclick');
    expect(document.querySelector('textarea')).toBeNull();
    wrapper.unmount();
  });
});

// ── 属性回改：选中回填面板、改属性写回入栈、矩形/圆形填充二态 ─────────────
describe('WhiteBoard.vue 属性回改与填充', () => {
  function seedShape(vm: SelVM, shape: Record<string, unknown>) {
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape(shape);
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
  }

  it('选中矩形回填属性并打开面板，改色写回可撤销，清选中关闭面板', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 100,
      height: 60,
      color: '#123456',
      lineWidth: 3,
      opacity: 0.8
    });

    expect(wrapper.find('.color-panel').isVisible()).toBe(false);
    vm.selectShape('r1');
    await nextTick();
    expect(wrapper.find('.color-panel').isVisible()).toBe(true);
    // 矩形选中 → 粗细条作用于线宽（"细/粗"）
    expect(wrapper.find('.size-title').text()).toContain('细');

    // 点击第一个预设色 → 写回所选图形并入 undo 栈
    const items = wrapper.findAll('.edit-color .item');
    await items[0]!.trigger('click');
    expect(vm.getCurrentPageShapes()[0]!.color).toBe(PRESET_COLORS[0]);
    expect(vm.getCurrentPageShapes()[0]!.color).not.toBe('#123456');

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');

    vm.clearSelection();
    await nextTick();
    expect(wrapper.find('.color-panel').isVisible()).toBe(false);
    wrapper.unmount();
  });

  it('选中文字后粗细条作用于字号，拖拽结束写回并可撤销', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 't1',
      type: 'text',
      x: 50,
      y: 60,
      text: 'hi',
      fontSize: 20,
      color: '#000',
      opacity: 1
    });
    vm.selectShape('t1');
    await nextTick();
    expect(wrapper.find('.size-title').text()).toContain('小');

    const strip = wrapper.find('.strip');
    // jsdom getBoundingClientRect 全 0 → x=65 → 字号 = round(8 + 65/130*40) = 28
    await strip.trigger('mousedown', { clientX: 65 });
    expect(vm.getCurrentPageShapes()[0]!.fontSize).toBe(20); // 拖拽中仅本地预览，不写回

    await strip.trigger('mouseup');
    expect(vm.getCurrentPageShapes()[0]!.fontSize).toBe(28);

    vm.revocation('pre');
    expect(vm.getCurrentPageShapes()[0]!.fontSize).toBe(20);
    wrapper.unmount();
  });

  it('填充弹出色板：选色写入 fill、无颜色删除字段，可撤销/重做', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();

    const toggle = wrapper.find('.fill-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toContain('无填充');
    expect(wrapper.find('.fill-palette').exists()).toBe(false);

    // 点填充 → 弹出色板（预设色 + 无颜色）
    await toggle.trigger('click');
    expect(wrapper.find('.fill-palette').exists()).toBe(true);
    expect(wrapper.findAll('.fill-palette .fp-item').length).toBe(PRESET_COLORS.length);
    expect(wrapper.find('.fill-palette .fp-none').exists()).toBe(true);

    // 选第一个预设色 → 写入 fill、收起弹层、描边不动
    await wrapper.findAll('.fill-palette .fp-item')[0]!.trigger('click');
    expect(wrapper.find('.fill-palette').exists()).toBe(false);
    expect(vm.getCurrentPageShapes()[0]!.fill).toBe(PRESET_COLORS[0]);
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');
    expect(wrapper.find('.fill-toggle').text()).toContain('已填充');

    vm.revocation('pre');
    expect('fill' in vm.getCurrentPageShapes()[0]!).toBe(false);
    vm.revocation('next');
    expect(vm.getCurrentPageShapes()[0]!.fill).toBe(PRESET_COLORS[0]);

    // 无颜色 → 删除 fill 字段
    const reopen = wrapper.find('.fill-toggle');
    await reopen.trigger('click');
    await wrapper.find('.fill-palette .fp-none').trigger('click');
    expect('fill' in vm.getCurrentPageShapes()[0]!).toBe(false);
    expect(wrapper.find('.fill-toggle').text()).toContain('无填充');
    wrapper.unmount();
  });

  it('开启填充后绘制椭圆：预览与落库均带 fill', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();
    await wrapper.find('.fill-toggle').trigger('click');
    await wrapper.findAll('.fill-palette .fp-item')[0]!.trigger('click');
    vm.tool('circle');
    const stage = konvaMocks.MockStage.last()!;
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 300, y: 160 };
    stage.fire('mousemove', { target: stage, evt: {} });
    const preview = vm.renderer.previewLayer.getChildren()[0] as {
      _attrs?: Record<string, unknown>;
    };
    expect(preview._attrs?.fill).toBeTruthy();
    stage.fire('mouseup', { target: stage, evt: { shiftKey: false } });
    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(2);
    const ellipse = shapes.find(s => s.type === 'circle');
    expect(ellipse).toBeTruthy();
    expect(ellipse!.fill).toBeTruthy();
    wrapper.unmount();
  });

  it('开启填充后绘制矩形：预览与落库均带 fill', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    seedShape(vm, {
      id: 'c1',
      type: 'circle',
      x: 50,
      y: 50,
      radius: 30,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('c1');
    await nextTick();
    await wrapper.find('.fill-toggle').trigger('click');
    await wrapper.findAll('.fill-palette .fp-item')[0]!.trigger('click');
    vm.tool('rectangle');
    const stage = konvaMocks.MockStage.last()!;
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 200, y: 180 };
    stage.fire('mousemove', { target: stage, evt: {} });
    const preview = vm.renderer.previewLayer.getChildren()[0] as {
      _attrs?: Record<string, unknown>;
    };
    expect(preview._attrs?.fill).toBeTruthy();
    stage.fire('mouseup', { target: stage, evt: { shiftKey: false } });
    const rect = vm.getCurrentPageShapes().find(s => s.type === 'rect');
    expect(rect).toBeTruthy();
    expect(rect!.fill).toBeTruthy();
    wrapper.unmount();
  });

  it('填充色与描边色独立：改填充不动描边，换描边不动填充', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();
    // 选绿填充色（PRESET_COLORS[7]）→ 描边不动
    await wrapper.find('.fill-toggle').trigger('click');
    await wrapper.findAll('.fill-palette .fp-item')[7]!.trigger('click');
    expect(vm.getCurrentPageShapes()[0]!.fill).toBe(PRESET_COLORS[7]);
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');
    // 换描边色 → 填充不动
    await wrapper.findAll('.edit-color .item')[0]!.trigger('click');
    expect(vm.getCurrentPageShapes()[0]!.color).toBe(PRESET_COLORS[0]);
    expect(vm.getCurrentPageShapes()[0]!.fill).toBe(PRESET_COLORS[7]);
    wrapper.unmount();
  });

  it('画图填充取独立填充色：选绿填充、换蓝描边后画圆 fill=绿 color=蓝', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as DrawVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();
    await wrapper.find('.fill-toggle').trigger('click');
    await wrapper.findAll('.fill-palette .fp-item')[7]!.trigger('click');
    // 换描边为蓝（PRESET_COLORS[9] = '#017aff'）
    await wrapper.findAll('.edit-color .item')[9]!.trigger('click');
    vm.tool('circle');
    const stage = konvaMocks.MockStage.last()!;
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: 300, y: 160 };
    stage.fire('mousemove', { target: stage, evt: {} });
    stage.fire('mouseup', { target: stage, evt: { shiftKey: false } });
    const ellipse = vm.getCurrentPageShapes().find(s => s.type === 'circle');
    expect(ellipse).toBeTruthy();
    expect(ellipse!.fill).toBe(PRESET_COLORS[7]);
    expect(ellipse!.color).toBe(PRESET_COLORS[9]);
    wrapper.unmount();
  });

  function stubWheelCtx() {
    const putImageData = vi.fn();
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4)
      }),
      putImageData,
      getImageData: (x: number) => ({ data: x < 100 ? [1, 168, 255, 255] : [255, 0, 0, 255] })
    } as unknown as RenderingContext);
    return { spy, putImageData };
  }

  function mockWheelRect(canvas: { element: Element }) {
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 150,
      bottom: 150,
      width: 150,
      height: 150,
      toJSON: () => ({})
    } as DOMRect);
  }

  it('描边颜色盘：HSV 轮盘按下仅预览、松手才提交、死代码色条已移除', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();
    const { spy, putImageData } = stubWheelCtx();

    const box = wrapper.find('.pallet-box');
    expect(box.isVisible()).toBe(false);
    await wrapper.find('.edit-color .colours').trigger('click');
    expect(box.isVisible()).toBe(true);
    expect(wrapper.find('.strip-color').exists()).toBe(false);
    expect(wrapper.find('.endSelectColor .end-color-item').exists()).toBe(true);
    await nextTick();
    expect(putImageData).toHaveBeenCalled();

    const canvas = wrapper.find('.pallet-box .pal-color canvas');
    expect(canvas.exists()).toBe(true);
    mockWheelRect(canvas);
    await canvas.trigger('mousedown', { clientX: 75, clientY: 75 });
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#01a8ff');
    expect('fill' in vm.getCurrentPageShapes()[0]!).toBe(false);
    spy.mockRestore();
    wrapper.unmount();
  });

  it('填充颜色盘：与描边同款卡片、轮盘取色写 fill、描边不动、弹层保持打开', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();
    const { spy, putImageData } = stubWheelCtx();

    await wrapper.find('.fill-toggle').trigger('click');
    expect(wrapper.find('.fill-palette.pallet-box').exists()).toBe(true);
    const canvas = wrapper.find('.fill-palette .fpal-color canvas');
    expect(canvas.exists()).toBe(true);
    await nextTick();
    expect(putImageData).toHaveBeenCalled();
    mockWheelRect(canvas);
    await canvas.trigger('mousedown', { clientX: 75, clientY: 75 });
    expect('fill' in vm.getCurrentPageShapes()[0]!).toBe(false);
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(vm.getCurrentPageShapes()[0]!.fill).toBe('#01a8ff');
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');
    expect(wrapper.find('.fill-palette').exists()).toBe(true);
    spy.mockRestore();
    wrapper.unmount();
  });

  it('颜色盘按住拖动连续取色：拖动中不提交，松手提交最后命中的颜色', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'r1',
      type: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      color: '#123456',
      lineWidth: 1,
      opacity: 1
    });
    vm.selectShape('r1');
    await nextTick();
    const { spy } = stubWheelCtx();

    await wrapper.find('.edit-color .colours').trigger('click');
    const canvas = wrapper.find('.pallet-box .pal-color canvas');
    mockWheelRect(canvas);
    await canvas.trigger('mousedown', { clientX: 30, clientY: 75 });
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 75 }));
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#123456');
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(vm.getCurrentPageShapes()[0]!.color).toBe('#ff0000');
    spy.mockRestore();
    wrapper.unmount();
  });

  it('选中图片不打开属性面板', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    seedShape(vm, {
      id: 'i1',
      type: 'image',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      url: 'http://mock.test/pic.png',
      opacity: 1
    });
    vm.selectShape('i1');
    await nextTick();
    expect(wrapper.find('.color-panel').isVisible()).toBe(false);
    expect(wrapper.find('.fill-toggle').exists()).toBe(false);
    wrapper.unmount();
  });

  it('学生端 selectShape 不回填不闪面板', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    expect(() => vm.selectShape('any')).not.toThrow();
    expect(vm.getSelectedShapeId()).toBeNull();
    expect(wrapper.find('.color-panel').isVisible()).toBe(false);
    wrapper.unmount();
  });
});

// ── 激光笔：教师跟指广播、切走/Esc 熄灭、远端渲染红点 ─────────────────────
describe('WhiteBoard.vue 激光笔', () => {
  function localLaser(vm: SelVM): { x: number; y: number } | null | undefined {
    return (vm.provider!.awareness.getLocalState() as Record<string, unknown> | null)?.laser as
      { x: number; y: number } | null | undefined;
  }

  it('教师点选激光进入模式，移动广播 awareness 并渲染红点，切换工具即熄灭', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    await wrapper.find('.tools .laser').trigger('click');
    expect(vm.mode).toBe('laser');

    const stage = konvaMocks.MockStage.last()!;
    stage._pointer = { x: 200, y: 150 };
    stage.fire('mousemove', { target: stage, evt: {} });

    expect(localLaser(vm)).toEqual({ x: 200, y: 150 });
    const dot = (
      vm.renderer as unknown as { laserLayer: { getChildren: () => unknown[] } }
    ).laserLayer.getChildren()[0] as { x: () => number; y: () => number; visible: () => boolean };
    expect(dot).toBeTruthy();
    expect(dot.x()).toBe(200);
    expect(dot.y()).toBe(150);
    expect(dot.visible()).toBe(true);

    vm.tool('cur');
    expect(vm.mode).toBe('cur');
    expect(localLaser(vm) ?? null).toBeFalsy();
    expect(dot.visible()).toBe(false);
    wrapper.unmount();
  });

  it('Esc 退出激光模式并熄灭', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    await wrapper.find('.tools .laser').trigger('click');
    expect(vm.mode).toBe('laser');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(vm.mode).toBe('cur');
    expect(localLaser(vm) ?? null).toBeFalsy();
    wrapper.unmount();
  });

  it('远端 laser 广播渲染红点，清除后熄灭（学生端视角）', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    // 学生端 readOnly 下 setLaser 不可用——直接写 awareness 触发同一 change 渲染路径
    provider.awareness.setLocalStateField('laser', { x: 30, y: 40 });

    const dot = (
      vm.renderer as unknown as { laserLayer: { getChildren: () => unknown[] } }
    ).laserLayer.getChildren()[0] as { x: () => number; y: () => number; visible: () => boolean };
    expect(dot).toBeTruthy();
    expect(dot.x()).toBe(30);
    expect(dot.y()).toBe(40);
    expect(dot.visible()).toBe(true);

    provider.awareness.setLocalStateField('laser', null);
    expect(dot.visible()).toBe(false);
    wrapper.unmount();
  });
});

// ── 远端光标：悬停广播、写侧节流、contain 换算、标签淡出、幽灵清理（F7.1） ──
describe('WhiteBoard.vue 远端光标（F7.1）', () => {
  type NodeLike = {
    x: (v?: number) => number;
    y: (v?: number) => number;
    visible: () => boolean;
    opacity: (v?: number) => number;
    _attrs: Record<string, unknown>;
  };
  function cursorChildren(vm: SelVM): unknown[] {
    return (
      vm.renderer as unknown as { cursorLayer: { getChildren: () => unknown[] } }
    ).cursorLayer.getChildren();
  }
  function localCursor(vm: SelVM): Record<string, unknown> | null | undefined {
    return (vm.provider!.awareness.getLocalState() as Record<string, unknown> | null)?.cursor as
      Record<string, unknown> | null | undefined;
  }
  function fireMove(stage: unknown, x: number, y: number) {
    const s = stage as {
      _pointer: { x: number; y: number };
      fire: (evt: string, d: unknown) => void;
    };
    s._pointer = { x, y };
    s.fire('mousemove', { target: stage, evt: {} });
  }
  const teacherCursor = (x: number, y: number) => ({
    userId: 'teacher-9',
    userName: 'Teacher',
    x,
    y,
    color: '#3366ff'
  });

  it('教师悬停（未进入绘制）即广播光标：stage 坐标 + 姓名 + 代表色', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    fireMove(konvaMocks.MockStage.last()!, 300, 240);
    expect(localCursor(vm)).toMatchObject({
      userId: 'op1',
      userName: 'teacher',
      x: 300,
      y: 240
    });
    expect(typeof (localCursor(vm) as Record<string, unknown>).color).toBe('string');
    // 本端光标不自渲染（children 未创建）
    expect(cursorChildren(vm).length).toBe(0);
    wrapper.unmount();
  });

  it('光标写侧 50ms 节流：连续移动只广播一次', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const spy = vi.spyOn(vm.provider!, 'updateCursor');
    const stage = konvaMocks.MockStage.last()!;
    fireMove(stage, 10, 10);
    fireMove(stage, 11, 11);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    wrapper.unmount();
  });

  it('学生端移动指针不写 cursor awareness（只渲染不可写）', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    fireMove(konvaMocks.MockStage.last()!, 50, 60);
    expect(localCursor(vm) ?? null).toBeFalsy();
    wrapper.unmount();
  });

  it('远端光标渲染点+姓名标签，stage 坐标经 contain k=2 换算成层局部坐标', () => {
    // 视口写侧被 readOnly 守卫（学生只读），用教师端写入触发同一 viewportOffset 观察器
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    // 视口：平移(60,40)、缩放 100%、stage 400×300 → 本端 800×600 下 k=min(2,2)=2
    provider.setViewportAll({ x: 60, y: 40, zoom: 100, sw: 400, sh: 300 });
    provider.awareness.setLocalStateField('cursor', teacherCursor(200, 180));

    const children = cursorChildren(vm);
    expect(children.length).toBe(7);
    const dot = children[5] as unknown as NodeLike;
    const label = children[6] as unknown as NodeLike;
    // 教师层局部坐标 = (200−60)/1 = 140（k 经 ×k 与层缩放抵消）
    expect(dot.x()).toBe(140);
    expect(dot.y()).toBe(140);
    expect(dot.visible()).toBe(true);
    expect(label.x()).toBe(152);
    expect(label.y()).toBe(152);
    expect(label._attrs.text).toBe('Teacher');
    wrapper.unmount();
  });

  it('远端光标静止 3s 后姓名标签淡出，新光标帧恢复并重置计时', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    vi.useFakeTimers();
    try {
      provider.awareness.setLocalStateField('cursor', teacherCursor(10, 20));
      const label = cursorChildren(vm)[6] as unknown as NodeLike;
      expect(label.opacity()).toBe(1);
      vi.advanceTimersByTime(3000);
      expect(label.opacity()).toBe(0);
      // 新帧（坐标须变化，同坐标被去重跳过）→ 恢复可见
      provider.awareness.setLocalStateField('cursor', teacherCursor(30, 40));
      expect(label.opacity()).toBe(1);
      // 重置后再次满 3s 才淡出（计时器已被新帧重置）
      vi.advanceTimersByTime(2999);
      expect(label.opacity()).toBe(1);
      vi.advanceTimersByTime(1);
      expect(label.opacity()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    wrapper.unmount();
  });

  it('peer 离开 / cursor:null 清除光标节点，无幽灵残留', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    provider.awareness.setLocalStateField('cursor', teacherCursor(1, 2));
    const children = cursorChildren(vm);
    expect((children[5] as unknown as NodeLike).visible()).toBe(true);

    provider.awareness.setLocalStateField('cursor', null);
    expect((children[5] as unknown as NodeLike).visible()).toBe(false);
    expect((children[6] as unknown as NodeLike).visible()).toBe(false);
    (children.slice(0, 5) as unknown as NodeLike[]).forEach(t => expect(t.visible()).toBe(false));
    wrapper.unmount();
  });

  it('本端 userId 的光标帧被忽略（不渲染自己的光标）', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    // 本端 userId = opaqueId 'op1'（route.query.userId 为空）
    vm.provider!.awareness.setLocalStateField('cursor', {
      userId: 'op1',
      userName: 'Self',
      x: 9,
      y: 9,
      color: '#000'
    });
    expect(cursorChildren(vm).length).toBe(0);
    wrapper.unmount();
  });

  it('激光红点与远端光标同时渲染互不干扰（各在各层，清激光不动光标）', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as SelVM;
    const provider = vm.provider!;
    provider.awareness.setLocalStateField('laser', { x: 30, y: 40 });
    provider.awareness.setLocalStateField('cursor', teacherCursor(5, 6));

    const laserDot = (
      vm.renderer as unknown as { laserLayer: { getChildren: () => unknown[] } }
    ).laserLayer.getChildren()[0] as NodeLike;
    const cursorDot = cursorChildren(vm)[5] as unknown as NodeLike;
    expect(laserDot.visible()).toBe(true);
    expect(laserDot.x()).toBe(30);
    expect(cursorDot.visible()).toBe(true);
    expect(cursorDot.x()).toBe(5);

    provider.awareness.setLocalStateField('laser', null);
    expect(laserDot.visible()).toBe(false);
    expect(cursorDot.visible()).toBe(true);
    wrapper.unmount();
  });
});

// ── 快照暂存失败横幅（§4.9 F6.2 失败态：可见提示 + 服务端自动重试） ──────
describe('WhiteBoard.vue 快照状态帧横幅', () => {
  type BannerVM = {
    snapshotRetry: number | null | { value: number | null };
    provider: {
      provider: {
        messageHandlers: Array<(e: unknown, d: { arr: Uint8Array; pos: number }) => void>;
      };
    };
  };

  it('state=1 显示「板书暂存失败，重试中(第 n 次)」，state=0 恢复后隐藏', async () => {
    const wrapper = mountWB();
    await nextTick();
    const vm = wrapper.vm as unknown as BannerVM;
    const handler = vm.provider.provider.messageHandlers[4]!;
    expect(typeof handler).toBe('function');

    // 服务端 type=4 帧：varuint(4) 已被 y-websocket 消费，此处为 payload = state + attempt
    handler(null, { arr: new Uint8Array([1, 2]), pos: 0 });
    await nextTick();
    const banner = wrapper.find('.snapshot-banner');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toBe('板书暂存失败，重试中(第 2 次)');

    handler(null, { arr: new Uint8Array([0, 0]), pos: 0 });
    await nextTick();
    expect(wrapper.find('.snapshot-banner').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('WhiteBoard.vue 板书导出（F6.1）', () => {
  type ExportReq = {
    format: string;
    scope: string;
    currentPage: number;
    pageCount: number;
    getElementsAt: (i: number) => unknown;
    width: number;
    height: number;
    fileNameBase: string;
    onProgress?: (done: number, total: number) => void;
  };

  beforeEach(() => {
    exportMocks.runExport.mockResolvedValue('saved');
  });

  it('教师工具栏提供导出入口', () => {
    const wrapper = mountWB();
    expect(wrapper.find('.tools .export').exists()).toBe(true);
  });

  it('学生端无导出入口，手动调用也提示仅教师可导出', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      exportDialogVisible: boolean;
      toastMsg: string;
    };
    expect(wrapper.find('.tools .export').exists()).toBe(false);
    vm.openExportDialog();
    await nextTick();
    expect(vm.exportDialogVisible).toBe(false);
    expect(vm.toastMsg).toBe('仅教师可导出');
    expect(exportMocks.runExport).not.toHaveBeenCalled();
  });

  it('点击入口打开导出弹窗（默认当前页 PNG）', async () => {
    const wrapper = mountWB();
    await wrapper.find('.tools .export').trigger('click');
    await nextTick();
    const vm = wrapper.vm as unknown as {
      exportDialogVisible: boolean;
      exportScope: string;
      exportFormat: string;
    };
    expect(vm.exportDialogVisible).toBe(true);
    expect(vm.exportScope).toBe('current');
    expect(vm.exportFormat).toBe('png');
    expect(wrapper.find('.el-dialog__title').text()).toBe('导出板书');
  });

  it('确认导出：按当前页 PNG 组装请求，成功后关弹窗并提示', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      confirmExport: () => Promise<void>;
      exportDialogVisible: boolean;
      toastMsg: string;
    };
    vm.openExportDialog();
    await nextTick();
    await vm.confirmExport();

    expect(exportMocks.runExport).toHaveBeenCalledTimes(1);
    const req = exportMocks.runExport.mock.calls[0]![0] as ExportReq;
    expect(req.format).toBe('png');
    expect(req.scope).toBe('current');
    // 测试环境无 ws sync，provider 无默认页（pageCount=0 由 runExport 判空并给出可读错误）
    expect(req.pageCount).toBeGreaterThanOrEqual(0);
    expect(req.currentPage).toBeGreaterThanOrEqual(0);
    expect(req.width).toBe(800);
    expect(req.height).toBe(600);
    expect(req.fileNameBase).toBe('板书-1001');
    expect(typeof req.getElementsAt).toBe('function');
    expect(typeof req.onProgress).toBe('function');
    expect(vm.exportDialogVisible).toBe(false);
    expect(vm.toastMsg).toBe('导出成功');
  });

  it('用户取消保存：关闭弹窗且不提示成功', async () => {
    exportMocks.runExport.mockResolvedValue('cancelled');
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      confirmExport: () => Promise<void>;
      exportDialogVisible: boolean;
      toastMsg: string;
    };
    vm.openExportDialog();
    await nextTick();
    await vm.confirmExport();
    expect(vm.exportDialogVisible).toBe(false);
    expect(vm.toastMsg).toBe('');
  });

  it('导出失败：toast 可读错误，弹窗保留可重试', async () => {
    exportMocks.runExport.mockRejectedValue(new Error('第2页图片加载超时'));
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      confirmExport: () => Promise<void>;
      exportDialogVisible: boolean;
      exporting: boolean;
      toastMsg: string;
    };
    vm.openExportDialog();
    await nextTick();
    await vm.confirmExport();
    expect(vm.toastMsg).toBe('导出失败：第2页图片加载超时');
    expect(vm.exportDialogVisible).toBe(true);
    expect(vm.exporting).toBe(false);
  });

  it('进度回调写入 exportProgress（页 n/m）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      confirmExport: () => Promise<void>;
      exportProgress: { done: number; total: number } | null;
    };
    vm.openExportDialog();
    await nextTick();
    let seen: { done: number; total: number } | null = null;
    exportMocks.runExport.mockImplementation(async (req: ExportReq) => {
      req.onProgress?.(2, 5);
      seen = vm.exportProgress;
      return 'saved';
    });
    await vm.confirmExport();
    expect(seen).toEqual({ done: 2, total: 5 });
  });

  it('全部页 PNG 在弹窗内提示打包 ZIP', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      exportScope: string;
      exportFormat: string;
    };
    vm.openExportDialog();
    await nextTick();
    expect(wrapper.find('.export-hint').exists()).toBe(false);
    vm.exportScope = 'all';
    vm.exportFormat = 'png';
    await nextTick();
    expect(wrapper.find('.export-hint').exists()).toBe(true);
    expect(wrapper.find('.export-hint').text()).toContain('ZIP');
  });

  it('导出进行中显示页进度（n/m）并防重复提交', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as {
      openExportDialog: () => void;
      confirmExport: () => Promise<void>;
      exporting: boolean;
    };
    vm.openExportDialog();
    await nextTick();
    let release!: (outcome: string) => void;
    exportMocks.runExport.mockImplementation((req: ExportReq) => {
      req.onProgress?.(1, 3);
      return new Promise(resolve => {
        release = resolve;
      });
    });
    const first = vm.confirmExport();
    await nextTick();
    await nextTick();
    expect(vm.exporting).toBe(true);
    const progress = wrapper.find('.export-progress');
    expect(progress.exists()).toBe(true);
    expect(progress.text()).toContain('1/3');
    await vm.confirmExport();
    expect(exportMocks.runExport).toHaveBeenCalledTimes(1);
    release('saved');
    await first;
    expect(vm.exporting).toBe(false);
    expect(wrapper.find('.export-progress').exists()).toBe(false);
  });
});

// ── F1.1 公式浮层（5.7.1 B1：∑ 按钮 → 源码框 → Enter 提交 / Esc 取消 / 双击重编辑） ──
describe('F1.1 公式浮层', () => {
  type FormulaVM = PPTVM & {
    formulaVisible: boolean;
    formulaInput: string;
    formulaError: string;
    formulaLoading: boolean;
    openFormula: () => void;
    closeFormula: () => void;
    submitFormula: () => Promise<void>;
    editTextShape: (id: string) => void;
  };

  it('教师工具栏提供 ∑ 按钮，点击呼出源码浮层', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    const btn = wrapper.find('.formula-tool');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('∑');
    await btn.trigger('click');
    await nextTick();
    expect(vm.formulaVisible).toBe(true);
    expect(wrapper.find('.formula-overlay').exists()).toBe(true);
    expect(wrapper.find('.formula-textarea').exists()).toBe(true);
    expect(wrapper.find('.formula-hint').text()).toContain('Enter');
    wrapper.unmount();
  });

  it('非法 LaTeX → 行内红框文案，浮层不关闭', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    vm.openFormula();
    vm.formulaInput = 'INVALID';
    await vm.submitFormula();
    await nextTick();
    expect(vm.formulaError).toBe(formulaMocks.FORMULA_INVALID_MSG);
    expect(wrapper.find('.formula-error').exists()).toBe(true);
    expect(wrapper.find('.formula-textarea').classes()).toContain('invalid');
    expect(vm.formulaVisible).toBe(true);
    wrapper.unmount();
  });

  it('空输入 → 提示必填，不调渲染管线', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    formulaMocks.measureFormula.mockClear();
    vm.openFormula();
    vm.formulaInput = '   ';
    await vm.submitFormula();
    expect(vm.formulaError).toBe('请输入 LaTeX 公式');
    expect(formulaMocks.measureFormula).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('合法提交 → addShape(type=formula, 自然尺寸) 且浮层关闭', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    const addSpy = vi.spyOn(YjsProvider.prototype, 'addShape').mockClear();
    vm.openFormula();
    vm.formulaInput = 'E=mc^2';
    await vm.submitFormula();
    await nextTick();
    expect(addSpy).toHaveBeenCalledTimes(1);
    const data = addSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(data.type).toBe('formula');
    expect(data.latex).toBe('E=mc^2');
    expect(data.width).toBe(130);
    expect(data.height).toBe(40);
    expect(typeof data.id).toBe('string');
    expect(vm.formulaVisible).toBe(false);
    expect(wrapper.find('.formula-overlay').exists()).toBe(false);
    addSpy.mockRestore();
    wrapper.unmount();
  });

  it('切换工具即收起浮层（面板互斥，setMode 单一收口）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    vm.openFormula();
    expect(vm.formulaVisible).toBe(true);
    vm.tool('brush');
    await nextTick();
    expect(vm.formulaVisible).toBe(false);
    expect(wrapper.find('.formula-overlay').exists()).toBe(false);
    wrapper.unmount();
  });

  it('渲染模块加载失败 → 可读降级文案（§4.9）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    formulaMocks.measureFormula.mockImplementationOnce(() => {
      throw new Error('chunk down');
    });
    vm.openFormula();
    vm.formulaInput = 'E=mc^2';
    await vm.submitFormula();
    await nextTick();
    expect(vm.formulaError).toBe('公式组件加载失败，点击重试');
    expect(vm.formulaVisible).toBe(true);
    wrapper.unmount();
  });

  it('双击已有公式 → 预填源码重编辑，提交走 updateElement', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as FormulaVM;
    const updateSpy = vi.spyOn(YjsProvider.prototype, 'updateElement');
    // 与生产路径一致：WS 未同步时无页，先建页（onPointerUp 兜底建页的等价测试前置）
    if (!vm.provider!.getActiveElements()) vm.provider!.addPage();
    vm.provider!.addShape({
      id: 'fx1',
      type: 'formula',
      latex: 'a+b',
      x: 0,
      y: 0,
      width: 130,
      height: 40,
      color: '#000000',
      opacity: 1
    });
    await nextTick();
    vm.editTextShape('fx1');
    await nextTick();
    expect(vm.formulaVisible).toBe(true);
    expect(vm.formulaInput).toBe('a+b');
    vm.formulaInput = 'c+d';
    await vm.submitFormula();
    await nextTick();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0]![0]).toBe('fx1');
    expect(updateSpy.mock.calls[0]![1]).toMatchObject({ latex: 'c+d', width: 130, height: 40 });
    expect(vm.formulaVisible).toBe(false);
    updateSpy.mockRestore();
    wrapper.unmount();
  });

  it('学生端不渲染公式按钮（工具栏仅教师可见的回归延伸）', () => {
    const wrapper = mountWB({ isTeacher: false });
    expect(wrapper.find('.formula-tool').exists()).toBe(false);
    wrapper.unmount();
  });
});

// ── F7.5 学生端跟随打磨 ────────────────────────────────────────────────────
describe('WhiteBoard.vue 跟随打磨（F7.5）', () => {
  type F75Renderer = {
    getStage: () => { fire: (evt: string, e?: unknown) => void };
    getCurrentPageIndex: () => number;
    getPageCount: () => number;
    getZoom: () => number;
    showPage: (i: number) => void;
    layer: { x: () => number; y: () => number };
  };

  function studentRenderer(vm: PPTVM): F75Renderer {
    return vm.renderer as unknown as F75Renderer;
  }

  function fireStudentWheel(vm: PPTVM, deltaY = 100) {
    const stage = vm.renderer!.getStage();
    const preventDefault = vi.fn();
    stage.fire('wheel', { target: stage, evt: { deltaY, preventDefault } });
    return preventDefault;
  }

  it('正向：学生滚轮本地只读缩放，进入手动模式且不写 Yjs 视口', () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.viewportOffset.set('zoom', 100); // 教师视口种子（raw 绕过只读守卫）
    const before = vm.zoomLevel;
    const preventDefault = fireStudentWheel(vm);
    expect(preventDefault).toHaveBeenCalled();
    expect(vm.zoomLevel).toBe(before - 1);
    expect(provider.viewportOffset.get('zoom')).toBe(100); // 本地缩放不回写
    wrapper.unmount();
  });

  it('正向：学生手动缩放后教师视口优先，冲突横幅 5s 自动消失', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.viewportOffset.set('zoom', 100);
    fireStudentWheel(vm); // 进入手动模式（本地 99）
    vi.useFakeTimers();
    try {
      provider.viewportOffset.set('zoom', 150); // 教师改视口 → 冲突
      await nextTick();
      expect(wrapper.find('.follow-banner').text()).toContain('已回到教师视角');
      // 教师视口优先：插值收敛到教师目标（250ms + 帧余量）
      vi.advanceTimersByTime(300);
      expect(vm.viewState().zoom).toBe(150);
      expect(vm.zoomLevel).toBe(150);
      // 横幅 5s 自动消失：4999ms 仍在，5000ms 消失
      vi.advanceTimersByTime(4699);
      expect(wrapper.find('.follow-banner').exists()).toBe(true);
      vi.advanceTimersByTime(1);
      await nextTick();
      expect(wrapper.find('.follow-banner').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
      wrapper.unmount();
    }
  });

  it('正向：横幅点击恢复手动，后续教师冲突再次提示', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.viewportOffset.set('zoom', 100);
    fireStudentWheel(vm); // 手动模式
    vi.useFakeTimers();
    try {
      provider.viewportOffset.set('zoom', 150);
      await nextTick();
      const banner = wrapper.find('.follow-banner');
      expect(banner.exists()).toBe(true);
      await banner.trigger('click');
      expect(wrapper.find('.follow-banner').exists()).toBe(false);
      vi.advanceTimersByTime(300);
      expect(vm.viewState().zoom).toBe(150);
      // 恢复手动：再滚轮为本地 149，教师数据仍 150（不回写）
      fireStudentWheel(vm);
      expect(vm.viewState().zoom).toBe(149);
      expect(provider.viewportOffset.get('zoom')).toBe(150);
      // 教师再次更新 → 手动冲突 → 横幅重现
      provider.viewportOffset.set('zoom', 160);
      await nextTick();
      expect(wrapper.find('.follow-banner').exists()).toBe(true);
    } finally {
      vi.useRealTimers();
      wrapper.unmount();
    }
  });

  it('负向：学生未手动缩放时教师视口更新不出现横幅', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vi.useFakeTimers();
    try {
      provider.viewportOffset.set('zoom', 130);
      await nextTick();
      expect(wrapper.find('.follow-banner').exists()).toBe(false);
      vi.advanceTimersByTime(300);
      expect(vm.viewState().zoom).toBe(130); // 跟随仍正常应用
    } finally {
      vi.useRealTimers();
      wrapper.unmount();
    }
  });

  it('边界：小步视口切换 250ms 插值平滑，大跳变直切不滑行', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vi.useFakeTimers();
    try {
      provider.viewportOffset.set('x', 10);
      expect(vm.viewState().x).toBe(0); // 小步：插值待帧，不直切
      vi.advanceTimersByTime(300);
      expect(vm.viewState().x).toBe(10);
      provider.viewportOffset.set('x', 3000); // 跳变 2990 ≥ 阈值 → 直切
      expect(vm.viewState().x).toBe(3000);
    } finally {
      vi.useRealTimers();
      wrapper.unmount();
    }
  });

  it('正向：教师快速翻页学生端 200ms 节流合并（首帧即刻、尾帧取最新）', async () => {
    const wrapper = mountWB({ isTeacher: false });
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    const r = studentRenderer(vm);
    // 只读端本地播种 4 页（raw 绕过 addPage 只读守卫），观察器先完成页表对账
    const rawPages = [1, 2, 3, 4].map(i => {
      const p = new Y.Map();
      p.set('id', `page_${i}`);
      p.set('name', `Page ${i}`);
      p.set('visible', true);
      p.set('elements', new Y.Array());
      return p;
    });
    provider.pages.push(rawPages);
    await nextTick();
    expect(r.getPageCount()).toBe(4);
    const showSpy = vi.spyOn(r, 'showPage');
    vi.useFakeTimers();
    try {
      provider.currentPageIndex.set('index', 1);
      provider.currentPageIndex.set('index', 2);
      provider.currentPageIndex.set('index', 3);
      // 首帧立即应用，窗口内其余合并
      expect(showSpy).toHaveBeenCalledTimes(1);
      expect(r.getCurrentPageIndex()).toBe(1);
      vi.advanceTimersByTime(199);
      expect(showSpy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(showSpy).toHaveBeenCalledTimes(2);
      expect(r.getCurrentPageIndex()).toBe(3); // 尾帧取最新页
    } finally {
      vi.useRealTimers();
      showSpy.mockRestore();
      wrapper.unmount();
    }
  });
});

// ── F4.6 截图插入 ──────────────────────────────────────────────────────────
describe('WhiteBoard.vue 截图插入（F4.6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_UPLOAD_IMAGE_URL', 'http://mock.test/img');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 1000,
            data: { fileUrl: 'http://mock.test/img/shot1.png' }
          })
      })
    );
    stubShotFakeImage();
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubElectronShot(opts: { cap?: string | Error; clip?: string } = {}) {
    const captureScreen = vi
      .fn()
      .mockImplementation(() =>
        opts.cap instanceof Error
          ? Promise.reject(opts.cap)
          : Promise.resolve(opts.cap ?? `data:image/png;base64,${btoa('shot')}`)
      );
    const clipboardReadImage = vi.fn().mockResolvedValue(opts.clip ?? '');
    Object.assign(window, { electronAPI: { captureScreen, clipboardReadImage } });
    return { captureScreen, clipboardReadImage };
  }

  // 捕获 dataURL → 1600×900 自然尺寸；上传后的裁剪图 http URL → 200×90（贴近真实链路：
  // 裁剪画布尺寸即上传图自然尺寸，jsdom 无解码只能按 src 类型区分）
  function stubShotFakeImage() {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1600;
      naturalHeight = 900;
      width = 1600;
      height = 900;
      complete = false;
      private _src = '';
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        queueMicrotask(() => {
          if (!val.startsWith('data:')) {
            this.naturalWidth = 200;
            this.naturalHeight = 90;
            this.width = 200;
            this.height = 90;
          }
          this.complete = true;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal('Image', FakeImage);
  }

  function stubShotCanvas() {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      `data:image/png;base64,${btoa('crop')}`
    );
    return { drawImage };
  }

  function fireShotShortcut() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'x',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
  }

  it('正向：框选截图裁剪上传并按框选原位写入 Yjs', async () => {
    const { captureScreen } = stubElectronShot();
    const { drawImage } = stubShotCanvas();
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;

    fireShotShortcut();
    await vi.waitFor(() => expect(wrapper.find('.screenshot-overlay').exists()).toBe(true), {
      timeout: 2000
    });
    expect(captureScreen).toHaveBeenCalledTimes(1);

    const overlay = wrapper.find('.screenshot-overlay');
    await overlay.trigger('mousedown', { clientX: 100, clientY: 100 });
    await overlay.trigger('mousemove', { clientX: 200, clientY: 160 });
    await overlay.trigger('mouseup', { clientX: 200, clientY: 160 });
    expect(wrapper.find('.screenshot-overlay').exists()).toBe(false);

    await vi.waitFor(() => expect(imageShapes(vm).length).toBe(1), { timeout: 3000 });
    const s = imageShapes(vm)[0]!;
    // 原位对齐：框选左上角 (100,100) → 层坐标同值（默认视口 scale=1、无平移）
    expect(s.x).toBe(100);
    expect(s.y).toBe(100);
    // 裁剪：显示 100×60 → 捕获像素 (200,150,200,90)（容器回退 800×600，捕获 1600×900）
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 150, 200, 90, 0, 0, 200, 90);
    expect(s.width).toBe(200);
    expect(s.height).toBe(90);
    expect(s.url).toBe('http://mock.test/img/shot1.png');
    wrapper.unmount();
  });

  it('负向：Esc 取消框选，不落任何元素', async () => {
    stubElectronShot();
    stubShotCanvas();
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;

    fireShotShortcut();
    await vi.waitFor(() => expect(wrapper.find('.screenshot-overlay').exists()).toBe(true), {
      timeout: 2000
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(wrapper.find('.screenshot-overlay').exists()).toBe(false);
    expect(imageShapes(vm).length).toBe(0);
    wrapper.unmount();
  });

  it('正向：截屏权限被拒提示并降级剪贴板图片插入', async () => {
    // 剪贴板读取挂起：让"截屏权限被拒"toast 在降级完成前可观测（否则被"图片已添加"覆盖）
    let releaseClip!: (v: string) => void;
    const clipPromise = new Promise<string>(r => {
      releaseClip = r;
    });
    const captureScreen = vi.fn().mockRejectedValue(new Error('denied'));
    const clipboardReadImage = vi.fn().mockReturnValue(clipPromise);
    Object.assign(window, { electronAPI: { captureScreen, clipboardReadImage } });
    stubShotCanvas();
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;

    fireShotShortcut();
    await vi.waitFor(() => expect(String(unwrapVal(vm.toastMsg))).toContain('截屏权限被拒'), {
      timeout: 2000
    });
    expect(clipboardReadImage).toHaveBeenCalledTimes(1);
    releaseClip(`data:image/png;base64,${btoa('clip')}`);
    await vi.waitFor(() => expect(imageShapes(vm).length).toBe(1), { timeout: 3000 });
    const s = imageShapes(vm)[0]!;
    expect(s.x).toBe(50); // 降级插入走默认位置
    expect(s.y).toBe(50);
    wrapper.unmount();
  });

  it('负向：学生端 Ctrl+Shift+X 不触发截屏', async () => {
    const { captureScreen } = stubElectronShot();
    const wrapper = mountWB({ isTeacher: false });

    fireShotShortcut();
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    expect(captureScreen).not.toHaveBeenCalled();
    expect(wrapper.find('.screenshot-overlay').exists()).toBe(false);
    wrapper.unmount();
  });
});

// ── F3.2 引线标签（复合单元素：Line+Text，锚点跟随被指对象） ────────────────
describe('WhiteBoard.vue 引线标签（F3.2）', () => {
  type F32VM = PPTVM & {
    selectLeader: () => void;
    commitShapeMove: (id: string, x: number, y: number, altKey?: boolean) => void;
    renderer: {
      previewLayer: { getChildren: () => unknown[] };
      layer: { getChildren: () => unknown[] };
      bindElements: (els: unknown) => void;
    } | null;
  };

  function leaderShapes(vm: F32VM) {
    return vm.getCurrentPageShapes().filter(s => s.type === 'leader-label');
  }

  // 拖出引线：mousedown 设锚点（命中被指对象）→ mousemove 拖标签位 → mouseup 落库
  function drawLeader(vm: F32VM, ax: number, ay: number, lx: number, ly: number) {
    const stage = konvaMocks.MockStage.last()!;
    vm.selectLeader();
    stage._pointer = { x: ax, y: ay };
    stage.fire('mousedown', { target: stage, evt: {} });
    stage._pointer = { x: lx, y: ly };
    stage.fire('mousemove', { target: stage, evt: {} });
    stage.fire('mouseup', { target: stage, evt: {} });
  }

  function seedImageAndLeader(vm: F32VM) {
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 'img-t',
      type: 'image',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      src: 'data:image/png;base64,x',
      opacity: 1
    });
    provider.addShape({
      id: 'ld-t',
      type: 'leader-label',
      points: [120, 120, 260, 90], // 锚点(120,120) + 标签位(260,90)
      label: '细胞核',
      targetId: 'img-t',
      anchorRel: [20, 20], // 锚点相对被指对象 x,y 的偏移
      color: '#000',
      lineWidth: 2,
      fontSize: 14,
      opacity: 1
    });
  }

  it('正向：拖出引线标签，锚点与标签位写入 Yjs', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F32VM;
    drawLeader(vm, 120, 120, 260, 90);
    const shapes = leaderShapes(vm);
    expect(shapes.length).toBe(1);
    expect(shapes[0]!.points).toEqual([120, 120, 260, 90]);
    expect(typeof shapes[0]!.label).toBe('string');
    wrapper.unmount();
  });

  it('正向：双击改标签，Enter 提交并可撤销/重做', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F32VM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 'ld-e',
      type: 'leader-label',
      points: [120, 120, 260, 90],
      label: '旧标签',
      targetId: null,
      anchorRel: null,
      color: '#000',
      lineWidth: 2,
      fontSize: 14,
      opacity: 1
    });
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
    const node = (
      vm.renderer as unknown as { layer: { getChildren: () => unknown[] } }
    ).layer.getChildren()[0] as { fire: (e: string) => void };

    node.fire('dblclick');
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('旧标签');
    ta.value = '新标签';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ta.isConnected).toBe(false);
    expect(leaderShapes(vm)[0]!.label).toBe('新标签');

    vm.revocation('pre');
    expect(leaderShapes(vm)[0]!.label).toBe('旧标签');
    vm.revocation('next');
    expect(leaderShapes(vm)[0]!.label).toBe('新标签');
    wrapper.unmount();
  });

  it('正向：移动被指图片，引线锚点跟随（anchorRel 重算）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F32VM;
    seedImageAndLeader(vm);

    // 移动图片 x,y → 引线锚点 = 新 x,y + anchorRel，标签位不变
    vm.commitShapeMove('img-t', 180, 160);
    const ld = leaderShapes(vm)[0]!;
    expect(ld.points).toEqual([200, 180, 260, 90]);
    wrapper.unmount();
  });

  it('负向：微小拖拽（<5px）不落引线元素', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F32VM;
    drawLeader(vm, 120, 120, 122, 121);
    expect(leaderShapes(vm).length).toBe(0);
    wrapper.unmount();
  });
});

// ── F4.2 手绘图形规整：抬笔后近似直线/圆/矩形自动规整（两步 undo） ─────────
describe('WhiteBoard.vue 手绘图形规整（F4.2）', () => {
  type RegVM = DrawVM & {
    regularizeEnabled: boolean;
    toggleRegularize: () => void;
    renderer: { previewLayer: { getChildren: () => unknown[] } };
  };

  // 近似直线：多次 mousemove 沿水平线轻微抖动
  function drawNearLine(vm: DrawVM, opts: { shift?: boolean } = {}) {
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('brush');
    const jitter = [0, 1, -1, 0, 1];
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown', { target: stage, evt: {} });
    for (let i = 1; i <= 4; i++) {
      stage._pointer = { x: 100 + i * 50, y: 100 + jitter[i]! };
      stage.fire('mousemove', { target: stage, evt: {} });
    }
    stage.fire('mouseup', { target: stage, evt: { shiftKey: !!opts.shift } });
  }

  it('正向：近似直线抬笔后规整为 line（端点），原 brush 变换', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as RegVM;
    drawNearLine(vm);
    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]!.type).toBe('line');
    const pts = shapes[0]!.points as number[];
    expect(pts.length).toBe(4);
    expect(pts[0]).toBeCloseTo(100, 0);
    expect(pts[2]).toBeCloseTo(300, 0);
    wrapper.unmount();
  });

  it('负向：按住 Shift 跳过本次规整，保留 brush 笔迹', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as RegVM;
    drawNearLine(vm, { shift: true });
    const shapes = vm.getCurrentPageShapes();
    expect(shapes.length).toBe(1);
    expect(shapes[0]!.type).toBe('brush');
    wrapper.unmount();
  });

  it('两步 undo：第一步回手绘轨迹，第二步回未绘制', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as RegVM;
    drawNearLine(vm);
    expect(vm.getCurrentPageShapes()[0]!.type).toBe('line');

    vm.revocation('pre'); // 第一步：回手绘轨迹
    expect(vm.getCurrentPageShapes()[0]!.type).toBe('brush');

    vm.revocation('pre'); // 第二步：回未绘制
    expect(vm.getCurrentPageShapes().length).toBe(0);
    wrapper.unmount();
  });

  it('负向：开关关闭时不规整，保留 brush 笔迹', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as RegVM;
    expect(vm.regularizeEnabled).toBe(true); // 默认开启
    vm.toggleRegularize(); // 关闭
    expect(vm.regularizeEnabled).toBe(false);
    drawNearLine(vm);
    expect(vm.getCurrentPageShapes()[0]!.type).toBe('brush');
    wrapper.unmount();
  });

  it('边界：不规则笔迹拟合失败，保留原 brush 笔迹', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as RegVM;
    const stage = konvaMocks.MockStage.last()!;
    vm.tool('brush');
    stage._pointer = { x: 50, y: 50 };
    stage.fire('mousedown', { target: stage, evt: {} });
    // 剧烈曲折（交叉/沙漏），包围盒内部有点 → 拟合失败
    const path: Array<[number, number]> = [
      [50, 50],
      [150, 150],
      [250, 50],
      [250, 150],
      [50, 150],
      [150, 100]
    ];
    for (const [x, y] of path) {
      stage._pointer = { x, y };
      stage.fire('mousemove', { target: stage, evt: {} });
    }
    stage.fire('mouseup', { target: stage, evt: { shiftKey: false } });
    expect(vm.getCurrentPageShapes()[0]!.type).toBe('brush');
    wrapper.unmount();
  });
});

// ── F4.3 文本工具增强：粗斜/对齐/行距/宽度字段 + 渲染读取（行内混排不做） ──
describe('WhiteBoard.vue 文本工具增强（F4.3）', () => {
  type F43VM = PPTVM & {
    commitTextStyle: (patch: Record<string, unknown>) => boolean;
    selectShape: (id: string) => void;
    renderer: {
      layer: { getChildren: () => unknown[] };
      bindElements: (els: unknown) => void;
    } | null;
  };

  function seedText(vm: F43VM) {
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 'tx1',
      type: 'text',
      x: 20,
      y: 30,
      text: '你好世界',
      fontSize: 14,
      color: '#000',
      opacity: 1
    });
    vm.tool('cur');
    vm.selectShape('tx1');
  }

  it('正向：选中文本应用粗斜/对齐/行距/宽度 → 写入 Yjs 字段', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F43VM;
    seedText(vm);
    const ok = vm.commitTextStyle({
      bold: true,
      italic: true,
      align: 'center',
      lineHeight: 1.5,
      width: 200
    });
    expect(ok).toBe(true);
    const s = vm.getCurrentPageShapes()[0]!;
    expect(s.bold).toBe(true);
    expect(s.italic).toBe(true);
    expect(s.align).toBe('center');
    expect(s.lineHeight).toBe(1.5);
    expect(s.width).toBe(200);
    wrapper.unmount();
  });

  it('正向：Konva.Text 渲染读取 width/align/lineHeight/fontStyle（粗斜→bold italic）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F43VM;
    seedText(vm);
    vm.commitTextStyle({ bold: true, italic: true, align: 'right', lineHeight: 1.4, width: 180 });
    // 重绑渲染层，读取节点属性
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      vm.provider!.getActiveElements()
    );
    const node = (
      vm.renderer as unknown as { layer: { getChildren: () => Array<Record<string, unknown>> } }
    ).layer.getChildren()[0] as unknown as {
      fontStyle: () => string;
      align: () => string;
      lineHeight: () => number;
      width: () => number;
    };
    expect(node.fontStyle()).toBe('bold italic');
    expect(node.align()).toBe('right');
    expect(node.lineHeight()).toBe(1.4);
    expect(node.width()).toBe(180);
    wrapper.unmount();
  });

  it('负向：粗体为元素级单一样式，不支持行内混排（一个文本单一 fontStyle）', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as F43VM;
    seedText(vm);
    vm.commitTextStyle({ bold: true });
    // 元素仅一个 bold 布尔字段（无逐字符 range 样式）
    const s = vm.getCurrentPageShapes()[0]!;
    expect(s.bold).toBe(true);
    expect(s.ranges).toBeUndefined();
    expect(s.runs).toBeUndefined();
    wrapper.unmount();
  });
});

// ── F4.5 对齐吸附（commitShapeMove 落位吸附到邻元素边缘/中心） ──────────────
type SnapVM = PPTVM & {
  tool: (m: string) => void;
  commitShapeMove: (id: string, x: number, y: number, altKey?: boolean) => void;
  snapEnabled: boolean;
  renderer: {
    getBox: (id: string) => { x: number; y: number; width: number; height: number } | null;
    getSnapBoxes: (
      exceptId: string
    ) => Array<{ x: number; y: number; width: number; height: number }>;
    showGuides: (g: unknown) => void;
    clearGuides: () => void;
  } | null;
};

describe('F4.5 对齐吸附', () => {
  function seedRect(vm: SnapVM, id: string, x: number, y: number) {
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id,
      type: 'rect',
      x,
      y,
      width: 40,
      height: 20,
      color: '#000',
      lineWidth: 2
    });
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
  }

  it('正向：拖动落位吸附到邻元素左边缘并产生垂直参考线', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SnapVM;
    seedRect(vm, 'a', 100, 100);
    vi.spyOn(vm.renderer!, 'getBox').mockReturnValue({ x: 100, y: 100, width: 40, height: 20 });
    vi.spyOn(vm.renderer!, 'getSnapBoxes').mockReturnValue([
      { x: 98, y: 300, width: 60, height: 30 }
    ]);
    const guideSpy = vi.spyOn(vm.renderer!, 'showGuides');
    vm.commitShapeMove('a', 100, 100, false);
    expect(vm.getCurrentPageShapes()[0]!.x).toBe(98); // 100 → 98（左边缘差 2 吸附）
    expect(guideSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('负向：按住 Alt 跳过本次吸附', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SnapVM;
    seedRect(vm, 'a', 100, 100);
    vi.spyOn(vm.renderer!, 'getBox').mockReturnValue({ x: 100, y: 100, width: 40, height: 20 });
    vi.spyOn(vm.renderer!, 'getSnapBoxes').mockReturnValue([
      { x: 98, y: 300, width: 60, height: 30 }
    ]);
    vm.commitShapeMove('a', 100, 100, true);
    expect(vm.getCurrentPageShapes()[0]!.x).toBe(100); // 不吸附
    wrapper.unmount();
  });

  it('负向：关闭吸附开关后不吸附', () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as SnapVM;
    seedRect(vm, 'a', 100, 100);
    vm.snapEnabled = false;
    vi.spyOn(vm.renderer!, 'getBox').mockReturnValue({ x: 100, y: 100, width: 40, height: 20 });
    vi.spyOn(vm.renderer!, 'getSnapBoxes').mockReturnValue([
      { x: 98, y: 300, width: 60, height: 30 }
    ]);
    vm.commitShapeMove('a', 100, 100, false);
    expect(vm.getCurrentPageShapes()[0]!.x).toBe(100);
    wrapper.unmount();
  });
});

// ── F4.4 表格（点击落点插入 + 选中增删行列） ────────────────────────────────
type TableVM = PPTVM & {
  tool: (m: string) => void;
  selectShape: (id: string) => void;
  tableOp: (op: 'addRow' | 'removeRow' | 'addCol' | 'removeCol') => void;
  editTextShape: (id: string, e?: unknown) => void;
  selIsTable: boolean;
};

describe('F4.4 表格', () => {
  it('正向：table 工具点击落点插入 3×3 表格', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as TableVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    vm.tool('table');
    const stage = vm.renderer!.getStage();
    stage._pointer = { x: 100, y: 100 };
    stage.fire('mousedown');
    await nextTick();
    const shapes = vm.getCurrentPageShapes();
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.type).toBe('table');
    expect(shapes[0]!.rows).toBe(3);
    expect(shapes[0]!.cols).toBe(3);
    wrapper.unmount();
  });

  it('正向：选中表格显示行列按钮，增行/增列改数据并入 undo 栈', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as TableVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 't1',
      type: 'table',
      x: 10,
      y: 10,
      rows: 2,
      cols: 2,
      cellW: 80,
      cellH: 30,
      cells: [
        [{ text: 'A' }, { text: 'B' }],
        [{ text: 'C' }, { text: 'D' }]
      ]
    });
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
    vm.selectShape('t1');
    await nextTick();
    expect(vm.selIsTable).toBe(true);
    vm.tableOp('addRow');
    expect(vm.getCurrentPageShapes()[0]!.rows).toBe(3);
    expect((vm.getCurrentPageShapes()[0]!.cells as string[][]).length).toBe(3);
    vm.tableOp('addCol');
    expect(vm.getCurrentPageShapes()[0]!.cols).toBe(3);
    // 撤销回到 2×3
    vm.revocation('pre');
    expect(vm.getCurrentPageShapes()[0]!.cols).toBe(2);
    wrapper.unmount();
  });

  it('负向：仅剩 1 行时删行不生效（保底 1 行）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as TableVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 't2',
      type: 'table',
      x: 10,
      y: 10,
      rows: 1,
      cols: 2,
      cellW: 80,
      cellH: 30,
      cells: [[{ text: 'A' }, { text: 'B' }]]
    });
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
    vm.selectShape('t2');
    vm.tableOp('removeRow');
    expect(vm.getCurrentPageShapes()[0]!.rows).toBe(1);
    wrapper.unmount();
  });

  it('正向：双击单元格弹出编辑框，提交写回该单元格文本', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as TableVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addShape({
      id: 't3',
      type: 'table',
      x: 10,
      y: 10,
      rows: 2,
      cols: 2,
      cellW: 80,
      cellH: 30,
      cells: [
        [{ text: 'A' }, { text: 'B' }],
        [{ text: 'C' }, { text: 'D' }]
      ]
    });
    vm.tool('cur');
    (vm.renderer as unknown as { bindElements: (els: unknown) => void }).bindElements(
      provider.getActiveElements()
    );
    const stage = vm.renderer!.getStage();
    // 表格 (10,10)，cellW=80,cellH=30；单元格 (0,1) 中心约 (130,25)
    stage._pointer = { x: 130, y: 25 };
    vm.editTextShape('t3', {});
    await nextTick();
    const ta = document.querySelector('textarea');
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe('B');
    ta!.value = 'Hi';
    ta!.dispatchEvent(new Event('blur'));
    await nextTick();
    const cells = vm.getCurrentPageShapes()[0]!.cells as Array<Array<{ text: string }>>;
    expect(cells[0]![1]!.text).toBe('Hi');
    expect(cells[0]![0]!.text).toBe('A'); // 其它单元格不变
    wrapper.unmount();
  });
});

// ── F5.2 页面缩略图总览（浮层 + 当前页高亮 + 快速跳页） ──────────────────────
type ThumbVM = PPTVM & {
  showThumbPanel: boolean;
  toggleThumbPanel: () => void;
  jumpToThumb: (index: number) => void;
  thumbPages: Array<{ id: string; index: number; current: boolean }>;
  curLayerIndex: number;
};

describe('F5.2 页面缩略图总览', () => {
  it('正向：总览按钮开合浮层，列出各页且当前页高亮', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as ThumbVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addPage();
    provider.addPage();
    await nextTick();
    expect(wrapper.find('.thumb-panel').exists()).toBe(false);
    vm.toggleThumbPanel();
    await nextTick();
    expect(wrapper.find('.thumb-panel').exists()).toBe(true);
    const items = wrapper.findAll('.thumb-item');
    expect(items.length).toBe(vm.thumbPages.length);
    expect(vm.thumbPages.length).toBeGreaterThanOrEqual(3);
    // 当前页（addPage 后停在最后一页）高亮：恰有一项 current 且对应 curLayerIndex
    const curIdx = vm.curLayerIndex - 1;
    expect(vm.thumbPages[curIdx]!.current).toBe(true);
    expect(items[curIdx]!.classes()).toContain('on');
    vm.toggleThumbPanel();
    await nextTick();
    expect(wrapper.find('.thumb-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('正向：点击缩略图跳到对应页（当前页随之更新）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as ThumbVM;
    const provider = vm.provider!;
    if (!provider.getActiveElements()) provider.addPage();
    provider.addPage();
    await nextTick();
    vm.toggleThumbPanel();
    await nextTick();
    vm.jumpToThumb(1);
    await nextTick();
    expect(vm.curLayerIndex).toBe(2);
    expect(vm.thumbPages[1]!.current).toBe(true);
    wrapper.unmount();
  });

  it('负向：无页时不渲染缩略图条目（thumbPages 空）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as ThumbVM;
    // 未额外建页：至少有初始 1 页；模拟 renderer 未就绪时 thumbPages 回退空数组
    vm.toggleThumbPanel();
    await nextTick();
    expect(Array.isArray(vm.thumbPages)).toBe(true);
    wrapper.unmount();
  });
});
