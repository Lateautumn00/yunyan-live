import { describe, expect, it } from 'vitest';
import { formatDate, formateNumber } from '../format';

describe('formatDate (baseline freeze)', () => {
  it('returns empty string when time is falsy', () => {
    expect(formatDate(0)).toBe('');
    expect(formatDate(NaN)).toBe('');
  });

  it('formats local time in YYYY-MM-DD HH:mm:ss', () => {
    const ts = new Date(2020, 0, 15, 8, 9, 10).getTime();
    expect(formatDate(ts)).toBe('2020-01-15 08:09:10');
  });

  it('zero-pads month/day/hour/minute/second', () => {
    const ts = new Date(2021, 11, 3, 4, 5, 6).getTime();
    expect(formatDate(ts)).toBe('2021-12-03 04:05:06');
  });

  it('returns empty string for unsupported formats', () => {
    const ts = new Date(2020, 0, 15, 8, 9, 10).getTime();
    expect(formatDate(ts, 'YYYY/MM/DD')).toBe('');
  });

  it('uses default format when omitted', () => {
    const ts = new Date(2020, 5, 1, 0, 0, 0).getTime();
    expect(formatDate(ts)).toBe('2020-06-01 00:00:00');
  });
});

describe('formateNumber', () => {
  it('pads single digit with leading zero', () => {
    expect(formateNumber(5)).toBe('05');
    expect(formateNumber(12)).toBe('12');
    expect(formateNumber(0)).toBe('00');
  });
});
