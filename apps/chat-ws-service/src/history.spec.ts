import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  createHistoryStore,
  decodeCursor,
  encodeCursor,
  rowToEntry,
  SQL_PAGE,
  SQL_RECENT
} from './history';

interface FakeRow {
  msg_id: string;
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  is_teacher: boolean;
  content: string;
  msg_type: number;
  mentions: unknown;
  extra: unknown;
  time_ms: string;
}

function makeRow(i: number, overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    msg_id: `m-${i}`,
    id: String(1000 + i),
    room_id: 'r1',
    sender_id: `guid-${i}`,
    sender_name: `用户${i}`,
    is_teacher: i === 2,
    content: `内容${i}`,
    msg_type: 1,
    mentions: null,
    extra: { liveUserId: 'u1' },
    time_ms: String(1770000000000 + i * 1000),
    ...overrides
  };
}

function fakePool(query: (sql: string, params?: unknown[]) => Promise<unknown>): Pool {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => query(sql, params))
  } as unknown as Pool;
}

function result(rows: FakeRow[]): QueryResult<never> {
  return { rows, rowCount: rows.length } as unknown as QueryResult<never>;
}

describe('cursor 编解码（方案 §4.5：ms|id，严格正则）', () => {
  it('往返：encode(decode(x)) === x', () => {
    const c = encodeCursor(1770000000000, '42');
    expect(c).toBe('1770000000000|42');
    expect(decodeCursor(c)).toEqual({ ms: 1770000000000, id: '42' });
  });

  it.each([
    ['垃圾串', 'garbage'],
    ['管道缺失', '177000000000042'],
    ['两段间无管道', 'abc|42'],
    ['负数毫秒', '-1|42'],
    ['小数毫秒', '1.5|42'],
    ['前导零', '007|42'],
    ['id 非数字', '1770000000000|abc'],
    ['id 带符号', '1770000000000|-42'],
    ['空串', ''],
    ['超长毫秒段', '1'.repeat(16) + '|42']
  ])('畸形 cursor 拒绝：%s', (_label, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });

  it('非字符串（undefined/null/对象/数字）→ null', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(123)).toBeNull();
    expect(decodeCursor({ ms: 1, id: '1' })).toBeNull();
  });
});

describe('rowToEntry 映射（方案 §4.1 映射表）', () => {
  it('全字段：time 毫秒数字、info.isTeacher、extra.liveUserId、mentions 数组', () => {
    const entry = rowToEntry(
      makeRow(1, {
        is_teacher: true,
        mentions: [{ userId: 'u2', userName: '小明' }],
        time_ms: '1770000000555'
      })
    );
    expect(entry).toEqual({
      msgId: 'm-1',
      liveMsg: {
        msg: '内容1',
        roomId: 'r1',
        name: '用户1',
        time: 1770000000555,
        mentions: [{ userId: 'u2', userName: '小明' }]
      },
      info: { type: 1, isTeacher: true, liveUserId: 'u1', senderId: 'guid-1' }
    });
  });

  it('sender_id → info.senderId（稳定账号身份，跨会话 self 判定）', () => {
    const entry = rowToEntry(makeRow(6));
    expect(entry.info.senderId).toBe('guid-6');
  });

  it('sender_id 空串 → 不带 senderId 字段', () => {
    const entry = rowToEntry(makeRow(7, { sender_id: '' }));
    expect('senderId' in entry.info).toBe(false);
  });

  it('mentions 非数组 → 不带 mentions 字段', () => {
    const entry = rowToEntry(makeRow(3, { mentions: 'junk' }));
    expect('mentions' in entry.liveMsg!).toBe(false);
  });

  it('extra 非对象 → liveUserId 空串兜底', () => {
    const entry = rowToEntry(makeRow(4, { extra: null }));
    expect(entry.info.liveUserId).toBe('');
  });

  it('extra 缺 liveUserId → 空串兜底', () => {
    const entry = rowToEntry(makeRow(5, { extra: { infoType: 3 } }));
    expect(entry.info.liveUserId).toBe('');
    expect(entry.info.type).toBe(1);
  });
});

