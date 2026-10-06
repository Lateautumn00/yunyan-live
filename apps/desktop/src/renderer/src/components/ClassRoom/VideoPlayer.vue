<template>
  <div class="classroom-video-player">
    <video
      ref="videoPlayers"
      class="video-js vjs-big-play-centered vjs-fluid vjs-tech"
      :class="props.radius ? 'radius' : ''"
      webkit-playsinline
      width="100%"
      height="100%"
      poster="~@/assets/imgs/classroom/video-image.png"
      :controls="false"
      :muted="props.isMuted"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

const props = withDefaults(defineProps<{ isMuted?: boolean; radius?: boolean }>(), {
  isMuted: false,
  radius: false
});

const videoPlayers = ref<HTMLVideoElement>();

onMounted(() => {
  void nextTick(() => {
    if (videoPlayers.value) {
      videojs(videoPlayers.value, {
        autoplay: false,
        preload: 'auto',
        bigPlayButton: false,
        aspectRatio: '16:9',
        controlBar: {
          playToggle: false,
          volumePanel: {
            inline: false,
            CurrentTimeDisplay: true
          }
        }
      });
    }
  });
});

defineExpose({ videoPlayers });
</script>

<style lang="less">
.classroom-video-player {
  width: 100%;
  height: 100%;
  .radius {
    border-radius: 4px;
  }
  .vjs-poster {
    position: relative;
    background-size: 100% 100% !important;
  }
  .video-js {
    width: 100% !important;
    height: 100% !important;
  }

  .vjs-tech {
    object-fit: fill;
    height: 100%;
    width: 100%;
  }

  .video-js .vjs-big-play-button {
    font-size: 3em;
    line-height: 42px !important;
    height: 50px !important;
    width: 50px !important;
    display: block;
    position: absolute !important;
    left: 50% !important;
    top: 50% !important;
    margin-top: -25px !important;
    margin-left: -25px !important;
    padding: 0;
    cursor: pointer;
    opacity: 1;
    border: 0.06666em solid #fff;
    background-color: #2b333f;
    background-color: rgba(43, 51, 63, 0.7);
    border-radius: 50% !important;
    -webkit-transition: all 0.4s;
    transition: all 0.4s;
  }

  .vjs-paused .vjs-big-play-button,
  .vjs-paused.vjs-has-started .vjs-big-play-button {
    display: block !important;
  }
}
video::-webkit-media-controls-timeline {
  display: none;
}
</style>
