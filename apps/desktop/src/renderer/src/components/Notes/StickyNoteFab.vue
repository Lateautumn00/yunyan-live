<template>
  <div
    class="sticky-note-fab"
    :class="{ 'is-open': open }"
    :style="positionStyle"
    role="button"
    tabindex="0"
    aria-label="便签"
    :title="open ? '关闭便签' : '打开便签'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onClick"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <el-icon :size="22"><Notebook /></el-icon>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useStickyNotes } from '@/composables/useStickyNotes';

const FAB_SIZE = 48;
const EDGE = 16;
const DRAG_THRESHOLD = 4;
const POS_KEY = 'sticky-fab-pos';

const { open, openNotes, closeNotes } = useStickyNotes();

interface FabPos {
  x: number;
  y: number;
}

function clamp(x: number, y: number): FabPos {
  const maxX = Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - FAB_SIZE - EDGE);
  return {
    x: Math.min(Math.max(EDGE, x), maxX),
    y: Math.min(Math.max(EDGE, y), maxY)
  };
}

function defaultPos(): FabPos {
  return clamp(window.innerWidth - FAB_SIZE - EDGE, window.innerHeight - FAB_SIZE - EDGE);
}

function loadPos(): FabPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FabPos>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return clamp(parsed.x, parsed.y);
  } catch {
    return null;
  }
}

const pos = ref<FabPos | null>(null);
const dragging = ref(false);
let startClient = { x: 0, y: 0 };
let startPos = { x: 0, y: 0 };
let moved = false;
let justDragged = false;

const positionStyle = computed(() => {
  const p = pos.value ?? defaultPos();
  return { left: `${p.x}px`, top: `${p.y}px` };
});

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const el = e.currentTarget as HTMLElement;
  dragging.value = true;
  moved = false;
  startClient = { x: e.clientX, y: e.clientY };
  const p = pos.value ?? defaultPos();
  startPos = { ...p };
  if (typeof e.pointerId === 'number') el.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  const dx = e.clientX - startClient.x;
  const dy = e.clientY - startClient.y;
  if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) moved = true;
  if (moved) pos.value = clamp(startPos.x + dx, startPos.y + dy);
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  const el = e.currentTarget as HTMLElement;
  if (typeof e.pointerId === 'number') el.releasePointerCapture?.(e.pointerId);
  if (moved) {
    justDragged = true;
    localStorage.setItem(POS_KEY, JSON.stringify(pos.value));
  }
}

function onClick(): void {
  if (justDragged) {
    justDragged = false;
    return;
  }
  toggle();
}

function toggle(): void {
  if (open.value) void closeNotes();
  else void openNotes();
}

function onResize(): void {
  if (pos.value) pos.value = clamp(pos.value.x, pos.value.y);
}

onMounted(() => {
  pos.value = loadPos() ?? defaultPos();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<style lang="less" scoped>
.sticky-note-fab {
  position: fixed;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff7d6;
  color: #8a6d1a;
  border: 1px solid #e8d48b;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
  cursor: grab;
  user-select: none;
  touch-action: none;
  z-index: 1500;
  transition:
    box-shadow 0.15s ease,
    background 0.15s ease;

  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  }

  &:active {
    cursor: grabbing;
  }

  &.is-open {
    background: #ffe99a;
    border-color: #d9bd57;
  }
}
</style>
