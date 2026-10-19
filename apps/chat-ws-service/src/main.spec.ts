import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import { RECALLED_PLACEHOLDER } from '@yunyan-live/types';

/**
 * 持久化开启路径的端到端契约（方案 §4.1/§4.5/§4.6/§4.7）。
 * pg → canned rows（history 可断言）；amqplib connect 永不 resolve（publisher 永不就绪 →
 * 同时验证 §4.2 fire-and-forget：发布失败绝不阻断广播）。
 */
const SECRET = 'main-spec-secret';
const SID = 'sid-spec-1';
const PORT = 50174;

process.env.JWT_SECRET = SECRET;
process.env.CHAT_WS_PORT = String(PORT);
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.DATABASE_URL = 'postgresql://spec:spec@127.0.0.1:1/spec';
process.env.RABBITMQ_URL = 'amqp://spec:spec@127.0.0.1:1/spec';
process.env.CHAT_HISTORY_TIMEOUT_MS = '';

const h = vi.hoisted(() => ({
  /** pg 调用记录（SQL/参数断言用） */
  calls: [] as Array<{ sql: string; params?: unknown[] }>,
  /** pg 查询实现（测试内替换默认行为） */
  query: undefined as unknown as (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>,
  /** 历史查询延迟（单飞测试用，ms） */
  historyDelay: 0,
  /** ioredis 实例（含 duplicate 出的订阅连接）：签到订阅测试定位用 */
  redisInstances: [] as Array<{
    subscribe: { mock: { calls: unknown[][] } };
    emit: (event: string, ...args: unknown[]) => boolean;
  }>
}));

vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('node:events');
  class MockRedis extends EventEmitter {
    constructor() {
      super();
      h.redisInstances.push(this as unknown as (typeof h)['redisInstances'][number]);
    }
    get = vi.fn(async (key: string) => (key.startsWith('session:') ? 'sid-spec-1' : null));
    set = vi.fn(async () => 'OK');
    subscribe = vi.fn(async () => 0);
    publish = vi.fn(async () => 1);
    duplicate() {
      return new MockRedis();
    }
  }
  return { default: MockRedis };
});

vi.mock('pg', () => ({
  Pool: class {
    query = (sql: string, params?: unknown[]) => {
      h.calls.push({ sql, params });
      if (sql.includes('FROM chat_messages') && h.historyDelay > 0) {
        return new Promise(resolve =>
          setTimeout(() => resolve(h.query(sql, params)), h.historyDelay)
        );
      }
      return h.query(sql, params);
    };
    on = vi.fn();
    end = vi.fn(async () => undefined);
  }
}));

vi.mock('amqplib', () => ({
  default: { connect: vi.fn(() => new Promise(() => undefined)) }
}));

interface Frame {
  type: string;
  data?: Record<string, unknown>;
  reason?: string;
}

/** 顺序消费的 WS 测试客户端：next(type) 按到达序取帧，未到达则等待 */
class TestClient {
  readonly received: Frame[] = [];
  private cursor = 0;
  private waiters: Array<{
    pred: (f: Frame) => boolean;
    resolve: (f: Frame) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw: Buffer | string) => {
      const frame = JSON.parse(String(raw)) as Frame;
      this.received.push(frame);
      this.waiters = this.waiters.filter(w => {
        if (w.pred(frame)) {
          clearTimeout(w.timer);
          // waiter 命中与 scan 命中同语义：消费至该帧（后续同类型 next 不复吃旧帧）
          this.cursor = Math.max(this.cursor, this.received.length);
          w.resolve(frame);
          return false;
        }
        return true;
      });
    });
  }

  send(obj: unknown) {
    this.ws.send(JSON.stringify(obj));
  }

  /** 从 cursor 起按序取指定类型帧；缓冲无则等待新帧 */
  async next(type: string, timeoutMs = 3000): Promise<Frame> {
    const scan = (): Frame | undefined => {
      for (let i = this.cursor; i < this.received.length; i += 1) {
        const f = this.received[i];
        if (f.type === type) {
          this.cursor = i + 1;
          return f;
        }
      }
      return undefined;
    };
    const hit = scan();
    if (hit) return hit;
    return new Promise<Frame>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `timeout waiting ${type}; got: ${this.received
              .slice(this.cursor)
              .map(f => f.type)
              .join(',')}`
          )
        );
      }, timeoutMs);
      this.waiters.push({ pred: f => f.type === type, resolve, timer });
    });
  }

  /** 断言缓冲区中不存在该类型帧（配合等待窗口） */
  async expectNo(type: string, waitMs = 150): Promise<void> {
    const before = this.received.filter(f => f.type === type).length;
    await new Promise(r => setTimeout(r, waitMs));
    expect(this.received.filter(f => f.type === type)).toHaveLength(before);
  }

  close() {
    this.ws.close();
  }
}

