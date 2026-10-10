import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Minimal Konva mock covering what KonvaRenderer uses ─────────────────
const konvaMocks = vi.hoisted(() => {
  class MockStage {
    children: unknown[] = [];
    private _w: number;
    private _h: number;
    private _x = 0;
    private _y = 0;
    constructor(opts?: { width?: number; height?: number }) {
      this._w = opts?.width ?? 0;
      this._h = opts?.height ?? 0;
    }
    add(child: unknown) {
      this.children.push(child);
    }
    width() {
      return this._w;
    }
    height() {
      return this._h;
    }
    batchDraw() {}
    x(v?: number) {
      if (v !== undefined) this._x = v;
      return this._x;
    }
    y(v?: number) {
      if (v !== undefined) this._y = v;
      return this._y;
    }
    destroy() {}
  }

  class MockLayer {
    children: unknown[] = [];
    batchDrawCalls = 0;
    visible = true;
    _x = 0;
    _y = 0;
    _sx = 1;
    _sy = 1;
    add(child: unknown) {
      this.children.push(child);
      (child as { _layer?: MockLayer | null })._layer = this;
    }
    show() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    batchDraw() {
      this.batchDrawCalls += 1;
    }
    destroyChildren() {
      this.children.forEach(c => {
        (c as { _layer?: MockLayer | null })._layer = null;
      });
      this.children = [];
    }
    destroy() {}
    x(v?: number) {
      if (v !== undefined) this._x = v;
      return this._x;
    }
    y(v?: number) {
      if (v !== undefined) this._y = v;
      return this._y;
    }
    scaleX(v?: number) {
      if (v !== undefined) this._sx = v;
      return this._sx;
    }
    scaleY(v?: number) {
      if (v !== undefined) this._sy = v;
      return this._sy;
    }
    getChildren() {
      return this.children;
    }
    moveToTop() {}
  }

  class MockImage {
    attrs: Record<string, unknown>;
    _layer: MockLayer | null = null;
    _handlers: Record<string, (e?: unknown) => void> = {};
    _draggable = false;
    _x = 0;
    _y = 0;
    _w = 0;
    _h = 0;
    _sx = 1;
    _sy = 1;
    constructor(attrs: Record<string, unknown>) {
      this.attrs = attrs;
      if (attrs.x !== undefined) this._x = attrs.x as number;
      if (attrs.y !== undefined) this._y = attrs.y as number;
      if (attrs.width !== undefined) this._w = attrs.width as number;
      if (attrs.height !== undefined) this._h = attrs.height as number;
    }
    getLayer() {
      return this._layer;
    }
    on(evt: string, cb: (e?: unknown) => void) {
      this._handlers[evt] = cb;
      return this;
    }
    off(_evt?: string) {
      this._handlers = {};
      return this;
    }
    fire(evt: string, e?: unknown) {
      this._handlers[evt]?.(e);
    }
    draggable(v?: boolean) {
      if (v !== undefined) this._draggable = v;
      return this._draggable;
    }
    x(v?: number) {
      if (v !== undefined) this._x = v;
      return this._x;
    }
    y(v?: number) {
      if (v !== undefined) this._y = v;
      return this._y;
    }
    width(v?: number) {
      if (v !== undefined) this._w = v;
      return this._w;
    }
    height(v?: number) {
      if (v !== undefined) this._h = v;
      return this._h;
    }
    scaleX(v?: number) {
      if (v !== undefined) this._sx = v;
      return this._sx;
    }
    scaleY(v?: number) {
      if (v !== undefined) this._sy = v;
      return this._sy;
    }
    getClientRect(_opts?: unknown) {
      return { x: this._x, y: this._y, width: this._w, height: this._h };
    }
    getClassName() {
      return 'Image';
    }
    image(v?: unknown) {
      if (v !== undefined) {
        this.attrs.image = v;
        return this;
      }
      return this.attrs.image;
    }
    setAttr(k: string, v: unknown) {
      this.attrs[k] = v;
      return this;
    }
    getAttr(k: string) {
      return this.attrs[k];
    }
  }

  class MockShape {
    attrs: Record<string, unknown>;
    _layer: MockLayer | null = null;
    _handlers: Record<string, (e?: unknown) => void> = {};
    _draggable = false;
    _x = 0;
    _y = 0;
    _w = 0;
    _h = 0;
    _sx = 1;
    _sy = 1;
    _points: number[] = [];
    _opacity = 1;
    constructor(attrs: Record<string, unknown>) {
      this.attrs = attrs;
      if (attrs.x !== undefined) this._x = attrs.x as number;
      if (attrs.y !== undefined) this._y = attrs.y as number;
      if (attrs.width !== undefined) this._w = attrs.width as number;
      if (attrs.height !== undefined) this._h = attrs.height as number;
      if (attrs.points !== undefined) this._points = attrs.points as number[];
      if (attrs.opacity !== undefined) this._opacity = attrs.opacity as number;
    }
    getAttr(k: string) {
      return this.attrs[k];
    }
    getLayer() {
      return this._layer;
    }
    on(evt: string, cb: (e?: unknown) => void) {
      this._handlers[evt] = cb;
      return this;
    }
    off(_evt?: string) {
      this._handlers = {};
      return this;
    }
    fire(evt: string, e?: unknown) {
      this._handlers[evt]?.(e);
    }
    draggable(v?: boolean) {
      if (v !== undefined) this._draggable = v;
      return this._draggable;
    }
    x(v?: number) {
      if (v !== undefined) this._x = v;
      return this._x;
    }
    y(v?: number) {
      if (v !== undefined) this._y = v;
      return this._y;
    }
    width(v?: number) {
      if (v !== undefined) this._w = v;
      return this._w;
    }
    height(v?: number) {
      if (v !== undefined) this._h = v;
      return this._h;
    }
    scaleX(v?: number) {
      if (v !== undefined) this._sx = v;
      return this._sx;
    }
    scaleY(v?: number) {
      if (v !== undefined) this._sy = v;
      return this._sy;
    }
    points(v?: number[]) {
      if (v !== undefined) this._points = v;
      return this._points;
    }
    strokeWidth(v?: number) {
      if (v !== undefined) this.attrs.strokeWidth = v;
      return typeof this.attrs.strokeWidth === 'number' ? this.attrs.strokeWidth : 1;
    }
    getClassName() {
      return 'Shape';
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
    opacity(v?: number) {
      if (v !== undefined) this._opacity = v;
      return this._opacity;
    }
  }

  class MockLineShape extends MockShape {
    override getClassName() {
      return 'Line';
    }
  }

  class MockCircle extends MockShape {
    _radius = 0;
    constructor(attrs: Record<string, unknown>) {
      super(attrs);
      if (attrs.radius !== undefined) this._radius = attrs.radius as number;
    }
    radius(v?: number) {
      if (v !== undefined) this._radius = v;
      return this._radius;
    }
    override getClassName() {
      return 'Circle';
    }
  }

  class MockEllipse extends MockShape {
    _rx = 0;
    _ry = 0;
    constructor(attrs: Record<string, unknown>) {
      super(attrs);
      if (attrs.radiusX !== undefined) this._rx = attrs.radiusX as number;
      if (attrs.radiusY !== undefined) this._ry = attrs.radiusY as number;
    }
    radiusX(v?: number) {
      if (v !== undefined) this._rx = v;
      return this._rx;
    }
    radiusY(v?: number) {
      if (v !== undefined) this._ry = v;
      return this._ry;
    }
    override getClassName() {
      return 'Ellipse';
    }
  }

  class MockTransformer {
    _nodes: unknown[] = [];
    _keepRatio = false;
    _layer: MockLayer | null = null;
    nodes(v?: unknown[]) {
      if (v !== undefined) this._nodes = v;
      return this._nodes;
    }
    keepRatio(v?: boolean) {
      if (v !== undefined) this._keepRatio = v;
      return this._keepRatio;
    }
    getLayer() {
      return this._layer;
    }
    on() {
      return this;
    }
    off() {
      return this;
    }
  }

  return {
    MockStage,
    MockLayer,
    MockImage,
    MockShape,
    MockLineShape,
    MockCircle,
    MockEllipse,
    MockTransformer,
    MockShape2: MockShape
  };
});

vi.mock('konva', () => ({
  default: {
    Stage: konvaMocks.MockStage,
    Layer: konvaMocks.MockLayer,
    Image: konvaMocks.MockImage,
    Line: konvaMocks.MockLineShape,
    Arrow: konvaMocks.MockLineShape,
    Text: konvaMocks.MockShape,
    Circle: konvaMocks.MockCircle,
    Ellipse: konvaMocks.MockEllipse,
    Rect: konvaMocks.MockShape,
    Transformer: konvaMocks.MockTransformer
  }
}));

// 导出就绪用例需可控的 PDF 渲染：默认挂起（image 保持 null），单测内按需覆写结果
vi.mock('./pdfAsset', () => ({
  renderPdfPage: vi.fn(() => new Promise(() => {}))
}));

// F1.1 公式光栅（katex+html2canvas chunk）：单测只验接线/时序，光栅实现由 formulaRaster.spec 覆盖
const formulaMocks = vi.hoisted(() => ({
  rasterizeFormula: vi.fn(async (_latex: string, _color: string, scale: number) => ({
    canvas: {
      __formulaCanvas: true,
      width: Math.round(120 * scale),
      height: Math.round(48 * scale)
    },
    width: 120,
    height: 48
  }))
}));

vi.mock('./formulaRaster', () => ({
  rasterizeFormula: formulaMocks.rasterizeFormula,
  measureFormula: vi.fn(),
  validateLatex: vi.fn(),
  clearFormulaCache: vi.fn(),
  formulaOversample: vi.fn(() => 2),
  FORMULA_INVALID_MSG: 'LaTeX 语法有误'
}));

import { KonvaRenderer } from './KonvaRenderer';
import { ERASER_WIDTH_MULT, HIT_STROKE_MIN } from './types';
import { renderPdfPage } from './pdfAsset';

class StubImage {
  static instances: StubImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 800;
  height = 450;
  complete = true;
  naturalWidth = 800;
  crossOrigin: string | null = null;
  private _src = '';
  constructor() {
    StubImage.instances.push(this);
  }
  set src(v: string) {
    this._src = v;
  }
  get src() {
    return this._src;
  }
}

function pptElement(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    id: 'p1',
    type: 'ppt-image',
    url: 'http://test.local/ppt/1.png',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    opacity: 1,
    ...overrides
  };
  return { get: (k: string) => data[k] };
}

