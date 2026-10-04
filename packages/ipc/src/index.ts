export const IpcChannels = {
  checkForUpdate: 'app:check-for-update',
  message: 'app:message',
  getSources: 'desktop-capturer:get-sources',
  clipboardWrite: 'clipboard:write-text',
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

export interface RecordingSaveBlobArgs {
  buffer: ArrayBuffer;
  defaultName: string;
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
  clipboardWriteText: (text: string) => Promise<void>;
  recordingGetFileUrl: (filePath: string) => Promise<string>;
  recordingSaveBlob: (data: RecordingSaveBlobArgs) => Promise<RecordingSaveBlobResult>;
}