describe('createHistoryStore.recent（进场页：DESC 取 → 应用层 reverse 成 ASC）', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('SQL 形状：ORDER BY created_at DESC, id DESC LIMIT $2（直接 ASC 会取到最早 50 条）', async () => {
    let seenSql = '';
    const store = createHistoryStore(
      fakePool(sql => {
        seenSql = sql;
        return Promise.resolve(result([]));
      }),
      100
    );
    await store.recent('r1', 50);
    expect(seenSql).toBe(SQL_RECENT);
    expect(SQL_RECENT).toContain('ORDER BY created_at DESC, id DESC');
    expect(SQL_RECENT).toContain('LIMIT $2');
    expect(SQL_RECENT).not.toContain('ASC');
    expect(SQL_RECENT).toContain('sender_id::text AS sender_id');
    expect(SQL_PAGE).toContain('sender_id::text AS sender_id');
  });

  it('DESC 行集返回时 reverse 为 ASC，nextCursor 指向最旧一条', async () => {
    const rows = [makeRow(2), makeRow(1)]; // 2 新 1 旧（DESC）
    const store = createHistoryStore(
      fakePool(() => Promise.resolve(result(rows))),
      100
    );
    const page = await store.recent('r1', 50);
    expect(page.messages.map(m => m.msgId)).toEqual(['m-1', 'm-2']); // ASC
    expect(page.messages[0]!.liveMsg!.time).toBeLessThan(page.messages[1]!.liveMsg!.time);
    expect(page.nextCursor).toBeNull(); // 2 < limit → 已到底
  });

  it('恰好 limit 行 → nextCursor 编码最旧一行（rows[limit-1]）', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => makeRow(50 - i)); // DESC：i=0 最新
    const store = createHistoryStore(
      fakePool(() => Promise.resolve(result(rows))),
      100
    );
    const page = await store.recent('r1', 50);
    expect(page.messages).toHaveLength(50);
    const oldest = rows[49];
    expect(page.nextCursor).toBe(encodeCursor(Number(oldest.time_ms), oldest.id));
    expect(page.nextCursor).toBe(`${oldest.time_ms}|${oldest.id}`);
  });

  it('查询失败 → null（fail-open，调用方不推帧，严禁推空 history）', async () => {
    const store = createHistoryStore(
      fakePool(() => Promise.reject(new Error('pg down'))),
      100
    );
    await expect(store.recent('r1', 50)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('history_recent_failed'),
      'pg down'
    );
  });

  it('超时 → null（3s fail-open 计时器，此处 20ms 实测）', async () => {
    const store = createHistoryStore(
      fakePool(() => new Promise(() => undefined)), // 永不 resolve
      20
    );
    const started = Date.now();
    await expect(store.recent('r1', 50)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('createHistoryStore.page（keyset 翻页）', () => {
  it('cursor=null → 走 SQL_RECENT（同进场语义）', async () => {
    let seen = { sql: '', params: [] as unknown[] };
    const store = createHistoryStore(
      fakePool((sql, params) => {
        seen = { sql, params: params ?? [] };
        return Promise.resolve(result([]));
      }),
      100
    );
    await store.page('r1', null, 50);
    expect(seen.sql).toBe(SQL_RECENT);
    expect(seen.params).toEqual(['r1', 50]);
  });

  it('带 cursor → keyset 参数化（非字符串拼接），行比较 + 两列 DESC', async () => {
    let seen = { sql: '', params: [] as unknown[] };
    const store = createHistoryStore(
      fakePool((sql, params) => {
        seen = { sql, params: params ?? [] };
        return Promise.resolve(result([makeRow(9)]));
      }),
      100
    );
    const page = await store.page('r1', { ms: 1769999999000, id: '999' }, 50);
    expect(seen.sql).toBe(SQL_PAGE);
    expect(SQL_PAGE).toContain(
      'AND (created_at, id) < (to_timestamp($2::double precision / 1000), $3::bigint)'
    );
    expect(SQL_PAGE).toContain('ORDER BY created_at DESC, id DESC');
    expect(seen.params).toEqual(['r1', 1769999999000, '999', 50]);
    expect(page.messages.map(m => m.msgId)).toEqual(['m-9']);
  });

  it('查询失败/超时 → throw（调用方映射 historyError unavailable，与 recent 的 fail-open 不同）', async () => {
    const store = createHistoryStore(
      fakePool(() => Promise.reject(new Error('boom'))),
      100
    );
    await expect(store.page('r1', { ms: 1, id: '1' }, 50)).rejects.toThrow('boom');
  });
});
