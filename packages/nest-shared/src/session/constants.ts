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