describe('KonvaRenderer ppt-image', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    StubImage.instances = [];
  });

  function bindPptPage(renderer: KonvaRenderer) {
    const elements = [pptElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
  }

  it('bindElements creates an image node with shape attrs and src', () => {
    vi.stubGlobal('Image', StubImage);
    const container = document.createElement('div');
    const renderer = new KonvaRenderer(container);

    bindPptPage(renderer);

    expect(renderer.layer.getChildren().length).toBe(1);
    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockImage
    >;
    expect(node.attrs.width).toBe(100);
    expect(node.attrs.height).toBe(50);
    expect(StubImage.instances.length).toBe(1);
    expect(StubImage.instances[0]!.src).toBe('http://test.local/ppt/1.png');
    renderer.destroy();
  });

  it('redraws the layer when the image finishes loading late', () => {
    vi.stubGlobal('Image', StubImage);
    const container = document.createElement('div');
    const renderer = new KonvaRenderer(container);

    bindPptPage(renderer);
    const layer = renderer.layer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    const callsAfterBind = layer.batchDrawCalls;
    expect(callsAfterBind).toBe(1);

    // 模拟图片未命中缓存、加载完成后才重绘
    StubImage.instances[0]!.onload?.();

    expect(layer.batchDrawCalls).toBe(callsAfterBind + 1);
    renderer.destroy();
  });
});

