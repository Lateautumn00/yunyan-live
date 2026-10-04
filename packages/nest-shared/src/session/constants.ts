/** 与 JWT_EXPIRES_IN 默认值（7d）一致 */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** 顶下线广播频道（登录时 publish KickPayload） */
export const SESSION_KICK_CHANNEL = 'session:kick';

export type SessionState = 'ok' | 'expired' | 'kicked' | 'fail-open';

export interface KickPayload {
  guid: string;
  oldSid: string;
}

export function sessionKey(guid: string): string {
  return `session:${guid}`;
}

/** 教室禁言广播频道（网关写入禁言状态后 publish ForbidPayload） */
export const FORBID_CHANNEL = 'live:forbid';

/**
 * 禁言状态语义（与前端 Chat.vue speechClose 一致）：
 * 0=禁言（输入框禁用），1=可发言；无记录时视为 1。
 */
export const FORBID_MUTED = 0;
export const FORBID_ALLOWED = 1;

export interface ForbidPayload {
  roomId: string;
  status: number;
}

export function forbidKey(roomId: string): string {
  return `live:forbid:${roomId}`;
}
