import * as Y from 'yjs';

// F6.4 时间轴过程回放客户端：服务端事件流（baseline + seq/ts/update）驱动
// 独立 Doc 重建；seek = 重建（baseline + 增量 apply），分段 = currentPageIndex 变化点。
export interface ReplayEventDto {
  seq: number;
  ts: number;
  u: string;
}

export interface ReplayDataDto {
  baseline: string | null;
  events: ReplayEventDto[];
  lastSeq: number;
}

export type ReplaySpeed = 0.5 | 1 | 2 | 4;

export function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** ws://host/path → http://host（wss → https）；回放走 HTTP 直连 yjs-ws 同端口 */
export function replayHttpBase(wsUrl: string): string {
  const u = new URL(wsUrl);
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  return u.origin;
}

export async function fetchReplay(
  roomId: string,
  wsUrl = import.meta.env.VITE_YJS_WS || 'ws://localhost:8188/yjs',
  fromSeq = 0
): Promise<ReplayDataDto> {
  const base = replayHttpBase(wsUrl);
  // S7：回放端点已鉴权（Bearer JWT + 会话 + 房间成员），与网关/YjsProvider 同口径取 token
  const token = localStorage.getItem('token') || '';
  const res = await fetch(`${base}/replay/${encodeURIComponent(roomId)}?fromSeq=${fromSeq}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error(`replay fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { code: number; msg: string; data: ReplayDataDto | null };
  if (body.code !== 1000 || !body.data) throw new Error(`replay fetch rejected: ${body.msg}`);
  return body.data;
}

function pageIndexOf(doc: Y.Doc): number {
  return doc.getMap<number>('currentPageIndex').get('index') ?? 0;
}

export class ReplayController {
  private _doc = new Y.Doc();
  private events: ReplayEventDto[] = [];
  private baselineBytes: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  cursor = 0;
  playing = false;
  speed: ReplaySpeed = 1;
  /** 进度条按页分段：{seq: 已应用事件数, pageIndex}，首条恒为会话起点 */
  segments: Array<{ seq: number; pageIndex: number }> = [];

  get doc(): Y.Doc {
    return this._doc;
  }

  get canPlay(): boolean {
    return this.events.length > 0;
  }

  get total(): number {
    return this.events.length;
  }

  load(data: ReplayDataDto): void {
    this.pause();
    this.events = [...data.events].sort((a, b) => a.seq - b.seq);
    this.baselineBytes = data.baseline ? fromB64(data.baseline) : null;
    this.rebuildTo(0);
  }

  /** seek = 状态快照（baseline）+ 增量重放（events[0..seq-1]） */
  seekTo(seq: number): void {
    this.pause();
    this.rebuildTo(seq);
  }

  /** 应用下一条；返回是否还有后续 */
  step(): boolean {
    if (this.destroyed || this.cursor >= this.events.length) {
      this.pause();
      return false;
    }
    const event = this.events[this.cursor];
    if (event) Y.applyUpdate(this._doc, fromB64(event.u));
    this.cursor += 1;
    return this.cursor < this.events.length;
  }

  play(): void {
    if (this.destroyed || !this.canPlay || this.playing) return;
    if (this.cursor >= this.events.length) this.rebuildTo(0);
    this.playing = true;
    this.scheduleNext();
  }

  pause(): void {
    this.playing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setSpeed(speed: ReplaySpeed): void {
    this.speed = speed;
  }

  destroy(): void {
    this.pause();
    this.destroyed = true;
    this.events = [];
    this.segments = [];
    this._doc.destroy();
  }

  private nextDelayMs(): number {
    const e = this.events;
    const i = this.cursor;
    if (i >= e.length) return 0;
    if (i === 0) return e.length > 1 ? e[1]!.ts - e[0]!.ts : 0;
    return e[i]!.ts - e[i - 1]!.ts;
  }

  private scheduleNext(): void {
    if (!this.playing) return;
    const delay = Math.max(0, this.nextDelayMs() / this.speed);
    this.timer = setTimeout(() => {
      this.timer = null;
      const more = this.step();
      if (more && this.playing) this.scheduleNext();
      else this.pause();
    }, delay);
  }

  private rebuildTo(seq: number): void {
    const clamped = Math.max(0, Math.min(seq, this.events.length));
    const doc = new Y.Doc();
    if (this.baselineBytes) Y.applyUpdate(doc, this.baselineBytes);
    for (let i = 0; i < clamped; i++) {
      const event = this.events[i];
      if (event) Y.applyUpdate(doc, fromB64(event.u));
    }
    this._doc = doc;
    this.cursor = clamped;
    this.rebuildSegments();
  }

  private rebuildSegments(): void {
    const doc = new Y.Doc();
    if (this.baselineBytes) Y.applyUpdate(doc, this.baselineBytes);
    const segs: Array<{ seq: number; pageIndex: number }> = [
      { seq: 0, pageIndex: pageIndexOf(doc) }
    ];
    let prev = segs[0]!.pageIndex;
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      if (event) Y.applyUpdate(doc, fromB64(event.u));
      const idx = pageIndexOf(doc);
      if (idx !== prev) {
        segs.push({ seq: i + 1, pageIndex: idx });
        prev = idx;
      }
    }
    this.segments = segs;
  }
}
