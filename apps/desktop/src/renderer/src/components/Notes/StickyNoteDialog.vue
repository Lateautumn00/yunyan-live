<template>
  <el-dialog
    :model-value="open"
    class="sticky-note-dialog"
    title="便签"
    width="720px"
    :modal="false"
    draggable
    :close-on-click-modal="false"
    @update:model-value="onVisibleChange"
  >
    <div class="note-layout" @paste="onPaste" @drop.prevent="onDrop" @dragover.prevent>
      <div class="note-list">
        <div class="note-list-header">
          <span class="note-list-count">便签（{{ notes.length }}）</span>
          <el-button size="small" :icon="Plus" @click="onCreate">新建</el-button>
        </div>
        <div class="note-list-items">
          <div
            v-for="note in notes"
            :key="note.id"
            class="note-item"
            :class="{ active: note.id === activeId }"
            @click="onSelect(note.id)"
          >
            <div class="note-item-main">
              <div class="note-item-title">{{ noteTitle(note.content) }}</div>
              <div class="note-item-meta">{{ formatTime(note.updatedAt) }}</div>
            </div>
            <el-icon class="note-item-delete" @click.stop="onDelete(note.id)">
              <Delete />
            </el-icon>
          </div>
          <div v-if="!notes.length" class="note-list-empty">暂无便签</div>
        </div>
      </div>
      <div class="note-main">
        <div v-if="degradedNotice" class="note-degraded">
          本地存储不可用，便签仅保留在本次会话内存中，请及时导出备份。
        </div>
        <div class="note-toolbar">
          <div class="note-colors">
            <button
              v-for="c in STICKY_NOTE_COLORS"
              :key="c"
              type="button"
              class="note-color"
              :class="[`color-${c}`, { active: (activeNote?.color ?? 'yellow') === c }]"
              :title="colorLabel(c)"
              @click="onColor(c)"
            />
          </div>
          <el-radio-group
            :model-value="activeNote?.size ?? 'medium'"
            size="small"
            @update:model-value="onSize"
          >
            <el-radio-button value="small">小</el-radio-button>
            <el-radio-button value="medium">中</el-radio-button>
            <el-radio-button value="large">大</el-radio-button>
          </el-radio-group>
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="edit">编辑</el-radio-button>
            <el-radio-button value="preview">预览</el-radio-button>
          </el-radio-group>
          <div class="note-toolbar-right">
            <span class="note-chars" :class="{ over: chars > MAX_NOTE_CHARS }">
              {{ chars }}/{{ MAX_NOTE_CHARS }}
            </span>
            <el-button size="small" :icon="Picture" @click="onPickImage">图片</el-button>
            <el-button size="small" @click="onExport">导出</el-button>
            <el-button size="small" @click="onImportClick">导入</el-button>
          </div>
        </div>
        <div class="note-editor-wrap" :style="{ background: noteBg }">
          <textarea
            v-if="mode === 'edit'"
            ref="editorRef"
            class="note-editor"
            :value="activeContent"
            :style="editorStyle"
            spellcheck="false"
            placeholder="记录点什么…（支持 Markdown，可粘贴/拖入图片）"
            @input="onEditorInput"
          />
          <div
            v-show="mode === 'preview'"
            ref="previewRef"
            class="note-preview"
            :style="editorStyle"
            v-html="renderedHtml"
          />
          <div v-if="mode === 'preview' && !activeContent" class="note-preview-empty">
            暂无内容，切换到「编辑」开始记录
          </div>
        </div>
        <div class="note-footer">
          <span>Markdown 支持 · Ctrl+S 保存 · Esc 关闭</span>
        </div>
      </div>
    </div>
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      class="note-file-input"
      @change="onFileChange"
    />
    <input
      ref="archiveInputRef"
      type="file"
      accept=".zip,application/zip"
      class="note-file-input"
      @change="onImportFile"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, Picture, Plus } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { uid } from '@yunyan-live/utils';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import { useStickyNotes } from '@/composables/useStickyNotes';
import { useStickyNoteImages } from '@/composables/useStickyNoteImages';
import {
  putStickyNoteImage,
  STICKY_NOTE_COLORS,
  type StickyNoteColor,
  type StickyNoteSize
} from './stickyNoteStore';
import {
  countNoteChars,
  MAX_NOTE_CHARS,
  noteImageMarkdown,
  noteTitle,
  renderNoteMarkdown
} from './markdownNote';
import { exportNotesArchive, importNotesArchive } from './exportImport';

type NoteMode = 'edit' | 'preview';

