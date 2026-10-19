/**
 * F9 通知邮件通道（与 chat/audit 隔离的 exchange；拓扑由 mail-service consumer 断言）。
 * 重试阶梯同 audit 口径 5s/30s/120s，≥3 次进 DLQ。
 */
export const NOTIFY_EXCHANGE = 'mail.notify';
export const NOTIFY_RK_WORK = 'notify.work';
export const NOTIFY_RK_DLQ = 'notify.dlq';
export const NOTIFY_RK_RETRY = ['notify.retry1', 'notify.retry2', 'notify.retry3'] as const;
export const NOTIFY_QUEUE_WORK = 'mail.notify.work';
export const NOTIFY_QUEUE_RETRY = [
  'mail.notify.retry1',
  'mail.notify.retry2',
  'mail.notify.retry3'
] as const;
export const NOTIFY_QUEUE_DLQ = 'mail.notify.dlq';
/** x-message-ttl（ms）：work 失败 → retryN → TTL 到期回 work */
export const NOTIFY_RETRY_TTLS = [5_000, 30_000, 120_000] as const;
/** x-retry ≥3 → DLQ */
export const NOTIFY_MAX_RETRY = 3;

/** 通知类型白名单（publisher 校验 + 模板分发；新增类型须同步 notification-matrix.md） */
export const NOTIFY_KINDS = ['class_reminder', 'recording_ready', 'checkin_ended'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

/** 单用户单日发送上限（F9 频控 DoD；Redis INCR 按 UTC 日分桶） */
export const NOTIFY_DAILY_LIMIT = 5;
/** 场次模板去重窗口：7d（dedupeKey = kind:scope:to，SET NX EX） */
export const NOTIFY_DEDUPE_TTL_S = 7 * 24 * 60 * 60;

export const NOTIFY_COLUMN_LIMITS = {
  to: 254,
  kind: 40,
  scope: 100,
  dedupeKey: 320
} as const;
/** payload JSON 整体上限（模板参数很小；超限裁剪防畸形大报文） */
export const MAX_NOTIFY_PAYLOAD_LENGTH = 4096;
/** 报文整体硬顶（防畸形调用） */
export const MAX_NOTIFY_BODY_LENGTH = 16_384;
