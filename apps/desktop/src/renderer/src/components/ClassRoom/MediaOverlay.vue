<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MEDIA_PROGRESS_MS, driftSeekTo, isLongDuration, playPosFrom } from './whiteboard/media';
import type { MediaProgressState } from './whiteboard/types';

/** 播放控制器（默认包 DOM media；测试可注入假控制器） */
type MediaCtl = {
  play(): void;
  pause(): void;
  seek(s: number): void;
  time(): number;
  destroy(): void;
};

const props = defineProps<{
  el: Record<string, unknown>;
  isTeacher: boolean;
  /** 教师端 awareness 进度广播（null=无/断线→停在最后已知状态） */
  remote: MediaProgressState | null;
  /** 测试注入控制器（缺省用 <video>/<audio> 真实 DOM 封装） */
  createCtl?: (url: string) => MediaCtl;
}>();

const emit = defineEmits<{
  (e: 'state', p: { elId: string; playing: boolean; time: number }): void;
  (e: 'progress', p: { elId: string; time: number }): void;
}>();

const mediaEl = ref<HTMLMediaElement | null>(null);
const resolvedUrl = ref('');
const srcReady = ref(false);
const status = ref<'idle' | 'playing' | 'paused' | 'ended'>('idle');
const pos = ref(0);
const errored = ref(false);
const longHint = ref(false);

const elId = computed(() => String(props.el.id ?? ''));
const mime = computed(() => (String(props.el.mime) === 'audio' ? 'audio' : 'video'));
const name = computed(() => String(props.el.name ?? ''));
const loop = computed(() => props.el.loop === true);

// URL 同步可播（setup 期置位，首帧即渲染播放器）；本地文件 onMounted 异步解析（仅教师端）
if (String(props.el.srcKind) === 'url') {
  resolvedUrl.value = String(props.el.src ?? '');
  srcReady.value = true;
}

function domCtl(): MediaCtl | null {
  const elm = mediaEl.value;
  if (!elm) return null;
  return {
    play: () => {
      try {
        void elm.play()?.catch(() => {});
      } catch {
        /* jsdom 未实现 */
      }
    },
    pause: () => {
      try {
        elm.pause();
      } catch {
        /* jsdom 未实现 */
      }
    },
    seek: s => {
      try {
        elm.currentTime = s;
      } catch {
        /* ignore */
      }
    },
    time: () => {
      try {
        return elm.currentTime || 0;
      } catch {
        return 0;
      }
    },
    destroy: () => {
      try {
        elm.pause();
      } catch {
        /* ignore */
      }
    }
  };
}

let ctl: MediaCtl | null = null;
function ensureCtl(): MediaCtl | null {
  if (ctl) return ctl;
  if (!resolvedUrl.value) return null;
  ctl = props.createCtl ? props.createCtl(resolvedUrl.value) : domCtl();
  return ctl;
}

onMounted(() => {
  if (String(props.el.srcKind) === 'url') {
    applyDiscrete();
    return;
  }
  // 本地文件：仅教师端可播（atom:// 协议由主进程注册；通道缺失/学生端 → 占位）
  const get = (
    window as unknown as {
      electronAPI?: { recordingGetFileUrl?: (p: string) => Promise<string> };
    }
  ).electronAPI?.recordingGetFileUrl;
  if (props.isTeacher && get) {
    get(String(props.el.src ?? ''))
      .then(url => {
        resolvedUrl.value = url;
      })
      .catch(() => {})
      .finally(() => {
        srcReady.value = true;
        applyDiscrete();
      });
    return;
  }
  srcReady.value = true;
});

function applyDiscrete() {
  if (!srcReady.value || errored.value) return;
  if (props.el.ended === true) {
    ensureCtl()?.pause();
    stopProgress();
    status.value = 'ended';
    return;
  }
  const c = ensureCtl();
  if (!c) return;
  const playing = props.el.playing === true;
  if (playing && status.value !== 'playing') {
    const t = Number(props.el.time) || 0;
    if (t > 0) {
      c.seek(t);
      pos.value = t;
    }
    c.play();
    status.value = 'playing';
    startProgress();
  } else if (!playing && status.value === 'playing') {
    c.pause();
    status.value = 'paused';
    stopProgress();
  }
}
watch(
  () => [props.el.playing, props.el.time, props.el.ended],
  () => applyDiscrete()
);