describe('KonvaRenderer selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    StubImage.instances = [];
  });

  function makeRenderer() {
    vi.stubGlobal('Image', StubImage);
    const container = document.createElement('div');
    const renderer = new KonvaRenderer(container);
    const elements = [pptElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
    return renderer;
  }

  it('does not wire nodes until select mode is enabled', () => {
    const renderer = makeRenderer();
    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockImage
    >;
    expect(node._draggable).toBe(false);
    expect(renderer.selectNode('p1')).toBe(false);
    expect(renderer.getSelectedId()).toBeNull();
    renderer.destroy();
  });

  it('wires click/drag on nodes and selects the clicked shape', () => {
    const renderer = makeRenderer();
    const clicks: string[] = [];
    renderer.onShapeClick = id => clicks.push(id);
    renderer.setSelectMode(true);

    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockImage
    >;
    expect(node._draggable).toBe(true);

    node.fire('click');
    expect(clicks).toEqual(['p1']);

    expect(renderer.selectNode('p1')).toBe(true);
    expect(renderer.getSelectedId()).toBe('p1');

    renderer.clearSelection();
    expect(renderer.getSelectedId()).toBeNull();
    renderer.destroy();
  });

  it('reports drag end with the node position', () => {
    const renderer = makeRenderer();
    const moves: Array<[string, number, number]> = [];
    renderer.onShapeDragEnd = (id, x, y) => moves.push([id, x, y]);
    renderer.setSelectMode(true);

    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockImage
    >;
    node.x(40);
    node.y(50);
    node.fire('dragend');
    expect(moves).toEqual([['p1', 40, 50]]);
    renderer.destroy();
  });

  it('keeps selection attached after bindElements rebuild', () => {
    const renderer = makeRenderer();
    renderer.setSelectMode(true);
    renderer.selectNode('p1');
    expect(renderer.getSelectedId()).toBe('p1');

    const elements = [pptElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
    expect(renderer.getSelectedId()).toBe('p1');
    renderer.destroy();
  });

  it('fit-all pans via layer while keeping stage identity', () => {
    vi.stubGlobal('Image', StubImage);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    const renderer = new KonvaRenderer(container);
    const elements = [pptElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);

    renderer.zoomFitAll();

    // 内容 100x50 → scale=min(800/100,600/50,2)*0.9=1.8，居中平移写入 layer
    expect(renderer.getZoom()).toBe(180);
    expect(renderer.layer.x()).toBe(310);
    expect(renderer.layer.y()).toBe(255);
    expect(renderer.getView()).toEqual({ x: 310, y: 255 });
    // stage 必须保持恒等变换，否则 Transformer 两套坐标约定错位（选择器缩放偏移）
    expect(renderer.stage.x()).toBe(0);
    expect(renderer.stage.y()).toBe(0);
    renderer.destroy();
  });

  it('recreates transformer after tempLayer cleanup destroyed it', () => {
    const renderer = makeRenderer();
    renderer.setSelectMode(true);
    expect(renderer.selectNode('p1')).toBe(true);
    const temp = renderer.tempLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    expect(temp.children.length).toBe(1);

    // 模拟画笔预览清理（destroyChildren）连带销毁 transformer 但引用残留
    temp.destroyChildren();
    expect(temp.children.length).toBe(0);

    expect(renderer.selectNode('p1')).toBe(true);
    expect(renderer.getSelectedId()).toBe('p1');
    expect(temp.children.length).toBe(1);
    renderer.destroy();
  });

  it('defers bindElements during gesture and flushes via onRefreshRequest on dragend', () => {
    const renderer = makeRenderer();
    renderer.setSelectMode(true);
    let refreshes = 0;
    renderer.onRefreshRequest = () => {
      refreshes += 1;
    };
    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockImage
    >;

    node.fire('dragstart');
    const rebuilt = [pptElement({ x: 77 })] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];
    renderer.bindElements(rebuilt);
    // 手势中不销毁重建（会中断拖动并触发 Konva null getStage 崩溃）
    expect(renderer.layer.getChildren()[0]).toBe(node);
    expect(refreshes).toBe(0);

    node.fire('dragend');
    expect(refreshes).toBe(1);

    // 手势结束后恢复正常重建
    renderer.bindElements(rebuilt);
    expect(renderer.layer.getChildren()[0]).not.toBe(node);
    expect(
      (renderer.layer.getChildren()[0] as unknown as InstanceType<typeof konvaMocks.MockImage>)
        .attrs.x
    ).toBe(77);
    renderer.destroy();
  });

  it('binds brush strokes with persisted x/y offset', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'b1',
      type: 'brush',
      x: 5,
      y: 6,
      points: [0, 0, 10, 10],
      color: '#000',
      lineWidth: 2,
      opacity: 1
    };
    const elements = [{ get: (k: string) => data[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];
    renderer.bindElements(elements);
    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockLineShape
    >;
    expect(node._x).toBe(5);
    expect(node._y).toBe(6);
    renderer.destroy();
  });

  it('renders eraser strokes at lineWidth × ERASER_WIDTH_MULT while brush stays 1×', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'));
    const bindStroke = (type: string) => {
      const data: Record<string, unknown> = {
        id: type,
        type,
        x: 0,
        y: 0,
        points: [0, 0, 10, 10],
        color: '#000',
        lineWidth: 2,
        opacity: 1
      };
      const elements = [{ get: (k: string) => data[k] }] as unknown as Parameters<
        typeof renderer.bindElements
      >[0];
      renderer.bindElements(elements);
      return renderer.layer.getChildren()[0] as unknown as InstanceType<
        typeof konvaMocks.MockLineShape
      >;
    };
    expect(bindStroke('eraser').attrs.strokeWidth).toBe(2 * ERASER_WIDTH_MULT);
    expect(bindStroke('brush').attrs.strokeWidth).toBe(2);
    renderer.destroy();
  });

  it('细笔画命中区抬到 HIT_STROKE_MIN，粗笔画保持原宽', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'));
    const bindStroke = (type: string, lineWidth: number) => {
      const data: Record<string, unknown> = {
        id: `${type}_${lineWidth}`,
        type,
        x: 0,
        y: 0,
        points: [0, 0, 10, 10],
        color: '#000',
        lineWidth,
        opacity: 1
      };
      const elements = [{ get: (k: string) => data[k] }] as unknown as Parameters<
        typeof renderer.bindElements
      >[0];
      renderer.bindElements(elements);
      return renderer.layer.getChildren()[0] as unknown as InstanceType<
        typeof konvaMocks.MockLineShape
      >;
    };
    expect(bindStroke('brush', 1).attrs.hitStrokeWidth).toBe(HIT_STROKE_MIN);
    expect(bindStroke('brush', 20).attrs.hitStrokeWidth).toBe(20);
    expect(bindStroke('eraser', 2).attrs.hitStrokeWidth).toBe(
      Math.max(2 * ERASER_WIDTH_MULT, HIT_STROKE_MIN)
    );
    renderer.destroy();
  });

  it('细描边矩形命中区抬到 HIT_STROKE_MIN', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'r_hit',
      type: 'rect',
      x: 0,
      y: 0,
      width: 50,
      height: 40,
      color: '#000',
      lineWidth: 1,
      opacity: 1
    };
    const elements = [{ get: (k: string) => data[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];
    renderer.bindElements(elements);
    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockShape
    >;
    expect(node.attrs.hitStrokeWidth).toBe(HIT_STROKE_MIN);
    renderer.destroy();
  });

  it('bakes transform scale into width/height for image nodes', () => {
    const renderer = makeRenderer();
    const baked: Array<[string, Record<string, number>]> = [];
    renderer.onShapeTransformEnd = (id, attrs) => baked.push([id, attrs]);
    renderer.setSelectMode(true);

    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockImage
    >;
    node.x(10);
    node.y(20);
    node.scaleX(2);
    node.scaleY(1.5);
    node.fire('transformend');

    expect(baked.length).toBe(1);
    expect(baked[0]![0]).toBe('p1');
    expect(baked[0]![1]).toEqual({ x: 10, y: 20, width: 200, height: 75 });
    // 烘焙后 scale 归一
    expect(node.scaleX()).toBe(1);
    expect(node.scaleY()).toBe(1);
    renderer.destroy();
  });

  it('bakes transform scale into points for line nodes', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'b2',
      type: 'brush',
      x: 0,
      y: 0,
      points: [10, 20, 30, 40],
      color: '#000',
      lineWidth: 2,
      opacity: 1
    };
    const elements = [{ get: (k: string) => data[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];
    renderer.bindElements(elements);
    const baked: Array<Record<string, unknown>> = [];
    renderer.onShapeTransformEnd = (_id, attrs) => baked.push(attrs);
    renderer.setSelectMode(true);

    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockLineShape
    >;
    node.scaleX(2);
    node.scaleY(3);
    node.fire('transformend');

    expect(baked[0]).toEqual({ x: 0, y: 0, points: [20, 60, 60, 120] });
    renderer.destroy();
  });
});

