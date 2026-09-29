import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { YjsProvider } from './whiteboard/YjsProvider';

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
    constructor(_opts?: unknown) { MockStage.instances.push(this); }
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
    off() { this._handlers = {}; }
    on(evt: string, cb: (e?: unknown) => void) {
      evt.split(' ').forEach(k => { this._handlers[k] = cb; });
    }
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
    destroyChildren() { this.children = []; }
    add(_child: unknown) { this.children.push(_child); }
    x(_val?: unknown) { if (_val !== undefined) this._x = _val as number; return this._x; }
    y(_val?: unknown) { if (_val !== undefined) this._y = _val as number; return this._y; }
    width() { return 800; }
    height() { return 600; }
    // 有状态：showPage/setZoom 会写入层缩放，视口同步用例据此断言重应用
    _sx = 1;
    _sy = 1;
    scaleX(_val?: unknown) { if (_val !== undefined) this._sx = _val as number; return this._sx; }
    scaleY(_val?: unknown) { if (_val !== undefined) this._sy = _val as number; return this._sy; }
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
    _x = 0;
    _y = 0;
    _width = 100;
    _height = 100;
    _scaleX = 1;
    _scaleY = 1;
    _draggable = false;
    _handlers: Record<string, (e?: unknown) => void> = {};
    constructor() {}
    show() {}
    hide() {}
    draw() {}
    batchDraw() {}
    destroy() {}
    getAttrs() {
      return {
        x: this._x, y: this._y, width: this._width, height: this._height,
        scaleX: this._scaleX, scaleY: this._scaleY, offsetX: 0, offsetY: 0,
        visible: true, image: { currentSrc: '' }
      };
    }
    setAttrs(_a: unknown) {}
    zIndex(_val?: unknown) { return 0; }
    getClientRect() { return { x: 0, y: 0, width: 100, height: 100 }; }
    scaleX(_val?: unknown) { if (_val !== undefined) this._scaleX = _val as number; return this._scaleX; }
    scaleY(_val?: unknown) { if (_val !== undefined) this._scaleY = _val as number; return this._scaleY; }
    visible() { return true; }
    getAttr(_key: string) {
      if (_key === 'visible') return true;
      if (_key === 'image') return { currentSrc: '' };
      return 0;
    }
    getClassName() { return 'Node'; }
    add(_child: unknown) {}
    draggable(_val?: unknown) { if (_val !== undefined) this._draggable = _val as boolean; return this._draggable; }
    getPointerPosition() { return { x: 100, y: 100 }; }
    off(_evt?: string) { this._handlers = {}; return this; }
    on(evt: string, cb: (e?: unknown) => void) {
      evt.split(' ').forEach(k => { this._handlers[k] = cb; });
      return this;
    }
    fire(evt: string, e?: unknown) { this._handlers[evt]?.(e); }
    x(_val?: unknown) { if (_val !== undefined) this._x = _val as number; return this._x; }
    y(_val?: unknown) { if (_val !== undefined) this._y = _val as number; return this._y; }
    width(_val?: unknown) { if (_val !== undefined) this._width = _val as number; return this._width; }
    height(_val?: unknown) { if (_val !== undefined) this._height = _val as number; return this._height; }
  }

  class MockLine extends MockNode {
    _points: number[] = [];
    points(_val?: number[]) { if (_val !== undefined) this._points = _val; return this._points; }
  }
  class MockArrow extends MockNode {
    _points: number[] = [];
    points(_val?: number[]) { if (_val !== undefined) this._points = _val; return this._points; }
  }
  class MockText extends MockNode {
    text(_val?: unknown) { return ''; }
    fontSize(_val?: unknown) { return 14; }
    fontFamily(_val?: unknown) { return 'Arial'; }
    fill(_val?: unknown) { return '#000'; }
    align(_val?: unknown) { return 'left'; }
    lineHeight(_val?: unknown) { return 1.1; }
  }
  class MockCircle extends MockNode {
    _radius = 0;
    radius(_val?: unknown) { if (_val !== undefined) this._radius = _val as number; return this._radius; }
  }
  class MockRect extends MockNode {}
  class MockImage extends MockNode {}
  class MockTransformer extends MockNode {
    _nodes: unknown[] = [];
    _keepRatio = false;
    nodes(v?: unknown[]) { if (v !== undefined) this._nodes = v; return this._nodes; }
    keepRatio(v?: boolean) { if (v !== undefined) this._keepRatio = v; return this._keepRatio; }
  }
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

