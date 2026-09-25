import { describe, expect, it } from 'vitest';
import { IpcChannels } from '../index';

describe('IpcChannels', () => {
  it('exposes all required channels', () => {
    expect(IpcChannels).toMatchObject({
      checkForUpdate: 'app:check-for-update',
      message: 'app:message',
      openExternal: 'shell:open-external',
      getSources: 'desktop-capturer:get-sources',
      clipboardWrite: 'clipboard:write-text',
      getSystemInfo: 'app:get-system-info'
    });
  });

  it('channel values are unique', () => {
    const values = Object.values(IpcChannels);
    expect(new Set(values).size).toBe(values.length);
  });
});