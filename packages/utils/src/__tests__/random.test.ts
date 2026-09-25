import { describe, expect, it } from 'vitest';
import { randomString } from '../random';

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
