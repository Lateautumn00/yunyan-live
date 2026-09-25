import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

type GetWindow = () => BrowserWindow | null;

export function registerRecordingHandlers(_getWindow: GetWindow): void {
  ipcMain.handle('recording:save-file', async (_event, data: { buffer: ArrayBuffer; fileName: string }) => {
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

  ipcMain.handle('recording:choose-save-path', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'WebM Video', extensions: ['webm'] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false };
    }
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle('recording:save-to-path', async (_event, data: { buffer: ArrayBuffer; filePath: string }) => {
    try {
      const buffer = Buffer.from(data.buffer);
      fs.writeFileSync(data.filePath, buffer);
      return { success: true, filePath: data.filePath, fileSize: buffer.length };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('recording:get-file-url', (_event, filePath: string) => {
    return `atom://${filePath}`;
  });

  ipcMain.handle('recording:save-blob', async (_event, data: { buffer: ArrayBuffer; defaultName: string }) => {
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