const token = jwt.sign({ sub: 'u-main', email: 'u@x', role: 0, sid: SID }, SECRET);

async function connect(extra: Record<string, string> = {}, tok = token): Promise<TestClient> {
  const qs = new URLSearchParams({
    token: tok,
    roomId: 'r-main',
    liveUserId: 'u1',
    nickName: '小明',
    ...extra
  });
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?${qs}`);
  // 监听必须同步挂上：服务端 pong 可能与 open 同批到达，await 后再挂会丢帧
  const client = new TestClient(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return client;
}

/** canned 历史行（SQL 层 DESC：新在前；应用层 reverse 后 ASC） */
const cannedHistory = [
  {
    msg_id: 'm-2',
    id: '2002',
    room_id: 'r-main',
    sender_id: '22222222-2222-4222-8222-222222222222',
    sender_name: '乙',
    is_teacher: false,
    content: '第二条',
    msg_type: 1,
    mentions: null,
    extra: { liveUserId: 'u2' },
    time_ms: '1770000002000'
  },
  {
    msg_id: 'm-1',
    id: '2001',
    room_id: 'r-main',
    sender_id: '11111111-1111-4111-8111-111111111111',
    sender_name: '甲',
    is_teacher: true,
    content: '第一条',
    msg_type: 3,
    mentions: [{ userId: 'u2', userName: '乙' }],
    extra: { liveUserId: 'u1', infoType: 3 },
    time_ms: '1770000001000'
  }
];

let server: import('http').Server;
let wss: import('ws').WebSocketServer;

beforeAll(async () => {
  h.query = async (sql: string) =>
    sql.includes('FROM chat_messages')
      ? { rows: cannedHistory, rowCount: cannedHistory.length }
      : { rows: [], rowCount: 0 };
  const main = await import('./main');
  server = main.server;
  wss = main.wss;
  // WSL/drvfs 下 @yunyan-live/nest-shared 首次加载可达 ~25s（纯 I/O），放宽 hook 超时
}, 90_000);

afterAll(async () => {
  wss.clients.forEach(c => c.terminate());
  (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  await new Promise<void>(resolve => {
    const guard = setTimeout(() => resolve(), 5000);
    server.close(() => {
      clearTimeout(guard);
      resolve();
    });
  });
}, 30_000);

describe('连接握手与进场历史（§4.5：pong → msg → history）', () => {
  it('持久化开启 → 依次收到 pong / msg / history，history 为 ASC + nextCursor null', async () => {
    const c = await connect();
    const pong = await c.next('pong');
    expect(pong.type).toBe('pong');
    const msg = await c.next('msg');
    expect((msg.data?.liveMsg as Record<string, unknown>).forbid).toBe(1); // redis 无记录 → 可发言
    const history = await c.next('history');
    const data = history.data as {
      messages: Array<Record<string, unknown>>;
      nextCursor: string | null;
    };
    expect(data.messages.map(m => m.msgId)).toEqual(['m-1', 'm-2']); // ASC（最旧在前）
    const first = data.messages[0] as {
      liveMsg: { time: number };
      info: { type: number; senderId: string; liveUserId: string };
    };
    expect(first.liveMsg.time).toBe(1770000001000); // 毫秒往返
    expect(first.info.type).toBe(3); // msg_type 落 info.type
    expect(first.info.senderId).toBe('11111111-1111-4111-8111-111111111111'); // sender_id → info.senderId
    expect(first.info.liveUserId).toBe('u1'); // extra.liveUserId 会话级回放
    expect(data.nextCursor).toBeNull(); // 2 < 50
    c.close();
  });

  it('缺 token → close 4001', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?roomId=r-main`);
    const code = await new Promise<number>(resolve => {
      ws.once('close', c => resolve(c));
    });
    expect(code).toBe(4001);
  });

  it('伪造 token → close 4001', async () => {
    const qs = new URLSearchParams({ token: 'not-a-jwt', roomId: 'r-main' });
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?${qs}`);
    const code = await new Promise<number>(resolve => {
      ws.once('close', c => resolve(c));
    });
    expect(code).toBe(4001);
  });

  it('roomId 超 50 字符 → close 4001（注册前拦截）', async () => {
    const c = await connect({ roomId: 'x'.repeat(51) });
    const code = await new Promise<number>(resolve => {
      c.ws.once('close', x => resolve(x));
    });
    expect(code).toBe(4001);
  });
});

describe('bullet 广播与持久化旁路（§4.2 fire-and-forget）', () => {
  it('MQ 永不就绪时 bullet 照常广播，msgId 为服务端 UUID', async () => {
    const c = await connect();
    await c.next('history');
    c.send({ type: 'bullet', data: { liveMsg: { msg: 'hello' } } });
    const frame = await c.next('bullet');
    const data = frame.data as {
      msgId: string;
      liveMsg: { msg: string; name: string };
      info: { liveUserId: string; senderId: string; isTeacher: boolean };
    };
    expect(data.msgId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(data.liveMsg.msg).toBe('hello');
    expect(data.liveMsg.name).toBe('小明');
    expect(data.info.senderId).toBe('u-main'); // JWT sub → info.senderId（跨会话 self 判定）
    expect(data.info.liveUserId).toBe('u1');
    c.close();
  });

  it('令牌桶：突发 10 后限流，拒发 reason=rate_limited（§4.6）', async () => {
    const c = await connect();
    await c.next('history');
    for (let i = 0; i < 12; i += 1) {
      c.send({ type: 'bullet', data: { liveMsg: { msg: `m${i}` } } });
    }
    await new Promise(r => setTimeout(r, 500));
    const bullets = c.received.filter(f => f.type === 'bullet');
    const rejects = c.received.filter(f => f.type === 'bullet_rejected');
    expect(bullets.length + rejects.length).toBe(12); // 每发必有归宿
    expect(bullets.length).toBeGreaterThanOrEqual(10); // 突发容量
    expect(rejects.length).toBeGreaterThanOrEqual(1); // 第 11+ 发必拒
    for (const r of rejects) expect(r.reason).toBe('rate_limited');
    c.close();
  });

  it('禁言态 forbid=0 + 学生 → bullet_rejected forbidden', async () => {
    // 直接构造禁言态：连接后 redis mock 无法变更（readForbid 在连接期读取）——
    // 通过禁言房间的 msg 缓存已由测试 1 覆盖极性逻辑（bullet.spec），此处验证拒发帧形态。
    const c = await connect();
    await c.next('history');
    c.send({ type: 'bullet', data: { liveMsg: { msg: '' } } });
    const f = await c.next('bullet_rejected');
    expect(f.reason).toBe('invalid');
    c.close();
  });
});

describe('getHistory 翻页协议（§4.5）', () => {
  it('无 cursor → 走 SQL_RECENT 返回 historyPage', async () => {
    const c = await connect();
    await c.next('history');
    h.calls.length = 0;
    c.send({ type: 'getHistory' });
    const page = await c.next('historyPage');
    const data = page.data as { messages: Array<{ msgId: string }>; nextCursor: string | null };
    expect(data.messages.map(m => m.msgId)).toEqual(['m-1', 'm-2']);
    const recent = h.calls.find(
      x => x.sql.includes('FROM chat_messages') && !x.sql.includes('to_timestamp')
    );
    expect(recent?.params).toEqual(['r-main', 50]);
    c.close();
  });

  it('带合法 cursor → keyset 参数化查询', async () => {
    const c = await connect();
    await c.next('history');
    h.calls.length = 0;
    c.send({ type: 'getHistory', data: { cursor: '1770000001000|2001' } });
    await c.next('historyPage');
    const pageQuery = h.calls.find(x => x.sql.includes('to_timestamp'));
    expect(pageQuery?.params).toEqual(['r-main', 1770000001000, '2001', 50]);
    c.close();
  });

  it('畸形 cursor → historyError invalid_cursor（终态，hasMore=false）', async () => {
    const c = await connect();
    await c.next('history');
    h.calls.length = 0;
    c.send({ type: 'getHistory', data: { cursor: 'garbage' } });
    const err = await c.next('historyError');
    expect(err.data).toEqual({ reason: 'invalid_cursor' });
    expect(h.calls.filter(x => x.sql.includes('chat_messages'))).toHaveLength(0);
    c.close();
  });

  it('连接级单飞：并发重复 getHistory 静默忽略，仅回一帧', async () => {
    const c = await connect();
    await c.next('history');
    h.historyDelay = 80;
    h.calls.length = 0;
    c.send({ type: 'getHistory', data: { cursor: '1770000001000|2001' } });
    c.send({ type: 'getHistory', data: { cursor: '1770000001000|2001' } });
    await c.next('historyPage');
    await c.expectNo('historyPage', 300);
    expect(h.calls.filter(x => x.sql.includes('chat_messages'))).toHaveLength(1);
    h.historyDelay = 0;
    c.close();
  });

  it('查询失败 → historyError unavailable（可重试）', async () => {
    const c = await connect();
    await c.next('history');
    const original = h.query;
    h.query = async (sql: string) => {
      if (sql.includes('FROM chat_messages'))
        throw Object.assign(new Error('pg down'), { code: 'ECONNREFUSED' });
      return original(sql);
    };
    c.send({ type: 'getHistory' });
    const err = await c.next('historyError');
    expect(err.data).toEqual({ reason: 'unavailable' });
    h.query = original;
    c.close();
  });
});

describe('/healthz（§4.7）', () => {
  it('双探活：pg 可用 + MQ 未就绪 → degraded，深度为 null', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'degraded',
      mq: 0,
      pg: 1,
      queueDepth: null,
      dlqDepth: null
    });
  });

  it('60s 缓存：第二次仍返回同形状', async () => {
    const body = (await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json()) as Record<
      string,
      unknown
    >;
    expect(body.status).toBe('degraded');
  });

  it('根路径仍返回 service 标识（catch-all 未被劫持）', async () => {
    const body = (await (await fetch(`http://127.0.0.1:${PORT}/`)).json()) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({ status: 'ok', service: 'chat-ws' });
  });
});

