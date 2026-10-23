<template>
  <div class="board-review">
    <div class="br-head">
      <span class="br-title">课后回看</span>
      <span class="br-close" @click="$emit('close')">×</span>
    </div>
    <div v-if="loading" class="br-state">加载中…</div>
    <div v-else-if="error" class="br-state br-error">{{ error }}</div>
    <div v-else-if="!items.length" class="br-state">该房间暂无板书快照</div>
    <div v-else class="br-body">
      <ul class="br-list">
        <li
          v-for="it in items"
          :key="it.id"
          :class="['br-item', { on: it.id === selectedId }]"
          @click="open(it.id)"
        >
          <span class="br-time">{{ formatTime(it.createdAt) }}</span>
          <span class="br-size">{{ formatSize(it.size) }}</span>
        </li>
      </ul>
      <div class="br-view">
        <div v-if="viewLoading" class="br-state">快照生成中…</div>
        <div v-else-if="viewError" class="br-state br-error">{{ viewError }}</div>
        <div v-else ref="stageEl" class="br-stage" :class="{ dark: pageDark }" />
        <div v-if="pages.length > 1" class="br-pagenav">
          <span class="br-nav" @click="showPageIdx(Math.max(0, pageIdx - 1))">上一页</span>
          <span class="br-num">{{ pageIdx + 1 }}/{{ pages.length }}</span>
          <span class="br-nav" @click="showPageIdx(Math.min(pages.length - 1, pageIdx + 1))">
            下一页
          </span>
        </div>
        <div class="br-replaybar">
          <span v-if="!showReplay" class="br-nav br-replay-btn" @click="openReplay">
            过程回放
          </span>
          <span v-else class="br-nav br-replay-exit" @click="closeReplay">退出回放</span>
        </div>
        <div v-if="replayLoading" class="br-state">回放数据加载中…</div>
        <div v-else-if="replayError" class="br-state br-error br-replay-error">
          {{ replayError }}
        </div>
        <ReplayControls
          v-else-if="showReplay"
          :total="replayTotal"
          :cursor="replayCursor"
          :playing="replayPlaying"
          :speed="replaySpeed"
          :segments="replaySegments"
          :disabled="replayTotal === 0"
          @toggle="toggleReplay"
          @seek="seekReplay"
          @speed="setReplaySpeed"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue';
import type * as Y from 'yjs';
import Live from '@/api/backstage';
import { KonvaRenderer } from './whiteboard/KonvaRenderer';
import { decodeBoardSnapshot, readSnapshotPages } from './whiteboard/boardReview';
import ReplayControls from './ReplayControls.vue';
import { ReplayController, fetchReplay, type ReplaySpeed } from './whiteboard/replayPlayer';

const props = defineProps<{ roomId: string }>();
defineEmits<{ (e: 'close'): void }>();

interface HistoryItem {
  id: string;
  roomId: string;
  lessonId?: string;
  size?: number;
  createdAt?: string | number;
}

const loading = ref(false);
const error = ref('');
const items = ref<HistoryItem[]>([]);
const selectedId = ref('');
const viewLoading = ref(false);
const viewError = ref('');
const stageEl = ref<HTMLElement | null>(null);
const pages = ref<Array<{ id: string; elements: any; dark?: boolean }>>([]);
const pageIdx = ref(0);
const pageDark = ref(false);
let renderer: KonvaRenderer | null = null;
let lastDoc: Y.Doc | null = null;

/** 文档视口（老师当时的平移/缩放）应用到回看渲染器；跨窗口尺寸按直播端同式缩放 */
function applyDocViewport(doc: Y.Doc, ren: KonvaRenderer) {
  const vp = doc.getMap<number>('viewportOffset');
  const sw = vp.get('sw') || 0;
  const sh = vp.get('sh') || 0;
  const stage = ren.getStage();
  let k = 1;
  if (sw > 0 && sh > 0 && stage.width() > 0 && stage.height() > 0) {
    k = Math.min(stage.width() / sw, stage.height() / sh);
  }
  if (!vp.has('x') && ren.getNodeCount() > 0 && stage.width() > 0 && stage.height() > 0) {
    ren.zoomFitAll();
    return;
  }
  ren.setViewport((vp.get('x') || 0) * k, (vp.get('y') || 0) * k);
  ren.setZoom(Math.max(1, Math.min(200, (vp.get('zoom') || 100) * k)));
}

