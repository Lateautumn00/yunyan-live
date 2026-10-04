import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  AppMessagePayload,
  DesktopSource,
  ElectronApi,
  IpcChannels,
  SystemInfo,
  UpdateMessage,
  type RecordingChoosePathResult,
  type RecordingSaveBlobArgs,
  type RecordingSaveBlobResult,
  type RecordingSaveFileArgs,
  type RecordingSaveToPathArgs,
  type RecordingWriteResult
} from '@yunyan-live/ipc';

const api: ElectronApi = {
  checkForUpdate: () => {
    ipcRenderer.send(IpcChannels.checkForUpdate);
  },
  onUpdateMessage: (callback: (type: UpdateMessage, message?: string) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AppMessagePayload & { type: UpdateMessage }): void => {
      callback(payload.type, typeof payload.message === 'string' ? payload.message : undefined);
    };
    ipcRenderer.on(IpcChannels.message, listener);
    return () => ipcRenderer.removeListener(IpcChannels.message, listener);
  },
  onMessage: (callback: (payload: AppMessagePayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AppMessagePayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.message, listener);
    return () => ipcRenderer.removeListener(IpcChannels.message, listener);
  },
  openExternal: (url: string) => {
    return ipcRenderer.invoke(IpcChannels.openExternal, url) as Promise<void>;
  },
  getSources: () => {
    return ipcRenderer.invoke(IpcChannels.getSources) as Promise<DesktopSource[]>;
  },
  clipboardWriteText: (text: string) => {
    return ipcRenderer.invoke(IpcChannels.clipboardWrite, text) as Promise<void>;
  },
  getSystemInfo: () => {
    return ipcRenderer.invoke(IpcChannels.getSystemInfo) as Promise<SystemInfo>;
  },
  recordingSaveFile: (data: RecordingSaveFileArgs) => {
    return ipcRenderer.invoke(IpcChannels.recordingSaveFile, data) as Promise<RecordingWriteResult>;
  },
  recordingChooseSavePath: (defaultName: string) => {
    return ipcRenderer.invoke(IpcChannels.recordingChooseSavePath, defaultName) as Promise<RecordingChoosePathResult>;
  },
  recordingSaveToPath: (data: RecordingSaveToPathArgs) => {
    return ipcRenderer.invoke(IpcChannels.recordingSaveToPath, data) as Promise<RecordingWriteResult>;
  },
  recordingGetFileUrl: (filePath: string) => {
    return ipcRenderer.invoke(IpcChannels.recordingGetFileUrl, filePath) as Promise<string>;
  },
  recordingSaveBlob: (data: RecordingSaveBlobArgs) => {
    return ipcRenderer.invoke(IpcChannels.recordingSaveBlob, data) as Promise<RecordingSaveBlobResult>;
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);