import { getPdfPageCount, getPdfPageDims } from './pdfAsset';
import type { YjsProvider } from './YjsProvider';

export interface PptMeta {
  numPages: number;
  dims: Array<{ w: number; h: number }>;
}

// 阶段0：上传 PPT 到网关（LibreOffice 转 PDF），返回 fileUrl。
// 抛出的 Error.message 即为可直接展示的最终文案（与原 uploadPPT 的 toast 一一对应）。
export async function uploadPptFile(api: string, file: File): Promise<string> {
  if (!api) throw new Error('未配置PPT上传接口');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(api, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`PPT上传失败: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (data.code !== 1000 || !data.data?.fileUrl) throw new Error('PPT上传失败');
    return data.data.fileUrl as string;
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    throw new Error(msg.startsWith('PPT上传') ? msg : `PPT上传出错: ${msg}`, { cause: e });
  }
}

// 阶段1：numPages/尺寸以 pdf.js 为准；任一失败抛错（画布零改动）
export async function loadPptMeta(fileUrl: string): Promise<PptMeta> {
  const numPages = await getPdfPageCount(fileUrl);
  const dims: Array<{ w: number; h: number }> = [];
  for (let i = 1; i <= numPages; i++) {
    try {
      dims.push(await getPdfPageDims(fileUrl, i));
    } catch {
      throw new Error(`加载第${i}页尺寸失败`);
    }
  }
  return { numPages, dims };
}

// 阶段2：建页/复用空白当前页 + 双维限幅居中，返回各幻灯片页 id（含被复用页）。
// 纯逻辑，不触碰 DOM 尺寸与 toast，调用方负责容器尺寸与提示。
export function importPptPages(
  provider: YjsProvider | null,
  cw: number,
  ch: number,
  fileUrl: string,
  meta: PptMeta,
): string[] {
  const active = provider?.getActiveElements();
  const canReuse =
    !!provider &&
    provider.getCurrentPageIndex() === 0 &&
    !!provider.getCurrentPageId() &&
    !!active &&
    active.length === 0;
  const layerIds: string[] = [];
  for (let i = 0; i < meta.numPages; i++) {
    // pages.observe 会同步创建并切换对应的 Konva 层，此处不得重复 showPage
    const pageId =
      i === 0 && canReuse
        ? provider!.getCurrentPageId()
        : (provider?.addPage() || `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const { w, h } = meta.dims[i]!;
    const k = Math.min(1, (cw * 0.9) / w, (ch * 0.9) / h);
    const width = w * k;
    const height = h * k;
    provider?.addShape({
      id: `pptimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'ppt-image',
      pdfUrl: fileUrl,
      page: i + 1,
      x: (cw - width) / 2,
      y: (ch - height) / 2,
      width,
      height,
    });
    layerIds.push(pageId);
  }
  return layerIds;
}
