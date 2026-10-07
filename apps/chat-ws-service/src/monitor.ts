/**
 * §4.8 日志级阈值告警（零依赖，固定可检索 tag）。
 * - DLQ 深度 >0 持续即为可靠性承诺被打破 → 每轮输出 `[ChatWS][DLQ] depth=N`（>100 追加 critical）
 * - work 队列积压 Warning >10,000 / Critical >100,000 → `[ChatWS][QUEUE] work=N`
 * - 30s 轮询保证场景「>0 持续 1min」下 1min 内必有告警
 */

export const DLQ_CRITICAL = 100;
export const WORK_WARNING = 10_000;
export const WORK_CRITICAL = 100_000;
export const DEPTH_INTERVAL_MS = 30_000;

export interface DepthMonitorDeps {
  /** 深度探测（consumer.depths）；未就绪返回 null → 本轮静默 */
  depths: () => Promise<{ work: number; dlq: number } | null>;
  intervalMs?: number;
  /** 告警出口（测试注入；缺省 console.warn） */
  warn?: (message: string) => void;
}

/** 启动深度阈值轮询；返回停止函数（幂等）。异常仅记日志，不中断轮询。 */
export function startDepthMonitor(deps: DepthMonitorDeps): () => void {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  const timer = setInterval(() => {
    void deps
      .depths()
      .then(depths => {
        if (!depths) return;
        if (depths.dlq > 0) {
          const critical = depths.dlq > DLQ_CRITICAL ? ' level=critical' : '';
          warn(`[ChatWS][DLQ] depth=${depths.dlq}${critical}`);
        }
        if (depths.work > WORK_WARNING) {
          const critical = depths.work > WORK_CRITICAL ? ' level=critical' : '';
          warn(`[ChatWS][QUEUE] work=${depths.work}${critical}`);
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[ChatWS][DLQ] depth_check_failed:',
          err instanceof Error ? err.message : String(err)
        );
      });
  }, deps.intervalMs ?? DEPTH_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