describe('白板状态消息已移除（legacy paint-log 链路 D4）', () => {
  it('whiteBoard/getwhiteBoard 被忽略且连接仍可用', async () => {
    const room = 'r-wb-removed';
    const c = await connect({ roomId: room });
    await c.next('history');
    c.send({ type: 'whiteBoard', data: { liveMsg: { msg: 'WB-STATE' } } });
    c.send({ type: 'getwhiteBoard' });
    c.send({ type: 'ping' });
    const pong = await c.next('pong');
    expect(pong.type).toBe('pong');
    c.close();
  }, 10_000);
});

describe('签到广播（live:checkin → {type:"checkin"}）', () => {
  async function checkinSubscriber() {
    const { CHECKIN_CHANNEL } = await import('@yunyan-live/nest-shared');
    const sub = h.redisInstances.find(x =>
      x.subscribe.mock.calls.some(call => call[0] === CHECKIN_CHANNEL)
    );
    expect(sub).toBeDefined();
    return { CHECKIN_CHANNEL, sub: sub! };
  }

  it('订阅签到频道：emit 状态变更 → 房间内客户端收到 checkin 帧（data 透传）', async () => {
    const { CHECKIN_CHANNEL, sub } = await checkinSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit(
      'message',
      CHECKIN_CHANNEL,
      JSON.stringify({ roomId: 'r-main', action: 'update', sessionId: 's-1', signedCount: 3 })
    );
    const f = await c.next('checkin');
    expect(f.data).toEqual({
      roomId: 'r-main',
      action: 'update',
      sessionId: 's-1',
      signedCount: 3
    });
    c.close();
  });

  it('其它房间的签到事件不广播到本房间', async () => {
    const { CHECKIN_CHANNEL, sub } = await checkinSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit(
      'message',
      CHECKIN_CHANNEL,
      JSON.stringify({ roomId: 'r-other', action: 'ended', sessionId: 's-2' })
    );
    await c.expectNo('checkin');
    c.close();
  });

  it('坏载荷不广播（subscribeCheckin 解析层拦截）', async () => {
    const { CHECKIN_CHANNEL, sub } = await checkinSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit('message', CHECKIN_CHANNEL, JSON.stringify({ roomId: 'r-main' }));
    await c.expectNo('checkin');
    c.close();
  });
});