// ── 圆形/椭圆：数据模型（radius vs radiusX/radiusY）、自由缩放、烘焙 ────────
describe('KonvaRenderer circle/ellipse', () => {
  function circleData(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = {
      id: 'c1',
      type: 'circle',
      x: 10,
      y: 20,
      radius: 30,
      color: '#000',
      lineWidth: 1,
      opacity: 1,
      ...overrides
    };
    return { get: (k: string) => data[k] };
  }

  function bindOne(renderer: KonvaRenderer, data: Record<string, unknown>) {
    renderer.bindElements([data] as unknown as Parameters<typeof renderer.bindElements>[0]);
    return renderer.layer.getChildren()[0] as unknown as {
      scaleX: (v?: number) => number;
      scaleY: (v?: number) => number;
      fire: (evt: string) => void;
      getClassName: () => string;
    };
  }

  it('creates Circle from radius and Ellipse from radiusX/radiusY', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    renderer.bindElements([
      circleData({ id: 'c1' }),
      circleData({ id: 'e1', radius: undefined, radiusX: 60, radiusY: 20 })
    ] as unknown as Parameters<typeof renderer.bindElements>[0]);

    const c = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockCircle
    >;
    const e = renderer.layer.getChildren()[1] as unknown as InstanceType<
      typeof konvaMocks.MockEllipse
    >;
    expect(c.getClassName()).toBe('Circle');
    expect(c.radius()).toBe(30);
    expect(e.getClassName()).toBe('Ellipse');
    expect(e.radiusX()).toBe(60);
    expect(e.radiusY()).toBe(20);
    renderer.destroy();
  });

  it('selectNode keeps transformer free-scaling (keepRatio false) for circles', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    bindOne(renderer, circleData());
    renderer.setSelectMode(true);
    expect(renderer.selectNode('c1')).toBe(true);

    const temp = renderer.tempLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    const tf = temp.children[0] as unknown as InstanceType<typeof konvaMocks.MockTransformer>;
    expect(tf._keepRatio).toBe(false);
    renderer.destroy();
  });

  it('bakes non-uniform circle scale into radiusX/radiusY (converts to ellipse)', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const node = bindOne(renderer, circleData());
    const baked: Array<Record<string, number>> = [];
    renderer.onShapeTransformEnd = (_id, attrs) => baked.push(attrs);
    renderer.setSelectMode(true);

    node.scaleX(2);
    node.scaleY(1);
    node.fire('transformend');
    expect(baked[0]).toEqual({ x: 10, y: 20, radiusX: 60, radiusY: 30 });
    renderer.destroy();
  });

  it('bakes uniform circle scale into radius (stays circle)', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const node = bindOne(renderer, circleData());
    const baked: Array<Record<string, number>> = [];
    renderer.onShapeTransformEnd = (_id, attrs) => baked.push(attrs);
    renderer.setSelectMode(true);

    node.scaleX(2);
    node.scaleY(2);
    node.fire('transformend');
    expect(baked[0]).toEqual({ x: 10, y: 20, radius: 60 });
    renderer.destroy();
  });

  it('bakes ellipse scale into radiusX/radiusY even when uniform (ellipse stays ellipse)', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const node = bindOne(renderer, circleData({ radius: undefined, radiusX: 60, radiusY: 20 }));
    const baked: Array<Record<string, number>> = [];
    renderer.onShapeTransformEnd = (_id, attrs) => baked.push(attrs);
    renderer.setSelectMode(true);

    node.scaleX(1.5);
    node.scaleY(1.5);
    node.fire('transformend');
    expect(baked[0]).toEqual({ x: 10, y: 20, radiusX: 90, radiusY: 30 });
    renderer.destroy();
  });

  it('mirrors viewport transform on previewLayer', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    renderer.setZoom(150);
    renderer.setViewport(10, -20);

    const preview = renderer.previewLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    expect(preview.scaleX()).toBe(1.5);
    expect(preview.scaleY()).toBe(1.5);
    expect(preview.x()).toBe(10);
    expect(preview.y()).toBe(-20);

    renderer.showPage(0);
    expect(preview.scaleX()).toBe(1.5);
    expect(preview.x()).toBe(10);
    renderer.destroy();
  });

  it('creates Line nodes for line shapes with points', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'l1',
      type: 'line',
      points: [10, 20, 80, 90],
      color: '#000',
      lineWidth: 2,
      opacity: 1
    };
    renderer.bindElements([{ get: (k: string) => data[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0]);

    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockLineShape
    >;
    expect(node.getClassName()).toBe('Line');
    expect(node.points()).toEqual([10, 20, 80, 90]);
    renderer.destroy();
  });

  it('creates Arrow nodes for arrow shapes with points', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'a1',
      type: 'arrow',
      points: [10, 20, 80, 90],
      color: '#000',
      lineWidth: 2,
      opacity: 1
    };
    renderer.bindElements([{ get: (k: string) => data[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0]);

    const node = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockLineShape
    >;
    // Konva.Arrow 在 mock 中共用 MockLineShape（getClassName 恒为 Line），points 为断言锚点
    expect(node.getClassName()).toBe('Line');
    expect(node.points()).toEqual([10, 20, 80, 90]);
    renderer.destroy();
  });

  it('fires onShapeDblClick only while select mode is on', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    bindOne(renderer, circleData());
    const hits: string[] = [];
    renderer.onShapeDblClick = id => hits.push(id);
    const node = renderer.layer.getChildren()[0] as unknown as { fire: (e: string) => void };

    node.fire('dblclick');
    expect(hits).toEqual([]); // selectEnabled 初始 false → 未接线

    renderer.setSelectMode(true);
    node.fire('dblclick');
    expect(hits).toEqual(['c1']);

    renderer.setSelectMode(false);
    node.fire('dblclick');
    expect(hits).toEqual(['c1']); // 退出选择模式后不再触发
    renderer.destroy();
  });

  it('passes fill through for rect/circle; absent fill stays unfilled', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const rectData = (overrides: Record<string, unknown> = {}) => {
      const data: Record<string, unknown> = {
        id: 'r1',
        type: 'rect',
        x: 5,
        y: 6,
        width: 40,
        height: 30,
        color: '#000',
        lineWidth: 1,
        opacity: 1,
        ...overrides
      };
      return { get: (k: string) => data[k] };
    };
    renderer.bindElements([
      rectData({ id: 'r1', fill: '#00ff00' }),
      rectData({ id: 'r2' }),
      circleData({ id: 'c1', fill: '#ff0000' }),
      circleData({ id: 'c2' })
    ] as unknown as Parameters<typeof renderer.bindElements>[0]);

    const [rf, rn, cf, cn] = renderer.layer.getChildren() as unknown as Array<{
      attrs: Record<string, unknown>;
    }>;
    expect(rf!.attrs.fill).toBe('#00ff00');
    expect(rn!.attrs.fill).toBeUndefined();
    expect(cf!.attrs.fill).toBe('#ff0000');
    expect(cn!.attrs.fill).toBeUndefined();
    renderer.destroy();
  });

  it('renders ellipse (radiusX/radiusY) fill through to node attrs', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'e1',
      type: 'circle',
      x: 10,
      y: 20,
      radiusX: 40,
      radiusY: 25,
      color: '#000',
      lineWidth: 1,
      opacity: 1,
      fill: '#00ff00'
    };
    renderer.bindElements([{ get: (k: string) => data[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0]);
    const node = renderer.layer.getChildren()[0] as unknown as { attrs: Record<string, unknown> };
    expect(node.attrs.fill).toBe('#00ff00');
    renderer.destroy();
  });
});

