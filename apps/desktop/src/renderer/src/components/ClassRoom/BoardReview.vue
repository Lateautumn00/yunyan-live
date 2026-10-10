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
        <div v-else ref="stageEl" class="br-stage" />
        <div v-if="pages.length > 1" class="br-pagenav">
          <span class="br-nav" @click="showPageIdx(Math.max(0, pageIdx - 1))">上一页</span>
          <span class="br-num">{{ pageIdx + 1 }}/{{ pages.length }}</span>
          <span class="br-nav" @click="showPageIdx(Math.min(pages.length - 1, pageIdx + 1))">
            下一页
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue';
import Live from '@/api/backstage';
import { KonvaRenderer } from './whiteboard/KonvaRenderer';
import { decodeBoardSnapshot, readSnapshotPages } from './whiteboard/boardReview';

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
const pages = ref<Array<{ id: string; elements: any }>>([]);
const pageIdx = ref(0);
let renderer: KonvaRenderer | null = null;

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
    await nextTick();
    renderPage(0);
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
}

function showPageIdx(idx: number) {
  pageIdx.value = idx;
  renderPage(idx);
}

onMounted(fetchHistory);
onBeforeUnmount(() => {
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
    }
  }
}
</style>