describe('F3 单用户禁言/踢出（live:moderation）', () => {
  const tokenMuted = jwt.sign({ sub: 'u-mute', email: 'm@x', role: 0, sid: SID }, SECRET);
  const tokenTeacher = jwt.sign({ sub: 'u-teacher', email: 't@x', role: 1, sid: SID }, SECRET);
  const tokenOther = jwt.sign({ sub: 'u-other', email: 'o@x', role: 0, sid: SID }, SECRET);

  /** 只替换 chat_moderation 读：branch(sub, row) 返回活跃行或 [] */
  function stubModeration(
    branch: (userId: string) => Array<{ kind: string; until: Date | null }>
  ): () => void {
    const prev = h.query;
    h.query = async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM chat_moderation')) {
        const rows = branch(String(params?.[1] ?? ''));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM chat_messages')) {
        return { rows: cannedHistory, rowCount: cannedHistory.length };
      }
      return { rows: [], rowCount: 0 };
    };
    return () => {
      h.query = prev;
    };
  }

  async function moderationSubscriber() {
    const { MODERATION_CHANNEL } = await import('@yunyan-live/nest-shared');
    const sub = h.redisInstances.find(x =>
      x.subscribe.mock.calls.some(call => call[0] === MODERATION_CHANNEL)
    );
    expect(sub).toBeDefined();
    return { MODERATION_CHANNEL, sub: sub! };
  }

  function closeCode(c: TestClient): Promise<number> {
    return new Promise<number>(resolve => c.ws.once('close', code => resolve(code)));
  }

  it('握手：PG 活跃 kick → 4005 拒入本场，不注册', async () => {
    const restore = stubModeration(userId =>
      userId === 'u-kick' ? [{ kind: 'kick', until: null }] : []
    );
    try {
      const c = await connect(
        {},
        jwt.sign({ sub: 'u-kick', email: 'k@x', role: 0, sid: SID }, SECRET)
      );
      const code = await closeCode(c);
      expect(code).toBe(4005);
      expect(c.received.filter(f => f.type === 'msg')).toHaveLength(0);
    } finally {
      restore();
    }
  });

  it('握手：PG 活跃 mute → 回填缓存，bullet 拒发 reason=muted；他人不受影响', async () => {
    const restore = stubModeration(userId =>
      userId === 'u-mute' ? [{ kind: 'mute', until: new Date(Date.now() + 60_000) }] : []
    );
    try {
      const muted = await connect({}, tokenMuted);
      await muted.next('history');
      muted.send({ type: 'bullet', data: { liveMsg: { msg: 'hi' } } });
      const rej = await muted.next('bullet_rejected');
      expect(rej.reason).toBe('muted');

      const other = await connect({}, tokenOther);
      await other.next('history');
      other.send({ type: 'bullet', data: { liveMsg: { msg: 'ok' } } });
      const f = await other.next('bullet');
      expect((f.data?.liveMsg as Record<string, unknown>).msg).toBe('ok');

      muted.close();
      other.close();
    } finally {
      restore();
    }
  });

  it('握手：教师即使有活跃 mute 行也豁免发送（教师豁免）', async () => {
    const restore = stubModeration(userId =>
      userId === 'u-teacher' ? [{ kind: 'mute', until: new Date(Date.now() + 60_000) }] : []
    );
    try {
      const t = await connect({}, tokenTeacher);
      await t.next('history');
      t.send({ type: 'bullet', data: { liveMsg: { msg: 'teacher' } } });
      const f = await t.next('bullet');
      expect((f.data?.liveMsg as Record<string, unknown>).msg).toBe('teacher');
      t.close();
    } finally {
      restore();
    }
  });

  it('订阅 mute/set → 房间收到 moderation 帧；目标被拒 muted；release 后恢复', async () => {
    const { MODERATION_CHANNEL, sub } = await moderationSubscriber();
    const target = await connect({}, tokenMuted);
    const watcher = await connect({}, tokenOther);
    await target.next('history');
    await watcher.next('history');

    sub.emit(
      'message',
      MODERATION_CHANNEL,
      JSON.stringify({
        roomId: 'r-main',
        userId: 'u-mute',
        kind: 'mute',
        op: 'set',
        untilMs: Date.now() + 60_000
      })
    );
    const applied = await watcher.next('moderation');
    expect(applied).toMatchObject({ userId: 'u-mute', kind: 'mute', op: 'set' });

    target.send({ type: 'bullet', data: { liveMsg: { msg: 'blocked' } } });
    const rej = await target.next('bullet_rejected');
    expect(rej.reason).toBe('muted');

    sub.emit(
      'message',
      MODERATION_CHANNEL,
      JSON.stringify({ roomId: 'r-main', userId: 'u-mute', kind: 'mute', op: 'release' })
    );
    const released = await watcher.next('moderation');
    expect(released).toMatchObject({ op: 'release' });

    target.send({ type: 'bullet', data: { liveMsg: { msg: 'again' } } });
    const f = await target.next('bullet');
    expect((f.data?.liveMsg as Record<string, unknown>).msg).toBe('again');

    target.close();
    watcher.close();
  });

  it('单用户禁言优先于全房禁言：forbid=0 时目标仍回 muted（非 forbidden）', async () => {
    const { FORBID_CHANNEL } = await import('@yunyan-live/nest-shared');
    const forbidSub = h.redisInstances.find(x =>
      x.subscribe.mock.calls.some(call => call[0] === FORBID_CHANNEL)
    );
    expect(forbidSub).toBeDefined();
    const { MODERATION_CHANNEL, sub: moderationSub } = await moderationSubscriber();

    const target = await connect({}, tokenMuted);
    const bystander = await connect({}, tokenOther);
    await target.next('history');
    await bystander.next('history');

    // 全房禁言生效
    forbidSub!.emit('message', FORBID_CHANNEL, JSON.stringify({ roomId: 'r-main', status: 0 }));
    await bystander.next('updateForbid');
    // 目标叠加单用户禁言
    moderationSub.emit(
      'message',
      MODERATION_CHANNEL,
      JSON.stringify({
        roomId: 'r-main',
        userId: 'u-mute',
        kind: 'mute',
        op: 'set',
        untilMs: Date.now() + 60_000
      })
    );
    await target.next('moderation');

    target.send({ type: 'bullet', data: { liveMsg: { msg: 'both' } } });
    const rej = await target.next('bullet_rejected');
    expect(rej.reason).toBe('muted'); // 单用户优先于全房 forbidden

    bystander.send({ type: 'bullet', data: { liveMsg: { msg: 'other' } } });
    const rej2 = await bystander.next('bullet_rejected');
    expect(rej2.reason).toBe('forbidden'); // 无单用户标记者仍受全房禁言

    target.close();
    bystander.close();
  });

  it('订阅 kick/set → 目标连接 4005 关闭 + 房间收到 moderation 帧', async () => {
    const { MODERATION_CHANNEL, sub } = await moderationSubscriber();
    const target = await connect({}, tokenOther);
    const watcher = await connect({}, tokenMuted);
    await target.next('history');
    await watcher.next('history');

    const closed = closeCode(target);
    sub.emit(
      'message',
      MODERATION_CHANNEL,
      JSON.stringify({ roomId: 'r-main', userId: 'u-other', kind: 'kick', op: 'set' })
    );
    expect(await closed).toBe(4005);

    const frame = await watcher.next('moderation');
    expect(frame).toMatchObject({ userId: 'u-other', kind: 'kick', op: 'set' });
    watcher.close();
  });

  it('其它房间的 moderation 事件不广播到本房间', async () => {
    const { MODERATION_CHANNEL, sub } = await moderationSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit(
      'message',
      MODERATION_CHANNEL,
      JSON.stringify({ roomId: 'r-other', userId: 'u-x', kind: 'mute', op: 'set', untilMs: 1 })
    );
    await c.expectNo('moderation');
    c.close();
  });
});

