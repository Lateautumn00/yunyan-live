import { describe, expect, it } from 'vitest';
import { extractErrorMessage } from '../error';

describe('extractErrorMessage', () => {
  it('prefers Error.message', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads message from plain objects', () => {
    expect(extractErrorMessage({ message: 'from message' })).toBe('from message');
  });

  it('reads msg from API envelopes', () => {
    expect(extractErrorMessage({ code: 4001, msg: '登录已过期' })).toBe('登录已过期');
  });

  it('ignores empty strings and falls back', () => {
    expect(extractErrorMessage({ message: '', msg: '' }, '默认错误')).toBe('默认错误');
    expect(extractErrorMessage('just a string', '默认错误')).toBe('默认错误');
    expect(extractErrorMessage(null)).toBe('');
    expect(extractErrorMessage(undefined, 'oops')).toBe('oops');
  });
});
