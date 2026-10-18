import type { PageQuery } from '@yunyan-live/types';

export type { PageQuery };

/** 单页上限：防 pageSize=100000 一类穿透（F16 共性钳制） */
export const MAX_PAGE_SIZE = 100;

/** 入口层分页原始入参（接受 page/pageNum/page_size 别名，值可为 query 字符串） */
interface PageQueryInput {
  page?: string | number;
  pageSize?: string | number;
  pageNum?: string | number;
  page_size?: string | number;
}

/**
 * 归一化分页入参：别名收敛 + 数值解析，非法/缺省回落到 1/10；
 * 钳制：page ≥ 1，1 ≤ pageSize ≤ MAX_PAGE_SIZE（超限截断）。
 */
export function normalizePageQuery(input: PageQueryInput): Required<PageQuery> {
  const page = parseInt(String(input.page ?? input.pageNum ?? ''), 10);
  const pageSize = parseInt(String(input.pageSize ?? input.page_size ?? ''), 10);
  return {
    page: page > 0 ? page : 1,
    pageSize: pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : 10
  };
}

/** 网关 → gRPC 字段映射（proto 为 snake_case int32） */
export function toGrpcPage(query: Required<PageQuery>): { page: number; page_size: number } {
  return { page: query.page, page_size: query.pageSize };
}

/** keyset 游标（F16 深翻页）：`<排序时间戳 epoch ms>|<tiebreaker id>` */
export interface PageCursor {
  timeMs: number;
  id: string;
}

export function encodeCursor(timeMs: number, id: string): string {
  return `${Math.trunc(timeMs)}|${id}`;
}

/** 解析游标：空/非法（缺分隔符、非数字时间、空 id）→ null（调用方回落 OFFSET 分页） */
export function decodeCursor(raw?: string | null): PageCursor | null {
  if (!raw) return null;
  const idx = raw.indexOf('|');
  if (idx <= 0 || idx === raw.length - 1) return null;
  const timeMs = Number(raw.slice(0, idx));
  const id = raw.slice(idx + 1).trim();
  if (!Number.isFinite(timeMs) || !Number.isInteger(timeMs) || id === '') return null;
  return { timeMs, id };
}
