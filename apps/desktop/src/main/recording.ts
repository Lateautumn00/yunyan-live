import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import {
  IpcChannels,
  type RecordingChoosePathResult,
  type RecordingSaveBlobArgs,
  type RecordingSaveBlobResult,
  type RecordingSaveFileArgs,
  type RecordingSaveToPathArgs,
  type RecordingWriteResult
} from '@yunyan-live/ipc';
import { PROTOCOL_SCHEME } from './constants';

type GetWindow = () => BrowserWindow | null;

export function registerRecordingHandlers(_getWindow: GetWindow): void {
  ipcMain.handle(IpcChannels.recordingSaveFile, async (_event, data: RecordingSaveFileArgs): Promise<RecordingWriteResult> => {
    try {
      const videosDir = path.join(app.getPath('videos'), 'edu-live-recordings');
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }
      const filePath = path.join(videosDir, data.fileName);
      const buffer = Buffer.from(data.buffer);
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath, fileSize: buffer.length };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannels.recordingChooseSavePath, async (_event, defaultName: string): Promise<RecordingChoosePathResult> => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'WebM Video', extensions: ['webm'] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false };
    }
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle(IpcChannels.recordingSaveToPath, async (_event, data: RecordingSaveToPathArgs): Promise<RecordingWriteResult> => {
    try {
      const buffer = Buffer.from(data.buffer);
      fs.writeFileSync(data.filePath, buffer);
      return { success: true, filePath: data.filePath, fileSize: buffer.length };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IpcChannels.recordingGetFileUrl, (_event, filePath: string) => {
    return `${PROTOCOL_SCHEME}://${filePath}`;
  });

  ipcMain.handle(IpcChannels.recordingSaveBlob, async (_event, data: RecordingSaveBlobArgs): Promise<RecordingSaveBlobResult> => {
    const result = await dialog.showSaveDialog({
      defaultPath: data.defaultName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false };
    }
    try {
      const buffer = Buffer.from(data.buffer);
      fs.writeFileSync(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}
