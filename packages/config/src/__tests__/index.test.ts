import { describe, expect, it } from 'vitest';
import { loadConfig } from '../index';

describe('loadConfig', () => {
  it('reads values from env record', () => {
    const config = loadConfig({
      VITE_VERSION: '0.5.0',
      VITE_LIVE_SERVER: 'wss://live.example.com',
      VITE_MESSAGE_WS: 'wss://live.example.com/lvws',
      VITE_USER_API: 'https://api.example.com/lvuser',
      VITE_LIVE_API: 'https://api.example.com/lv',
      VITE_UPLOAD_URL: 'https://cdn.example.com/h5/live/',
      VITE_AUDIO_URL: 'https://cdn.example.com/media/Ascott.m4a',
      VITE_USER_AGREEMENT: 'https://cdn.example.com/user.pdf',
      VITE_UPLOAD_IMAGE_URL: 'https://api.example.com/image/upload',
      VITE_UPLOAD_PPT_URL: 'https://api.example.com/image/ppt',
      VITE_SMALL_CLASS_NUM: '10'
    });

    expect(config.version).toBe('0.5.0');
    expect(config.liveServer).toBe('wss://live.example.com');
    expect(config.messageWs).toBe('wss://live.example.com/lvws');
    expect(config.userApi).toBe('https://api.example.com/lvuser');
    expect(config.liveApi).toBe('https://api.example.com/lv');
    expect(config.uploadUrl).toBe('https://cdn.example.com/h5/live/');
    expect(config.audioUrl).toBe('https://cdn.example.com/media/Ascott.m4a');
    expect(config.userAgreement).toBe('https://cdn.example.com/user.pdf');
    expect(config.uploadImageUrl).toBe('https://api.example.com/image/upload');
    expect(config.uploadPptUrl).toBe('https://api.example.com/image/ppt');
    expect(config.smallClassNum).toBe(10);
  });

  it('falls back to defaults for missing keys', () => {
    const config = loadConfig({});
    expect(config.version).toBe('0.0.0');
    expect(config.liveServer).toBe('');
    expect(config.smallClassNum).toBe(10);
  });

  it('coerces smallClassNum to number', () => {
    expect(loadConfig({ VITE_SMALL_CLASS_NUM: '5' }).smallClassNum).toBe(5);
  });
});