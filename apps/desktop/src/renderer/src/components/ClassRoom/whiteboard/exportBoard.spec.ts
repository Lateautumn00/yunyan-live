import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { ElectronApi } from '@yunyan-live/ipc';
import type { ExportRequest } from './exportBoard';

const mocks = vi.hoisted(() => {
  const bindElements = vi.fn();
  const clearCurrentPage = vi.fn();
  const whenImagesReady = vi.fn();
  const toDataURL = vi.fn();
  const destroy = vi.fn();
  class MockKonvaRenderer {
    static lastContainer: HTMLElement | null = null;
    static lastOpts: unknown = null;
    constructor(container: HTMLElement, opts?: unknown) {
      MockKonvaRenderer.lastContainer = container;
      MockKonvaRenderer.lastOpts = opts;
    }
    bindElements = bindElements;
    clearCurrentPage = clearCurrentPage;
    whenImagesReady = whenImagesReady;
    getStage() {
      return { toDataURL };
    }
    destroy = destroy;
  }
  const jsPDFInstances: Array<{
    opts: unknown;
    addImage: ReturnType<typeof vi.fn>;
    addPage: ReturnType<typeof vi.fn>;
    output: ReturnType<typeof vi.fn>;
  }> = [];
  class MockJsPDF {
    opts: unknown;
    addImage = vi.fn();
    addPage = vi.fn();
    output = vi.fn(() => new ArrayBuffer(8));
    constructor(opts?: unknown) {
      this.opts = opts;
      jsPDFInstances.push(this);
    }
  }
  return {
    bindElements,
    clearCurrentPage,
    whenImagesReady,
    toDataURL,
    destroy,
    MockKonvaRenderer,
    MockJsPDF,
    jsPDFInstances
  };
});

vi.mock('./KonvaRenderer', () => ({ KonvaRenderer: mocks.MockKonvaRenderer }));
vi.mock('jspdf', () => ({ jsPDF: mocks.MockJsPDF }));

import { resolveExportPages, runExport } from './exportBoard';

const PNG_DATA_URL = 'data:image/png;base64,QUJD';

function makeElements() {
  return [{ get: () => 'el' }] as unknown as NonNullable<
    ReturnType<ExportRequest['getElementsAt']>
  >;
}

function makeRequest(overrides: Partial<ExportRequest> = {}): ExportRequest {
  return {
    format: 'png',
    scope: 'current',
    currentPage: 2,
    pageCount: 5,
    getElementsAt: () => makeElements(),
    width: 800,
    height: 600,
    fileNameBase: '板书-1001',
    ...overrides
  };
}

