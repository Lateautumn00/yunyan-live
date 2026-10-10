import type * as Y from 'yjs';
import { KonvaRenderer } from './KonvaRenderer';

export interface PageSnapshotRequest {
  getElementsAt: (index: number) => Y.Array<unknown> | null;
  width: number;
  height: number;
  /** 缩略图像素倍率，默认 1（F6.1 导出为 2x，缩略单格约 80px 无需高倍） */
  pixelRatio?: number;
  /** 等待图片/PDF 页就绪上限，缩略图默认短超时，避免拖垮"翻页后 500ms 内刷新" */
  timeoutMs?: number;
}

const DEFAULT_PIXEL_RATIO = 1;
const DEFAULT_TIMEOUT_MS = 1500;

/**
 * 把指定页渲染为 PNG dataURL，供 F5.2 缩略图面板使用。
 *
 * 与 F6.1 导出共用同一套离屏管线（视口外隐藏 div + exportMode KonvaRenderer +
 * bindElements + whenImagesReady + stage.toDataURL），故 F6.1 已验收的渲染语义
 * （图片/公式/课件底图）在缩略图上天然一致。
 *
 * 任何失败一律降级为 null：缩略图是辅助视图，渲染异常不得打断面板交互，
 * 调用方拿到 null 时回退到页码占位图（§4.9 降级要求）。
 */
export async function renderPageSnapshot(
  req: PageSnapshotRequest,
  pageIndex: number
): Promise<string | null> {
  let hidden: HTMLDivElement | null = null;
  let renderer: KonvaRenderer | null = null;
  try {
    hidden = document.createElement('div');
    hidden.style.position = 'fixed';
    hidden.style.left = '-10000px';
    hidden.style.top = '0';
    hidden.style.width = `${req.width}px`;
    hidden.style.height = `${req.height}px`;
    document.body.appendChild(hidden);

    renderer = new KonvaRenderer(hidden, { exportMode: true });
    const elements = req.getElementsAt(pageIndex);
    if (elements) renderer.bindElements(elements);
    else renderer.clearCurrentPage();

    await renderer.whenImagesReady(req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return renderer.getStage().toDataURL({
      pixelRatio: req.pixelRatio ?? DEFAULT_PIXEL_RATIO
    });
  } catch {
    return null;
  } finally {
    if (renderer) {
      try {
        renderer.destroy();
      } catch {
        // 销毁失败不外抛：离屏容器随后仍会被移除
      }
    }
    hidden?.remove();
  }
}
