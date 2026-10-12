/** F5.3 多媒体嵌入：元素合同、视口对齐公式与播放推算（纯函数，无 Konva/DOM 依赖） */

export type MediaMime = 'video' | 'audio';
export type MediaSrcKind = 'url' | 'local';

/** 进度广播节流（教师侧写 awareness 的最小间隔） */
export const MEDIA_PROGRESS_MS = 2000;
/** 漂移阈值：学生端本地推算位置与声明位置差超此值才 seek 回拉 */
export const MEDIA_DRIFT_MS = 400;
/** 超长时长提示阈值（秒，1 小时） */
export const MEDIA_LONG_SEC = 3600;

export function mediaSize(mime: MediaMime): { width: number; height: number } {
  return mime === 'audio' ? { width: 320, height: 64 } : { width: 480, height: 270 };
}

/** layer 视口（stage 恒等，变换全在 Layer；学生端 k contain 系数已含在 layer 状态里） */
export interface MediaViewport {
  x: number;
  y: number;
  scale: number;
}

/** 页坐标 → stage/屏幕坐标：screen = layer.x + page × scale */
export function pageToStage(v: MediaViewport, px: number, py: number): { x: number; y: number } {
  return { x: v.x + px * v.scale, y: v.y + py * v.scale };
}

/** media 元素的 DOM overlay 矩形（.whiteBoard 内 absolute 定位，≤2px 对齐合同） */
export function mediaOverlayRect(
  v: MediaViewport,
  el: { x: number; y: number; width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const p = pageToStage(v, el.x, el.y);
  return { left: p.x, top: p.y, width: el.width * v.scale, height: el.height * v.scale };
}

/** 学生端接收时刻本地化推算：pos = 声明位置 + 本地经过时长 × 倍率（无跨机时钟依赖） */
export function playPosFrom(declaredSec: number, elapsedMs: number, rate = 1): number {
  const base = Number(declaredSec);
  if (!Number.isFinite(base) || base < 0) return 0;
  const extra = (Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0) / 1000;
  return base + extra * (rate || 1);
}

/** 漂移回拉：|当前 - 目标| 超 MEDIA_DRIFT_MS 才返回 seek 目标，否则 null（不打断自然播放）。
 *  加 epsilon 抵消 12.5/12.9 类浮点误差，边界恰 400ms 不回拉 */
export function driftSeekTo(currentSec: number, targetSec: number): number | null {
  const cur = Number(currentSec);
  const tgt = Number(targetSec);
  if (!Number.isFinite(cur) || !Number.isFinite(tgt)) return null;
  return Math.abs(cur - tgt) * 1000 > MEDIA_DRIFT_MS + 1e-6 ? tgt : null;
}

/** 超长时长提示（≥1h 建议课前裁剪） */
export function isLongDuration(sec: number): boolean {
  return Number.isFinite(sec) && sec >= MEDIA_LONG_SEC;
}

/** 标题派生：URL → host；本地 → 文件名；解析失败回退原串 */
export function mediaHostLabel(src: string, srcKind: MediaSrcKind): string {
  if (srcKind === 'local') {
    const name = src.split(/[\\/]/).pop();
    return name && name.length > 0 ? name : src;
  }
  try {
    return new URL(src).host || src;
  } catch {
    return src;
  }
}

/** 文件名派生（元素 name 字段）：URL 取路径末段（去 query/hash），本地取文件名 */
function baseName(src: string): string {
  const noQuery = src.split(/[?#]/)[0] || '';
  const seg = noQuery.split(/[\\/]/).pop();
  return seg && seg.length > 0 ? seg : src;
}

/** 本地导入路径带 `<id>-` 前缀（导入时生成），剥离还原原始文件名（仅无显式 name 的兜底） */
function stripImportId(name: string): string {
  return name.replace(/^[a-z0-9]{1,8}-/i, '');
}

export type MediaSrcResolution = { ok: true; url: string } | { ok: false; reason: 'local-student' };

/**
 * 播放地址解析：URL 跨端可播；本地文件仅教师端可播（经 localUrl 协议解析），
 * 学生端/通道缺失 → 占位（§11.2 不转码、本地文件仅教师端）
 */
export function resolveMediaSrc(
  el: { srcKind: MediaSrcKind; src: string },
  opts: { isTeacher: boolean; localUrl?: (absPath: string) => string }
): MediaSrcResolution {
  if (el.srcKind === 'url') return { ok: true, url: el.src };
  if (opts.isTeacher && opts.localUrl) return { ok: true, url: opts.localUrl(el.src) };
  return { ok: false, reason: 'local-student' };
}

/** 元素默认字段（离散态入 Yjs，教师写学生跟；播放进度走 awareness 不进文档）。
 *  name 缺省时：URL 取路径文件名；本地剥导入 id 前缀（导入流程应显式传原文件名） */
export function mediaDefaults(input: {
  srcKind: MediaSrcKind;
  src: string;
  mime: MediaMime;
  x: number;
  y: number;
  name?: string;
}): {
  type: 'media';
  srcKind: MediaSrcKind;
  src: string;
  name: string;
  mime: MediaMime;
  x: number;
  y: number;
  width: number;
  height: number;
  playing: boolean;
  time: number;
  loop: boolean;
  ended: boolean;
} {
  const size = mediaSize(input.mime);
  return {
    type: 'media',
    srcKind: input.srcKind,
    src: input.src,
    name:
      input.name ??
      (input.srcKind === 'local' ? stripImportId(baseName(input.src)) : baseName(input.src)),
    mime: input.mime,
    x: input.x,
    y: input.y,
    width: size.width,
    height: size.height,
    playing: false,
    time: 0,
    loop: false,
    ended: false
  };
}
