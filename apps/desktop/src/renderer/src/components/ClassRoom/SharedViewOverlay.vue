<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { vendorUrl } from './whiteboard/vendorUrl';
import { captureCanvasFromDoc, type SharedViewCapture } from './whiteboard/sharedViewCapture';
import type { SharedViewKind } from './whiteboard/types';

/** F3.4/F3.5 页内拖拽浮层：外挂工具视图宿主（教师开关+拖拽，学生跟随只读） */
const props = defineProps<{
  kind: SharedViewKind | null;
  isTeacher: boolean;
  /** 测试注入寻址（缺省走 vendorUrl IPC） */
  resolveUrl?: (kind: SharedViewKind) => Promise<string>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'capture', payload: SharedViewCapture): void;
}>();

const REL: Record<SharedViewKind, string> = {
  circuit: 'circuitjs/circuitjs.html',
  molecule: 'molecule/harness.html'
};
const TITLE: Record<SharedViewKind, string> = {
  circuit: '电路实验室',
  molecule: '分子模型'
};

const src = ref('');
const loading = ref(false);
const errored = ref(false);
const fullscreen = ref(false);
const pos = ref({ x: 120, y: 72 });
const posStyle = computed(() => ({
  left: `${pos.value.x}px`,
  top: `${pos.value.y}px`
}));

const title = computed(() => (props.kind ? TITLE[props.kind] : ''));

async function resolve(): Promise<void> {
  if (!props.kind) return;
  loading.value = true;
  errored.value = false;
  src.value = '';
  try {
    const url = props.resolveUrl
      ? await props.resolveUrl(props.kind)
      : await vendorUrl(REL[props.kind]);
    src.value = url;
  } catch {
    errored.value = true;
    loading.value = false;
  }
}

watch(
  () => props.kind,
  k => {
    if (k) void resolve();
    else {
      src.value = '';
      loading.value = false;
      errored.value = false;
      fullscreen.value = false;
    }
  },
  { immediate: true }
);

/** Esc 桥：iframe 内按键不冒泡父页（隔离），教师端注入监听 → 关闭浮层；跨域不可达时降级仅父页级 Esc */
function onFrameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

function attachEscapeBridge(): void {
  if (!props.isTeacher) return;
  try {
    frameRef.value?.contentDocument?.addEventListener('keydown', onFrameKeydown);
  } catch {
    /* 跨域降级（截图回填同款语义） */
  }
}

function onLoad(): void {
  loading.value = false;
  attachEscapeBridge();
}

function toggleFullscreen(): void {
  fullscreen.value = !fullscreen.value;
}

/** F3.4 截图回填：取 iframe 主视图 canvas → emit 给父页落画布（无 canvas/跨域不 emit） */
function captureToBoard(): void {
  const frame = frameRef.value;
  const capture = captureCanvasFromDoc(frame?.contentDocument ?? null);
  if (capture) emit('capture', capture);
}

const frameRef = ref<HTMLIFrameElement | null>(null);

function onHeaderPointerDown(e: PointerEvent): void {
  if (fullscreen.value) return;
  // 标题栏内的按钮（关闭/插入画布/全屏）不进入拖拽：否则 setPointerCapture 会把
  // pointerup/click 重定向到标题栏，按钮自身 click 永不触发（关不掉/插入无反应）
  const t = e.target as HTMLElement | null;
  if (t && typeof t.closest === 'function' && t.closest('button')) return;
  try {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    /* jsdom 无活动指针，仅测试环境 */
  }
  dragOrigin = { px: e.clientX, py: e.clientY, ox: pos.value.x, oy: pos.value.y };
}

let dragOrigin: { px: number; py: number; ox: number; oy: number } | null = null;

function onDragMove(e: PointerEvent): void {
  if (!dragOrigin) return;
  const dx = e.clientX - dragOrigin.px;
  const dy = e.clientY - dragOrigin.py;
  pos.value = {
    x: Math.max(0, dragOrigin.ox + dx),
    y: Math.max(0, dragOrigin.oy + dy)
  };
}

function onDragEnd(_e: PointerEvent): void {
  dragOrigin = null;
}

/** F3.4/F3.5 走查修复：Tab 键盘入口——焦点送进 iframe 并落到首个可聚焦元素（保证可见焦点环）；跨域降级为浏览上下文聚焦 */
function focusFrame(): void {
  const win = frameRef.value?.contentWindow;
  if (!win) return;
  win.focus();
  try {
    const el = win.document.querySelector<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    el?.focus();
  } catch {
    /* 跨域降级：已聚焦浏览上下文，下一次 Tab 由浏览器进 iframe 内首个可聚焦元素 */
  }
}

onBeforeUnmount(() => {
  dragOrigin = null;
  try {
    frameRef.value?.contentDocument?.removeEventListener('keydown', onFrameKeydown);
  } catch {
    /* 跨域降级 */
  }
});

defineExpose({ onHeaderPointerDown, onDragMove, onDragEnd, focusFrame });
</script>

<template>
  <div v-if="kind" class="shared-view-overlay" :class="{ fullscreen }">
    <div class="sv-panel" :style="posStyle">
      <div
        class="sv-header"
        @pointerdown="onHeaderPointerDown"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span class="sv-title">{{ title }}</span>
        <span class="sv-actions">
          <button class="sv-fullscreen" type="button" @click="toggleFullscreen">
            {{ fullscreen ? '退出全屏' : '全屏' }}
          </button>
          <button v-if="isTeacher" class="sv-capture" type="button" @click="captureToBoard">
            插入画布
          </button>
          <button v-if="isTeacher" class="sv-close" type="button" @click="emit('close')">
            关闭
          </button>
        </span>
      </div>
      <div class="sv-body">
        <div v-if="errored" class="sv-error">
          <p>外挂资源加载失败</p>
          <button class="sv-retry" type="button" @click="resolve">重试</button>
        </div>
        <template v-else>
          <div v-if="loading || !src" class="sv-loading">加载中…</div>
          <iframe v-if="src" ref="frameRef" class="sv-frame" :src="src" @load="onLoad" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shared-view-overlay {
  position: absolute;
  inset: 0;
  /* 层级槽位：便签球 1500 < 本浮层 1600 < EP 弹窗/EmojiPicker 2000 < el-message 3000 */
  z-index: 1600;
}
.shared-view-overlay.fullscreen {
  background: rgba(0, 0, 0, 0.45);
}
.shared-view-overlay.fullscreen .sv-panel {
  position: absolute;
  left: 0 !important;
  top: 0 !important;
  width: 100%;
  height: 100%;
}
.sv-panel {
  position: absolute;
  width: 720px;
  height: 480px;
  max-width: 92%;
  max-height: 88%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.sv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  cursor: move;
  user-select: none;
  touch-action: none;
}
.sv-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.sv-actions {
  display: flex;
  gap: 6px;
}
.sv-actions button {
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 4px;
  font-size: 12px;
  padding: 2px 8px;
  cursor: pointer;
}
.sv-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.sv-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
/* 走查修复：焦点进入浮层（iframe 文档聚焦时 iframe 元素匹配 :focus）→ 整框蓝描边，Tab 后可见反馈 */
.sv-frame:focus {
  outline: 2px solid #409eff;
  outline-offset: -2px;
}
.sv-loading,
.sv-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #909399;
  font-size: 13px;
  background: #fafafa;
}
.sv-error p {
  margin: 0;
  color: #f56c6c;
}
.sv-retry {
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 4px;
  padding: 3px 12px;
  cursor: pointer;
}
</style>
