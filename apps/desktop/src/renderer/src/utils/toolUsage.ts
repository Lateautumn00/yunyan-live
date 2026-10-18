import Live from '@/api/backstage';

let last = { tool: '', at: 0 };

/**
 * F1 附带埋点：白板工具切换上报（F12 触发条件数据源）。
 * fire-and-forget：埋点绝不阻塞画板交互，失败静默（网关侧也会吞参数缺失）。
 * 同工具 <1s 连点去抖，避免重复行淹没使用数据。
 */
export function reportToolUsage(roomId: string, tool: string): void {
  if (!roomId || !tool) return;
  const now = Date.now();
  if (tool === last.tool && now - last.at < 1000) return;
  last = { tool, at: now };
  void Live.track_tool_usage({ roomId, tool }).catch(() => undefined);
}
