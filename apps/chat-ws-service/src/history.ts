import type { Pool, QueryResult } from 'pg';
import type { HistoryEntry, MentionTarget } from '@yunyan-live/types';

export interface HistoryPage {
  messages: HistoryEntry[];
  /** 指向本页最旧一条；null = 无更多 */
  nextCursor: string | null;
}

/** cursor = `${created_at_ms}|${id}`（方案 §4.5；严格解析，畸形即 invalid_cursor） */
export function encodeCursor(ms: number, id: string): string {
  return `${ms}|${id}`;
}

export function decodeCursor(raw: unknown): { ms: number; id: string } | null {
  if (typeof raw !== 'string') return null;
  // 严格规范形：ms≤15 位、id 1..19 位且无前导零（与 encodeCursor 输出一致，畸形即 invalid_cursor）
  const m = /^(0|[1-9]\d{0,14})\|([1-9]\d{0,18})$/.exec(raw);
  if (!m) return null;
  return { ms: Number(m[1]), id: m[2] };
}

/** 行 → 信封（方案 §4.1 映射表；time 毫秒往返、BIGINT 字符串化） */
export function rowToEntry(row: {
  msg_id: string;
  room_id: string;
  sender_name: string;
  is_teacher: boolean;
  content: string;
  msg_type: number;
  mentions: unknown;
  extra: unknown;
  time_ms: string;
}): HistoryEntry {
  const extra = (typeof row.extra === 'object' && row.extra !== null ? row.extra : {}) as {
    liveUserId?: string;
    infoType?: number;
  };
  const mentions = Array.isArray(row.mentions) ? (row.mentions as MentionTarget[]) : undefined;
  return {
    msgId: row.msg_id,
    liveMsg: {
      msg: row.content,
      roomId: row.room_id,
      name: row.sender_name,
      time: Number(row.time_ms),
      ...(mentions ? { mentions } : {})
    },
    info: {
      type: row.msg_type,
      isTeacher: row.is_teacher,
      liveUserId: typeof extra.liveUserId === 'string' ? extra.liveUserId : ''
    }
  };
}

/** 最近一页：SQL DESC 取最新 50 → 应用层 reverse 成 ASC（直接 ASC LIMIT 会取到最早 50 条） */
export const SQL_RECENT = `
SELECT msg_id, id::text AS id, room_id, sender_name, is_teacher, content, msg_type, mentions, extra,
       floor(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS time_ms
FROM chat_messages
WHERE room_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2`.trim();

/** keyset 翻页：行比较 + 参数化（前导 room_id 等值 + 两列 DESC → 索引前向扫描无 Sort） */
export const SQL_PAGE = `
SELECT msg_id, id::text AS id, room_id, sender_name, is_teacher, content, msg_type, mentions, extra,
       floor(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS time_ms
FROM chat_messages
WHERE room_id = $1
  AND (created_at, id) < (to_timestamp($2::double precision / 1000), $3::bigint)
ORDER BY created_at DESC, id DESC
LIMIT $4`.trim();

export interface HistoryStore {
  /** 进场最近页：3s fail-open 超时/失败 → null（调用方不推帧，严禁推空帧） */
  recent(roomId: string, limit: number): Promise<HistoryPage | null>;
  /** 翻页：失败/超时 → throw（调用方映射 historyError unavailable） */
  page(
    roomId: string,
    cursor: { ms: number; id: string } | null,
    limit: number
  ): Promise<HistoryPage>;
}

interface HistoryRow {
  msg_id: string;
  id: string;
  room_id: string;
  sender_name: string;
  is_teacher: boolean;
  content: string;
  msg_type: number;
  mentions: unknown;
  extra: unknown;
  time_ms: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    timer.unref?.();
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** DESC 行集 → ASC 页面 + nextCursor（少于 limit 说明已到底 → null） */
function buildPage(rows: HistoryRow[], limit: number): HistoryPage {
  const messages = rows.map(rowToEntry).reverse();
  let nextCursor: string | null = null;
  if (rows.length === limit && rows.length > 0) {
    const oldest = rows[rows.length - 1];
    nextCursor = encodeCursor(Number(oldest.time_ms), oldest.id);
  }
  return { messages, nextCursor };
}

export function createHistoryStore(pool: Pool, timeoutMs = 3000): HistoryStore {
  return {
    async recent(roomId, limit) {
      try {
        const res: QueryResult<HistoryRow> = await withTimeout(
          pool.query(SQL_RECENT, [roomId, limit]),
          timeoutMs,
          'history_recent'
        );
        return buildPage(res.rows, limit);
      } catch (err) {
        console.error(
          '[ChatWS][PG] history_recent_failed:',
          err instanceof Error ? err.message : String(err)
        );
        return null;
      }
    },
    async page(roomId, cursor, limit) {
      if (cursor === null) {
        const res: QueryResult<HistoryRow> = await withTimeout(
          pool.query(SQL_RECENT, [roomId, limit]),
          timeoutMs,
          'history_page'
        );
        return buildPage(res.rows, limit);
      }
      const res: QueryResult<HistoryRow> = await withTimeout(
        pool.query(SQL_PAGE, [roomId, cursor.ms, cursor.id, limit]),
        timeoutMs,
        'history_page'
      );
      return buildPage(res.rows, limit);
    }
  };
}
