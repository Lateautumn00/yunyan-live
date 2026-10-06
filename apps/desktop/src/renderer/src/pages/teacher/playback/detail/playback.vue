<template>
  <div class="playback-page">
    <div class="playback-header">
      <el-button class="back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="header-info">
        <span class="title">{{ title }}</span>
        <el-tag v-if="recordType === 1" type="info" size="small"> 窗口录制 </el-tag>
        <el-tag v-else type="success" size="small"> 流录制 </el-tag>
        <span class="duration">{{ formatDurationClock(duration) }}</span>
        <span class="time">{{ formatDate(Number(createTime)) }}</span>
        <el-button
          v-if="recordType === 2"
          class="download-btn"
          :loading="downloading"
          @click="handleDownload"
        >
          <el-icon><Download /></el-icon>
          下载
        </el-button>
      </div>
    </div>
    <div class="playback-content">
      <video
        v-if="recordType === 1 && fileUrl"
        ref="videoRef"
        :src="fileUrl"
        controls
        autoplay
        class="local-video"
      />
      <HistoryVideo
        v-else-if="recordType === 2 && videoId"
        :id="videoId"
        ref="historyVideoRef"
        :opaque-id="opaqueId"
      />
      <div v-else class="no-video">暂无视频</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Download } from '@element-plus/icons-vue';
import { formatDate, formatDurationClock } from '@yunyan-live/utils';
import HistoryVideo from '@/components/ClassRoom/HistoryVideo.vue';
import { useUserStore } from '@/store/user';
import { useRecordingDownload } from '@/composables/useRecordingDownload';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const roomId = ref((route.query.roomId as string) || '');
const videoId = ref((route.query.videoId as string) || '');
const recordType = ref(Number(route.query.recordType) || 2);
const title = ref((route.query.title as string) || '');
const duration = ref(Number(route.query.duration) || 0);
const createTime = ref((route.query.createTime as string) || '');
const filePath = ref((route.query.filePath as string) || '');

const fileUrl = ref('');
const opaqueId = ref('');
const historyVideoRef = ref<InstanceType<typeof HistoryVideo> | null>(null);
const { downloading, download } = useRecordingDownload();

async function loadFileUrl() {
  console.log('[playback] loadFileUrl', {
    recordType: recordType.value,
    filePath: filePath.value,
    hasElectronAPI: !!window.electronAPI
  });
  if (recordType.value === 1 && filePath.value && window.electronAPI) {
    const url = await window.electronAPI.recordingGetFileUrl(filePath.value);
    console.log('[playback] fileUrl resolved', url);
    fileUrl.value = url;
  }
}

function goBack() {
  if (historyVideoRef.value) {
    historyVideoRef.value.playStop();
  }
  void router.push({
    path: '/teacher/playback/detail',
    query: { roomId: roomId.value, name: title.value }
  });
}

async function handleDownload() {
  await download(videoId.value, `${title.value}.mp4`);
}

onMounted(() => {
  opaqueId.value = userStore.guid;
  void loadFileUrl();
});

onUnmounted(() => {
  if (historyVideoRef.value) {
    historyVideoRef.value.playStop();
  }
});
</script>

<style lang="less" scoped>
.playback-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
}

.playback-header {
  height: 56px;
  background: #16213e;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
  flex-shrink: 0;

  .back-btn {
    color: #fff;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  .download-btn {
    color: #fff;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    margin-left: auto;
    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;

    .title {
      font-size: 16px;
      font-weight: 500;
    }

    .duration {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.7);
    }

    .time {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.5);
    }
  }
}

.playback-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  .local-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .no-video {
    color: rgba(255, 255, 255, 0.5);
    font-size: 18px;
  }
}
</style>
