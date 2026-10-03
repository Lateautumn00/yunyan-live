<template>
  <div class="classroom-history-video">
    <div class="bottom">
      <el-button
        v-if="isPlay"
        :loading="playPending"
        @click="startPlayout"
      >
        <el-icon><VideoPlay /></el-icon>
      </el-button>
      <el-button
        v-if="!isPlay"
        @click="playStop"
      >
        <el-icon><VideoPause /></el-icon>
      </el-button>
      <el-icon
        v-if="!isPlay"
        class="enlarge"
        aria-label="全屏"
        @click="pall"
      >
        <FullScreen />
      </el-icon>
    </div>
    <VideoPlayer
      ref="videoPlayerRef"
      :is-muted="false"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { JanusHandle, JanusSession } from '@/vendor/live/live';
import Live from '@/vendor/live/live';
import '@/vendor/live/adapter/adapter.min';
import { config } from '@/api';
import VideoPlayer from '@/components/ClassRoom/VideoPlayer.vue';

const props = defineProps<{ id?: string; opaqueId?: string }>();

const record = ref<JanusSession | null>(null);
const recordPlay = ref<JanusHandle | null>(null);
const isPlay = ref(true);
const playPending = ref(false);
const videoPlayerRef = ref<InstanceType<typeof VideoPlayer>>();

let playPendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPlayPending() {
  playPending.value = false;
  if (playPendingTimer) {
    clearTimeout(playPendingTimer);
    playPendingTimer = null;
  }
}

onMounted(() => {
  Live.init({
    debug: 'true',
    callback: () => {
      record.value = new Live({
        server: config.liveServer,
        success: () => {
          recordAttach();
        },
        error: (error) => {
          console.error(error);
        },
        destroyed: () => {}
      });
    }
  });
});

onUnmounted(() => {
  if (playPendingTimer) {
    clearTimeout(playPendingTimer);
    playPendingTimer = null;
  }
});

function recordAttach() {
  record.value?.attach({
    plugin: 'janus.plugin.recordplay',
    opaqueId: props.opaqueId,
    success: (pluginHandle) => {
      recordPlay.value = pluginHandle;
    },
    error: (error) => {
      console.error(error);
    },
    webrtcState: () => {},
    onmessage: (msg, jsep) => {
      message(msg, jsep);
    },
    onlocalstream: () => {},
    onremotestream: (stream) => {
      attachMediaStream(stream);
      const videoTracks = stream.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0) {
        playStop();
        console.error('No remote video available');
      }
    },
    oncleanup: () => {}
  });
}

function message(msg: Record<string, unknown>, jsep?: unknown) {
  const result = msg['result'] as Record<string, unknown> | string | undefined;
  if (result && typeof result === 'object') {
    const status = result['status'];
    if (status) {
      if (status === 'preparing' || status === 'refreshing') {
        recordPlay.value?.createAnswer({
          jsep: jsep,
          media: {
            audioSend: false,
            videoSend: false
          },
          success: (answerJsep) => {
            recordPlay.value?.send({
              message: {
                request: 'start'
              },
              jsep: answerJsep
            });
          },
          error: (error) => {
            ElMessage.error(String(error));
            console.error(error);
          }
        });
      } else if (status === 'playing') {
        isPlay.value = false;
        clearPlayPending();
      } else if (status === 'stopped') {
        isPlay.value = true;
        clearPlayPending();
        recordPlay.value?.hangup();
      }
    }
  } else if (result === 'done') {
    isPlay.value = true;
    clearPlayPending();
    recordPlay.value?.hangup();
  }
}

function attachMediaStream(stream: MediaStream) {
  const video = videoPlayerRef.value?.videoPlayers;
  playStream(video, stream);
}

function playStream(element: HTMLVideoElement | undefined, stream: MediaStream) {
  if (!element) {
    return;
  }
  try {
    element.srcObject = stream;
    element.onloadedmetadata = () => void element.play();
  } catch (e) {
    try {
      element.src = URL.createObjectURL(stream as unknown as Blob);
      element.onloadedmetadata = () => void element.play();
    } catch (err) {
      console.error('Error attaching stream to element');
    }
  }
}

function startPlayout() {
  if (playPending.value) return;
  if (!props.id) {
    ElMessage.error('视频不存在');
    return;
  }
  playPending.value = true;
  playPendingTimer = setTimeout(() => {
    clearPlayPending();
  }, 5000);
  recordPlay.value?.send({
    message: {
      request: 'play',
      id: parseInt(props.id)
    }
  });
}

function playStop() {
  if (isPlay.value) return;
  recordPlay.value?.send({
    message: {
      request: 'stop'
    }
  });
}

function pall() {
  const ele = videoPlayerRef.value?.videoPlayers;
  if (!ele) return;
  const video = ele as HTMLVideoElement & {
    mozRequestFullScreen?: () => void;
    webkitRequestFullScreen?: () => void;
    msRequestFullscreen?: () => void;
    webkitEnterFullscreen?: () => void;
    enterFullScreen?: () => void;
  };
  if (video.requestFullscreen) {
    void video.requestFullscreen();
  } else if (video.mozRequestFullScreen) {
    video.mozRequestFullScreen();
  } else if (video.webkitRequestFullScreen) {
    video.webkitRequestFullScreen();
  } else if (video.msRequestFullscreen) {
    video.msRequestFullscreen();
  } else if (video.webkitEnterFullscreen || video.enterFullScreen) {
    video.webkitEnterFullscreen?.();
    video.enterFullScreen?.();
  }
}

defineExpose({ playStop });
</script>

<style lang="less" scoped>
.classroom-history-video {
  width: 100%;
  height: 100%;
  position: relative;
  .bottom {
    position: absolute;
    z-index: 999;
    bottom: 0px;
    background: linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, #000000 100%);
    width: 100%;
    display: flex;
    align-items: center;
    .enlarge {
      font-size: 24px;
      color: #ffffff;
      cursor: pointer;
      margin-left: 6px;
    }
  }
}
</style>
<style lang="less">
.classroom-history-video {
  .el-button.el-button--default {
    border: 0px;
    font-size: 24px;
    width: 28px;
    color: #ffffff;
    background-color: unset;
  }
}
</style>