<template>
  <div class="replay-controls">
    <span v-if="disabled" class="rc-empty">{{ emptyText }}</span>
    <template v-else>
      <button class="rc-play" type="button" @click="$emit('toggle')">
        {{ playing ? '暂停' : '播放' }}
      </button>
      <select
        class="rc-speed"
        :value="speed"
        @change="onSpeed(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="s in SPEEDS" :key="s" :value="String(s)">{{ s }}×</option>
      </select>
      <div class="rc-track" @click="onTrack">
        <div class="rc-fill" :style="{ width: pct + '%' }" />
        <span
          v-for="seg in segments"
          :key="seg.seq"
          class="rc-seg"
          :style="{ left: segPct(seg) + '%' }"
        />
      </div>
      <span class="rc-num">{{ cursor }}/{{ total }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReplaySpeed } from './whiteboard/replayPlayer';

const SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 4];

const props = withDefaults(
  defineProps<{
    total: number;
    cursor: number;
    playing?: boolean;
    speed?: number;
    segments?: Array<{ seq: number; pageIndex: number }>;
    disabled?: boolean;
    emptyText?: string;
  }>(),
  {
    playing: false,
    speed: 1,
    segments: () => [],
    disabled: false,
    emptyText: '该房间暂无过程回放数据'
  }
);

const emits = defineEmits<{
  (e: 'toggle'): void;
  (e: 'seek', seq: number): void;
  (e: 'speed', speed: ReplaySpeed): void;
}>();

const pct = computed(() => (props.total > 0 ? (props.cursor / props.total) * 100 : 0));

function segPct(seg: { seq: number }): number {
  return props.total > 0 ? (seg.seq / props.total) * 100 : 0;
}

function onSpeed(raw: string) {
  // SPEEDS 字符串化后与 select 值对齐，再收窄回档位类型
  const hit = SPEEDS.find(s => String(s) === raw);
  if (hit !== undefined) emits('speed', hit);
}

function onTrack(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) {
    emits('seek', 0);
    return;
  }
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  emits('seek', Math.round(ratio * props.total));
}
</script>

<style scoped lang="less">
.replay-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 12px;
  color: #ccc;
  .rc-empty {
    color: #888;
  }
  .rc-play {
    min-width: 56px;
    padding: 4px 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    background: rgba(64, 158, 255, 0.25);
    color: #fff;
    cursor: pointer;
    &:hover {
      background: rgba(64, 158, 255, 0.4);
    }
  }
  .rc-speed {
    background: rgba(255, 255, 255, 0.08);
    color: #ddd;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    padding: 2px 4px;
  }
  .rc-track {
    position: relative;
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.12);
    cursor: pointer;
    .rc-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      border-radius: 3px;
      background: rgba(64, 158, 255, 0.7);
    }
    .rc-seg {
      position: absolute;
      top: -3px;
      width: 2px;
      height: 12px;
      background: rgba(255, 255, 255, 0.55);
    }
  }
  .rc-num {
    min-width: 48px;
    text-align: right;
    color: #999;
  }
}
</style>
