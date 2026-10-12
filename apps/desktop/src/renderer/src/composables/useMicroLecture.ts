import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { RecordingSaveBlobArgs, RecordingSaveBlobResult } from '@yunyan-live/ipc';

/** F6.5 微课录制：状态机 idle → starting → recording ⇄ paused → saving → idle */
export type MicroLectureState = 'idle' | 'starting' | 'recording' | 'paused' | 'saving';

export type MicroTrack = { stop: () => void };
export type MicroStreamLike = { getTracks: () => MicroTrack[] };
export type MicroRecorderLike = {
  start: (timeslice?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  addEventListener: (type: string, cb: (e?: unknown) => void) => void;
};

export type MicroLectureDeps = {
  getSources: () => Promise<{ id: string; name: string }[]>;
  getUserMedia: (constraints: Record<string, unknown>) => Promise<MicroStreamLike>;
  createRecorder: (stream: MicroStreamLike, opts?: Record<string, unknown>) => MicroRecorderLike;
  saveBlob: (args: RecordingSaveBlobArgs) => Promise<RecordingSaveBlobResult>;
  notify?: (level: 'info' | 'error' | 'success', message: string) => void;
};

function defaultDeps(): MicroLectureDeps {
  return {
    getSources: async () => (await window.electronAPI?.getSources?.()) ?? [],
    getUserMedia: constraints =>
      navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints),
    createRecorder: (stream, opts) =>
      new MediaRecorder(stream as unknown as MediaStream, opts as MediaRecorderOptions),
    saveBlob: async args =>
      (await window.electronAPI?.recordingSaveBlob?.(args)) ?? {
        success: false,
        error: '保存通道不可用'
      },
    notify: (level, message) => ElMessage({ type: level, message })
  };
}

export function useMicroLecture(overrides?: Partial<MicroLectureDeps>) {
  const d: MicroLectureDeps = { ...defaultDeps(), ...overrides };
  const state = ref<MicroLectureState>('idle');
  const errorMessage = ref('');
  let stream: MicroStreamLike | null = null;
  let recorder: MicroRecorderLike | null = null;
  let chunks: Blob[] = [];

  function cleanup() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    recorder = null;
    chunks = [];
  }

  async function finalize() {
    try {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const buffer = await blob.arrayBuffer();
      if (buffer.byteLength > 0) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const result = await d.saveBlob({
          buffer,
          defaultName: `微课-${stamp}.webm`,
          // 显式 webm 过滤：主进程保存框默认 mp4，MediaRecorder 产物是 webm
          filters: [{ name: 'WebM Video', extensions: ['webm'] }]
        });
        if (result?.success === false) {
          errorMessage.value = result.error || '微课视频未保存';
          d.notify?.('info', `微课录制未保存：${errorMessage.value}`);
        } else {
          d.notify?.('success', '微课录制已保存');
        }
      }
    } catch (e) {
      errorMessage.value = (e as Error)?.message || '微课视频保存失败';
      d.notify?.('error', `微课录制保存失败：${errorMessage.value}`);
    } finally {
      cleanup();
      state.value = 'idle';
    }
  }

  async function start(): Promise<boolean> {
    // 重复启动防抖：仅 idle 可进入（starting 已占位）
    if (state.value !== 'idle') return false;
    state.value = 'starting';
    errorMessage.value = '';
    try {
      const sources = await d.getSources();
      const screen = sources[0];
      if (!screen) throw new Error('未找到可录制的屏幕源');
      const s = await d.getUserMedia({
        audio: false,
        video: {
          mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: screen.id }
        }
      });
      stream = s;
      chunks = [];
      const rec = d.createRecorder(s, { mimeType: 'video/webm' });
      recorder = rec;
      rec.addEventListener('dataavailable', (e?: unknown) => {
        const data = (e as { data?: Blob } | undefined)?.data;
        if (data && data.size > 0) chunks.push(data);
      });
      rec.addEventListener('stop', () => {
        void finalize();
      });
      rec.start(1000);
      state.value = 'recording';
      return true;
    } catch (err) {
      // 权限拒绝/源缺失（§4.9 异常态）：回 idle 并提示，不留半开状态
      cleanup();
      state.value = 'idle';
      errorMessage.value = (err as Error)?.message || '屏幕录制权限被拒绝';
      d.notify?.('error', `无法开始微课录制：${errorMessage.value}`);
      return false;
    }
  }

  function pause(): boolean {
    if (state.value !== 'recording') return false;
    recorder?.pause();
    state.value = 'paused';
    return true;
  }

  function resume(): boolean {
    if (state.value !== 'paused') return false;
    recorder?.resume();
    state.value = 'recording';
    return true;
  }

  async function stop(): Promise<boolean> {
    if (state.value !== 'recording' && state.value !== 'paused') return false;
    // 停止即入 saving：文件未就绪的等待态，stop 事件完成保存后才回 idle
    state.value = 'saving';
    recorder?.stop();
    return true;
  }

  return { state, errorMessage, start, pause, resume, stop };
}