describe('exportBoard', () => {
  let saveMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveMock = vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/x' });
    window.electronAPI = { recordingSaveBlob: saveMock } as unknown as ElectronApi;
    mocks.toDataURL.mockReturnValue(PNG_DATA_URL);
    mocks.whenImagesReady.mockResolvedValue(undefined);
    mocks.MockKonvaRenderer.lastContainer = null;
    mocks.MockKonvaRenderer.lastOpts = null;
    mocks.jsPDFInstances.length = 0;
  });

  afterEach(() => {
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  type SaveArgs = {
    buffer: ArrayBuffer;
    defaultName: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  };
  function savedArgs(): SaveArgs {
    return saveMock.mock.calls[0]![0] as SaveArgs;
  }

  describe('resolveExportPages', () => {
    it('当前页 → 单元素页下标', () => {
      expect(resolveExportPages({ scope: 'current', currentPage: 3, pageCount: 9 })).toEqual([3]);
    });

    it('全部页 → 0..N-1', () => {
      expect(resolveExportPages({ scope: 'all', currentPage: 0, pageCount: 3 })).toEqual([0, 1, 2]);
    });

    it('全部页但零页 → 空', () => {
      expect(resolveExportPages({ scope: 'all', currentPage: 0, pageCount: 0 })).toEqual([]);
    });
  });

  it('当前页 PNG：单文件保存，容器与渲染器在结束后清理', async () => {
    const onProgress = vi.fn();
    const outcome = await runExport(makeRequest({ onProgress }));

    expect(outcome).toBe('saved');
    expect(mocks.MockKonvaRenderer.lastOpts).toEqual({ exportMode: true });
    expect(mocks.bindElements).toHaveBeenCalledTimes(1);
    expect(mocks.whenImagesReady).toHaveBeenCalledTimes(1);
    expect(mocks.toDataURL).toHaveBeenCalledWith({ pixelRatio: 2 });
    expect(onProgress).toHaveBeenCalledWith(1, 1);
    const arg = savedArgs();
    expect(arg.buffer).toBeInstanceOf(ArrayBuffer);
    expect(arg.defaultName).toBe('板书-1001-第3页.png');
    expect(arg.filters).toEqual([{ name: 'PNG 图片', extensions: ['png'] }]);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.MockKonvaRenderer.lastContainer?.isConnected).toBe(false);
  });

  it('全部页 PNG：打包 ZIP（PK 魔数 + 每页一条目）并逐页推进进度', async () => {
    const onProgress = vi.fn();
    const outcome = await runExport(makeRequest({ scope: 'all', pageCount: 3, onProgress }));

    expect(outcome).toBe('saved');
    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);
    const arg = savedArgs();
    expect(arg.defaultName).toBe('板书-1001-全3页.zip');
    expect(arg.filters).toEqual([{ name: 'ZIP 压缩包', extensions: ['zip'] }]);
    const bytes = new Uint8Array(arg.buffer);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const zip = await JSZip.loadAsync(arg.buffer);
    expect(Object.keys(zip.files).sort()).toEqual(['第1.png', '第2.png', '第3.png']);
  });

  it('全部页 PDF：逐页 addImage，除首页外 addPage', async () => {
    const outcome = await runExport(makeRequest({ format: 'pdf', scope: 'all', pageCount: 2 }));

    expect(outcome).toBe('saved');
    const doc = mocks.jsPDFInstances[0]!;
    expect(doc.opts).toEqual({
      unit: 'px',
      format: [800, 600],
      orientation: 'landscape',
      hotfixes: ['px_scaling']
    });
    expect(doc.addImage).toHaveBeenCalledTimes(2);
    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(doc.addPage).toHaveBeenCalledWith([800, 600], 'landscape');
    const arg = savedArgs();
    expect(arg.defaultName).toBe('板书-1001-全2页.pdf');
    expect(arg.filters).toEqual([{ name: 'PDF 文档', extensions: ['pdf'] }]);
    expect(arg.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('当前页 PDF：不追加 addPage', async () => {
    await runExport(makeRequest({ format: 'pdf' }));
    expect(mocks.jsPDFInstances[0]!.addPage).not.toHaveBeenCalled();
    expect(savedArgs().defaultName).toBe('板书-1001-第3页.pdf');
  });

  it('空页（无元素）仍产出合法图片', async () => {
    const outcome = await runExport(makeRequest({ getElementsAt: () => null }));
    expect(outcome).toBe('saved');
    expect(mocks.clearCurrentPage).toHaveBeenCalledTimes(1);
    expect(mocks.toDataURL).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('用户取消保存 → cancelled，不抛错', async () => {
    saveMock.mockResolvedValue({ success: false });
    await expect(runExport(makeRequest())).resolves.toBe('cancelled');
  });

  it('保存失败 → 抛可读错误', async () => {
    saveMock.mockResolvedValue({ success: false, error: '磁盘空间不足' });
    await expect(runExport(makeRequest())).rejects.toThrow('保存失败：磁盘空间不足');
  });

  it('第 N 页图片未就绪 → 抛带页号的可读错误，仍清理资源', async () => {
    mocks.whenImagesReady
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('图片加载超时'));
    await expect(runExport(makeRequest({ scope: 'all', pageCount: 3 }))).rejects.toThrow(
      '第2页图片加载超时'
    );
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.MockKonvaRenderer.lastContainer?.isConnected).toBe(false);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('零页 → 抛可读错误且不创建渲染器', async () => {
    await expect(runExport(makeRequest({ scope: 'all', pageCount: 0 }))).rejects.toThrow(
      '没有可导出的页面'
    );
    expect(mocks.MockKonvaRenderer.lastContainer).toBeNull();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('无 Electron 保存通道 → 浏览器下载回退仍成功', async () => {
    delete (window as { electronAPI?: unknown }).electronAPI;
    const createSpy = vi.fn(() => 'blob:mock');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createSpy;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await expect(runExport(makeRequest())).resolves.toBe('saved');
    expect(saveMock).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
