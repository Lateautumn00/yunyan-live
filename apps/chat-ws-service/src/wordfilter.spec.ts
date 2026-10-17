import { describe, expect, it } from 'vitest';
import { DEFAULT_BANNED_WORDS, isBlocked } from './wordfilter';

describe('DEFAULT_BANNED_WORDS', () => {
  it('默认词库非空（F5 DoD）', () => {
    expect(DEFAULT_BANNED_WORDS.length).toBeGreaterThan(0);
    expect(DEFAULT_BANNED_WORDS.every(w => w.trim() !== '')).toBe(true);
  });
});

describe('isBlocked', () => {
  it('命中内置词库', () => {
    expect(isBlocked('广告：加微信详聊', DEFAULT_BANNED_WORDS)).toBe(true);
  });

  it('未命中放行', () => {
    expect(isBlocked('老师这道题怎么做', DEFAULT_BANNED_WORDS)).toBe(false);
  });

  it('大小写不敏感', () => {
    expect(isBlocked('join ABC now', ['abc'])).toBe(true);
    expect(isBlocked('ABC', ['abc'])).toBe(true);
  });

  it('词项两侧空白忽略', () => {
    expect(isBlocked('看看刷单', ['  刷单  '])).toBe(true);
  });

  it('空/null/缺省词库 fail-open 放行', () => {
    expect(isBlocked('任意内容', [])).toBe(false);
    expect(isBlocked('任意内容', null)).toBe(false);
    expect(isBlocked('任意内容', undefined)).toBe(false);
  });

  it('空白词跳过不算命中', () => {
    expect(isBlocked('任意内容', ['   ', ''])).toBe(false);
  });
});
