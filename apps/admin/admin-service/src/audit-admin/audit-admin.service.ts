import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 批次 7c：审计日志只读查询面。
 *
 * 设计约束（`docs/research/index-inventory.md:34`）：audit_logs **不建二级索引**，
 * > 1 亿行前再评估 (actor, occurred_at)。因此：
 * - 查询一律以时间窗收敛（缺省近 7 天），时间窗上无界不放开；
 * - 排序用 `ORDER BY id DESC`（走复合 PK `(id, occurred_at)` 的 id 前缀 = 写入序），
 *   **不用** `ORDER BY occurred_at`（该列无独立索引，会退化为全量排序）。
 * 表为 append-only（行级触发器禁 UPDATE/DELETE，`db/migrations/0003_audit_logs.sql:23-32`），本面只读。
 */

export interface ListAuditLogsQuery {
  page: number;
  pageSize: number;
  action?: string;
  actor?: string;
  fromMs?: string;
  toMs?: string;
}

export interface AuditLogRow {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string;
  ip: string;
  detail: string;
}

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseMs(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

@Injectable()
export class AuditAdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: ListAuditLogsQuery): Promise<{ total: number; items: AuditLogRow[] }> {
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);
    const now = Date.now();
    const to = parseMs(query.toMs, now);
    const from = parseMs(query.fromMs, to - DEFAULT_WINDOW_MS);

    const params: unknown[] = [new Date(from), new Date(to)];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = ['occurred_at >= $1', 'occurred_at < $2'];
    if (query.action) where.push(`action = ${add(query.action)}`);
    if (query.actor) where.push(`actor ILIKE ${add(`%${query.actor}%`)}`);
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const countSql = `SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`;
    const pageSql = `
      SELECT id, occurred_at AS "occurredAt", actor, action,
             target_type AS "targetType", target_id AS "targetId",
             request_id AS "requestId", ip, detail
      FROM audit_logs
      ${whereSql}
      ORDER BY id DESC
      LIMIT ${add(pageSize)} OFFSET ${add((page - 1) * pageSize)}`;

    const [countRows, pageRows] = await Promise.all([
      this.dataSource.query(countSql, params.slice(0, -2)),
      this.dataSource.query(pageSql, params)
    ]);
    const total = Number((countRows as { total: number }[])[0]?.total ?? 0);
    const items = (pageRows as Record<string, unknown>[]).map(row => ({
      id: String(row.id ?? ''),
      occurredAt:
        row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : String(row.occurredAt ?? ''),
      actor: String(row.actor ?? ''),
      action: String(row.action ?? ''),
      targetType: String(row.targetType ?? ''),
      targetId: String(row.targetId ?? ''),
      requestId: String(row.requestId ?? ''),
      ip: String(row.ip ?? ''),
      detail: row.detail === null || row.detail === undefined ? '' : JSON.stringify(row.detail)
    }));
    return { total, items };
  }
}
