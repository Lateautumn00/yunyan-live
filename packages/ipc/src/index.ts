export const IpcChannels = {
  checkForUpdate: 'app:check-for-update',
  message: 'app:message',
  getSources: 'desktop-capturer:get-sources',
  captureScreen: 'desktop-capturer:capture-screen',
  clipboardWrite: 'clipboard:write-text',
  clipboardReadImage: 'clipboard:read-image',
  recordingGetFileUrl: 'recording:get-file-url',
  recordingSaveBlob: 'recording:save-blob',
  /** F5.3：本地媒体导入（复制入 userData/media，返回绝对路径；失败 null） */
  mediaImportFile: 'media:import-file',
  /** F3.4/F3.5：外挂 vendor 资源寻址（dev→Vite public，prod→atom:// 绝对路径） */
  vendorGetUrl: 'vendor:get-url'
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

/** F5.3：本地媒体导入入参（buffer 从渲染端 File.arrayBuffer 来） */
export interface MediaImportFileArgs {
  name: string;
  buffer: ArrayBuffer;
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
  /** F5.3：本地媒体导入 → userData/media 绝对路径；失败/取消返回 null */
  mediaImportFile: (data: MediaImportFileArgs) => Promise<string | null>;
  /** F3.4/F3.5：vendor 相对路径 → 可加载完整 URL（路径非法时 reject） */
  vendorGetUrl: (relPath: string) => Promise<string>;
}