describe('KonvaRenderer laser', () => {
  it('mirrors viewport transform on laserLayer and toggles the laser dot', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    renderer.setZoom(150);
    renderer.setViewport(10, -20);

    const laser = renderer.laserLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    expect(laser.scaleX()).toBe(1.5);
    expect(laser.scaleY()).toBe(1.5);
    expect(laser.x()).toBe(10);
    expect(laser.y()).toBe(-20);

    renderer.setLaserPoint(50, 60);
    const dot = laser.getChildren()[0] as unknown as InstanceType<typeof konvaMocks.MockShape>;
    expect(dot.x()).toBe(50);
    expect(dot.y()).toBe(60);
    expect(dot.visible()).toBe(true);

    renderer.setLaserPoint(null);
    expect(dot.visible()).toBe(false);

    // 翻页重应用视口且红点保持（laserLayer 不随页隐藏）
    renderer.showPage(0);
    expect(laser.scaleX()).toBe(1.5);
    expect(laser.x()).toBe(10);
    expect(dot.visible()).toBe(false);
    renderer.destroy();
  });
});

describe('KonvaRenderer 远端光标（F7.1）', () => {
  type Shape = InstanceType<typeof konvaMocks.MockShape>;

  it('cursorLayer 镜像视口变换，z 序介于笔迹层与激光层之间', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    renderer.setZoom(150);
    renderer.setViewport(10, -20);

    const cursor = renderer.cursorLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    expect(cursor.scaleX()).toBe(1.5);
    expect(cursor.scaleY()).toBe(1.5);
    expect(cursor.x()).toBe(10);
    expect(cursor.y()).toBe(-20);

    renderer.showPage(0);
    expect(cursor.scaleX()).toBe(1.5);
    expect(cursor.x()).toBe(10);

    // z 序（stage 添加序）：笔迹层 < cursorLayer < laserLayer
    const stage = renderer.stage as unknown as { children: unknown[] };
    expect(stage.children.indexOf(cursor)).toBeGreaterThan(stage.children.indexOf(renderer.layer));
    expect(stage.children.indexOf(cursor)).toBeLessThan(
      stage.children.indexOf(renderer.laserLayer)
    );
    renderer.destroy();
  });

  it('setRemoteCursor 渲染光标点与姓名标签（右下偏移 12px），尾迹封顶 5 帧渐隐', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    renderer.setRemoteCursor(10, 20, '#ff0000', 'Teacher');

    const layer = renderer.cursorLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    // 节点序：5 尾迹 → 光标点 → 姓名标签
    expect(layer.getChildren().length).toBe(7);
    const dot = layer.getChildren()[5] as unknown as InstanceType<typeof konvaMocks.MockCircle>;
    const label = layer.getChildren()[6] as unknown as Shape;
    expect(dot.x()).toBe(10);
    expect(dot.y()).toBe(20);
    expect(dot.visible()).toBe(true);
    expect(label.x()).toBe(22);
    expect(label.y()).toBe(32);
    expect((label as unknown as { attrs: Record<string, unknown> }).attrs.text).toBe('Teacher');

    // 首帧不产生尾迹（无历史位置）
    for (let i = 0; i < 5; i++) {
      expect((layer.getChildren()[i] as unknown as Shape).visible()).toBe(false);
    }

    // 连续移动 7 帧 → 仅保留最近 5 帧，最新一帧为上一帧位置 (16,20)
    for (let i = 1; i <= 7; i++) {
      renderer.setRemoteCursor(10 + i, 20, '#ff0000', 'Teacher');
    }
    const trails = layer.getChildren().slice(0, 5) as unknown as Shape[];
    trails.forEach(t => expect(t.visible()).toBe(true));
    expect(trails[0]!.x()).toBe(12);
    expect(trails[4]!.x()).toBe(16);
    expect(trails[0]!.opacity()).toBeCloseTo(0.08);
    expect(trails[4]!.opacity()).toBeCloseTo(0.4);
    expect(dot.x()).toBe(17);
    renderer.destroy();
  });

  it('setRemoteCursorLabel 切换标签透明度；clearRemoteCursor 隐藏全部并重置尾迹', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    renderer.setRemoteCursor(1, 2, '#00ff00', 'T');
    renderer.setRemoteCursor(2, 2, '#00ff00', 'T');
    const layer = renderer.cursorLayer as unknown as InstanceType<typeof konvaMocks.MockLayer>;
    const dot = layer.getChildren()[5] as unknown as InstanceType<typeof konvaMocks.MockCircle>;
    const label = layer.getChildren()[6] as unknown as Shape;

    renderer.setRemoteCursorLabel(false);
    expect(label.opacity()).toBe(0);
    renderer.setRemoteCursorLabel(true);
    expect(label.opacity()).toBe(1);

    renderer.clearRemoteCursor();
    expect(dot.visible()).toBe(false);
    expect(label.visible()).toBe(false);
    (layer.getChildren().slice(0, 5) as unknown as Shape[]).forEach(t =>
      expect(t.visible()).toBe(false)
    );

    // 清除后重新放置：无陈旧尾迹、标签恢复可见
    renderer.setRemoteCursor(5, 6, '#00ff00', 'T');
    expect(dot.visible()).toBe(true);
    expect(label.visible()).toBe(true);
    (layer.getChildren().slice(0, 5) as unknown as Shape[]).forEach(t =>
      expect(t.visible()).toBe(false)
    );
    renderer.destroy();
  });
});

