import { onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import Live from '@/api/backstage';
import { saveBinaryFile } from '@/utils/webBridge';

const TRANSCODING_CODE = 2002;

export function useRecordingDownload() {
  const downloading = ref(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function releaseDownload() {
    stopPolling();
    downloading.value = false;
  }

  async function downloadFile(videoId: string, filename: string) {
    try {
      ElMessage.info('正在下载，请稍候...');
      const res = await Live.download_recording_file(videoId);
      const blob = new Blob([res.data], { type: 'video/mp4' });
      const buffer = await blob.arrayBuffer();
      const saved = await saveBinaryFile(buffer, filename);
      if (saved) {
        ElMessage.success('下载成功');
      } else {
        ElMessage.info('已取消下载');
      }
    } catch (e) {
      console.error(e);
      ElMessage.error('下载失败');
    }
  }

  function startPolling(videoId: string, filename: string) {
    stopPolling();
    let count = 0;
    const maxCount = 200;
    pollTimer = setInterval(async () => {
      count++;
      if (count >= maxCount) {
        ElMessage.warning('转码时间过长，请稍后再试');
        releaseDownload();
        return;
      }
      try {
        const res = await Live.download_recording(videoId);
        if (res.data.code !== TRANSCODING_CODE) {
          stopPolling();
          await downloadFile(videoId, filename);
          releaseDownload();
        }
      } catch {
        ElMessage.error('下载失败');
        releaseDownload();
      }
    }, 3000);
  }

  async function download(videoId: string, filename: string): Promise<void> {
    if (downloading.value) return;
    downloading.value = true;
    let polling = false;
    try {
      const statusRes = await Live.download_recording(videoId);
      if (statusRes.data.code === TRANSCODING_CODE) {
        ElMessage.info(statusRes.data.msg || '视频转码中，请稍候...');
        startPolling(videoId, filename);
        polling = true;
        return;
      }
      await downloadFile(videoId, filename);
    } catch (e) {
      console.error(e);
      ElMessage.error('下载失败');
    } finally {
      if (!polling) releaseDownload();
    }
  }

  onUnmounted(() => {
    releaseDownload();
  });

  return { downloading, download, releaseDownload };
}
