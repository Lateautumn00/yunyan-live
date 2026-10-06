<template>
  <div class="flexible-layout">
    <div class="main-area">
      <div class="whiteboard-panel">
        <slot name="whiteboard" />
      </div>

      <div v-show="showChat" class="divider vertical" @mousedown="onVerticalDragStart" />

      <div v-show="showChat" class="chat-panel" :style="{ width: chatWidth + 'px' }">
        <slot name="chat" />
      </div>
    </div>

    <div
      v-if="enableVideos"
      v-show="showVideos"
      class="divider horizontal"
      @mousedown="onHorizontalDragStart"
    />

    <div
      v-if="enableVideos"
      v-show="showVideos"
      class="video-panel"
      :style="{ height: videoHeight + 'px' }"
    >
      <slot name="student-videos" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, watch } from 'vue';
import { frameThrottle } from '@yunyan-live/utils';

const props = withDefaults(
  defineProps<{
    enableVideos?: boolean;
    chatVisible?: boolean;
    videosVisible?: boolean;
  }>(),
  {
    enableVideos: true,
    chatVisible: true,
    videosVisible: true
  }
);

const emit = defineEmits<{
  'update:chatVisible': [value: boolean];
  'update:videosVisible': [value: boolean];
}>();

const showChat = ref(props.chatVisible);
const showVideos = ref(props.videosVisible);

watch(
  () => props.chatVisible,
  val => {
    showChat.value = val;
  }
);
watch(
  () => props.videosVisible,
  val => {
    showVideos.value = val;
  }
);
watch(showChat, val => {
  emit('update:chatVisible', val);
});
watch(showVideos, val => {
  emit('update:videosVisible', val);
});
const chatWidth = ref(280);
const videoHeight = ref(150);

const CHAT_MIN = 200;
const CHAT_MAX = 500;
const VIDEO_MIN = 80;
const VIDEO_MAX = 300;

let dragCleanup: (() => void) | null = null;

function cleanupDrag() {
  if (dragCleanup) {
    dragCleanup();
    dragCleanup = null;
  }
}

onBeforeUnmount(cleanupDrag);

function onVerticalDragStart(e: MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = chatWidth.value;

  const onMouseMove = frameThrottle((ev: MouseEvent) => {
    const delta = startX - ev.clientX;
    chatWidth.value = Math.min(CHAT_MAX, Math.max(CHAT_MIN, startWidth + delta));
  });

  function onMouseUp() {
    onMouseMove.flush();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    dragCleanup = null;
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  dragCleanup = cleanupDrag;
}

function onHorizontalDragStart(e: MouseEvent) {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = videoHeight.value;

  const onMouseMove = frameThrottle((ev: MouseEvent) => {
    const delta = startY - ev.clientY;
    videoHeight.value = Math.min(VIDEO_MAX, Math.max(VIDEO_MIN, startHeight + delta));
  });

  function onMouseUp() {
    onMouseMove.flush();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    dragCleanup = null;
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';

  dragCleanup = cleanupDrag;
}
</script>

<style lang="less" scoped>
.flexible-layout {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.whiteboard-panel {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.chat-panel {
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
}

.video-panel {
  width: 100%;
  overflow: hidden;
  flex-shrink: 0;
}

.divider {
  background: #e4e7ed;
  transition: background 0.15s;
  flex-shrink: 0;
  z-index: 10;

  &:hover {
    background: #409eff;
  }

  &.vertical {
    width: 4px;
    cursor: col-resize;
  }

  &.horizontal {
    height: 4px;
    cursor: row-resize;
  }
}
</style>
