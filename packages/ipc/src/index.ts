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

export type UpdateMessage = 'checking' | 'update-available' | 'update-not-available' | 'error';

export type AppMessageLevel = 'info' | 'error' | 'success';

export interface AppMessagePayload {
  level: AppMessageLevel;
  message: string;
}

export interface ElectronApi {
  checkForUpdate: () => void;
  onUpdateMessage: (callback: (type: UpdateMessage, message?: string) => void) => void;
  onMessage: (callback: (payload: AppMessagePayload) => void) => void;
  openExternal: (url: string) => void;
  getSources: () => Promise<DesktopSource[]>;
  clipboardWriteText: (text: string) => void;
  getSystemInfo: () => Promise<SystemInfo>;
  recordingSaveFile: (data: { buffer: ArrayBuffer; fileName: string }) => Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }>;
  recordingChooseSavePath: (defaultName: string) => Promise<{ success: boolean; filePath?: string }>;
  recordingSaveToPath: (data: { buffer: ArrayBuffer; filePath: string }) => Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }>;
  recordingGetFileUrl: (filePath: string) => Promise<string>;
  recordingSaveBlob: (data: { buffer: ArrayBuffer; defaultName: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
}