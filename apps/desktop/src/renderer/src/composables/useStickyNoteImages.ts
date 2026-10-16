import { extractNoteImageIds, getStickyNoteImage } from '@/components/Notes/stickyNoteStore';

/** 便签图片 blob URL 生命周期：按需创建、切换时回收失效项、关闭/卸载全量回收 */

const urlCache = new Map<string, string>();

function canUseObjectUrl(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/** 为便签内容中引用的图片准备 blob URL（已存在的跳过） */
async function ensureFor(content: string): Promise<void> {
  if (!canUseObjectUrl()) return;
  const ids = extractNoteImageIds(content);
  await Promise.all(
    ids.map(async id => {
      if (urlCache.has(id)) return;
      const image = await getStickyNoteImage(id).catch(() => null);
      if (!image) return;
      urlCache.set(id, URL.createObjectURL(image.blob));
    })
  );
}

/** 回收内容不再引用的 blob URL（切换便签时调用） */
function revokeStale(content: string): void {
  if (!canUseObjectUrl()) return;
  const needed = new Set(extractNoteImageIds(content));
  for (const [id, url] of urlCache) {
    if (!needed.has(id)) {
      URL.revokeObjectURL(url);
      urlCache.delete(id);
    }
  }
}

/** 全量回收（关闭/卸载时调用） */
function revokeAll(): void {
  if (canUseObjectUrl()) {
    for (const url of urlCache.values()) URL.revokeObjectURL(url);
  }
  urlCache.clear();
}

/** 渲染后把 `data-note-img` 的 src 换成 blob URL（挂载/内容变更后调用） */
function applyTo(root: HTMLElement | null): void {
  if (!root) return;
  const imgs = root.querySelectorAll<HTMLImageElement>('img[data-note-img]');
  imgs.forEach(img => {
    const id = img.getAttribute('data-note-img');
    const url = id ? urlCache.get(id) : undefined;
    if (url) {
      img.src = url;
    } else {
      img.style.display = 'none';
    }
  });
}

function hasUrl(id: string): boolean {
  return urlCache.has(id);
}

function reset(): void {
  revokeAll();
}

export function useStickyNoteImages() {
  return { ensureFor, revokeStale, revokeAll, applyTo, hasUrl, reset };
}
