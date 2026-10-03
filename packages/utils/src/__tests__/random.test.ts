import { describe, expect, it } from 'vitest';
import { randomString, uid } from '../random';

describe('randomString (baseline freeze)', () => {
  it('generates string of requested length', () => {
    expect(randomString(8)).toHaveLength(8);
    expect(randomString(0)).toHaveLength(0);
  });

  it('generates pure digits when isNum is true', () => {
    const s = randomString(16, true);
    expect(s).toMatch(/^\d+$/);
  });

  it('generates alphanumeric chars when isNum is false', () => {
    const s = randomString(32, false);
    expect(s).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('produces different values across calls', () => {
    expect(randomString(10)).not.toBe(randomString(10));
  });
});

describe('uid', () => {
  it('prepends the given prefix', () => {
    expect(uid('page_')).toMatch(/^page_[0-9a-z]+[A-Za-z0-9]{8}$/);
    expect(uid()).toMatch(/^[0-9a-z]+[A-Za-z0-9]{8}$/);
  });

  it('produces unique values across rapid calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()));
    expect(ids.size).toBe(500);
  });

  it('is lexicographically sortable within the same millisecond boundary', () => {
    const a = uid();
    const b = uid();
    expect(a.slice(0, a.length - 8) <= b.slice(0, b.length - 8)).toBe(true);
  });
});
