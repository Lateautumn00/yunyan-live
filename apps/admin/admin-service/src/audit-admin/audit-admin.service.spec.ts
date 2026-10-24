import { describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { AuditAdminService } from './audit-admin.service';

function makeService() {
  const query = vi.fn();
  const service = new AuditAdminService({ query } as unknown as DataSource);
  return { service, query };
}

describe('AuditAdminService（批次 7c 审计只读面）', () => {
  it('缺省时间窗 = 近 7 天，排序走 id（PK），不按 occurred_at 排序', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    const now = Date.now();
    await service.list({ page: 1, pageSize: 50 });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql] = query.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain('occurred_at >= $1');
    expect(countSql).toContain('occurred_at < $2');
    expect(pageSql).toContain('ORDER BY id DESC');
    expect(pageSql).not.toContain('ORDER BY occurred_at');
    const [from, to] = countParams as [Date, Date];
    expect(to.getTime()).toBeLessThanOrEqual(Date.now());
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(7);
    expect(to.getTime()).toBeGreaterThanOrEqual(now - 1000);
  });

  it('动作精确 + 操作者模糊过滤，detail 序列化为 JSON 字符串', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([
      {
        id: '10',
        occurredAt: new Date('2026-10-01T00:00:00.000Z'),
        actor: 'admin-1',
        action: 'live.delete',
        targetType: 'room',
        targetId: 'r1',
        requestId: 'req-1',
        ip: '127.0.0.1',
        detail: { byAdmin: true }
      }
    ]);

    const res = await service.list({
      page: 1,
      pageSize: 50,
      action: 'live.delete',
      actor: 'admin',
      fromMs: String(Date.parse('2026-09-01T00:00:00Z')),
      toMs: String(Date.parse('2026-09-30T00:00:00Z'))
    });

    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    expect(countSql).toContain('action = $3');
    expect(countSql).toContain('actor ILIKE $4');
    expect(countParams).toEqual([
      new Date(Date.parse('2026-09-01T00:00:00Z')),
      new Date(Date.parse('2026-09-30T00:00:00Z')),
      'live.delete',
      '%admin%'
    ]);

    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: '10',
      occurredAt: '2026-10-01T00:00:00.000Z',
      action: 'live.delete',
      targetType: 'room',
      detail: '{"byAdmin":true}'
    });
  });

  it('pageSize 上限 200，page 下限 1', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await service.list({ page: 0, pageSize: 9999 });

    const pageParams = (query.mock.calls[1] as [string, unknown[]])[1];
    expect(pageParams.slice(-2)).toEqual([200, 0]);
  });

  it('detail 为空 → 空字符串（不输出 "undefined"）', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([
      {
        id: '1',
        occurredAt: new Date('2026-10-01T00:00:00.000Z'),
        actor: 'a',
        action: 'x',
        targetType: null,
        targetId: null,
        requestId: null,
        ip: null,
        detail: null
      }
    ]);

    const res = await service.list({ page: 1, pageSize: 50 });
    expect(res.items[0]).toMatchObject({ targetType: '', targetId: '', ip: '', detail: '' });
  });
});
