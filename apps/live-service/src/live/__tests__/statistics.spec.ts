import { describe, expect, it, vi } from 'vitest';
import { createLiveService } from './test-utils';

function stubQueries(manager: Record<string, unknown>, cardRows: unknown[], seriesRows: unknown[]) {
  const q = manager.query as ReturnType<typeof vi.fn>;
  q.mockReset().mockResolvedValueOnce(cardRows).mockResolvedValueOnce(seriesRows);
  return q;
}

describe('LiveService.getTeacherStatistics', () => {
  it('口径：总观看人数去重、left_at NULL 计 now、日期范围同时作用于卡片与 series', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(
      manager,
      [{ total_viewers: 3, total_rooms: 2, row_count: 10, total_seconds: '5400' }],
      [{ date: '2026-10-17', seconds: '3600', person_times: 4, viewers: 2 }]
    );
    const res = await service.getTeacherStatistics('t1', '1704067200000', '1704672000000');

    const cardsSql = q.mock.calls[0][0] as string;
    const seriesSql = q.mock.calls[1][0] as string;
    // 去重观看人数 + 场次
    expect(cardsSql).toContain('COUNT(DISTINCT w.user_id)');
    expect(cardsSql).toContain('COUNT(DISTINCT w.room_id)');
    // 时长语义：NULL 计至统计时刻（与 getUserWatchTimeList 同一 CASE 形态）
    expect(cardsSql).toContain('CASE WHEN w.left_at IS NULL');
    expect(cardsSql).toContain('now() - w.joined_at');
    expect(cardsSql).toContain('w.left_at - w.joined_at');
    expect(cardsSql).not.toContain('LIMIT');
    // 教师仅见本人场次
    expect(cardsSql).toContain('r."liveUserId" = $1');
    expect(seriesSql).toContain('r."liveUserId" = $1');
    // 日期范围两查询同时生效
    expect(cardsSql).toContain('w.joined_at >= $2');
    expect(cardsSql).toContain('w.joined_at <= $3');
    expect(seriesSql).toContain('w.joined_at >= $2');
    expect(seriesSql).toContain('w.joined_at <= $3');
    expect(q.mock.calls[0][1]).toEqual(['t1', new Date(1704067200000), new Date(1704672000000)]);
    expect(q.mock.calls[1][1]).toEqual(['t1', new Date(1704067200000), new Date(1704672000000)]);
    // series 按日分桶（Asia/Shanghai）且字段映射 camelCase
    expect(seriesSql).toContain("AT TIME ZONE 'Asia/Shanghai'");
    expect(seriesSql).toContain('GROUP BY 1');
    expect(res).toEqual({
      totalViewers: 3,
      totalSeconds: 5400,
      totalRooms: 2,
      hasData: true,
      series: [{ date: '2026-10-17', seconds: 3600, personTimes: 4, viewers: 2 }]
    });
  });

  it('无日期范围时不产生 joined_at 过滤；无数据 hasData=false（前端空态非 0）', async () => {
    const { service, manager } = createLiveService();
    const q = stubQueries(
      manager,
      [{ total_viewers: 0, total_rooms: 0, row_count: 0, total_seconds: '0' }],
      []
    );
    const res = await service.getTeacherStatistics('t1');
    expect(q.mock.calls[0][0]).not.toContain('w.joined_at >=');
    expect(q.mock.calls[0][0]).not.toContain('w.joined_at <=');
    expect(q.mock.calls[0][1]).toEqual(['t1']);
    expect(res.hasData).toBe(false);
    expect(res.totalViewers).toBe(0);
    expect(res.series).toEqual([]);
  });

  it('断线重连 = 多行独立区间由 SQL 求和，total 不随 series 行数截断（口径回归）', async () => {
    const { service, manager } = createLiveService();
    // 卡片与 series 返回不同聚合深度：卡片全量 3 行，series 仅 2 个自然日
    stubQueries(
      manager,
      [{ total_viewers: 1, total_rooms: 1, row_count: 3, total_seconds: '7200' }],
      [
        { date: '2026-10-17', seconds: '3600', person_times: 2, viewers: 1 },
        { date: '2026-10-18', seconds: '3600', person_times: 1, viewers: 1 }
      ]
    );
    const res = await service.getTeacherStatistics('t1');
    expect(res.totalSeconds).toBe(7200);
    expect(res.totalViewers).toBe(1);
    expect(res.series).toHaveLength(2);
  });
});

describe('LiveService.recordToolUsage', () => {
  it('落库 board_tool_usage，tool 截断 40 字符', async () => {
    const { service, boardToolUsage } = createLiveService();
    boardToolUsage.repo.insert = vi.fn().mockResolvedValue(undefined);
    await service.recordToolUsage('u1', 'r1', '  mindmap  ');
    expect(boardToolUsage.repo.insert).toHaveBeenCalledWith({
      roomId: 'r1',
      userId: 'u1',
      tool: 'mindmap'
    });
    await service.recordToolUsage('u1', 'r1', 'x'.repeat(80));
    const last = (boardToolUsage.repo.insert as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(last.tool).toHaveLength(40);
  });
});
