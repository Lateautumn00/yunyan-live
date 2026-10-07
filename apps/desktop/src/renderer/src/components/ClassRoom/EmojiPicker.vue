<template>
  <div v-click-outside="close" class="emoji">
    <span ref="btnRef" class="emoji-btn" aria-label="表情" @click="toggle">😀</span>
    <div v-if="open" ref="panelRef" class="emoji-panel" :style="panelStyle">
      <span v-for="e in EMOJI_LIST" :key="e" class="emoji-item" @click="emit('select', e)">{{
        e
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { ClickOutside as vClickOutside } from 'element-plus';
import { EMOJI_LIST } from '@/utils/chatFormat';

const emit = defineEmits<{ (e: 'select', emoji: string): void }>();
const EDGE = 8;
const GAP = 4;
const open = ref(false);
const btnRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({
  position: 'fixed',
  left: '0px',
  top: '0px',
  zIndex: '2000'
});

function positionPanel() {
  const btn = btnRef.value;
  const panel = panelRef.value;
  if (!btn || !panel) return;
  const rect = btn.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const maxLeft = Math.max(EDGE, window.innerWidth - width - EDGE);
  const left = Math.min(Math.max(rect.left, EDGE), maxLeft);
  let top = rect.top - height - GAP;
  if (top < EDGE) top = rect.bottom + GAP;
  const maxTop = Math.max(EDGE, window.innerHeight - height - EDGE);
  top = Math.min(Math.max(top, EDGE), maxTop);
  panelStyle.value = { position: 'fixed', left: `${left}px`, top: `${top}px`, zIndex: '2000' };
}

function toggle() {
  open.value = !open.value;
  if (open.value) {
    void nextTick(positionPanel);
    window.addEventListener('resize', positionPanel);
  } else {
    window.removeEventListener('resize', positionPanel);
  }
}

function close() {
  if (!open.value) return;
  open.value = false;
  window.removeEventListener('resize', positionPanel);
}

onBeforeUnmount(close);
</script>

<style scoped lang="less">
.emoji {
  position: relative;
  .emoji-btn {
    cursor: pointer;
    font-size: 18px;
    margin: 0 6px;
    width: 32px;
    height: 32px;
    line-height: 32px;
    text-align: center;
    display: inline-block;
    &:hover {
      background: #e2e2e7;
      border-radius: 6px;
    }
  }
  .emoji-panel {
    position: fixed;
    z-index: 2000;
    width: 252px;
    padding: 8px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    .emoji-item {
      font-size: 18px;
      text-align: center;
      cursor: pointer;
      padding: 2px 0;
      &:hover {
        background: #e2e2e7;
        border-radius: 4px;
      }
    }
  }
}
</style>