const COLOR_BG: Record<StickyNoteColor, string> = {
  yellow: '#fffbe6',
  green: '#f0fbf0',
  blue: '#f0f7ff',
  pink: '#fff4f8',
  purple: '#f8f4ff',
  gray: '#f6f6f6'
};

const COLOR_LABELS: Record<StickyNoteColor, string> = {
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  pink: '粉色',
  purple: '紫色',
  gray: '灰色'
};

const {
  notes,
  activeId,
  open,
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
  flushAll
} = useStickyNotes();
const { ensureFor, revokeStale, revokeAll, applyTo } = useStickyNoteImages();

const mode = ref<NoteMode>('edit');
const editorRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const archiveInputRef = ref<HTMLInputElement | null>(null);
let limitWarned = false;

const activeNote = computed(() => notes.value.find(n => n.id === activeId.value) ?? null);
const activeContent = computed(() => activeNote.value?.content ?? '');
const chars = computed(() => countNoteChars(activeContent.value));
const renderedHtml = computed(() => renderNoteMarkdown(activeContent.value));
const editorStyle = computed(() => {
  const size = activeNote.value?.size ?? 'medium';
  return { fontSize: size === 'small' ? '13px' : size === 'large' ? '18px' : '15px' };
});
const noteBg = computed(() => COLOR_BG[activeNote.value?.color ?? 'yellow']);

function colorLabel(c: StickyNoteColor): string {
  return COLOR_LABELS[c];
}

function formatTime(ts: number): string {
  return dayjs(ts).format('MM-DD HH:mm');
}

function onVisibleChange(visible: boolean): void {
  if (visible) void openNotes();
  else void closeNotes();
}

async function onCreate(): Promise<void> {
  await createNote();
  mode.value = 'edit';
  await nextTick();
  editorRef.value?.focus();
}

function onSelect(id: string): void {
  void selectNote(id);
}

function onColor(c: StickyNoteColor): void {
  updateColor(c);
}

function onSize(value: string | number | boolean | undefined): void {
  if (typeof value === 'string') updateSize(value as StickyNoteSize);
}

function onEditorInput(e: Event): void {
  const el = e.target as HTMLTextAreaElement;
  const value = el.value;
  if (countNoteChars(value) > MAX_NOTE_CHARS) {
    el.value = activeContent.value;
    if (!limitWarned) {
      limitWarned = true;
      ElMessage.warning(`单条便签最多 ${MAX_NOTE_CHARS} 字`);
    }
    return;
  }
  limitWarned = false;
  updateActive({ content: value });
}

async function insertAtCursor(text: string): Promise<void> {
  if (mode.value !== 'edit') {
    mode.value = 'edit';
    await nextTick();
  }
  const ta = editorRef.value;
  const base = getActive()?.content ?? activeContent.value;
  if (!ta) {
    updateActive({ content: base ? `${base}\n${text}` : text });
    return;
  }
  const start = ta.selectionStart ?? base.length;
  const end = ta.selectionEnd ?? start;
  const next = base.slice(0, start) + text + base.slice(end);
  updateActive({ content: next });
  await nextTick();
  ta.focus();
  ta.setSelectionRange(start + text.length, start + text.length);
}

async function insertImages(files: File[]): Promise<void> {
  const images = files.filter(f => f.type.startsWith('image/'));
  if (!images.length) {
    ElMessage.warning('仅支持插入图片文件');
    return;
  }
  for (const file of images) {
    const id = uid('img-');
    try {
      await putStickyNoteImage(id, file);
    } catch {
      ElMessage.error('图片保存失败');
      continue;
    }
    await insertAtCursor(noteImageMarkdown(id));
  }
}

function onPaste(e: ClipboardEvent): void {
  const dt = e.clipboardData;
  if (!dt) return;
  const items = Array.from(dt.items);
  const imageFiles: File[] = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }
  if (imageFiles.length) {
    e.preventDefault();
    void insertImages(imageFiles);
    return;
  }
  if (items.some(i => i.type === 'text/html')) {
    e.preventDefault();
    const text = dt.getData('text/plain');
    if (text) void insertAtCursor(text);
  }
}

function onDrop(e: DragEvent): void {
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) void insertImages(files);
}

function onPickImage(): void {
  fileInputRef.value?.click();
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) void insertImages(files);
}

async function onExport(): Promise<void> {
  await flushAll();
  const outcome = await exportNotesArchive(notes.value);
  if (outcome === 'saved') ElMessage.success(`已导出 ${notes.value.length} 条便签`);
  else if (outcome === 'failed') ElMessage.error('便签导出失败');
}

function onImportClick(): void {
  archiveInputRef.value?.click();
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const { notes: imported } = await importNotesArchive(buffer);
    await reloadNotes();
    ElMessage.success(`已导入 ${imported.length} 条便签`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '便签导入失败');
  }
}

