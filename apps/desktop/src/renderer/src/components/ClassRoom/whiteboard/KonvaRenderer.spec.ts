import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Minimal Konva mock covering what KonvaRenderer uses ─────────────────
const konvaMocks = vi.hoisted(() => {
  class MockStage {
    children: unknown[] = [];
    private _w: number;
    private _h: number;
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
    x(_v?: number) {
      return 0;
    }
    y(_v?: number) {
      return 0;
    }
    destroy() {}
  }

  class MockLayer {
    children: unknown[] = [];
    batchDrawCalls = 0;
    visible = true;
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
      this.children = [];
    }
    destroy() {}
    x(_v?: number) {
      return 0;
    }
    y(_v?: number) {
      return 0;
    }
    scaleX(_v?: number) {
      return 1;
    }
    scaleY(_v?: number) {
      return 1;
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
  }

  class MockLineShape extends MockShape {
    override getClassName() {
      return 'Line';
    }
  }

  class MockTransformer {
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
    on() {
      return this;
    }
    off() {
      return this;
    }
  }

  return { MockStage, MockLayer, MockImage, MockShape, MockLineShape, MockTransformer, MockShape2: MockShape };
});

vi.mock('konva', () => ({
  default: {
    Stage: konvaMocks.MockStage,
    Layer: konvaMocks.MockLayer,
    Image: konvaMocks.MockImage,
    Line: konvaMocks.MockLineShape,
    Arrow: konvaMocks.MockLineShape,
    Text: konvaMocks.MockShape,
    Circle: konvaMocks.MockShape,
    Rect: konvaMocks.MockShape,
    Transformer: konvaMocks.MockTransformer,
  },
}));

import { KonvaRenderer } from './KonvaRenderer';

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
