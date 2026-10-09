export const IpcChannels = {
  checkForUpdate: 'app:check-for-update',
  message: 'app:message',
  getSources: 'desktop-capturer:get-sources',
  captureScreen: 'desktop-capturer:capture-screen',
  clipboardWrite: 'clipboard:write-text',
  clipboardReadImage: 'clipboard:read-image',
  recordingGetFileUrl: 'recording:get-file-url',
  recordingSaveBlob: 'recording:save-blob'
} as const;

export interface DesktopSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  displayId?: string;
}

export type UpdateMessage =
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'error'
  | 'download-progress'
  | 'update-downloaded';

type AppMessageLevel = 'info' | 'error' | 'success';

export interface AppMessagePayload {
  level: AppMessageLevel;
  message: string;
}

export interface SaveFileFilter {
  name: string;
  extensions: string[];
}

export interface RecordingSaveBlobArgs {
  buffer: ArrayBuffer;
  defaultName: string;
  /** 系统保存框的文件类型过滤；缺省保持录屏 mp4 */
  filters?: SaveFileFilter[];
}

export interface RecordingSaveBlobResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface ElectronApi {
  checkForUpdate: () => void;
  onMessage: (callback: (payload: AppMessagePayload) => void) => () => void;
  getSources: () => Promise<DesktopSource[]>;
  /** F4.6：主屏全分辨率捕获，返回 PNG dataURL；macOS 屏幕录制权限被拒时 reject */
  captureScreen: () => Promise<string>;
  clipboardWriteText: (text: string) => Promise<void>;
  /** F4.6：读剪贴板图片，返回 PNG dataURL；剪贴板无图片返回空串 */
  clipboardReadImage: () => Promise<string>;
  recordingGetFileUrl: (filePath: string) => Promise<string>;
  recordingSaveBlob: (data: RecordingSaveBlobArgs) => Promise<RecordingSaveBlobResult>;
}