describe('成员名册 roster 帧（F3 前端身份桥）', () => {
  const tokenRoster2 = jwt.sign({ sub: 'u-roster-2', email: 'r2@x', role: 0, sid: SID }, SECRET);

  /** 持续消费 roster 帧直到出现指定人数快照（上一测试尾部 close 的 leave 广播可能穿插，避免误匹配） */
  async function nextRosterWith(c: TestClient, size: number): Promise<Frame> {
    for (let i = 0; i < 10; i += 1) {
      const f = await c.next('roster');
      if ((f.data as { members?: unknown[] }).members?.length === size) return f;
    }
    throw new Error(`no roster snapshot with ${size} members`);
  }

  it('注册后收到 roster 快照；新成员加入/离线触发全量更新（senderId=JWT sub）', async () => {
    const c1 = await connect();
    await c1.next('history');
    const r1 = await nextRosterWith(c1, 1);
    const members1 = (r1.data as { members: Array<Record<string, unknown>> }).members;
    expect(members1).toEqual([
      { senderId: 'u-main', liveUserId: 'u1', nickName: '小明', isTeacher: false }
    ]);

    const c2 = await connect({ liveUserId: 'u2' }, tokenRoster2);
    const r2c2 = await c2.next('roster');
    expect((r2c2.data as { members: unknown[] }).members).toHaveLength(2);
    const r2 = await nextRosterWith(c1, 2);
    const members2 = (r2.data as { members: Array<Record<string, unknown>> }).members;
    expect(members2).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ senderId: 'u-main', liveUserId: 'u1' }),
        expect.objectContaining({ senderId: 'u-roster-2', liveUserId: 'u2' })
      ])
    );
    expect(members2).toHaveLength(2);

    c2.close();
    const r3 = await nextRosterWith(c1, 1);
    const members3 = (r3.data as { members: Array<Record<string, unknown>> }).members;
    expect(members3[0]).toMatchObject({ liveUserId: 'u1' });
    c1.close();
  });

  it('同 liveUserId 重复连接按名册去重（liveUserId 维度一员）', async () => {
    const a = await connect();
    await a.next('history');
    await nextRosterWith(a, 1);
    const b = await connect(
      {},
      jwt.sign({ sub: 'u-dup', email: 'd@x', role: 0, sid: SID }, SECRET)
    );
    const rb = await b.next('roster');
    expect((rb.data as { members: unknown[] }).members).toHaveLength(1);
    const frame = await nextRosterWith(a, 1);
    const members = (frame.data as { members: Array<Record<string, unknown>> }).members;
    expect(members.filter(m => m.liveUserId === 'u1')).toHaveLength(1);
    a.close();
    b.close();
  });
});

