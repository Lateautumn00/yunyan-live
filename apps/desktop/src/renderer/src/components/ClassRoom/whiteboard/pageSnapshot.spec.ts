import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPageSnapshot, type PageSnapshotRequest } from './pageSnapshot';

// 离屏渲染三件套（隐藏 div + exportMode KonvaRenderer + whenImagesReady）在真实 Konva 上
// 已由 F6.1 导出链路验收，本 spec 只锁 pageSnapshot 自身契约：成功回 dataURL、失败一律回 null。
const h = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'ready-fail' | 'dataurl-throw' | 'bind-throw',
  dataUrl: 'data:image/png;base64,QUJD',
  hosts: [] as HTMLElement[],
  bindCount: 0,
  clearCount: 0,
  destroyCount: 0,
  readyTimeouts: [] as number[]
}));

vi.mock('./KonvaRenderer', () => {
  class MockKonvaRenderer {
    private stage = {
      toDataURL: (opts?: { pixelRatio?: number }) => {
        if (h.mode === 'dataurl-throw') throw new Error('toDataURL 炸了');
        void opts;
        return h.dataUrl;
      }
    };

    constructor(host: HTMLElement) {
      h.hosts.push(host);
    }

    bindElements(elements: unknown) {
      if (h.mode === 'bind-throw') throw new Error('bindElements 炸了');
      h.bindCount++;
      void elements;
    }

    clearCurrentPage() {
      h.clearCount++;
    }

    async whenImagesReady(timeoutMs = 15000) {
      h.readyTimeouts.push(timeoutMs);
      if (h.mode === 'ready-fail') throw new Error('图片加载超时');
    }

    getStage() {
      return this.stage;
    }

    destroy() {
      h.destroyCount++;
    }
  }
  return { KonvaRenderer: MockKonvaRenderer };
});

function req(overrides: Partial<PageSnapshotRequest> = {}): PageSnapshotRequest {
  return {
    getElementsAt: (() => ({ id: 'els' }) as never) as PageSnapshotRequest['getElementsAt'],
    width: 1280,
    height: 720,
    pixelRatio: 1,
    timeoutMs: 1500,
    ...overrides
  };
}

beforeEach(() => {
  h.mode = 'ok';
  h.hosts = [];
  h.bindCount = 0;
  h.clearCount = 0;
  h.destroyCount = 0;
  h.readyTimeouts = [];
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pageSnapshot — F5.2 每页离屏快照', () => {
  it('正向：渲染成功返回 dataURL，离屏容器与渲染器均已回收', async () => {
    const out = await renderPageSnapshot(req(), 0);
    expect(out).toBe(h.dataUrl);
    expect(out!.startsWith('data:image/png')).toBe(true);
    // 复用 F6.1 导出的离屏约定：固定定位在视口外，不引起滚动/闪烁
    expect(h.hosts.length).toBe(1);
    expect(h.hosts[0]!.style.left).toBe('-10000px');
    expect(h.hosts[0]!.style.width).toBe('1280px');
    expect(document.body.contains(h.hosts[0]!)).toBe(false);
    expect(h.destroyCount).toBe(1);
    expect(h.bindCount).toBe(1);
    expect(h.clearCount).toBe(0);
    expect(h.readyTimeouts).toEqual([1500]);
  });

  it('正向：该页无元素时清空画布兜底，仍产出快照', async () => {
    const out = await renderPageSnapshot(req({ getElementsAt: () => null }), 0);
    expect(out).toBe(h.dataUrl);
    expect(h.bindCount).toBe(0);
    expect(h.clearCount).toBe(1);
    expect(h.destroyCount).toBe(1);
  });

  it('负向：图片等待超时 → 返回 null，不向上抛', async () => {
    h.mode = 'ready-fail';
    await expect(renderPageSnapshot(req(), 0)).resolves.toBeNull();
    expect(h.destroyCount).toBe(1);
    expect(document.body.contains(h.hosts[0]!)).toBe(false);
  });

  it('负向：toDataURL 抛错 → 返回 null，不向上抛', async () => {
    h.mode = 'dataurl-throw';
    await expect(renderPageSnapshot(req(), 0)).resolves.toBeNull();
    expect(h.destroyCount).toBe(1);
  });

  it('负向：绑定元素即抛错 → 返回 null 且不留下离屏节点', async () => {
    h.mode = 'bind-throw';
    await expect(renderPageSnapshot(req(), 2)).resolves.toBeNull();
    expect(document.body.contains(h.hosts[0]!)).toBe(false);
  });
});
