import type { Pool } from 'pg';
import type { ModerationPayload } from '@yunyan-live/nest-shared';

/** 单用户管控条目：mute 到期毫秒（惰性过期）/ kick 仅本缓存期有效（重进由 PG 握手兜底） */
export interface ModerationEntry {
  muteUntilMs?: number;
  kicked?: boolean;
}

/** roomId → authUserId（JWT sub）→ 条目：运行时缓存，PG（chat_moderation）为唯一事实源 */
export type ModerationState = Map<string, Map<string, ModerationEntry>>;

export function ensureRoom(state: ModerationState, roomId: string): Map<string, ModerationEntry> {
  let room = state.get(roomId);
  if (!room) {
    room = new Map();
    state.set(roomId, room);
  }
  return room;
}

/** 房间无连接时丢弃缓存（重进由握手 PG 查询回填；与 roomForbid 同生命周期） */
export function dropRoom(state: ModerationState, roomId: string): void {
  state.delete(roomId);
}

/**
 * 单用户禁言判定（惰性过期）：教师豁免由调用侧决定。
 * 过期顺手清 muteUntilMs（广播/落库交给 15s 轮询，此处只保读路径正确）。
 */
export function isMuted(
  state: ModerationState,
  roomId: string,
  authUserId: string | undefined,
  now = Date.now()
): boolean {
  if (!authUserId) return false;
  const entry = state.get(roomId)?.get(authUserId);
  if (!entry?.muteUntilMs) return false;
  if (entry.muteUntilMs <= now) {
    delete entry.muteUntilMs;
    return false;
  }
  return true;
}

/** 应用 live:moderation 事件到缓存（订阅回调；广播由调用侧统一做） */
export function applyModeration(state: ModerationState, payload: ModerationPayload): void {
  const room = ensureRoom(state, payload.roomId);
  const entry = room.get(payload.userId) ?? {};
  if (payload.kind === 'mute') {
    if (payload.op === 'set') entry.muteUntilMs = payload.untilMs;
    else delete entry.muteUntilMs;
  } else {
    if (payload.op === 'set') entry.kicked = true;
    else entry.kicked = false;
  }
  if (entry.muteUntilMs === undefined && !entry.kicked) room.delete(payload.userId);
  else room.set(payload.userId, entry);
}

/** 收集已过期的 mute 条目（清条目并返回，供轮询广播 {kind:'mute', op:'expire'} 帧） */
export function collectExpired(
  state: ModerationState,
  now = Date.now()
): Array<{ roomId: string; userId: string }> {
  const out: Array<{ roomId: string; userId: string }> = [];
  for (const [roomId, room] of state) {
    for (const [userId, entry] of room) {
      if (entry.muteUntilMs !== undefined && entry.muteUntilMs <= now) {
        delete entry.muteUntilMs;
        if (!entry.kicked) room.delete(userId);
        out.push({ roomId, userId });
      }
    }
    if (room.size === 0) state.delete(roomId);
  }
  return out;
}

/**
 * 握手回填：读活跃行（kick 或未到期 mute）。
 * 无池 / 查询失败 → null（fail-open 连接，错误已由调用侧日志记录）。
 */
export async function loadModeration(
  pool: Pool | null,
  roomId: string,
  userId: string
): Promise<{ kicked: boolean; muteUntilMs?: number } | null> {
  if (!pool || !userId) return null;
  try {
    const res = await pool.query(
      `SELECT kind, until FROM chat_moderation
        WHERE room_id = $1 AND user_id = $2 AND active = true
          AND (until IS NULL OR until > now())`,
      [roomId, userId]
    );
    const rows = (res.rows ?? []) as Array<{ kind: string; until: unknown }>;
    let kicked = false;
    let muteUntilMs: number | undefined;
    for (const row of rows) {
      if (row.kind === 'kick') kicked = true;
      else if (row.kind === 'mute' && row.until)
        muteUntilMs = new Date(row.until as never).getTime();
    }
    if (!kicked && muteUntilMs === undefined) return null;
    return { kicked, muteUntilMs };
  } catch (err) {
    console.error(
      '[ChatWS][PG] moderation load failed:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * 全局扫过期 mute 行置 active=false（released_reason='expired'）。
 * 读侧谓词已排除到期行，本扫只做状态收口留痕；无池静默跳过。
 */
export async function sweepExpiredModeration(pool: Pool | null): Promise<number> {
  if (!pool) return 0;
  const res = await pool.query(
    `UPDATE chat_moderation
        SET active = false, released_at = now(), released_reason = 'expired'
      WHERE active = true AND until IS NOT NULL AND until <= now()`
  );
  return res.rowCount ?? 0;
}
