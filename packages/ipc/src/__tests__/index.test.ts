import { describe, expect, it } from 'vitest';
import { IpcChannels } from '../index';

describe('IpcChannels', () => {
  it('exposes all required channels', () => {
    expect(IpcChannels).toMatchObject({
      checkForUpdate: 'app:check-for-update',
      downloadUpdate: 'app:download-update',
      installUpdate: 'app:install-update',
      getVersion: 'app:get-version',
      message: 'app:message',
      getSources: 'desktop-capturer:get-sources',
      clipboardWrite: 'clipboard:write-text',
      recordingGetFileUrl: 'recording:get-file-url',
      recordingSaveBlob: 'recording:save-blob',
      mediaImportFile: 'media:import-file'
    });
  });

  it('channel values are unique', () => {
    const values = Object.values(IpcChannels);
    expect(new Set(values).size).toBe(values.length);
  });
});
