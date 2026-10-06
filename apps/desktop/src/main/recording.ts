import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import {
  IpcChannels,
  type RecordingSaveBlobArgs,
  type RecordingSaveBlobResult
} from '@yunyan-live/ipc';
import { PROTOCOL_SCHEME } from './constants';

type GetWindow = () => BrowserWindow | null;

export function registerRecordingHandlers(_getWindow: GetWindow): void {
  ipcMain.handle(IpcChannels.recordingGetFileUrl, (_event, filePath: string) => {
    return `${PROTOCOL_SCHEME}://${filePath}`;
  });

  ipcMain.handle(
    IpcChannels.recordingSaveBlob,
    async (_event, data: RecordingSaveBlobArgs): Promise<RecordingSaveBlobResult> => {
      const result = await dialog.showSaveDialog({
        defaultPath: data.defaultName,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
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
    }
  );
}
