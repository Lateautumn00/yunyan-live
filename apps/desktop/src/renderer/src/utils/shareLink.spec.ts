import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildShareUrl, getShareOrigin, resolveShareOrigin } from './shareLink';

describe('buildShareUrl', () => {
  it('拼接 hash 路由分享链接', () => {
    expect(buildShareUrl('https://live.example.com', 'r1', 'AB12')).toBe(
      'https://live.example.com/#/join?room=r1&code=AB12'
    );
  });

  it('去除 base 尾部斜杠', () => {
    expect(buildShareUrl('https://live.example.com///', 'r1', 'AB12')).toBe(
      'https://live.example.com/#/join?room=r1&code=AB12'
    );
  });

  it('room/code 缺失返回空串', () => {
    expect(buildShareUrl('https://x.com', '', 'AB12')).toBe('');
    expect(buildShareUrl('https://x.com', 'r1', '')).toBe('');
    expect(buildShareUrl('https://x.com', undefined, undefined)).toBe('');
  });

  it('空 base 或非 http(s) base 返回空串', () => {
    expect(buildShareUrl('', 'r1', 'AB12')).toBe('');
    expect(buildShareUrl('file:///app', 'r1', 'AB12')).toBe('');
    expect(buildShareUrl('  ', 'r1', 'AB12')).toBe('');
  });

  it('对参数做 URL 编码与去空白', () => {
    expect(buildShareUrl('https://x.com', ' r 1 ', 'A&B=C')).toBe(
      'https://x.com/#/join?room=r%201&code=A%26B%3DC'
    );
  });
});

describe('resolveShareOrigin', () => {
  it('显式配置优先且去尾斜杠', () => {
    expect(resolveShareOrigin('https://env.example.com/')).toBe('https://env.example.com');
    expect(resolveShareOrigin(' http://192.168.2.100:5173 ')).toBe('http://192.168.2.100:5173');
  });

  it('显式配置非 http(s) 时不回退（拒绝 file:// 等假源）', () => {
    expect(resolveShareOrigin('file:///app')).toBe('');
  });

  it('未配置时回退 window.location.origin（jsdom http 源）', () => {
    expect(resolveShareOrigin(undefined)).toBe(window.location.origin);
    expect(resolveShareOrigin('')).toBe(window.location.origin);
  });
});

describe('getShareOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('读取 VITE_SHARE_BASE_URL', () => {
    vi.stubEnv('VITE_SHARE_BASE_URL', 'https://env.example.com/');
    expect(getShareOrigin()).toBe('https://env.example.com');
  });

  it('未配置时回退 location.origin', () => {
    vi.stubEnv('VITE_SHARE_BASE_URL', '');
    expect(getShareOrigin()).toBe(window.location.origin);
  });
});