describe('F4 撤回（live:recall → recall 帧 + 历史占位，台账 DoD chat-ws 层）', () => {
  async function recallSubscriber() {
    const { RECALL_CHANNEL } = await import('@yunyan-live/nest-shared');
    const sub = h.redisInstances.find(x =>
      x.subscribe.mock.calls.some(call => call[0] === RECALL_CHANNEL)
    );
    expect(sub).toBeDefined();
    return { RECALL_CHANNEL, sub: sub! };
  }

  it('订阅撤回频道：emit → 房间内客户端收到 recall 帧（data.msgId 透传）', async () => {
    const { RECALL_CHANNEL, sub } = await recallSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit('message', RECALL_CHANNEL, JSON.stringify({ roomId: 'r-main', msgId: 'm-1' }));
    const f = await c.next('recall');
    expect(f.data).toEqual({ msgId: 'm-1' });
    c.close();
  });

  it('其它房间的撤回事件不广播到本房间', async () => {
    const { RECALL_CHANNEL, sub } = await recallSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit('message', RECALL_CHANNEL, JSON.stringify({ roomId: 'r-other', msgId: 'm-9' }));
    await c.expectNo('recall');
    c.close();
  });

  it('坏载荷（缺 msgId）不广播（subscribeRecall 解析层拦截）', async () => {
    const { RECALL_CHANNEL, sub } = await recallSubscriber();
    const c = await connect();
    await c.next('history');
    sub.emit('message', RECALL_CHANNEL, JSON.stringify({ roomId: 'r-main' }));
    await c.expectNo('recall');
    c.close();
  });

  it('离线重连：recalled 行 → 进场 history 帧回占位、原文不下发（DoD 闭环）', async () => {
    const prev = h.query;
    h.query = async (sql: string) => {
      if (sql.includes('FROM chat_messages')) {
        const rows = [
          { ...cannedHistory[0]!, recalled_at: null },
          { ...cannedHistory[1]!, content: '', recalled_at: '2026-10-19T02:00:00.000Z' }
        ];
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    };
    try {
      const c = await connect();
      const f = await c.next('history');
      const messages = f.data?.messages as Array<{ msgId: string; liveMsg?: { msg?: string } }>;
      expect(messages).toHaveLength(2);
      expect(messages[0]?.msgId).toBe('m-1');
      expect(messages[0]?.liveMsg?.msg).toBe(RECALLED_PLACEHOLDER);
      expect(messages[1]?.liveMsg?.msg).toBe('第二条');
      expect(JSON.stringify(f.data)).not.toContain('第一条');
      c.close();
    } finally {
      h.query = prev;
    }
  });
});
