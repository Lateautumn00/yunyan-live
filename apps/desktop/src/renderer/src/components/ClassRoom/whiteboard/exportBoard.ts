/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import type * as Y from 'yjs';
import type { SaveFileFilter } from '@yunyan-live/ipc';
import { KonvaRenderer } from './KonvaRenderer';

export type ExportFormat = 'png' | 'pdf';
export type ExportScope = 'current' | 'all';
export type ExportOutcome = 'saved' | 'cancelled';

export interface ExportRequest {
  format: ExportFormat;
  scope: ExportScope;
  /** 0-based 当前页下标 */
  currentPage: number;
  pageCount: number;
  getElementsAt: (index: number) => Y.Array<any> | null;
  /** F7.2：页级黑板深色底（true=画墨绿底；缺省按浅色处理，浅色页会清底） */
  getPageDark?: (index: number) => boolean;
  width: number;
  height: number;
  fileNameBase: string;
  onProgress?: (done: number, total: number) => void;
}

/** F7.2 黑板模式深色底（与 WhiteBoard.vue `.whiteBoard.dark` 同值） */
export const DARK_BOARD_COLOR = '#35543f';

/** 导出像素倍率：2x 保证板书文字/细线在放大查看时清晰 */
const PIXEL_RATIO = 2;
const PNG_FILTERS: SaveFileFilter[] = [{ name: 'PNG 图片', extensions: ['png'] }];
const ZIP_FILTERS: SaveFileFilter[] = [{ name: 'ZIP 压缩包', extensions: ['zip'] }];
const PDF_FILTERS: SaveFileFilter[] = [{ name: 'PDF 文档', extensions: ['pdf'] }];

export function resolveExportPages(
  req: Pick<ExportRequest, 'scope' | 'currentPage' | 'pageCount'>
): number[] {
  if (req.scope === 'current') return [req.currentPage];
  return Array.from({ length: req.pageCount }, (_, i) => i);
}

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// 保存失败与用户取消必须区分：取消静默返回（不是错误），失败抛可读错误供 toast + 重试
async function saveExportFile(
  buffer: ArrayBuffer,
  defaultName: string,
  filters: SaveFileFilter[]
): Promise<ExportOutcome> {
  const api = window.electronAPI;
  if (api?.recordingSaveBlob) {
    const result = await api.recordingSaveBlob({ buffer, defaultName, filters });
    if (result?.success) return 'saved';
    if (result?.error) throw new Error(`保存失败：${result.error}`);
    return 'cancelled';
  }
  try {
    const url = URL.createObjectURL(new Blob([buffer]));
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'saved';
  } catch (err) {
    throw new Error('保存失败', { cause: err });
  }
}

function pageLabel(pageIndex: number, total: number, scope: ExportScope): string {
  return scope === 'current' ? `第${pageIndex + 1}页` : `全${total}页`;
}

export async function runExport(req: ExportRequest): Promise<ExportOutcome> {
  const pages = resolveExportPages(req);
  if (pages.length === 0) throw new Error('没有可导出的页面');
  const hidden = document.createElement('div');
  hidden.style.position = 'fixed';
  hidden.style.left = '-10000px';
  hidden.style.top = '0';
  hidden.style.width = `${req.width}px`;
  hidden.style.height = `${req.height}px`;
  document.body.appendChild(hidden);
  const renderer = new KonvaRenderer(hidden, { exportMode: true });
  // 导出渲染器按需带底色（测试/轻量实现可能无此方法 → 可选调用）
  const bgCapable = renderer as KonvaRenderer & {
    fillBackground?: (color: string | null) => void;
  };
  try {
    const dataUrls: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const pageIndex = pages[i]!;
      const elements = req.getElementsAt(pageIndex);
      if (elements) renderer.bindElements(elements);
      else renderer.clearCurrentPage();
      try {
        await renderer.whenImagesReady();
      } catch (err) {
        throw new Error(`第${pageIndex + 1}页${(err as Error).message}`, { cause: err });
      }
      // F7.2：黑板页导出自绘底色——离屏容器 DOM 背景不进 toDataURL，且浅色页须清掉上一页残留
      bgCapable.fillBackground?.(req.getPageDark?.(pageIndex) ? DARK_BOARD_COLOR : null);
      dataUrls.push(renderer.getStage().toDataURL({ pixelRatio: PIXEL_RATIO }));
      req.onProgress?.(i + 1, pages.length);
    }
    const label = pageLabel(pages[0]!, pages.length, req.scope);
    const base = `${req.fileNameBase}-${label}`;
    if (req.format === 'pdf') {
      const orientation = req.width > req.height ? 'landscape' : 'portrait';
      const doc = new jsPDF({
        unit: 'px',
        format: [req.width, req.height],
        orientation,
        hotfixes: ['px_scaling']
      });
      dataUrls.forEach((dataUrl, i) => {
        if (i > 0) doc.addPage([req.width, req.height], orientation);
        doc.addImage(dataUrl, 'PNG', 0, 0, req.width, req.height);
      });
      return await saveExportFile(doc.output('arraybuffer'), `${base}.pdf`, PDF_FILTERS);
    }
    if (dataUrls.length === 1) {
      return await saveExportFile(dataUrlToBuffer(dataUrls[0]!), `${base}.png`, PNG_FILTERS);
    }
    const zip = new JSZip();
    dataUrls.forEach((dataUrl, i) => {
      zip.file(`第${pages[i]! + 1}.png`, dataUrl.slice(dataUrl.indexOf(',') + 1), {
        base64: true
      });
    });
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    return await saveExportFile(zipBuffer, `${base}.zip`, ZIP_FILTERS);
  } finally {
    renderer.destroy();
    hidden.remove();
  }
}
