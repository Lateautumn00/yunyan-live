import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
  normalizePageQuery,
  toGrpcPage
} from '../index';

describe('normalizePageQuery', () => {
  it('空入参回落到 1/10', () => {
    expect(normalizePageQuery({})).toEqual({ page: 1, pageSize: 10 });
  });

  it('解析 page/pageSize 数值与字符串', () => {
    expect(normalizePageQuery({ page: 3, pageSize: 7 })).toEqual({ page: 3, pageSize: 7 });
    expect(normalizePageQuery({ page: '3', pageSize: '7' })).toEqual({ page: 3, pageSize: 7 });
  });

  it('接受 pageNum/page_size 别名', () => {
    expect(normalizePageQuery({ pageNum: 2, page_size: 5 })).toEqual({ page: 2, pageSize: 5 });
    expect(normalizePageQuery({ pageNum: '2', pageSize: '5' })).toEqual({ page: 2, pageSize: 5 });
  });

  it('page 优先于 pageNum，pageSize 优先于 page_size', () => {
    expect(normalizePageQuery({ page: 1, pageNum: 9, pageSize: 4, page_size: 8 })).toEqual({
      page: 1,
      pageSize: 4
    });
  });

  it('非法值与零值回落 1/10', () => {
    expect(normalizePageQuery({ page: 'abc', pageSize: 'xyz' })).toEqual({ page: 1, pageSize: 10 });
    expect(normalizePageQuery({ page: 0, pageSize: 0 })).toEqual({ page: 1, pageSize: 10 });
    expect(normalizePageQuery({ page: '', pageSize: '' })).toEqual({ page: 1, pageSize: 10 });
  });

  it('负 page 钳制为 1（原 parseInt 负数穿透修复）', () => {
    expect(normalizePageQuery({ page: -5, pageSize: 10 })).toEqual({ page: 1, pageSize: 10 });
    expect(normalizePageQuery({ page: '-2' })).toEqual({ page: 1, pageSize: 10 });
  });

  it('pageSize 超上限截断至 MAX_PAGE_SIZE', () => {
    expect(normalizePageQuery({ pageSize: 100000 })).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE
    });
    expect(normalizePageQuery({ pageSize: MAX_PAGE_SIZE })).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE
    });
    expect(normalizePageQuery({ pageSize: -1 })).toEqual({ page: 1, pageSize: 10 });
  });
});

describe('cursor（keyset 深翻页）', () => {
  it('encode/decode 往返', () => {
    const raw = encodeCursor(1729123456789, 'u-1');
    expect(raw).toBe('1729123456789|u-1');
    expect(decodeCursor(raw)).toEqual({ timeMs: 1729123456789, id: 'u-1' });
  });

  it('空/非法游标回落 null（调用方走 OFFSET）', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('no-separator')).toBeNull();
    expect(decodeCursor('|abc')).toBeNull();
    expect(decodeCursor('123|')).toBeNull();
    expect(decodeCursor('abc|u-1')).toBeNull();
    expect(decodeCursor('12.5|u-1')).toBeNull();
  });

  it('encode 对小数毫秒取整', () => {
    expect(encodeCursor(1729123456789.7, 'i')).toBe('1729123456789|i');
  });
});

describe('toGrpcPage', () => {
  it('映射为 proto 的 page/page_size 字段', () => {
    expect(toGrpcPage({ page: 2, pageSize: 8 })).toEqual({ page: 2, page_size: 8 });
  });
});
