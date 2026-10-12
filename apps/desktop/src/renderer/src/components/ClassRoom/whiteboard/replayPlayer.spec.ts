import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ReplayController, replayHttpBase, fetchReplay, type ReplayEventDto } from './replayPlayer';

function toB64(u: Uint8Array): string {
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 产生一条与真实写路径同构的事件流：建两页 + 逐笔元素 + 翻页 */
function makeReplayData(): {
  baseline: string;
  events: ReplayEventDto[];
  ref: Y.Doc[];
} {
  const src = new Y.Doc();
  const events: ReplayEventDto[] = [];
  src.on('update', (u: Uint8Array) => {
    events.push({ seq: events.length + 1, ts: 1000 + events.length * 100, u: toB64(u) });
  });
  const baseline = toB64(Y.encodeStateAsUpdate(src));

  const pages = src.getArray<Y.Map<unknown>>('pages');
  src.transact(() => {
    const p1 = new Y.Map<unknown>();
    p1.set('id', 'p1');
    p1.set('elements', new Y.Array<unknown>());
    const p2 = new Y.Map<unknown>();
    p2.set('id', 'p2');
    p2.set('elements', new Y.Array<unknown>());
    pages.push([p1, p2]);
  });
  src.getMap<number>('currentPageIndex').set('index', 0);
  src.transact(() => {
    (pages.get(0)!.get('elements') as Y.Array<unknown>).push(['stroke1']);
  });
  src.transact(() => {
    (pages.get(0)!.get('elements') as Y.Array<unknown>).push(['stroke2']);
  });
  src.getMap<number>('currentPageIndex').set('index', 1);
  src.transact(() => {
    (pages.get(1)!.get('elements') as Y.Array<unknown>).push(['stroke3']);
  });

  // 参照：每个 cursor 位置顺序 apply 的期望 doc
  const refs: Y.Doc[] = [];
  const ref = new Y.Doc();
  refs.push(structuredCloneDoc(ref));
  Y.applyUpdate(ref, fromB64(baseline));
  refs.push(structuredCloneDoc(ref));
  for (const e of events) {
    Y.applyUpdate(ref, fromB64(e.u));
    refs.push(structuredCloneDoc(ref));
  }
  return { baseline, events, ref: refs };
}

function structuredCloneDoc(doc: Y.Doc): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

function pagesState(doc: Y.Doc): unknown {
  return JSON.stringify(
    doc
      .getArray<Y.Map<unknown>>('pages')
      .toArray()
      .map(p => ({
        id: p.get('id'),
        elements: ((p.get('elements') as Y.Array<unknown>)?.toArray() ?? []) as unknown[]
      }))
  );
}

describe('ReplayController 时间轴回放（F6.4）', () => {
  let ctrl: ReplayController;

  afterEach(() => {
    ctrl?.destroy();
  });

  it('正向：seek 重建等价性——任意 cursor 的 doc 内容 == 顺序 apply 到该点的内容', () => {
    const { baseline, events, ref } = makeReplayData();
    ctrl = new ReplayController();
    ctrl.load({ baseline, events, lastSeq: events.length });
    for (let k = 0; k <= events.length; k++) {
      ctrl.seekTo(k);
      expect(ctrl.cursor).toBe(k);
      // ref[0]=空 doc, ref[1]=baseline, ref[k+1]=baseline+e1..ek
      expect(pagesState(ctrl.doc)).toBe(pagesState(ref[k + 1]!));
    }
  });

  it('正向：分段标记为进度条全程页边界；step 推进 cursor 不改分段', () => {
    const { baseline, events } = makeReplayData();
    ctrl = new ReplayController();
    ctrl.load({ baseline, events, lastSeq: events.length });

    expect(ctrl.segments).toEqual([
      { seq: 0, pageIndex: 0 },
      { seq: 5, pageIndex: 1 }
    ]);
    while (ctrl.step()) {
      // drain
    }
    expect(ctrl.cursor).toBe(events.length);
    expect(ctrl.step()).toBe(false);
    expect(ctrl.segments).toEqual([
      { seq: 0, pageIndex: 0 },
      { seq: 5, pageIndex: 1 }
    ]);
  });

  it('正向：空流 canPlay=false，load/seekTo 不抛（空流空态前提）', () => {
    ctrl = new ReplayController();
    ctrl.load({ baseline: null, events: [], lastSeq: 0 });
    expect(ctrl.canPlay).toBe(false);
    expect(() => ctrl.seekTo(3)).not.toThrow();
    expect(() => ctrl.step()).not.toThrow();
    expect(ctrl.step()).toBe(false);
  });

  it('正向：seekTo 越界被 clamp 到 [0, events.length]', () => {
    const { baseline, events } = makeReplayData();
    ctrl = new ReplayController();
    ctrl.load({ baseline, events, lastSeq: events.length });
    ctrl.seekTo(-5);
    expect(ctrl.cursor).toBe(0);
    ctrl.seekTo(999);
    expect(ctrl.cursor).toBe(events.length);
  });

  it('正向：play 按事件时间差推进，setSpeed(2) 使推进加快', () => {
    vi.useFakeTimers();
    try {
      const { baseline, events } = makeReplayData();
      ctrl = new ReplayController();
      ctrl.load({ baseline, events, lastSeq: events.length });
      ctrl.play();
      // 事件间隔 100ms；1× 下 250ms 应推进 2 条
      vi.advanceTimersByTime(250);
      expect(ctrl.cursor).toBe(2);
      ctrl.setSpeed(2);
      vi.advanceTimersByTime(250);
      // 2× 下 250ms 再推进 ~5 条（100/2=50ms 每条）
      expect(ctrl.cursor).toBeGreaterThan(4);
      ctrl.pause();
      const frozen = ctrl.cursor;
      vi.advanceTimersByTime(1000);
      expect(ctrl.cursor).toBe(frozen);
    } finally {
      vi.useRealTimers();
    }
  });

  it('正向：播到末尾自动停止', () => {
    vi.useFakeTimers();
    try {
      const { baseline, events } = makeReplayData();
      ctrl = new ReplayController();
      ctrl.load({ baseline, events, lastSeq: events.length });
      ctrl.play();
      vi.advanceTimersByTime(10_000);
      expect(ctrl.cursor).toBe(events.length);
      expect(ctrl.playing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchReplay / replayHttpBase（F6.4）', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('正向：ws url 换算为 http base（去 path）', () => {
    expect(replayHttpBase('ws://localhost:8188/yjs')).toBe('http://localhost:8188');
    expect(replayHttpBase('wss://board.example.com/yjs')).toBe('https://board.example.com');
  });

  it('正向：fetchReplay 请求 /replay/:roomId?fromSeq 并返回 data', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 1000,
            msg: 'ok',
            data: { baseline: null, events: [], lastSeq: 0 }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchReplay('room-x', 'ws://127.0.0.1:50055/yjs');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:50055/replay/room-x?fromSeq=0');
    expect(data.events).toHaveLength(0);
    expect(data.lastSeq).toBe(0);
  });

  it('负向：非 1000 响应抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 1001, msg: 'fail', data: null }), { status: 200 })
      )
    );
    await expect(fetchReplay('room-x', 'ws://127.0.0.1:50055/yjs')).rejects.toThrow();
  });
});
