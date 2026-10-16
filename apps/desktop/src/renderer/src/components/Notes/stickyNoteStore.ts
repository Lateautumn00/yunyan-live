/** 便签本地持久化：IndexedDB（yunyan-notes，notes+images 两 store）+ 可注入内存后端（测试/降级） */

import { uid } from '@yunyan-live/utils';

export type StickyNoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'gray';
export type StickyNoteSize = 'small' | 'medium' | 'large';

export const STICKY_NOTE_COLORS: readonly StickyNoteColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'gray'
];
export const STICKY_NOTE_SIZES: readonly StickyNoteSize[] = ['small', 'medium', 'large'];

export interface StickyNote {
  id: string;
  content: string;
  color: StickyNoteColor;
  size: StickyNoteSize;
  createdAt: number;
  updatedAt: number;
}

export interface StickyNoteImage {
  id: string;
  blob: Blob;
  createdAt: number;
}

/** 存储后端抽象：默认 IndexedDB，测试注入内存实现（jsdom 无原生 IndexedDB） */
export interface StickyBackend {
  listNotes(): Promise<StickyNote[]>;
  getNote(id: string): Promise<StickyNote | null>;
  putNote(note: StickyNote): Promise<void>;
  deleteNote(id: string): Promise<void>;
  listImageIds(): Promise<string[]>;
  getImage(id: string): Promise<StickyNoteImage | null>;
  putImage(image: StickyNoteImage): Promise<void>;
  deleteImage(id: string): Promise<void>;
}

const DB_NAME = 'yunyan-notes';
const DB_VERSION = 1;
const NOTE_STORE = 'notes';
const IMAGE_STORE = 'images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTE_STORE)) {
        db.createObjectStore(NOTE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

function sortNotes(notes: StickyNote[]): StickyNote[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

function idbBackend(): StickyBackend {
  return {
    listNotes: () =>
      runTx<StickyNote[]>(NOTE_STORE, 'readonly', s => s.getAll()).then(list =>
        sortNotes(list || [])
      ),
    getNote: id =>
      runTx<StickyNote | undefined>(NOTE_STORE, 'readonly', s => s.get(id)).then(n => n ?? null),
    putNote: note => runTx(NOTE_STORE, 'readwrite', s => s.put(note)),
    deleteNote: id => runTx(NOTE_STORE, 'readwrite', s => s.delete(id)),
    listImageIds: () =>
      runTx<IDBValidKey[]>(IMAGE_STORE, 'readonly', s => s.getAllKeys()).then(keys =>
        keys.map(k => String(k))
      ),
    getImage: id =>
      runTx<StickyNoteImage | undefined>(IMAGE_STORE, 'readonly', s => s.get(id)).then(
        n => n ?? null
      ),
    putImage: image => runTx(IMAGE_STORE, 'readwrite', s => s.put(image)),
    deleteImage: id => runTx(IMAGE_STORE, 'readwrite', s => s.delete(id))
  };
}

/** 内存后端：测试与 IndexedDB 不可用时的降级（会话内有效，不跨版本） */
export function createMemoryStickyBackend(): StickyBackend {
  const notes = new Map<string, StickyNote>();
  const images = new Map<string, StickyNoteImage>();
  return {
    async listNotes() {
      return sortNotes([...notes.values()]);
    },
    async getNote(id) {
      return notes.get(id) ?? null;
    },
    async putNote(note) {
      notes.set(note.id, note);
    },
    async deleteNote(id) {
      notes.delete(id);
    },
    async listImageIds() {
      return [...images.keys()];
    },
    async getImage(id) {
      return images.get(id) ?? null;
    },
    async putImage(image) {
      images.set(image.id, image);
    },
    async deleteImage(id) {
      images.delete(id);
    }
  };
}

let backendPromise: Promise<StickyBackend> | null = null;
let degraded = false;

async function probeIdb(): Promise<boolean> {
  try {
    const db = await openDb();
    db.close();
    return true;
  } catch {
    return false;
  }
}

function resolveBackend(): Promise<StickyBackend> {
  if (!backendPromise) {
    backendPromise = probeIdb().then(ok => {
      if (ok) return idbBackend();
      degraded = true;
      return createMemoryStickyBackend();
    });
  }
  return backendPromise;
}

/** 注入后端（测试用）；传 null 恢复默认 */
export function setStickyBackend(b: StickyBackend | null): void {
  degraded = false;
  backendPromise = b ? Promise.resolve(b) : null;
}

/** IndexedDB 不可用时降级为内存后端（不持久化，仅会话内；对话框常驻提示） */
export function useMemoryStickyBackend(): void {
  degraded = false;
  backendPromise = Promise.resolve(createMemoryStickyBackend());
}

/** 便签持久化是否已降级为内存（只读） */
export function isStickyStorageDegraded(): boolean {
  return degraded;
}

export function createStickyNote(init: Partial<StickyNote> = {}): StickyNote {
  const now = Date.now();
  return {
    id: uid('note-'),
    content: '',
    color: 'yellow',
    size: 'medium',
    createdAt: now,
    updatedAt: now,
    ...init
  };
}

export async function listStickyNotes(): Promise<StickyNote[]> {
  return (await resolveBackend()).listNotes();
}

export async function getStickyNote(id: string): Promise<StickyNote | null> {
  return (await resolveBackend()).getNote(id);
}

export async function putStickyNote(note: StickyNote): Promise<void> {
  return (await resolveBackend()).putNote(note);
}

export async function listStickyNoteImageIds(): Promise<string[]> {
  return (await resolveBackend()).listImageIds();
}

export async function getStickyNoteImage(id: string): Promise<StickyNoteImage | null> {
  return (await resolveBackend()).getImage(id);
}

export async function putStickyNoteImage(id: string, blob: Blob): Promise<void> {
  return (await resolveBackend()).putImage({ id, blob, createdAt: Date.now() });
}

/** 从便签 Markdown 中提取 `note-img:<uuid>` 图片引用 */
export function extractNoteImageIds(content: string): string[] {
  const ids = new Set<string>();
  for (const m of content.matchAll(/note-img:([A-Za-z0-9_-]+)/g)) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

/** 删除未被任何便签引用的图片（删除便签后级联调用） */
export async function sweepOrphanStickyImages(): Promise<void> {
  const backend = await resolveBackend();
  const notes = await backend.listNotes();
  const referenced = new Set(notes.flatMap(n => extractNoteImageIds(n.content)));
  const ids = await backend.listImageIds();
  for (const id of ids) {
    if (!referenced.has(id)) await backend.deleteImage(id);
  }
}

/** 删除便签并级联清扫其图片（含全量孤儿图） */
export async function deleteStickyNoteCascade(id: string): Promise<void> {
  const backend = await resolveBackend();
  const note = await backend.getNote(id);
  if (!note) return;
  await backend.deleteNote(id);
  await sweepOrphanStickyImages();
}
