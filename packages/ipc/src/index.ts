export const IpcChannels = {
  checkForUpdate: 'app:check-for-update',
  message: 'app:message',
  openExternal: 'shell:open-external',
  getSources: 'desktop-capturer:get-sources',
  clipboardWrite: 'clipboard:write-text',
  getSystemInfo: 'app:get-system-info',
  recordingSaveFile: 'recording:save-file',
  recordingChooseSavePath: 'recording:choose-save-path',
  recordingSaveToPath: 'recording:save-to-path',
  recordingGetFileUrl: 'recording:get-file-url',
  recordingSaveBlob: 'recording:save-blob',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface DesktopSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  displayId?: string;
}

export interface SystemInfo {
  version: string;
  platform: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
}

export type UpdateMessage =
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'error'
  | 'download-progress'
  | 'update-downloaded';

export type AppMessageLevel = 'info' | 'error' | 'success';

export interface AppMessagePayload {
  level: AppMessageLevel;
  message: string;
}

export interface RecordingSaveFileArgs {
  buffer: ArrayBuffer;
  fileName: string;
}

export interface RecordingSaveToPathArgs {
  buffer: ArrayBuffer;
  filePath: string;
}

export interface RecordingSaveBlobArgs {
  buffer: ArrayBuffer;
  defaultName: string;
}

export interface RecordingWriteResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

export interface RecordingChoosePathResult {
  success: boolean;
  filePath?: string;
}

export interface RecordingSaveBlobResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface ElectronApi {
  checkForUpdate: () => void;
  onUpdateMessage: (callback: (type: UpdateMessage, message?: string) => void) => void;
  onMessage: (callback: (payload: AppMessagePayload) => void) => void;
  openExternal: (url: string) => void;
  getSources: () => Promise<DesktopSource[]>;
  clipboardWriteText: (text: string) => void;
  getSystemInfo: () => Promise<SystemInfo>;
  recordingSaveFile: (data: RecordingSaveFileArgs) => Promise<RecordingWriteResult>;
  recordingChooseSavePath: (defaultName: string) => Promise<RecordingChoosePathResult>;
  recordingSaveToPath: (data: RecordingSaveToPathArgs) => Promise<RecordingWriteResult>;
  recordingGetFileUrl: (filePath: string) => Promise<string>;
  recordingSaveBlob: (data: RecordingSaveBlobArgs) => Promise<RecordingSaveBlobResult>;
}