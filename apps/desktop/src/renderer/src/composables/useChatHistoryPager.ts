import { getCurrentInstance, onUnmounted, ref, type Ref } from 'vue';

/** 顶部翻页触发阈值（px） */
export const TOP_THRESHOLD_PX = 30;
/** 混跑兜底：getHistory 无响应（旧服务端 default:break）→ 3s 超时 hasMore=false 优雅降级 */
export const HISTORY_TIMEOUT_MS = 3000;

/** 终态 reason：停止翻页；unavailable 可重试（其余未知 reason 按终态保守处理） */
const TERMINAL_REASONS = new Set(['invalid_cursor', 'persistence_disabled', 'unknown_reason']);

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** ingest 接受后的可合并载荷（messages 形状由调用方再行校验/归一） */
export interface PagerIngest {
  messages: unknown[];
  nextCursor: string | null;
}

export type PagerFrameType = 'history' | 'historyPage' | 'historyError';

export interface HistoryPagerDeps {
  /** 注入的取页动作（Chat.vue 里 = setSocketSend getHistory）；signal 于超时/卸载时 abort */
  fetchHistory: (cursor: string | null, signal: AbortSignal) => void;
  timeoutMs?: number;
}

export interface HistoryPager {
  loading: Ref<boolean>;
  hasMore: Ref<boolean>;
  nextCursor: Ref<string | null>;
  /** 顶部滚动判定 + 单飞发页；返回是否发出了请求 */
  pageRequest(m: ScrollMetrics): boolean;
  /** 帧分发入口（history/historyPage/historyError）；返回可合并载荷或 null */
  ingest(type: PagerFrameType, data: unknown): PagerIngest | null;
  /** 卸载/超时清理 */
  dispose(): void;
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
}

function normalizeMessages(data: Record<string, unknown>): unknown[] | null {
  const m = data.messages;
  if (!Array.isArray(m)) return null; // 缺失/null/畸形 → 不 crash、不伪造"到底"
  return m;
}

function normalizeCursor(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function useChatHistoryPager(deps: HistoryPagerDeps): HistoryPager {
  const timeoutMs = deps.timeoutMs ?? HISTORY_TIMEOUT_MS;
  const loading = ref(false);
  const hasMore = ref(true); // 乐观初值：旧服务端无响应 → 3s 超时转 false（混跑降级）
  const nextCursor = ref<string | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: AbortController | null = null;
  let dead = false;

  function clearInflight() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    inflight = null;
    loading.value = false;
  }

  function pageRequest(m: ScrollMetrics): boolean {
    if (dead || loading.value || !hasMore.value) return false;
    if (m.scrollHeight <= m.clientHeight) return false; // 内容不足一屏不触发
    if (m.scrollTop > TOP_THRESHOLD_PX) return false;
    loading.value = true;
    const ctrl = new AbortController();
    inflight = ctrl;
    timer = setTimeout(() => {
      // 混跑/旧服务端：无帧 → 终止翻页（hasMore=false），late 帧因 loading=false 被 ingest 丢弃
      timer = null;
      inflight = null;
      loading.value = false;
      hasMore.value = false;
      ctrl.abort();
    }, timeoutMs);
    try {
      deps.fetchHistory(nextCursor.value, ctrl.signal);
    } catch {
      clearInflight();
      return false;
    }
    return true;
  }

  function ingest(type: PagerFrameType, data: unknown): PagerIngest | null {
    if (dead) return null;
    if (type === 'historyError') {
      const rec = asRecord(data);
      const reason = rec && typeof rec.reason === 'string' ? rec.reason : 'unknown_reason';
      clearInflight();
      if (TERMINAL_REASONS.has(reason)) {
        hasMore.value = false;
      }
      // unavailable：hasMore 保持不变，可再次触发
      return null;
    }

    const rec = asRecord(data);
    if (!rec) {
      clearInflight();
      return null;
    }
    const messages = normalizeMessages(rec);
    if (!messages) {
      // 畸形帧：清请求态但不动 hasMore（不 crash、不伪造"到底"），允许再次触发
      clearInflight();
      return null;
    }
    if (type === 'historyPage' && !loading.value) {
      return null; // 乱序/迟到响应：不重复 prepend
    }

    clearInflight();
    hasMore.value = normalizeCursor(rec.nextCursor) !== null;
    nextCursor.value = normalizeCursor(rec.nextCursor);
    return { messages, nextCursor: nextCursor.value };
  }

  function dispose() {
    dead = true;
    if (inflight) {
      inflight.abort(); // 卸载：终止在途请求，无悬挂 setState
      inflight = null;
    }
    clearInflight();
  }

  if (getCurrentInstance()) onUnmounted(dispose);

  return { loading, hasMore, nextCursor, pageRequest, ingest, dispose };
}