function formatTime(v?: string | number): string {
  if (!v) return '—';
  const d = new Date(typeof v === 'number' ? v : Number(v) || v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}
function formatSize(v?: number): string {
  if (!v) return '';
  return v > 1024 ? `${(v / 1024).toFixed(1)}KB` : `${v}B`;
}

async function fetchHistory() {
  loading.value = true;
  error.value = '';
  try {
    const res: any = await Live.board_history(props.roomId);
    items.value = res?.data?.items ?? [];
  } catch (e: any) {
    // Q4/Q9：非本房教师 → 服务端 403；统一可读文案，不暴露原始报错
    error.value = '无权限查看该房间板书回看';
  } finally {
    loading.value = false;
  }
}

async function open(id: string) {
  selectedId.value = id;
  viewLoading.value = true;
  viewError.value = '';
  pages.value = [];
  pageIdx.value = 0;
  try {
    const res: any = await Live.board_snapshot(id);
    const doc = decodeBoardSnapshot(res?.data?.data ?? '');
    pages.value = readSnapshotPages(doc);
    // 先结束加载态让舞台节点入 DOM，再渲染（否则 stageEl 为空、renderPage 空转）
    viewLoading.value = false;
    if (!pages.value.length) {
      viewError.value = '快照内容为空';
      return;
    }
    lastDoc = doc;
    const idx = doc.getMap<number>('currentPageIndex').get('index') ?? 0;
    pageIdx.value = Math.min(idx, Math.max(0, pages.value.length - 1));
    await nextTick();
    renderPage(pageIdx.value);
  } catch {
    viewError.value = '快照加载失败';
    viewLoading.value = false;
  }
}

function renderPage(idx: number) {
  const el = stageEl.value;
  const page = pages.value[idx];
  if (!el || !page) return;
  if (renderer) {
    renderer.destroy?.();
    renderer = null;
  }
  renderer = new KonvaRenderer(el);
  renderer.setSelectMode(false); // 回看只读
  renderer.addPage(0, page.id);
  renderer.showPage(0);
  renderer.bindElements(page.elements);
  pageDark.value = page.dark === true;
  if (lastDoc) applyDocViewport(lastDoc, renderer);
}

function showPageIdx(idx: number) {
  pageIdx.value = idx;
  renderPage(idx);
}

// ---------- F6.4 过程回放 ----------
const showReplay = ref(false);
const replayLoading = ref(false);
const replayError = ref('');
const replayTotal = ref(0);
const replayCursor = ref(0);
const replayPlaying = ref(false);
const replaySpeed = ref<ReplaySpeed>(1);
const replaySegments = ref<Array<{ seq: number; pageIndex: number }>>([]);
let replayCtrl: ReplayController | null = null;
let replaySyncTimer: ReturnType<typeof setInterval> | null = null;

async function openReplay() {
  showReplay.value = true;
  replayError.value = '';
  replayLoading.value = true;
  try {
    const data = await fetchReplay(props.roomId, undefined, 0);
    if (!data.baseline && data.events.length > 0) {
      replayError.value = '回放基线缺失，无法回放';
      return;
    }
    replayCtrl?.destroy();
    replayCtrl = new ReplayController();
    replayCtrl.load(data);
    replayTotal.value = replayCtrl.total;
    replayCursor.value = replayCtrl.cursor;
    replaySegments.value = replayCtrl.segments;
    replayPlaying.value = false;
    renderReplay();
  } catch {
    replayError.value = '回放数据加载失败';
  } finally {
    replayLoading.value = false;
  }
}

function renderReplay() {
  const ctrl = replayCtrl;
  if (!ctrl) return;
  lastDoc = ctrl.doc;
  pages.value = readSnapshotPages(ctrl.doc);
  const idx = ctrl.doc.getMap<number>('currentPageIndex').get('index') ?? 0;
  pageIdx.value = Math.min(idx, Math.max(0, pages.value.length - 1));
  renderPage(pageIdx.value);
}

function toggleReplay() {
  const ctrl = replayCtrl;
  if (!ctrl || !ctrl.canPlay) return;
  if (ctrl.playing) {
    ctrl.pause();
    replayPlaying.value = false;
    stopReplaySync();
  } else {
    ctrl.play();
    replayPlaying.value = true;
    startReplaySync();
  }
}

/** 回放端节流渲染：200ms 批量同步 cursor + 重绘（规格 §4.6 性能提示） */
function startReplaySync() {
  stopReplaySync();
  replaySyncTimer = setInterval(() => {
    const ctrl = replayCtrl;
    if (!ctrl) return;
    replayCursor.value = ctrl.cursor;
    if (!ctrl.playing) {
      replayPlaying.value = false;
      stopReplaySync();
    }
    renderReplay();
  }, 200);
}

function stopReplaySync() {
  if (replaySyncTimer) {
    clearInterval(replaySyncTimer);
    replaySyncTimer = null;
  }
}

function seekReplay(seq: number) {
  const ctrl = replayCtrl;
  if (!ctrl) return;
  ctrl.seekTo(seq);
  replayCursor.value = ctrl.cursor;
  replayPlaying.value = false;
  stopReplaySync();
  renderReplay();
}

function setReplaySpeed(s: ReplaySpeed) {
  replaySpeed.value = s;
  replayCtrl?.setSpeed(s);
}

function closeReplay() {
  showReplay.value = false;
  stopReplaySync();
  replayCtrl?.destroy();
  replayCtrl = null;
  replayTotal.value = 0;
  replayCursor.value = 0;
  replaySegments.value = [];
  replayPlaying.value = false;
  replayError.value = '';
  if (selectedId.value) void open(selectedId.value);
}

onMounted(fetchHistory);
onBeforeUnmount(() => {
  stopReplaySync();
  replayCtrl?.destroy();
  replayCtrl = null;
  renderer?.destroy?.();
  renderer = null;
});

defineExpose({ fetchHistory, open, pages, pageIdx, items, error, selectedId });
</script>

<style scoped lang="less">
.board-review {
  position: absolute;
  inset: 0;
  background: rgba(20, 22, 26, 0.94);
  color: #ddd;
  z-index: 30;
  display: flex;
  flex-direction: column;
  .br-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    .br-title {
      font-size: 14px;
    }
    .br-close {
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      &:hover {
        color: #fff;
      }
    }
  }
  .br-state {
    padding: 24px;
    text-align: center;
    color: #888;
    &.br-error {
      color: #e1383f;
    }
  }
  .br-body {
    flex: 1;
    display: flex;
    min-height: 0;
    .br-list {
      width: 220px;
      overflow-y: auto;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      margin: 0;
      padding: 6px;
      list-style: none;
      .br-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        &:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        &.on {
          background: rgba(64, 158, 255, 0.2);
        }
        .br-size {
          color: #888;
        }
      }
    }
    .br-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      .br-stage {
        flex: 1;
        min-height: 0;
        background: #fff;
        &.dark {
          background: #35543f;
        }
      }
      .br-pagenav {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 8px;
        font-size: 12px;
        .br-nav {
          cursor: pointer;
          &:hover {
            color: #fff;
          }
        }
      }
      .br-replaybar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 0 8px 4px;
        font-size: 12px;
        .br-nav {
          cursor: pointer;
          &:hover {
            color: #fff;
          }
        }
      }
    }
  }
}
</style>
