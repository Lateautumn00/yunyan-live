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
  // 绝对路径放 recording 虚拟 host 的 pathname（斜杠归一 + 去前导斜杠 + 编码），
  // 由 atom:// protocol.handle 解析；直接拼 atom://<abs> 会被 URL 规范化吞掉盘符冒号
  ipcMain.handle(IpcChannels.recordingGetFileUrl, (_event, filePath: string) => {
    const normalized = filePath.replaceAll('\\', '/').replace(/^\/+/, '');
    return `${PROTOCOL_SCHEME}://recording/${encodeURI(normalized)}`;
  });

  ipcMain.handle(
    IpcChannels.recordingSaveBlob,
    async (_event, data: RecordingSaveBlobArgs): Promise<RecordingSaveBlobResult> => {
      const result = await dialog.showSaveDialog({
        defaultPath: data.defaultName,
        filters: data.filters ?? [{ name: 'MP4 Video', extensions: ['mp4'] }]
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
