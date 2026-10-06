import type { PageQuery } from '@yunyan-live/types';

export type { PageQuery };

/** 入口层分页原始入参（接受 page/pageNum/page_size 别名，值可为 query 字符串） */
interface PageQueryInput {
  page?: string | number;
  pageSize?: string | number;
  pageNum?: string | number;
  page_size?: string | number;
}

/** 归一化分页入参：别名收敛 + 数值解析，非法/缺省回落到 1/10 */
export function normalizePageQuery(input: PageQueryInput): Required<PageQuery> {
  const page = parseInt(String(input.page ?? input.pageNum ?? ''), 10);
  const pageSize = parseInt(String(input.pageSize ?? input.page_size ?? ''), 10);
  return { page: page || 1, pageSize: pageSize || 10 };
}

/** 网关 → gRPC 字段映射（proto 为 snake_case int32） */
export function toGrpcPage(query: Required<PageQuery>): { page: number; page_size: number } {
  return { page: query.page, page_size: query.pageSize };
}