// 房内上传后登记课件表 + 进房自动导入课件的 API；测试中不得打真实网络
const liveMocks = vi.hoisted(() => ({
  saveCourseware: vi.fn(),
  coursewareList: vi.fn(),
  deleteCourseware: vi.fn(),
}));

vi.mock('@/api/backstage', () => ({
  default: {
    save_courseware: (params: unknown) => liveMocks.saveCourseware(params),
    courseware_list: (params: unknown) => liveMocks.coursewareList(params),
    delete_courseware: (params: unknown) => liveMocks.deleteCourseware(params),
  },
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
import { getPdfPageCount, getPdfPageDims } from './whiteboard/pdfAsset';

// pdf.js 管线在单测中不可用（worker/网络），mock 模块级 API
vi.mock('./whiteboard/pdfAsset', () => ({
  loadPdfDoc: vi.fn(),
  getPdfPageCount: vi.fn(),
  getPdfPageDims: vi.fn(),
  renderPdfPage: vi.fn(() => Promise.reject(new Error('test: pdf render unavailable'))),
}));

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
  fileList: Array<{ filename: string; filext: string; fileid: string; fileurl?: string }> | { value: Array<{ filename: string; filext: string; fileid: string; fileurl?: string }> };
  curLayerIndex: number | { value: number };
  toastMsg: string | { value: string };
  showFile: (ids: string) => boolean;
  showLayer: (index: number) => void;
  openCourseware: (item: { filename: string; fileid: string; fileurl?: string }, index: number) => Promise<void>;
  delFile: (i: number) => Promise<void>;
  delLayer: (index: number) => void;
  setFileItemId: (index: number, fileid: string) => void;
  addLayer: () => void;
  rendererPageCount: () => number;
  renderedShapeCount: () => number;
  getCurrentPageShapes: () => Array<Record<string, unknown>>;
  importServerCoursewares: () => Promise<void>;
  provider: YjsProvider | null;
  viewState: () => { zoom: number; layerScale: number; x: number; y: number; stageX: number; stageY: number };
  revocation: (type: string) => void;
};

function unwrapVal<T>(v: T | { value: T }): T {
  return v !== null && typeof v === 'object' && 'value' in (v as object)
    ? ((v as { value: T }).value)
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
    liveMocks.saveCourseware.mockResolvedValue({ data: { code: 1000, data: null } });
    liveMocks.coursewareList.mockResolvedValue({ data: { code: 1000, data: { list: [], pageInfo: { totalElements: 0 } } } });
    liveMocks.deleteCourseware.mockResolvedValue({ data: { code: 1000, data: null } });
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
        : Promise.resolve({ w: 1000, h: 500 }),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 1000,
          data: { fileUrl: 'http://mock.test/ppt/deck.pdf' },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const input = wrapper.find('input[accept=".ppt,.pptx"]');
    expect(input.exists()).toBe(true);
    const file = new File(['x'], '测试课件.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
    );
    // 第 2 次上传同样仅登记
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(2);
      },
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
    );
    // delFile 按 fileurl 回查服务端列表定位记录 id
    liveMocks.coursewareList.mockResolvedValue({
      data: {
        code: 1000,
        data: { list: [{ id: 'cw9', fileUrl: 'http://mock.test/ppt/deck.pdf' }], pageInfo: { totalElements: 1 } },
      },
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
      { timeout: 3000 },
    );
    liveMocks.coursewareList.mockResolvedValue({
      data: {
        code: 1000,
        data: { list: [{ id: 'cw9', fileUrl: 'http://mock.test/ppt/deck.pdf' }], pageInfo: { totalElements: 1 } },
      },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
    );
    await vm.openCourseware(unwrapVal(vm.fileList)[0]!, 0);
    expect(vm.rendererPageCount()).toBe(2);

    // 服务端记录已在「我的直播」对话框中被删除 → 列表为空
    liveMocks.coursewareList.mockResolvedValue({
      data: { code: 1000, data: { list: [], pageInfo: { totalElements: 0 } } },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 3000 },
    );
    expect(liveMocks.saveCourseware).toHaveBeenCalledTimes(1);
    expect(liveMocks.saveCourseware).toHaveBeenCalledWith({
      roomId: '1001',
      filename: '测试课件',
      filext: 'pptx',
      filesize: 1,
      fileUrl: 'http://mock.test/ppt/deck.pdf',
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
      { timeout: 3000 },
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
      { timeout: 3000 },
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
      { timeout: 1000 },
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
      { timeout: 3000 },
    );
    vm.provider!.fileList.get(0).set('filename', '远端改名');
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList)[0]!.filename).toBe('远端改名');
      },
      { timeout: 1000 },
    );
    wrapper.unmount();
  });

  it('教师缩放/全览写入 Yjs 视口', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    vm.layerZoomChange('add');
    expect(provider.viewportOffset.get('zoom')).toBe(101);
    // 空画布全览 → 回 100%、stage 归零，三项均写入 Yjs
    vm.layerZoomChange('all');
    expect(provider.viewportOffset.get('zoom')).toBe(100);
    expect(provider.viewportOffset.get('sx')).toBe(0);
    expect(provider.viewportOffset.get('sy')).toBe(0);
    wrapper.unmount();
  });

  it('远端视口变化（缩放/平移/全览位移）本地跟随应用', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    const provider = vm.provider!;
    provider.setViewportZoom(150);
    provider.setViewportStage(10, -20);
    provider.setViewportOffset(5, 6);
    await vi.waitFor(
      () => {
        const vs = vm.viewState();
        expect(vs.zoom).toBe(150);
        expect(vs.layerScale).toBeCloseTo(1.5, 5);
        expect(vs.x).toBe(5);
        expect(vs.y).toBe(6);
        expect(vs.stageX).toBe(10);
        expect(vs.stageY).toBe(-20);
      },
      { timeout: 1000 },
    );
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
      { timeout: 1000 },
    );
    vm.addLayer();
    // 新页是独立 Layer，showPage 必须把缩放/平移重应用上去，否则层 scale 掉回 1
    await vi.waitFor(
      () => {
        expect(vm.viewState().layerScale).toBeCloseTo(1.5, 5);
      },
      { timeout: 1000 },
    );
    expect(vm.viewState().zoom).toBe(150);
    wrapper.unmount();
  });
});

// ── 进房自动导入服务端课件 ────────────────────────────────────────────────
describe('WhiteBoard.vue 进房导入服务端课件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
    liveMocks.saveCourseware.mockResolvedValue({ data: { code: 1000, data: null } });
    liveMocks.deleteCourseware.mockResolvedValue({ data: { code: 1000, data: null } });
    liveMocks.coursewareList.mockResolvedValue({
      data: {
        code: 1000,
        data: {
          list: [
            {
              id: 'cw1',
              filename: '课前预习',
              filext: 'pptx',
              filesize: 2048,
              fileUrl: 'http://mock.test/ppt/deck.pdf',
            },
          ],
          pageInfo: { totalElements: 1 },
        },
      },
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
      { timeout: 3000 },
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
              data: { fileUrl: `http://mock.test/img/pic${uploadCount}.png` },
            }),
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