describe('KonvaRenderer 未知元素类型（F6.2 前向兼容）', () => {
  it('未注册类型被跳过且不崩溃，同批已知类型正常渲染', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const known: Record<string, unknown> = {
      id: 'k1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10
    };
    const unknown: Record<string, unknown> = { id: 'x1', type: 'hologram-3d', x: 5, y: 5 };
    const elements = [known, unknown].map(d => ({
      get: (k: string) => d[k]
    })) as unknown as Parameters<typeof renderer.bindElements>[0];

    expect(() => renderer.bindElements(elements)).not.toThrow();
    expect(renderer.layer.getChildren().length).toBe(1);
    renderer.destroy();
  });

  it('全未知类型批次 → 空层不崩溃', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const u: Record<string, unknown> = { id: 'x1', type: 'future-widget' };
    const elements = [{ get: (k: string) => u[k] }] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];

    expect(() => renderer.bindElements(elements)).not.toThrow();
    expect(renderer.layer.getChildren().length).toBe(0);
    renderer.destroy();
  });

  it('课件底图批次混入未知类型：底图与已知笔迹正常渲染、未知跳过', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const unknown: Record<string, unknown> = { id: 'x1', type: 'hologram-3d', x: 5, y: 5 };
    const brush: Record<string, unknown> = {
      id: 'b1',
      type: 'brush',
      points: [0, 0, 50, 0],
      color: '#000',
      lineWidth: 2,
      opacity: 1
    };
    const elements = [
      pptElement(),
      { get: (k: string) => unknown[k] },
      { get: (k: string) => brush[k] }
    ] as unknown as Parameters<typeof renderer.bindElements>[0];

    expect(() => renderer.bindElements(elements)).not.toThrow();
    expect(renderer.layer.getChildren().length).toBe(2);
    renderer.destroy();
  });
});

