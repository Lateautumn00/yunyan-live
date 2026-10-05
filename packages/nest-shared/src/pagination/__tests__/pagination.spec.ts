import { describe, expect, it } from 'vitest';
import { normalizePageQuery, toGrpcPage } from '../index';

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
});

describe('toGrpcPage', () => {
  it('映射为 proto 的 page/page_size 字段', () => {
    expect(toGrpcPage({ page: 2, pageSize: 8 })).toEqual({ page: 2, page_size: 8 });
  });
});
