import JSZip from 'jszip';
import dayjs from 'dayjs';
import type { SaveFileFilter } from '@yunyan-live/ipc';
import {
  getStickyNoteImage,
  putStickyNote,
  putStickyNoteImage,
  sweepOrphanStickyImages,
  STICKY_NOTE_COLORS,
  STICKY_NOTE_SIZES,
  type StickyNote,
  type StickyNoteColor,
  type StickyNoteSize
} from './stickyNoteStore';

/** 便签导出（zip：notes.json 清单 + images/ 原图）与导入（覆盖写入） */

export const NOTES_ARCHIVE_FORMAT = 'yunyan-sticky-notes';
export const NOTES_ARCHIVE_VERSION = 1;

const ZIP_FILTERS: SaveFileFilter[] = [{ name: 'ZIP 压缩包', extensions: ['zip'] }];
const IMAGE_REF_RE = /note-img:([A-Za-z0-9_-]+)/g;

export interface NotesArchive {
  format: string;
  version: number;
  exportedAt: number;
  notes: StickyNote[];
}

export interface ParsedNotesArchive {
  archive: NotesArchive;
  images: Map<string, Blob>;
}

export type ExportOutcome = 'saved' | 'cancelled' | 'failed';

async function saveZipFile(buffer: ArrayBuffer, defaultName: string): Promise<ExportOutcome> {
  const api = window.electronAPI;
  if (api?.recordingSaveBlob) {
    try {
      const result = await api.recordingSaveBlob({
        buffer,
        defaultName,
        filters: ZIP_FILTERS
      });
      if (result?.success) return 'saved';
      if (result?.error) return 'failed';
      return 'cancelled';
    } catch {
      return 'failed';
    }
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
  } catch {
    return 'failed';
  }
}

function collectReferencedImageIds(notes: StickyNote[]): string[] {
  const ids = new Set<string>();
  for (const note of notes) {
    for (const m of note.content.matchAll(IMAGE_REF_RE)) {
      if (m[1]) ids.add(m[1]);
    }
  }
  return [...ids];
}

/** 导出全部便签为 zip（notes.json + 引用到的原图） */
export async function exportNotesArchive(notes: StickyNote[]): Promise<ExportOutcome> {
  const zip = new JSZip();
  const manifest: NotesArchive = {
    format: NOTES_ARCHIVE_FORMAT,
    version: NOTES_ARCHIVE_VERSION,
    exportedAt: Date.now(),
    notes
  };
  zip.file('notes.json', JSON.stringify(manifest, null, 2));
  for (const id of collectReferencedImageIds(notes)) {
    const image = await getStickyNoteImage(id);
    if (image) zip.file(`images/${id}`, image.blob);
  }
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  const stamp = dayjs().format('YYYYMMDD-HHmmss');
  return saveZipFile(buffer, `云砚便签-${stamp}.zip`);
}

function normalizeColor(value: unknown): StickyNoteColor {
  return STICKY_NOTE_COLORS.includes(value as StickyNoteColor)
    ? (value as StickyNoteColor)
    : 'yellow';
}

function normalizeSize(value: unknown): StickyNoteSize {
  return STICKY_NOTE_SIZES.includes(value as StickyNoteSize) ? (value as StickyNoteSize) : 'medium';
}

function normalizeNote(raw: unknown): StickyNote | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || typeof r.content !== 'string') return null;
  const now = Date.now();
  return {
    id: r.id,
    content: r.content,
    color: normalizeColor(r.color),
    size: normalizeSize(r.size),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now
  };
}

async function parseImageFolder(zip: JSZip): Promise<Map<string, Blob>> {
  const images = new Map<string, Blob>();
  const names = Object.keys(zip.files).filter(
    name => name.startsWith('images/') && !zip.files[name]!.dir && name.length > 'images/'.length
  );
  for (const name of names) {
    const id = name.slice('images/'.length);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
    const blob = await zip.files[name]!.async('blob');
    images.set(id, blob);
  }
  return images;
}

/** 解析校验便签包（格式/版本/逐条字段），失败抛可读错误 */
export async function parseNotesArchive(buffer: ArrayBuffer): Promise<ParsedNotesArchive> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('便签包无法解压，请选择导出的 zip 文件');
  }
  const entry = zip.file('notes.json');
  if (!entry) throw new Error('便签包缺少 notes.json，不是有效的便签导出文件');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.async('string'));
  } catch {
    throw new Error('便签包 notes.json 解析失败');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('便签包格式无效');
  const archive = parsed as Record<string, unknown>;
  if (archive.format !== NOTES_ARCHIVE_FORMAT) throw new Error('不是云砚便签导出文件');
  if (typeof archive.version === 'number' && archive.version > NOTES_ARCHIVE_VERSION) {
    throw new Error('便签包版本过新，请升级应用后导入');
  }
  if (!Array.isArray(archive.notes)) throw new Error('便签包缺少便签列表');
  const notes = archive.notes.map(normalizeNote).filter((n): n is StickyNote => n !== null);
  if (notes.length === 0 && archive.notes.length > 0) {
    throw new Error('便签包中的便签字段无效');
  }
  const images = await parseImageFolder(zip);
  return {
    archive: {
      format: NOTES_ARCHIVE_FORMAT,
      version: typeof archive.version === 'number' ? archive.version : NOTES_ARCHIVE_VERSION,
      exportedAt: typeof archive.exportedAt === 'number' ? archive.exportedAt : Date.now(),
      notes
    },
    images
  };
}

/** 导入便签包：先写图片后写便签（同 id 覆盖），清扫孤儿图；返回便签列表与图片数 */
export async function importNotesArchive(
  buffer: ArrayBuffer
): Promise<{ notes: StickyNote[]; imageCount: number }> {
  const { archive, images } = await parseNotesArchive(buffer);
  for (const [id, blob] of images) await putStickyNoteImage(id, blob);
  for (const note of archive.notes) await putStickyNote(note);
  await sweepOrphanStickyImages();
  return { notes: archive.notes, imageCount: images.size };
}
