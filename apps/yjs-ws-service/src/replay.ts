import fs from 'node:fs';
import path from 'node:path';

/**
 * F6.4 时间轴过程回放：服务端 per-update 到达序列日志（append-only）。
 * 每房间两个文件（均落在 REPLAY_DIR 内，roomId 已 sanitize 防路径穿越）：
 * - `<room>.baseline`：首条事件前的 doc 状态（Y.encodeStateAsUpdate）
 * - `<room>.jsonl`：逐行 {seq, ts, u(base64)}，seq 房间内单调递增
 * 保留策略：REPLAY_TTL_MS（默认 7 天）按文件 mtime 惰性过期，<=0 关闭过期。
 */
export interface ReplayEvent {
  seq: number;
  ts: number;
  u: Uint8Array;
}

export interface ReplayData {
  baseline: Uint8Array | null;
  events: ReplayEvent[];
  lastSeq: number;
}

const DEFAULT_REPLAY_DIR = 'data/replay';
const DEFAULT_TTL_MS = 7 * 24 * 3600 * 1000;

function replayDir(): string {
  return process.env.REPLAY_DIR || DEFAULT_REPLAY_DIR;
}

function ttlMs(): number {
  const n = Number(process.env.REPLAY_TTL_MS);
  if (!Number.isFinite(n)) return DEFAULT_TTL_MS;
  return n;
}

function safeRoom(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function pathsOf(roomId: string): { jsonl: string; baseline: string } {
  const base = path.join(replayDir(), safeRoom(roomId));
  return { jsonl: `${base}.jsonl`, baseline: `${base}.baseline` };
}

/** 每房间 lastSeq 内存缓存；进程重启后首读从文件恢复（续接而非回退） */
const lastSeqCache = new Map<string, number>();

function scanLastSeq(jsonlPath: string): number {
  if (!fs.existsSync(jsonlPath)) return 0;
  let last = 0;
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { seq?: number };
      if (typeof parsed.seq === 'number' && parsed.seq > last) last = parsed.seq;
    } catch {
      // 尾行可能因进程中断而截断：跳过坏行
    }
  }
  return last;
}

function ensureDir(): void {
  fs.mkdirSync(replayDir(), { recursive: true });
}

/** mtime 超过 TTL 的文件惰性删除（保留策略），返回文件是否仍可用 */
function expireIfStale(filePath: string): boolean {
  const ttl = ttlMs();
  if (ttl <= 0 || !fs.existsSync(filePath)) return fs.existsSync(filePath);
  const age = Date.now() - fs.statSync(filePath).mtimeMs;
  if (age > ttl) {
    fs.rmSync(filePath, { force: true });
    return false;
  }
  return true;
}

export function hasReplay(roomId: string): boolean {
  const { jsonl } = pathsOf(roomId);
  return expireIfStale(jsonl) && fs.existsSync(jsonl);
}

/**
 * 写入基线快照；事件流已存在时 no-op（服务重启后从快照恢复的 doc
 * 继续续接旧事件流，不得覆盖原基线）。
 */
export function initReplayBaseline(roomId: string, baseline: Uint8Array): void {
  const { jsonl, baseline: baselinePath } = pathsOf(roomId);
  if (fs.existsSync(jsonl) || fs.existsSync(baselinePath)) return;
  ensureDir();
  fs.writeFileSync(baselinePath, Buffer.from(baseline));
}

/** 追加一条事件；seq 房间内单调递增（重启续接文件尾） */
export function appendReplayEvent(roomId: string, update: Uint8Array): ReplayEvent {
  const { jsonl } = pathsOf(roomId);
  ensureDir();
  let lastSeq = lastSeqCache.get(roomId);
  if (lastSeq === undefined) {
    lastSeq = scanLastSeq(jsonl);
  }
  const event: ReplayEvent = {
    seq: lastSeq + 1,
    ts: Date.now(),
    u: update
  };
  lastSeqCache.set(roomId, event.seq);
  const line = JSON.stringify({
    seq: event.seq,
    ts: event.ts,
    u: Buffer.from(event.u).toString('base64')
  });
  fs.appendFileSync(jsonl, `${line}\n`);
  return event;
}

/**
 * 读取事件流：fromSeq=0（默认）时附带 baseline，便于客户端从零重建；
 * fromSeq>0 只返回尾部事件（seek 增量场景）。
 */
export function readReplay(roomId: string, fromSeq = 0): ReplayData {
  const { jsonl, baseline: baselinePath } = pathsOf(roomId);
  if (!expireIfStale(jsonl)) {
    return { baseline: null, events: [], lastSeq: 0 };
  }
  const baseline =
    fromSeq <= 0 && fs.existsSync(baselinePath)
      ? new Uint8Array(fs.readFileSync(baselinePath))
      : null;
  const events: ReplayEvent[] = [];
  let lastSeq = 0;
  if (fs.existsSync(jsonl)) {
    for (const line of fs.readFileSync(jsonl, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { seq: number; ts: number; u: string };
        if (typeof parsed.seq === 'number') {
          if (parsed.seq > lastSeq) lastSeq = parsed.seq;
          if (parsed.seq >= fromSeq) {
            events.push({
              seq: parsed.seq,
              ts: parsed.ts,
              u: new Uint8Array(Buffer.from(parsed.u, 'base64'))
            });
          }
        }
      } catch {
        // 跳过坏行，保证部分写入不毁掉整条流
      }
    }
  }
  return { baseline, events, lastSeq };
}

export function clearReplay(roomId: string): void {
  const { jsonl, baseline: baselinePath } = pathsOf(roomId);
  fs.rmSync(jsonl, { force: true });
  fs.rmSync(baselinePath, { force: true });
  lastSeqCache.delete(roomId);
}