describe('KonvaRenderer 导出模式与图片就绪（F6.1）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    StubImage.instances = [];
  });

  function bindOneImage(renderer: KonvaRenderer, overrides: Record<string, unknown> = {}) {
    const elements = [pptElement({ id: 'img1', ...overrides })] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];
    renderer.bindElements(elements);
  }

  it('导出模式下 http 图片挂 crossorigin（读像素不被跨域污染）', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer);
    expect(StubImage.instances[0]!.crossOrigin).toBe('anonymous');
    renderer.destroy();
  });

  it('导出模式下非 http 源不挂 crossorigin（data: 本就不污染）', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer, { url: 'data:image/png;base64,AAA' });
    expect(StubImage.instances[0]!.crossOrigin).toBeNull();
    renderer.destroy();
  });

  it('展示模式保持原行为：不挂 crossorigin（旧服务端反代下图片照常显示）', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'));
    bindOneImage(renderer);
    expect(StubImage.instances[0]!.crossOrigin).toBeNull();
    renderer.destroy();
  });

  it('whenImagesReady 图片已就绪时立即返回', async () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer);
    await expect(renderer.whenImagesReady(1000)).resolves.toBeUndefined();
    renderer.destroy();
  });

  it('whenImagesReady 等待晚到的图片加载完成', async () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer);
    const img = StubImage.instances[0]!;
    img.complete = false;
    const wait = renderer.whenImagesReady(3000);
    setTimeout(() => {
      img.complete = true;
      img.naturalWidth = 640;
      img.onload?.();
    }, 30);
    await expect(wait).resolves.toBeUndefined();
    renderer.destroy();
  });

  it('图片加载失败（naturalWidth=0）立即抛可读错误', async () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer);
    StubImage.instances[0]!.naturalWidth = 0;
    await expect(renderer.whenImagesReady(1000)).rejects.toThrow('底图加载失败');
    renderer.destroy();
  });

  it('图片一直未就绪 → 超时抛可读错误', async () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer);
    StubImage.instances[0]!.complete = false;
    await expect(renderer.whenImagesReady(200)).rejects.toThrow('图片加载超时');
    renderer.destroy();
  });

  it('ppt 的 PDF 页渲染未落位 → 视为未就绪，超时抛可读错误', async () => {
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer, { pdfUrl: 'http://test.local/deck.pdf', page: 1 });
    await expect(renderer.whenImagesReady(200)).rejects.toThrow('图片加载超时');
    renderer.destroy();
  });

  it('ppt 的 PDF 页渲染完成后视为就绪', async () => {
    vi.mocked(renderPdfPage).mockResolvedValueOnce({} as HTMLCanvasElement);
    const renderer = new KonvaRenderer(document.createElement('div'), { exportMode: true });
    bindOneImage(renderer, { pdfUrl: 'http://test.local/deck.pdf', page: 1 });
    await expect(renderer.whenImagesReady(3000)).resolves.toBeUndefined();
    renderer.destroy();
  });
});

describe('KonvaRenderer 荧光笔混合与橡皮按元素命中（F4.1）', () => {
  function bindStrokes(renderer: KonvaRenderer, strokes: Array<Record<string, unknown>>) {
    const elements = strokes.map(data => ({
      get: (k: string) => data[k]
    })) as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
  }

  it('blend=multiply 挂节点 globalCompositeOperation，缺省不挂', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    bindStrokes(renderer, [
      {
        id: 'hl1',
        type: 'brush',
        points: [0, 0, 10, 10],
        color: '#ffeb3b',
        lineWidth: 2,
        opacity: 1,
        blend: 'multiply'
      },
      {
        id: 'pen1',
        type: 'brush',
        points: [0, 0, 10, 10],
        color: '#000000',
        lineWidth: 1,
        opacity: 1
      }
    ]);
    const hl = renderer.layer.getChildren()[0] as unknown as InstanceType<
      typeof konvaMocks.MockLineShape
    >;
    const pen = renderer.layer.getChildren()[1] as unknown as InstanceType<
      typeof konvaMocks.MockLineShape
    >;
    expect(hl.attrs.globalCompositeOperation).toBe('multiply');
    expect(pen.attrs.globalCompositeOperation).toBeUndefined();
    renderer.destroy();
  });

  it('hitStroke 折线在容差内命中、远离未命中', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    bindStrokes(renderer, [
      { id: 'b1', type: 'brush', points: [0, 0, 100, 0], color: '#000', lineWidth: 2, opacity: 1 }
    ]);
    // 笔画半宽 1 + 橡皮半径 2 → 容差 3；(50,2) 在线段上
    expect(renderer.hitStroke(50, 2, 2)).toBe('b1');
    expect(renderer.hitStroke(50, 40, 2)).toBeNull();
    renderer.destroy();
  });

  it('hitStroke 重叠笔迹取顶层，非折线类型跳过', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    bindStrokes(renderer, [
      {
        id: 'under',
        type: 'brush',
        points: [0, 0, 100, 0],
        color: '#000',
        lineWidth: 2,
        opacity: 1
      },
      { id: 'top', type: 'brush', points: [0, 0, 100, 0], color: '#f00', lineWidth: 2, opacity: 1 },
      {
        id: 'r1',
        type: 'rect',
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        color: '#000',
        lineWidth: 1,
        opacity: 1
      }
    ]);
    expect(renderer.hitStroke(50, 0, 2)).toBe('top');
    // (25,25) 只落在矩形内部：非折线类型不参与橡皮命中
    expect(renderer.hitStroke(25, 25, 2)).toBeNull();
    renderer.destroy();
  });

  it('hitStroke 空层与单点轨迹不崩溃', () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    expect(renderer.hitStroke(1, 1, 2)).toBeNull();
    bindStrokes(renderer, [
      { id: 'dot', type: 'brush', points: [5, 5], color: '#000', lineWidth: 2, opacity: 1 }
    ]);
    expect(renderer.hitStroke(6, 6, 2)).toBe('dot');
    expect(renderer.hitStroke(60, 60, 2)).toBeNull();
    renderer.destroy();
  });
});

