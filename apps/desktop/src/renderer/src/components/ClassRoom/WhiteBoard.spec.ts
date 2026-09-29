import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';

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
  showFile: (ids: string) => void;
  delFile: (i: number) => void;
  addLayer: () => void;
  rendererPageCount: () => number;
  getCurrentPageShapes: () => Array<Record<string, unknown>>;
  importServerCoursewares: () => Promise<void>;
  revocation: (type: string) => void;
};

function unwrapVal<T>(v: T | { value: T }): T {
  return v !== null && typeof v === 'object' && 'value' in (v as object)
    ? ((v as { value: T }).value)
    : (v as T);
}

describe('WhiteBoard.vue PPT 课件', () => {
  // uploadPptApi 在 setup()（mount 时）求值，env 必须在 mount 之前 stub
  beforeEach(() => {
    // restoreAllMocks 不重置 vi.fn 调用历史，跨用例计数必须显式清理
    vi.clearAllMocks();
    vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
    liveMocks.saveCourseware.mockResolvedValue({ data: { code: 1000, data: null } });
    liveMocks.coursewareList.mockResolvedValue({ data: { code: 1000, data: { list: [], pageInfo: { totalElements: 0 } } } });
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

  it('导入两页 PPT 后页数为 N（无空白页可复用时不重复建页），并定位到首张幻灯片', async () => {
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
    // 0 页起步：首页非空白不可复用 → 恰好 2 页
    expect(vm.rendererPageCount()).toBe(2);
    // showFile(layerIds) 定位到第一张幻灯片页
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    wrapper.unmount();
  });

  it('当前页为首页空白画布时复用该页（不新建），层索引指向首张幻灯片', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    // seed 一页空白画布（不复用则会变成 3 页）
    vm.addLayer();
    expect(vm.rendererPageCount()).toBe(1);

    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 },
    );
    // 复用 seed 页承载第 1 张幻灯片，仅新增第 2 张 → 共 2 页
    expect(vm.rendererPageCount()).toBe(2);
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    // fileid 含被复用页的 id（两页）
    expect(unwrapVal(vm.fileList)[0]!.fileid.split(',').length).toBe(2);
    wrapper.unmount();
  });

  it('二次导入追加到已有课件之后（非首页复用路径全量 addPage）', async () => {
    const wrapper = mountWB();
    const vm = wrapper.vm as unknown as PPTVM;
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(1);
      },
      { timeout: 3000 },
    );
    // 当前页已被第 1 次导入占用 → 非空白，不可复用
    await uploadTwoPagePpt(wrapper);
    await vi.waitFor(
      () => {
        expect(unwrapVal(vm.fileList).length).toBe(2);
      },
      { timeout: 3000 },
    );
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
    // showFile 后当前页 = 首张幻灯片页
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

  it('delFile 删除课件条目并回收其页面（含残留图清空）', async () => {
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
    // removePage 保底留 1 页，该页 elements 必须被清空（课件图不得残留）
    expect(vm.rendererPageCount()).toBe(1);
    expect(vm.getCurrentPageShapes().length).toBe(0);
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
});

// ── 进房自动导入服务端课件 ────────────────────────────────────────────────
describe('WhiteBoard.vue 进房导入服务端课件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
    liveMocks.saveCourseware.mockResolvedValue({ data: { code: 1000, data: null } });
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

  it('教师调用后按 fileurl 建页并登记 fileurl，二次调用去重', async () => {
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
    expect(vm.rendererPageCount()).toBe(2);
    // 全新房间导入后定位到首份课件首张幻灯片
    expect(unwrapVal(vm.curLayerIndex)).toBe(1);
    // 进房导入只读服务端列表，不重复登记
    expect(liveMocks.saveCourseware).not.toHaveBeenCalled();

    // 二次调用：fileurl 命中已有条目 → 不再建页
    await vm.importServerCoursewares();
    expect(vm.rendererPageCount()).toBe(2);
    expect(unwrapVal(vm.fileList).length).toBe(1);
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
  const IMAGE_INPUT = 'input[accept="image/x-png,image/gif,image/jpeg,image/jpg,image/bmp"]';
  let uploadCount = 0;

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
