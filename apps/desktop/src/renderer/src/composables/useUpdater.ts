import { computed, readonly, ref } from 'vue';
import type { ElectronApi, UpdateEventPayload } from '@yunyan-live/ipc';

export type UpdaterStatus =
  /** 未检查 / 后台检查无更新（静默） */
  | 'idle'
  /** 检查中 */
  | 'checking'
  /** 发现新版本，待用户确认 */
  | 'available'
  /** 已是最新（仅手动检查可见） */
  | 'latest'
  /** 下载中 */
  | 'downloading'
  /** 下载完成，待重启安装 */
  | 'downloaded'
  /** 检查/下载失败 */
  | 'error';

/**
 * 更新状态机（模块级单例，App 与设置页共享）：
 * 启动静默检查 → available（提示，可稍后）→ [确认] downloading → downloaded → [重启安装]。
 * manual 标记当前检查是否由用户手动触发：手动才回显「已是最新 / 检查失败」，
 * 且 App 的自动弹窗只跟随后台检查（manual=false）的结果。
 */
const status = ref<UpdaterStatus>('idle');
const manual = ref(false);
const latestVersion = ref('');
const currentVersion = ref('');
const progress = ref(0);
const errorMessage = ref('');
// 红点「已读」语义：用户进入设置页更新节即消除；新版本事件到达时复位重新点亮
const dotAcknowledged = ref(false);
const showUpdateDot = computed(
  () => !dotAcknowledged.value && (status.value === 'available' || status.value === 'downloaded')
);

let eventsBound = false;
let versionLoading: Promise<void> | null = null;

/** 非 Electron 环境（dev:web / 测试桩）下 electronAPI 可能缺失部分方法，统一防御调用 */
function bridge(): Partial<ElectronApi> | undefined {
  return window.electronAPI;
}

function loadCurrentVersion(): Promise<void> {
  if (!versionLoading) {
    versionLoading = (bridge()?.getVersion?.() ?? Promise.resolve(''))
      .then(v => {
        currentVersion.value = v;
      })
      .catch(() => undefined);
  }
  return versionLoading;
}

function handleUpdateEvent(payload: UpdateEventPayload): void {
  const { type, message } = payload;
  switch (type) {
    case 'checking':
      status.value = 'checking';
      break;
    case 'update-available':
      latestVersion.value = typeof message === 'string' ? message : '';
      progress.value = 0;
      status.value = 'available';
      dotAcknowledged.value = false;
      break;
    case 'update-not-available':
      status.value = manual.value ? 'latest' : 'idle';
      break;
    case 'download-progress':
      progress.value = Math.round(Number(message ?? 0));
      status.value = 'downloading';
      break;
    case 'update-downloaded':
      if (typeof message === 'string') latestVersion.value = message;
      progress.value = 100;
      status.value = 'downloaded';
      dotAcknowledged.value = false;
      break;
    case 'error':
      errorMessage.value = typeof message === 'string' ? message : '更新失败';
      // 后台静默检查失败不打扰用户；用户主动触发或下载中断才进入 error 态
      if (manual.value || status.value === 'downloading' || status.value === 'available') {
        status.value = 'error';
      } else {
        status.value = 'idle';
      }
      break;
  }
}

function bindUpdateEvents(): void {
  if (eventsBound) return;
  eventsBound = true;
  bridge()?.onMessage?.(handleUpdateEvent);
}

function check(isManual: boolean): void {
  manual.value = isManual;
  errorMessage.value = '';
  status.value = 'checking';
  bridge()?.checkForUpdate?.();
}

function download(): void {
  if (status.value !== 'available') return;
  status.value = 'downloading';
  progress.value = 0;
  bridge()?.downloadUpdate?.();
}

function install(): void {
  if (status.value !== 'downloaded') return;
  bridge()?.installUpdate?.();
}

/** 用户在设置页接管更新流程：后续交互由设置页承载，抑制 App 自动弹窗 */
function takeOver(): void {
  manual.value = true;
}

/** 用户进入设置页「软件更新」节：红点消除（新版本事件到达会重新点亮） */
function acknowledgeUpdateDot(): void {
  dotAcknowledged.value = true;
}

/** 测试用：重置模块级单例状态 */
function resetUpdater(): void {
  eventsBound = false;
  versionLoading = null;
  status.value = 'idle';
  manual.value = false;
  latestVersion.value = '';
  currentVersion.value = '';
  progress.value = 0;
  errorMessage.value = '';
  dotAcknowledged.value = false;
}

export function useUpdater() {
  return {
    status: readonly(status),
    manual: readonly(manual),
    latestVersion: readonly(latestVersion),
    currentVersion: readonly(currentVersion),
    progress: readonly(progress),
    errorMessage: readonly(errorMessage),
    showUpdateDot,
    bindUpdateEvents,
    loadCurrentVersion,
    handleUpdateEvent,
    check,
    download,
    install,
    takeOver,
    acknowledgeUpdateDot,
    resetUpdater
  };
}
