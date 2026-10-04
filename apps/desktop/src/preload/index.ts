import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  AppMessagePayload,
  DesktopSource,
  ElectronApi,
  IpcChannels,
  type RecordingSaveBlobArgs,
  type RecordingSaveBlobResult
} from '@yunyan-live/ipc';

const api: ElectronApi = {
  checkForUpdate: () => {
    ipcRenderer.send(IpcChannels.checkForUpdate);
  },
  onMessage: (callback: (payload: AppMessagePayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: AppMessagePayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IpcChannels.message, listener);
    return () => ipcRenderer.removeListener(IpcChannels.message, listener);
  },
  getSources: () => {
    return ipcRenderer.invoke(IpcChannels.getSources) as Promise<DesktopSource[]>;
  },
  clipboardWriteText: (text: string) => {
    return ipcRenderer.invoke(IpcChannels.clipboardWrite, text) as Promise<void>;
  },
  recordingGetFileUrl: (filePath: string) => {
    return ipcRenderer.invoke(IpcChannels.recordingGetFileUrl, filePath) as Promise<string>;
  },
  recordingSaveBlob: (data: RecordingSaveBlobArgs) => {
    return ipcRenderer.invoke(IpcChannels.recordingSaveBlob, data) as Promise<RecordingSaveBlobResult>;
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
