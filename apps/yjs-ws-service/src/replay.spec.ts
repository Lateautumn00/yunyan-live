import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';

const tmpDir = path.join(
  os.tmpdir(),
  `replay-spec-${Date.now()}-${Math.floor(Math.random() * 10000)}`
);
let replay: typeof import('./replay');

beforeAll(async () => {
  process.env.REPLAY_DIR = tmpDir;
  process.env.REPLAY_TTL_MS = '0';
  replay = await import('./replay');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function collectUpdates(doc: Y.Doc): Uint8Array[] {
  const updates: Uint8Array[] = [];
  const obs = (u: Uint8Array) => updates.push(u);
  doc.on('update', obs);
  return updates;
}

describe('replay 事件流（F6.4）', () => {
  it('正向：append 后 read 返回 baseline + 单调 seq 事件，apply 重建与源 doc 等价', () => {
    const room = 'room-append';
    const src = new Y.Doc();
    replay.initReplayBaseline(room, Y.encodeStateAsUpdate(src));
    const updates = collectUpdates(src);
    src.getArray('elements').push(['a']);
    src.getArray('elements').push(['b']);
    src.getArray('elements').push(['c']);
    for (const u of updates) replay.appendReplayEvent(room, u);

    const data = replay.readReplay(room);
    expect(data.baseline).not.toBeNull();
    expect(data.events).toHaveLength(3);
    expect(data.events.map(e => e.seq)).toEqual([1, 2, 3]);
    expect(data.lastSeq).toBe(3);
    for (const e of data.events) {
      expect(e.ts).toBeGreaterThan(0);
      expect(e.u.length).toBeGreaterThan(0);
    }

    const rebuilt = new Y.Doc();
    Y.applyUpdate(rebuilt, data.baseline!);
    for (const e of data.events) Y.applyUpdate(rebuilt, e.u);
    expect(rebuilt.getArray('elements').toArray()).toEqual(['a', 'b', 'c']);
  });

  it('正向：initReplayBaseline 对已存在事件流不覆盖（服务重启续接场景）', () => {
    const room = 'room-baseline';
    const src = new Y.Doc();
    replay.initReplayBaseline(room, Y.encodeStateAsUpdate(src));
    const updates = collectUpdates(src);
    src.getArray('elements').push(['x']);
    for (const u of updates) replay.appendReplayEvent(room, u);
    const before = replay.readReplay(room);
    expect(before.events).toHaveLength(1);

    replay.initReplayBaseline(room, new Uint8Array([1, 2, 3]));
    const after = replay.readReplay(room);
    expect(after.events).toHaveLength(1);
    expect(after.baseline).toEqual(before.baseline);
  });

  it('正向：fromSeq 过滤返回 seq >= fromSeq 的事件', () => {
    const room = 'room-fromseq';
    const src = new Y.Doc();
    replay.initReplayBaseline(room, Y.encodeStateAsUpdate(src));
    const updates = collectUpdates(src);
    for (let i = 0; i < 5; i++) src.getArray('elements').push([`s${i}`]);
    for (const u of updates) replay.appendReplayEvent(room, u);

    const tail = replay.readReplay(room, 3);
    expect(tail.events.map(e => e.seq)).toEqual([3, 4, 5]);
    expect(tail.lastSeq).toBe(5);
    expect(tail.baseline).toBeNull();
  });

  it('负向：无事件流的房间返回空 events 与 lastSeq 0（空流空态前提）', () => {
    const data = replay.readReplay('room-empty-none');
    expect(data.baseline).toBeNull();
    expect(data.events).toHaveLength(0);
    expect(data.lastSeq).toBe(0);
  });

  it('负向：roomId 含路径穿越字符时文件仍落在 REPLAY_DIR 内', () => {
    const room = '../../evil-room';
    const src = new Y.Doc();
    replay.initReplayBaseline(room, Y.encodeStateAsUpdate(src));
    const updates = collectUpdates(src);
    src.getArray('elements').push(['z']);
    for (const u of updates) replay.appendReplayEvent(room, u);

    const files = fs.readdirSync(tmpDir);
    expect(files.some(f => f.includes('evil-room'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '..', 'evil-room.jsonl'))).toBe(false);
    expect(replay.readReplay(room).events).toHaveLength(1);
  });

  it('正向：clearReplay 删除事件流后 read 回到空态', () => {
    const room = 'room-clear';
    const src = new Y.Doc();
    replay.initReplayBaseline(room, Y.encodeStateAsUpdate(src));
    const updates = collectUpdates(src);
    src.getArray('elements').push(['k']);
    for (const u of updates) replay.appendReplayEvent(room, u);
    expect(replay.hasReplay(room)).toBe(true);

    replay.clearReplay(room);
    expect(replay.hasReplay(room)).toBe(false);
    const data = replay.readReplay(room);
    expect(data.events).toHaveLength(0);
    expect(data.baseline).toBeNull();
  });
});
