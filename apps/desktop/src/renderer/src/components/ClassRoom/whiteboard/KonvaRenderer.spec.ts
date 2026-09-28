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
    constructor(attrs: Record<string, unknown>) {
      this.attrs = attrs;
    }
    getLayer() {
      return this._layer;
    }
  }

  class MockShape {
    attrs: Record<string, unknown>;
    _layer: MockLayer | null = null;
    constructor(attrs: Record<string, unknown>) {
      this.attrs = attrs;
    }
    getLayer() {
      return this._layer;
    }
  }

  return { MockStage, MockLayer, MockImage, MockShape, MockShape2: MockShape };
});

vi.mock('konva', () => ({
  default: {
    Stage: konvaMocks.MockStage,
    Layer: konvaMocks.MockLayer,
    Image: konvaMocks.MockImage,
    Line: konvaMocks.MockShape,
    Arrow: konvaMocks.MockShape,
    Text: konvaMocks.MockShape,
    Circle: konvaMocks.MockShape,
    Rect: konvaMocks.MockShape,
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
