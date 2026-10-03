import { describe, expect, it } from 'vitest';
import {
  formatCnDateTime,
  formatDate,
  formatDurationCn,
  formatDurationClock,
  formatFileSize,
  formatStopwatch,
  formateNumber
} from '../format';

describe('formatDate', () => {
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

  it('supports arbitrary token templates', () => {
    const ts = new Date(2020, 0, 15, 8, 9, 10).getTime();
    expect(formatDate(ts, 'YYYY/MM/DD')).toBe('2020/01/15');
    expect(formatDate(ts, 'YYYY-MM-DD')).toBe('2020-01-15');
    expect(formatDate(ts, 'HH:mm:ss')).toBe('08:09:10');
    expect(formatDate(ts, 'YYYY年MM月DD日')).toBe('2020年01月15日');
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

describe('formatStopwatch', () => {
  it('returns default for falsy or non-positive input', () => {
    expect(formatStopwatch(undefined)).toBe(`00'00"`);
    expect(formatStopwatch(0)).toBe(`00'00"`);
    expect(formatStopwatch(-5)).toBe(`00'00"`);
  });

  it('pads minutes and seconds independently', () => {
    expect(formatStopwatch(7)).toBe(`00'07"`);
    expect(formatStopwatch(67)).toBe(`01'07"`);
    expect(formatStopwatch(607)).toBe(`10'07"`);
    expect(formatStopwatch(670)).toBe(`11'10"`);
  });
});

describe('formatDurationCn', () => {
  it('handles sub-minute and empty durations', () => {
    expect(formatDurationCn(0)).toBe('0秒');
    expect(formatDurationCn(45)).toBe('45秒');
  });

  it('formats minutes with optional seconds', () => {
    expect(formatDurationCn(90)).toBe('1分30秒');
    expect(formatDurationCn(120)).toBe('2分');
    expect(formatDurationCn(3600)).toBe('60分');
  });
});

describe('formatDurationClock', () => {
  it('returns empty for invalid input', () => {
    expect(formatDurationClock(0)).toBe('');
    expect(formatDurationClock(-1)).toBe('');
  });

  it('formats as zero-padded clock', () => {
    expect(formatDurationClock(30)).toBe('00:30');
    expect(formatDurationClock(390)).toBe('06:30');
    expect(formatDurationClock(3600)).toBe('60:00');
  });
});

describe('formatFileSize', () => {
  it('formats bytes/KB/MB', () => {
    expect(formatFileSize(512)).toBe('512B');
    expect(formatFileSize(1024)).toBe('1.0KB');
    expect(formatFileSize(1536)).toBe('1.5KB');
    expect(formatFileSize(1048576)).toBe('1.0MB');
    expect(formatFileSize(2621440)).toBe('2.5MB');
  });

  it('treats invalid input as zero', () => {
    expect(formatFileSize(Number.NaN)).toBe('0B');
  });
});

describe('formatCnDateTime', () => {
  it('renders date with morning/afternoon marker', () => {
    const morning = new Date(2020, 8, 13, 9, 5, 3).getTime();
    expect(formatCnDateTime(morning)).toBe('2020-09-13 上午 09:05:03');
    const evening = new Date(2020, 8, 13, 20, 26, 40).getTime();
    expect(formatCnDateTime(evening)).toBe('2020-09-13 下午 20:26:40');
  });

  it('treats exactly noon as afternoon', () => {
    const noon = new Date(2020, 0, 1, 12, 0, 0).getTime();
    expect(formatCnDateTime(noon)).toContain('下午');
  });
});