// 远端进度（awareness）：接收时刻本地化推算目标位，漂移 >400ms 才回拉；断线停最后状态
let remoteTimer: ReturnType<typeof setInterval> | null = null;
let receivedAt = 0;
function applyRemote(r: MediaProgressState) {
  const c = ensureCtl();
  if (!c || !r.playing) return;
  const target = playPosFrom(r.time, Date.now() - receivedAt, r.rate);
  const seekTo = driftSeekTo(c.time(), target);
  if (seekTo !== null) {
    c.seek(seekTo);
    pos.value = seekTo;
  }
}
watch(
  () => props.remote,
  r => {
    if (remoteTimer) {
      clearInterval(remoteTimer);
      remoteTimer = null;
    }
    if (!r || r.elId !== elId.value) return;
    receivedAt = Date.now();
    if (r.playing) {
      applyRemote(r);
      remoteTimer = setInterval(() => applyRemote(r), 1000);
    }
  },
  { immediate: true }
);

// 教师端进度节流广播（MEDIA_PROGRESS_MS）
let progTimer: ReturnType<typeof setInterval> | null = null;
function startProgress() {
  if (!props.isTeacher || progTimer) return;
  progTimer = setInterval(() => {
    const c = ctl;
    if (!c) return;
    emit('progress', { elId: elId.value, time: c.time() });
  }, MEDIA_PROGRESS_MS);
}
function stopProgress() {
  if (progTimer) {
    clearInterval(progTimer);
    progTimer = null;
  }
}

function toggle() {
  if (!props.isTeacher) return;
  const playingNow = props.el.playing === true;
  const c = ensureCtl();
  emit('state', {
    elId: elId.value,
    playing: !playingNow,
    time: playingNow ? (c?.time() ?? 0) : Number(props.el.time) || 0
  });
}

function onEnded() {
  status.value = 'ended';
  stopProgress();
  if (props.isTeacher) {
    const c = ensureCtl();
    emit('state', { elId: elId.value, playing: false, time: c?.time() ?? 0 });
  }
}

// 加载失败：错误占位（源 404/解码失败），停进度广播
function onMediaError() {
  errored.value = true;
  stopProgress();
  if (remoteTimer) {
    clearInterval(remoteTimer);
    remoteTimer = null;
  }
}

// 时长 ≥1h 超长提示（初版仅提示；截段/转码延后 §11.2）
function onLoadedMetadata() {
  const d = mediaEl.value?.duration;
  if (typeof d === 'number' && Number.isFinite(d) && isLongDuration(d)) longHint.value = true;
}

onBeforeUnmount(() => {
  stopProgress();
  if (remoteTimer) clearInterval(remoteTimer);
  ctl?.destroy();
});
</script>

<template>
  <div
    class="media-overlay"
    :class="{
      'is-playing': status === 'playing',
      interactive: isTeacher && status === 'playing'
    }"
    :data-pos="pos"
  >
    <video
      v-if="srcReady && resolvedUrl && mime === 'video'"
      ref="mediaEl"
      :src="resolvedUrl"
      :loop="loop"
      @ended="onEnded"
      @error="onMediaError"
      @loadedmetadata="onLoadedMetadata"
    />
    <audio
      v-else-if="srcReady && resolvedUrl && mime === 'audio'"
      ref="mediaEl"
      :src="resolvedUrl"
      :loop="loop"
      @ended="onEnded"
      @error="onMediaError"
      @loadedmetadata="onLoadedMetadata"
    />
    <div v-if="errored" class="mo-error">媒体加载失败</div>
    <div v-else-if="!srcReady || !resolvedUrl" class="mo-unavailable">
      {{ isTeacher ? '本地媒体读取失败' : '本地媒体 · 仅教师端可播放' }}
    </div>
    <div v-if="longHint" class="mo-long">超长媒体（≥1小时），建议分段</div>
    <div v-if="resolvedUrl" class="mo-name">{{ name }}</div>
    <!-- 教师控制条：根 pointer-events:none 时子元素 auto 仍可点；学生端不渲染 -->
    <div v-if="isTeacher && resolvedUrl" class="mo-play" @click.stop="toggle">
      {{ status === 'playing' ? '⏸' : '▶' }}
    </div>
  </div>
</template>

<style scoped>
.mo-name {
  position: absolute;
  left: 8px;
  top: 6px;
  right: 8px;
  font-size: 12px;
  color: #d6d6d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mo-play {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  cursor: pointer;
  pointer-events: auto;
}
.mo-unavailable {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #909399;
}
.mo-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #f56c6c;
  background: #1f1f23;
}
.mo-long {
  position: absolute;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%);
  padding: 2px 8px;
  font-size: 11px;
  color: #e6a23c;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
}
video,
audio {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #000;
}
</style>
