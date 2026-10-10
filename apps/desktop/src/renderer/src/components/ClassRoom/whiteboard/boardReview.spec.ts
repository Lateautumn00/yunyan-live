import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { decodeBoardSnapshot, readSnapshotPages } from './boardReview';
/* eslint-disable @typescript-eslint/no-explicit-any */

// ── F6.3 课后回看：快照二进制解码 + 只读读取页/元素 ─────────────────────────
function makeSnapshot(): { b64: string; pageId: string } {
  const doc = new Y.Doc();
  const pages = doc.getArray<Y.Map<any>>('pages');
  const page = new Y.Map();
  const pageId = 'page_snap_1';
  page.set('id', pageId);
  pages.push([page]); // 先集成进 doc，再写嵌套 elements（未集成 Map 读回 get 为 undefined）
  const elements = new Y.Array();
  page.set('elements', elements);
  const el = new Y.Map();
  el.set('id', 'e1');
  el.set('type', 'rect');
  el.set('x', 10);
  el.set('y', 20);
  elements.push([el]);
  const update = Y.encodeStateAsUpdate(doc);
  let binary = '';
  for (const b of update) binary += String.fromCharCode(b);
  return { b64: btoa(binary), pageId };
}

describe('boardReview 快照解码（F6.3）', () => {
  it('正向：base64 快照解码为 Y.Doc 并读出页与元素', () => {
    const { b64, pageId } = makeSnapshot();
    const doc = decodeBoardSnapshot(b64);
    const pages = readSnapshotPages(doc);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.id).toBe(pageId);
    expect(pages[0]!.elements).toHaveLength(1);
    expect(pages[0]!.elements.get(0).get('type')).toBe('rect');
    expect(pages[0]!.elements.get(0).get('x')).toBe(10);
    doc.destroy();
  });

  it('正向：多页快照按序读出', () => {
    const doc = new Y.Doc();
    const pages = doc.getArray<Y.Map<any>>('pages');
    for (const id of ['p1', 'p2', 'p3']) {
      const p = new Y.Map();
      p.set('id', id);
      p.set('elements', new Y.Array());
      pages.push([p]);
    }
    const update = Y.encodeStateAsUpdate(doc);
    let binary = '';
    for (const b of update) binary += String.fromCharCode(b);
    const decoded = decodeBoardSnapshot(btoa(binary));
    const read = readSnapshotPages(decoded);
    expect(read.map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
    doc.destroy();
    decoded.destroy();
  });

  it('负向：无页的空快照读出空数组（不抛）', () => {
    const doc = new Y.Doc();
    const update = Y.encodeStateAsUpdate(doc);
    let binary = '';
    for (const b of update) binary += String.fromCharCode(b);
    const decoded = decodeBoardSnapshot(btoa(binary));
    expect(readSnapshotPages(decoded)).toEqual([]);
    doc.destroy();
    decoded.destroy();
  });
});
