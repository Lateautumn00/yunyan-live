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
export const FORBID_ALLOWED = 1;
export const FORBID_FORBIDDEN = 0;

export interface ForbidPayload {
  roomId: string;
  status: number;
}

export function forbidKey(roomId: string): string {
  return `live:forbid:${roomId}`;
}

/** 教室签到广播频道（网关写入签到状态后 publish CheckinPayload） */
export const CHECKIN_CHANNEL = 'live:checkin';

/**
 * 签到广播动作语义：
 * started=新轮发起，update=计数更新，ended=教师手动结束，makeup=补签开启。
 * 超时自然关闭无服务端事件——客户端按 deadlineAt 本地倒计时自行收口。
 */
export type CheckinAction = 'started' | 'update' | 'ended' | 'makeup';

export interface CheckinPayload {
  roomId: string;
  action: CheckinAction;
  sessionId: string;
  deadlineAt?: string;
  signedCount?: number;
  attendeeCount?: number;
}

export const CHECKIN_ACTIONS: readonly CheckinAction[] = ['started', 'update', 'ended', 'makeup'];

/** F3 单用户禁言/踢出广播频道（网关写库成功后 publish ModerationPayload） */
export const MODERATION_CHANNEL = 'live:moderation';

export type ModerationKind = 'mute' | 'kick';
export type ModerationOp = 'set' | 'release';

export interface ModerationPayload {
  roomId: string;
  userId: string;
  kind: ModerationKind;
  /** set=生效（mute 带 untilMs；kick 无）；release=解除（状态读侧自行清空对应 kind） */
  op: ModerationOp;
  /** kind=mute 时的到期 epoch ms；kick 为 undefined */
  untilMs?: number;
}
