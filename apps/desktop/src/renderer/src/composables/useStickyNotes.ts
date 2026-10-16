import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { debounce } from '@yunyan-live/utils';
import {
  createStickyNote,
  deleteStickyNoteCascade,
  isStickyStorageDegraded,
  listStickyNotes,
  putStickyNote,
  setStickyBackend,
  type StickyBackend,
  type StickyNote,
  type StickyNoteColor,
  type StickyNoteSize
} from '@/components/Notes/stickyNoteStore';

export const STICKY_SAVE_DEBOUNCE_MS = 800;

const notes = ref<StickyNote[]>([]);
const activeId = ref<string | null>(null);
const open = ref(false);
const loaded = ref(false);
const loading = ref(false);
const degradedNotice = ref(false);

const drafts = new Map<string, StickyNote>();
const storedIds = new Set<string>();
const dirtyIds = new Set<string>();

const saveDebounce = debounce(() => {
  void persistDirty();
}, STICKY_SAVE_DEBOUNCE_MS);

async function persistDirty(): Promise<void> {
  const ids = [...dirtyIds];
  if (ids.length === 0) return;
  dirtyIds.clear();
  let failed = false;
  for (const id of ids) {
    const draft = drafts.get(id);
    if (!draft) continue;
    const isStored = storedIds.has(id);
    if (draft.content.trim() === '' && !isStored) {
      removeLocal(id);
      continue;
    }
    try {
      const saved: StickyNote = { ...draft, updatedAt: Date.now() };
      await putStickyNote(saved);
      storedIds.add(id);
      draft.updatedAt = saved.updatedAt;
      const idx = notes.value.findIndex(n => n.id === id);
      if (idx >= 0) notes.value[idx] = saved;
    } catch {
      dirtyIds.add(id);
      failed = true;
    }
  }
  if (failed) ElMessage.error('便签保存失败，请重试');
}

/** 立即落盘全部脏便签（切换/关闭/路由/pagehide/Ctrl+S 共用） */
async function flushAll(): Promise<void> {
  saveDebounce.cancel();
  if (dirtyIds.size > 0) await persistDirty();
}

function removeLocal(id: string): void {
  drafts.delete(id);
  storedIds.delete(id);
  dirtyIds.delete(id);
  const idx = notes.value.findIndex(n => n.id === id);
  if (idx >= 0) notes.value.splice(idx, 1);
  if (activeId.value === id) activeId.value = notes.value[0]?.id ?? null;
}

async function loadNotes(): Promise<void> {
  if (loaded.value || loading.value) return;
  loading.value = true;
  try {
    const list = await listStickyNotes();
    notes.value = list;
    list.forEach(n => storedIds.add(n.id));
    loaded.value = true;
    degradedNotice.value = isStickyStorageDegraded();
  } catch {
    loaded.value = true;
    ElMessage.error('便签加载失败');
  } finally {
    loading.value = false;
  }
}

/** 打开便签：加载本地数据；无便签时自动新建第一条 */
async function openNotes(): Promise<void> {
  await loadNotes();
  open.value = true;
  if (notes.value.length === 0) {
    await createNote();
  } else if (!notes.value.some(n => n.id === activeId.value)) {
    activeId.value = notes.value[0]!.id;
  }
}

async function closeNotes(): Promise<void> {
  await flushAll();
  open.value = false;
}

/** 新建便签：先全量落盘上一条（切换即触发）再置为活动项 */
async function createNote(): Promise<StickyNote> {
  await flushAll();
  const note = createStickyNote();
  notes.value.unshift(note);
  drafts.set(note.id, note);
  activeId.value = note.id;
  return note;
}

/** 切换便签：先全量落盘再切换（避免孤儿图竞态） */
async function selectNote(id: string): Promise<void> {
  if (activeId.value === id) return;
  await flushAll();
  if (notes.value.some(n => n.id === id)) activeId.value = id;
}

function getActive(): StickyNote | null {
  const id = activeId.value;
  if (!id) return null;
  return drafts.get(id) ?? notes.value.find(n => n.id === id) ?? null;
}

type NotePatch = Partial<Pick<StickyNote, 'content' | 'color' | 'size'>>;

function updateActive(patch: NotePatch): void {
  const id = activeId.value;
  if (!id) return;
  const idx = notes.value.findIndex(n => n.id === id);
  if (idx < 0) return;
  const base = drafts.get(id) ?? notes.value[idx]!;
  const next = { ...base, ...patch };
  drafts.set(id, next);
  notes.value[idx] = next;
  dirtyIds.add(id);
  saveDebounce();
}

function updateColor(color: StickyNoteColor): void {
  updateActive({ color });
}

function updateSize(size: StickyNoteSize): void {
  updateActive({ size });
}

async function deleteNote(id: string): Promise<void> {
  await flushAll();
  await deleteStickyNoteCascade(id);
  removeLocal(id);
}

/** 从存储重新加载列表（导入后刷新），活动项失效时移到首条 */
async function reloadNotes(): Promise<void> {
  loaded.value = false;
  await loadNotes();
  if (!notes.value.some(n => n.id === activeId.value)) {
    activeId.value = notes.value[0]?.id ?? null;
  }
}

function setBackend(b: StickyBackend | null): void {
  setStickyBackend(b);
}

function reset(): void {
  saveDebounce.cancel();
  notes.value = [];
  activeId.value = null;
  open.value = false;
  loaded.value = false;
  loading.value = false;
  degradedNotice.value = false;
  drafts.clear();
  storedIds.clear();
  dirtyIds.clear();
}

export function useStickyNotes() {
  return {
    notes,
    activeId,
    open,
    loaded,
    loading,
    degradedNotice,
    openNotes,
    closeNotes,
    createNote,
    selectNote,
    getActive,
    updateActive,
    updateColor,
    updateSize,
    deleteNote,
    reloadNotes,
    flushAll,
    setBackend,
    reset
  };
}
