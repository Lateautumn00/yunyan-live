import { randomUUID } from 'node:crypto';
import {
  MAX_NOTIFY_PAYLOAD_LENGTH,
  NOTIFY_COLUMN_LIMITS,
  NOTIFY_KINDS,
  type NotifyKind
} from './constants';

/** 调用侧输入：eventId/occurredAtMs/dedupeKey 缺省由 publisher 生成 */
export interface NotifyEventInput {
  kind: NotifyKind;
  /** 收件人邮箱（调用侧已解析：JWT email / users.email） */
  to: string;
  /** 场次/录制/会话作用域：roomId / recordingId / sessionId */
  scope: string;
  payload?: Record<string, unknown>;
  /** uuid；缺省/非法由 publisher 重生成 */
  eventId?: string;
  /** epoch ms；缺省 Date.now() */
  occurredAtMs?: number;
}

/** publisher 规范化后的报文（wire 形态） */
export interface NotifyWireEvent {
  eventId: string;
  occurredAtMs: number;
  kind: NotifyKind;
  to: string;
  scope: string;
  /** 去重键 = kind:scope:to（每场次每模板每收件人 7d 唯一） */
  dedupeKey: string;
  payload: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 松邮箱形（非完整 RFC）：够拦明显脏值，真实投递失败由 SMTP/重试兜底 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** normalize：非法 kind/邮箱/scope → null（调用侧丢弃计数）；payload 超限裁剪 */
export function normalizeNotifyEvent(input: NotifyEventInput): NotifyWireEvent | null {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.kind !== 'string' || !(NOTIFY_KINDS as readonly string[]).includes(input.kind)) {
    return null;
  }
  if (typeof input.to !== 'string' || !EMAIL_RE.test(input.to)) return null;
  if (typeof input.scope !== 'string' || !input.scope) return null;
  const eventId =
    typeof input.eventId === 'string' && UUID_RE.test(input.eventId) ? input.eventId : randomUUID();
  const occurredAtMs =
    typeof input.occurredAtMs === 'number' && Number.isFinite(input.occurredAtMs)
      ? input.occurredAtMs
      : Date.now();
  const to = truncate(input.to, NOTIFY_COLUMN_LIMITS.to);
  const scope = truncate(input.scope, NOTIFY_COLUMN_LIMITS.scope);
  let payload: Record<string, unknown> = {};
  if (isPlainObject(input.payload)) {
    try {
      const json = JSON.stringify(input.payload);
      payload = json.length > MAX_NOTIFY_PAYLOAD_LENGTH ? { _truncated: true } : input.payload;
    } catch {
      payload = {};
    }
  }
  return {
    eventId,
    occurredAtMs,
    kind: input.kind as NotifyKind,
    to,
    scope,
    dedupeKey: `${input.kind}:${scope}:${to}`,
    payload
  };
}