function titleFor(id: string): string {
  const note = notes.value.find(n => n.id === id);
  return note ? noteTitle(note.content) : '未命名便签';
}

const { deleting, confirmAndDelete } = useConfirmDelete<string>({
  message: id => `确定删除便签「${titleFor(id)}」？其中引用的图片会一并删除。`,
  action: id => deleteNote(id),
  boxTitle: '删除便签',
  confirmText: '删除',
  successMessage: () => '已删除便签'
});

async function onDelete(id: string): Promise<void> {
  const ok = await confirmAndDelete(id);
  if (ok && !notes.value.length) await createNote();
}

function onDocKeydown(e: KeyboardEvent): void {
  if (!open.value) return;
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (key === 'escape') {
    if (deleting.value) return;
    e.preventDefault();
    e.stopPropagation();
    void closeNotes();
    return;
  }
  if (mod && !e.altKey && key === 's') {
    e.preventDefault();
    e.stopPropagation();
    void flushAll().then(() => ElMessage.success('便签已保存'));
    return;
  }
  const dangerous =
    key === 'delete' ||
    key === 'backspace' ||
    (mod && (key === 'z' || key === 'y')) ||
    (mod && e.shiftKey && key === 'x');
  if (!dangerous) return;
  const target = e.target as HTMLElement | null;
  const inInput =
    !!target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (inInput) return;
  e.preventDefault();
  e.stopPropagation();
}

watch(open, val => {
  if (val) document.addEventListener('keydown', onDocKeydown, true);
  else document.removeEventListener('keydown', onDocKeydown, true);
});

watch([renderedHtml, open], async () => {
  if (!open.value) return;
  await ensureFor(activeContent.value);
  await nextTick();
  applyTo(previewRef.value);
  revokeStale(activeContent.value);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKeydown, true);
  revokeAll();
});
</script>

<style lang="less" scoped>
.note-layout {
  display: flex;
  height: 430px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}

.note-list {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #ebeef5;
  background: #fafafa;
}

.note-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
}

.note-list-count {
  font-size: 13px;
  color: #606266;
}

.note-list-items {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.note-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: #f0f1f2;
  }

  &.active {
    background: #fff3c2;
  }
}

.note-item-main {
  flex: 1;
  min-width: 0;
}

.note-item-title {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-item-meta {
  font-size: 11px;
  color: #a8abb2;
  margin-top: 2px;
}

.note-item-delete {
  flex-shrink: 0;
  color: #c0c4cc;
  opacity: 0;

  .note-item:hover &,
  .note-item.active & {
    opacity: 1;
  }

  &:hover {
    color: #f56c6c;
  }
}

.note-list-empty {
  padding: 16px 8px;
  text-align: center;
  font-size: 12px;
  color: #a8abb2;
}

.note-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.note-degraded {
  padding: 6px 10px;
  font-size: 12px;
  color: #8a6d1a;
  background: #fff7d6;
  border-bottom: 1px solid #f0e0b0;
}

.note-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-bottom: 1px solid #ebeef5;
}

.note-colors {
  display: flex;
  gap: 6px;
}

.note-color {
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;

  &.active {
    box-shadow: 0 0 0 2px #409eff;
  }

  &.color-yellow {
    background: #fff3a3;
  }

  &.color-green {
    background: #d7f5d9;
  }

  &.color-blue {
    background: #d5ecff;
  }

  &.color-pink {
    background: #ffd9e8;
  }

  &.color-purple {
    background: #e8dcff;
  }

  &.color-gray {
    background: #ececec;
  }
}

.note-toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-chars {
  font-size: 12px;
  color: #a8abb2;

  &.over {
    color: #f56c6c;
  }
}

.note-editor-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
}

.note-editor {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  line-height: 1.6;
  font-family: inherit;
  color: #303133;
}

.note-preview {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  line-height: 1.6;
  color: #303133;
  overflow-wrap: break-word;

  :deep(img) {
    max-width: 100%;
    border-radius: 4px;
  }

  :deep(p) {
    margin: 0 0 8px;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0 0 8px;
    padding-left: 20px;
  }

  :deep(blockquote) {
    margin: 0 0 8px;
    padding: 4px 10px;
    border-left: 3px solid #dcdfe6;
    color: #909399;
  }

  :deep(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }
}

.note-preview-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #a8abb2;
  pointer-events: none;
}

.note-footer {
  padding: 6px 10px;
  font-size: 11px;
  color: #c0c4cc;
  border-top: 1px solid #ebeef5;
  text-align: right;
}

.note-file-input {
  display: none;
}
</style>