// ── F1.1 公式元素（5.7.1 B1 光栅接线：懒 chunk、自然尺寸采纳、缩放重栅格） ──
describe('KonvaRenderer formula', () => {
  function formulaElement(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = {
      id: 'f1',
      type: 'formula',
      latex: 'E=mc^2',
      x: 10,
      y: 20,
      width: 120,
      height: 48,
      color: '#123456',
      opacity: 1,
      ...overrides
    };
    return { get: (k: string) => data[k] };
  }

  function formulaNode(renderer: KonvaRenderer) {
    return renderer.layer.getChildren()[0] as unknown as InstanceType<typeof konvaMocks.MockImage>;
  }

  const flush = () => new Promise(r => setTimeout(r, 0));

  it('creates a formula Image node with latex attrs and lands the raster async', async () => {
    formulaMocks.rasterizeFormula.mockClear();
    const renderer = new KonvaRenderer(document.createElement('div'));
    const elements = [formulaElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);

    const node = formulaNode(renderer);
    expect(node.getAttr('latex')).toBe('E=mc^2');
    expect(node.getAttr('formulaColor')).toBe('#123456');
    expect(node.width()).toBe(120);
    expect(node.image()).toBeNull();

    await flush();
    expect(formulaMocks.rasterizeFormula).toHaveBeenCalledWith('E=mc^2', '#123456', 2);
    expect(node.image()).toMatchObject({ __formulaCanvas: true });
    renderer.destroy();
  });

  it('adopts natural raster size when element has no stored width/height', async () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const elements = [formulaElement({ width: 0, height: 0 })] as unknown as Parameters<
      typeof renderer.bindElements
    >[0];
    renderer.bindElements(elements);
    const node = formulaNode(renderer);
    expect(node.width()).toBe(0);
    await flush();
    expect(node.width()).toBe(120);
    expect(node.height()).toBe(48);
    renderer.destroy();
  });

  it('whenImagesReady stays pending until the formula raster lands', async () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const elements = [formulaElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
    const node = formulaNode(renderer);
    // 光栅未落位前不可判定就绪
    expect(node.image()).toBeNull();
    await renderer.whenImagesReady(2000);
    expect(node.image()).toBeTruthy();
    renderer.destroy();
  });

  it('debounced zoom re-rasters formulas at the new oversample, leaves other images alone', async () => {
    formulaMocks.rasterizeFormula.mockClear();
    const renderer = new KonvaRenderer(document.createElement('div'));
    const imageData: Record<string, unknown> = {
      id: 'i1',
      type: 'image',
      url: 'http://test.local/img/a.png',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      opacity: 1
    };
    const elements = [
      formulaElement(),
      { get: (k: string) => imageData[k] }
    ] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
    await flush();
    expect(formulaMocks.rasterizeFormula).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    try {
      // 连续缩放被防抖合并为一次重栅格
      renderer.setZoom(150);
      renderer.setZoom(200);
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      vi.useRealTimers();
    }
    // setZoom 上限 200% → S=clamp(2×200,1,8)=4；非公式图片不触发重栅格
    expect(formulaMocks.rasterizeFormula).toHaveBeenCalledTimes(2);
    expect(formulaMocks.rasterizeFormula).toHaveBeenLastCalledWith('E=mc^2', '#123456', 4);
    renderer.destroy();
  });

  it('destroy cancels the pending zoom re-raster timer', async () => {
    formulaMocks.rasterizeFormula.mockClear();
    const renderer = new KonvaRenderer(document.createElement('div'));
    const elements = [formulaElement()] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
    await flush();
    vi.useFakeTimers();
    try {
      renderer.setZoom(200);
      renderer.destroy();
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      vi.useRealTimers();
    }
    expect(formulaMocks.rasterizeFormula).toHaveBeenCalledTimes(1);
  });
});

// ── F5.1 课件页混合批次：底图/荧光/公式按 Yjs 迭代序堆叠 ─────────────────
describe('KonvaRenderer F5.1 混合批次层级', () => {
  it('底图在下、荧光居中（multiply）、公式在上，blend 只挂荧光', async () => {
    const renderer = new KonvaRenderer(document.createElement('div'));
    const highlighter: Record<string, unknown> = {
      id: 'hl1',
      type: 'brush',
      points: [0, 0, 100, 0],
      color: '#ffeb3b',
      lineWidth: 2,
      opacity: 1,
      blend: 'multiply'
    };
    const formula: Record<string, unknown> = {
      id: 'f1',
      type: 'formula',
      latex: 'E=mc^2',
      x: 0,
      y: 0,
      width: 120,
      height: 48,
      color: '#000000',
      opacity: 1
    };
    const elements = [
      pptElement(),
      { get: (k: string) => highlighter[k] },
      { get: (k: string) => formula[k] }
    ] as unknown as Parameters<typeof renderer.bindElements>[0];
    renderer.bindElements(elements);
    await new Promise(r => setTimeout(r, 0));

    const children = renderer.layer.getChildren() as unknown as Array<{
      image?: () => unknown;
      attrs: Record<string, unknown>;
    }>;
    expect(children.length).toBe(3);
    // Image 类节点（底图/公式）带 image()，荧光折线不带
    expect(typeof children[0]!.image).toBe('function');
    expect(typeof children[1]!.image).toBe('undefined');
    expect(typeof children[2]!.image).toBe('function');
    expect(children[1]!.attrs.globalCompositeOperation).toBe('multiply');
    expect(children[0]!.attrs.globalCompositeOperation).toBeUndefined();
    expect(children[2]!.attrs.globalCompositeOperation).toBeUndefined();
    expect(children[2]!.attrs.latex).toBe('E=mc^2');
    renderer.destroy();
  });
});
