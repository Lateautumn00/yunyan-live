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
    constructor(attrs: Record<string, unknown>) {
      this.attrs = attrs;
      if (attrs.x !== undefined) this._x = attrs.x as number;
      if (attrs.y !== undefined) this._y = attrs.y as number;
      if (attrs.width !== undefined) this._w = attrs.width as number;
      if (attrs.height !== undefined) this._h = attrs.height as number;
      if (attrs.points !== undefined) this._points = attrs.points as number[];
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

  return { MockStage, MockLayer, MockImage, MockShape, MockLineShape, MockCircle, MockEllipse, MockTransformer, MockShape2: MockShape };
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
    Transformer: konvaMocks.MockTransformer,
  },
}));

import { KonvaRenderer } from './KonvaRenderer';
import { ERASER_WIDTH_MULT } from './types';

class StubImage {
  static instances: StubImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 800;
  height = 450;
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
    ...overrides,
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
        .attrs.x,
    ).toBe(77);
    renderer.destroy();
  });

  it('binds brush strokes with persisted x/y offset', () => {
    vi.stubGlobal('Image', StubImage);
    const renderer = new KonvaRenderer(document.createElement('div'));
    const data: Record<string, unknown> = {
      id: 'b1', type: 'brush', x: 5, y: 6, points: [0, 0, 10, 10], color: '#000', lineWidth: 2, opacity: 1,
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
        id: type, type, x: 0, y: 0, points: [0, 0, 10, 10], color: '#000', lineWidth: 2, opacity: 1,
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
      id: 'b2', type: 'brush', x: 0, y: 0, points: [10, 20, 30, 40], color: '#000', lineWidth: 2, opacity: 1,
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
      id: 'c1', type: 'circle', x: 10, y: 20, radius: 30,
      color: '#000', lineWidth: 1, opacity: 1, ...overrides,
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
      circleData({ id: 'e1', radius: undefined, radiusX: 60, radiusY: 20 }),
    ] as unknown as Parameters<typeof renderer.bindElements>[0]);

    const c = renderer.layer.getChildren()[0] as unknown as InstanceType<typeof konvaMocks.MockCircle>;
    const e = renderer.layer.getChildren()[1] as unknown as InstanceType<typeof konvaMocks.MockEllipse>;
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
      id: 'l1', type: 'line', points: [10, 20, 80, 90], color: '#000', lineWidth: 2, opacity: 1,
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
        id: 'r1', type: 'rect', x: 5, y: 6, width: 40, height: 30,
        color: '#000', lineWidth: 1, opacity: 1, ...overrides,
      };
      return { get: (k: string) => data[k] };
    };
    renderer.bindElements([
      rectData({ id: 'r1', fill: '#00ff00' }),
      rectData({ id: 'r2' }),
      circleData({ id: 'c1', fill: '#ff0000' }),
      circleData({ id: 'c2' }),
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
      id: 'e1', type: 'circle', x: 10, y: 20, radiusX: 40, radiusY: 25,
      color: '#000', lineWidth: 1, opacity: 1, fill: '#00ff00',
    };
    renderer.bindElements([
      { get: (k: string) => data[k] },
    ] as unknown as Parameters<typeof renderer.bindElements>[0]);
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
