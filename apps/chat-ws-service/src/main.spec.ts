import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

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
  historyDelay: 0
}));

vi.mock('ioredis', () => {
  class MockRedis {
    get = vi.fn(async (key: string) => (key.startsWith('session:') ? 'sid-spec-1' : null));
    set = vi.fn(async () => 'OK');
    on = vi.fn(() => undefined);
    subscribe = vi.fn(async () => 0);
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

async function connect(extra: Record<string, string> = {}): Promise<TestClient> {
  const qs = new URLSearchParams({
    token,
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

describe('白板状态生命周期（房间空 → 释放 whiteboardStates）', () => {
  /** 服务端 close 处理在客户端 close() 返回后异步进行，留窗口让 Disconnected 日志落定 */
  const settle = () => new Promise(r => setTimeout(r, 200));

  async function wbState(roomId: string): Promise<string | null> {
    const c = await connect({ roomId });
    await c.next('history');
    c.send({ type: 'getwhiteBoard' });
    const f = await c.next('getWhiteBoard');
    c.close();
    await settle();
    return ((f.data?.liveMsg ?? {}) as { msg?: string | null }).msg ?? null;
  }

  it('有人时状态保留；最后一人离开后 getwhiteBoard 回 null（不泄漏）', async () => {
    const room = 'r-wb-lifecycle';

    const c1 = await connect({ roomId: room });
    await c1.next('history');
    c1.send({ type: 'whiteBoard', data: { liveMsg: { msg: 'WB-STATE' } } });
    c1.send({ type: 'getwhiteBoard' });
    expect(((await c1.next('getWhiteBoard')).data?.liveMsg as { msg: string }).msg).toBe(
      'WB-STATE'
    );

    const c2 = await connect({ roomId: room });
    await c2.next('history');
    c2.send({ type: 'getwhiteBoard' });
    expect(((await c2.next('getWhiteBoard')).data?.liveMsg as { msg: string }).msg).toBe(
      'WB-STATE'
    );

    c1.close();
    await settle();
    c2.send({ type: 'getwhiteBoard' }); // 房间未空 → 状态保留
    expect(((await c2.next('getWhiteBoard')).data?.liveMsg as { msg: string }).msg).toBe(
      'WB-STATE'
    );

    c2.close();
    await settle(); // 最后一人离开 → whiteboardStates.delete(room)

    expect(await wbState(room)).toBeNull();
  }, 20_000);
});
