import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YjsProvider } from './YjsProvider';
import { DEFAULT_TOOL } from './types';

function seedPage(provider: YjsProvider): void {
  const page = new Y.Map();
  page.set('id', `page_test_${Math.random().toString(36).slice(2, 8)}`);
  page.set('name', 'Page 1');
  page.set('visible', true);
  page.set('elements', new Y.Array());
  provider.getPages().push([page]);
}

describe('YjsProvider readOnly', () => {
  const providers: YjsProvider[] = [];
  function create(readOnly: boolean): YjsProvider {
    const p = new YjsProvider(
      `provider-spec-${Math.random().toString(36).slice(2, 8)}`,
      'u1',
      'tester',
      '#000000',
      undefined,
      readOnly
    );
    providers.push(p);
    return p;
  }

  afterEach(() => {
    while (providers.length) providers.pop()!.destroy();
  });

  it('readOnly addPage 不建页并返回空串', () => {
    const p = create(true);
    expect(p.addPage()).toBe('');
    expect(p.getPages().length).toBe(0);
  });

  it('可写 addPage 正常建页（对照）', () => {
    const p = create(false);
    const id = p.addPage();
    expect(id).toMatch(/^page_/);
    expect(p.getPages().length).toBe(1);
  });

  it('readOnly removePage 不删页', () => {
    const p = create(true);
    seedPage(p);
    seedPage(p);
    p.removePage(0);
    expect(p.getPages().length).toBe(2);
  });

  it('readOnly setCurrentPageIndex 不生效', () => {
    const p = create(true);
    p.setCurrentPageIndex(5);
    expect(p.getCurrentPageIndex()).toBe(0);
  });

  it('可写 setCurrentPageIndex 生效（对照）', () => {
    const p = create(false);
    p.setCurrentPageIndex(5);
    expect(p.getCurrentPageIndex()).toBe(5);
  });

  it('readOnly addShape 不写入当前页', () => {
    const p = create(true);
    seedPage(p);
    p.addShape({ id: 's1', type: 'rect', x: 0, y: 0, width: 10, height: 10 });
    expect(p.getActiveElements()!.length).toBe(0);
  });

  it('可写 addShape 正常写入（对照）', () => {
    const p = create(false);
    seedPage(p);
    p.addShape({ id: 's1', type: 'rect', x: 0, y: 0, width: 10, height: 10 });
    expect(p.getActiveElements()!.length).toBe(1);
  });

  it('readOnly removeLastElement 恒返回 false', () => {
    const p = create(true);
    seedPage(p);
    expect(p.removeLastElement()).toBe(false);
    expect(p.getActiveElements()!.length).toBe(0);
  });

  it('readOnly setToolState 不写入', () => {
    const p = create(true);
    p.setToolState({ color: '#ff0000', penType: 'highlight' });
    expect(p.getToolState().color).toBe(DEFAULT_TOOL.color);
    expect(p.getToolState().penType).toBe('pen');
  });

  it('可写 setToolState 正常写入（对照）', () => {
    const p = create(false);
    p.setToolState({ color: '#ff0000' });
    expect(p.getToolState().color).toBe('#ff0000');
  });

  it('getToolState 默认 penType=pen 且构造期不写入（不覆盖快照恢复的笔型）', () => {
    const p = create(false);
    expect(p.getToolState().penType).toBe('pen');
    expect(p.toolState.has('penType')).toBe(false);
  });

  it('可写 setToolState penType 往返写入（F4.1 持久工具态）', () => {
    const p = create(false);
    p.setToolState({ penType: 'highlight' });
    expect(p.getToolState().penType).toBe('highlight');
    p.setToolState({ penType: 'pen' });
    expect(p.getToolState().penType).toBe('pen');
  });

  it('readOnly setViewportOffset 不写入', () => {
    const p = create(true);
    p.setViewportOffset(10, 20);
    expect(p.getViewportOffset()).toEqual({ x: 0, y: 0 });
  });

  it('readOnly setViewportZoom 不写入', () => {
    const p = create(true);
    p.setViewportZoom(150);
    expect(p.getViewportZoom()).toBe(100);
  });

  it('可写 setViewportZoom/setViewportOffset 正常写入（对照）', () => {
    const p = create(false);
    p.setViewportZoom(150);
    p.setViewportOffset(10, 20);
    expect(p.getViewportZoom()).toBe(150);
    expect(p.getViewportOffset()).toEqual({ x: 10, y: 20 });
  });

  it('readOnly 课件条目增改删均不生效', () => {
    const p = create(true);
    p.addFileItem({ filename: 'a', filext: 'pptx', filesize: 1, fileid: 'f1' });
    expect(p.getFileList().length).toBe(0);

    const w = create(false);
    w.addFileItem({ filename: 'a', filext: 'pptx', filesize: 1, fileid: 'f1' });
    expect(w.getFileList().length).toBe(1);
    w.readOnly = true;
    w.renameFileItem(0, 'renamed');
    expect(w.getFileList()[0]!.filename).toBe('a');
    w.removeFileItem(0);
    expect(w.getFileList().length).toBe(1);
  });

  it('fileid 为空的已登记条目也返回（待创建态），可回填 fileid', () => {
    const w = create(false);
    w.addFileItem({ filename: 'a', filext: 'pptx', filesize: 1, fileid: '' });
    expect(w.getFileList().length).toBe(1);
    expect(w.getFileList()[0]!.fileid).toBe('');
    w.setFileItemId(0, 'p1,p2');
    expect(w.getFileList()[0]!.fileid).toBe('p1,p2');
    w.readOnly = true;
    w.setFileItemId(0, 'x');
    expect(w.getFileList()[0]!.fileid).toBe('p1,p2');
  });

  it('readOnly setLaser 不广播', () => {
    const p = create(true);
    p.setLaser(10, 20);
    expect(
      (p.awareness.getLocalState() as Record<string, unknown> | null)?.laser ?? null
    ).toBeFalsy();
  });

  it('readOnly updateCursor 不广播（F7.1 学生端只渲染不可写）', () => {
    const p = create(true);
    p.updateCursor({ userId: 'u1', userName: 'S', x: 1, y: 2, color: '#f00' });
    expect(
      (p.awareness.getLocalState() as Record<string, unknown> | null)?.cursor ?? null
    ).toBeFalsy();
  });

  it('可写 updateCursor 写入 awareness（对照）', () => {
    const p = create(false);
    p.updateCursor({ userId: 'u1', userName: 'T', x: 3, y: 4, color: '#0f0' });
    expect((p.awareness.getLocalState() as Record<string, unknown> | null)?.cursor).toEqual({
      userId: 'u1',
      userName: 'T',
      x: 3,
      y: 4,
      color: '#0f0'
    });
  });

  it('可写 setLaser/setLaserOff 写入 awareness 并可清除（对照）', () => {
    const p = create(false);
    p.setLaser(30, 40);
    expect((p.awareness.getLocalState() as Record<string, unknown> | null)?.laser).toEqual({
      x: 30,
      y: 40
    });
    p.setLaserOff();
    expect(
      (p.awareness.getLocalState() as Record<string, unknown> | null)?.laser ?? null
    ).toBeFalsy();
  });
});

// D5：Y.UndoManager 迁移的等价性用例（阶段 0，先于迁移写定，见 docs 走查记录）
describe('YjsProvider undo/redo（D5 Y.UndoManager 等价性）', () => {
  const providers: YjsProvider[] = [];
  function create(readOnly = false): YjsProvider {
    const p = new YjsProvider(
      `undo-spec-${Math.random().toString(36).slice(2, 8)}`,
      'u1',
      'tester',
      '#000000',
      undefined,
      readOnly
    );
    providers.push(p);
    return p;
  }
  /** 造页并丢弃建页本身的捕获，等价于「会话开始时页已存在」 */
  function seedClean(): YjsProvider {
    const p = create(false);
    seedPage(p);
    p.clearUndoStack();
    return p;
  }

  afterEach(() => {
    while (providers.length) providers.pop()!.destroy();
  });

  it('addShape → undo 移除 → redo 恢复', () => {
    const p = seedClean();
    p.addShape({ id: 's1', type: 'rect', x: 0, y: 0, width: 10, height: 10 });
    expect(p.getActiveElements()!.length).toBe(1);
    expect(p.undo()).not.toBeNull();
    expect(p.getActiveElements()!.length).toBe(0);
    expect(p.redo()).not.toBeNull();
    expect(p.getActiveElements()!.length).toBe(1);
  });

  it('连续两次 addShape 独立成项（captureTimeout=0 不合并）', () => {
    const p = seedClean();
    p.addShape({ id: 's1', type: 'rect' });
    p.addShape({ id: 's2', type: 'rect' });
    expect(p.undoManager.undoStack.length).toBe(2);
    p.undo();
    expect(p.getActiveElements()!.length).toBe(1);
    p.undo();
    expect(p.getActiveElements()!.length).toBe(0);
  });

  it('updateElement → undo 还原旧值 → redo 再写入', () => {
    const p = seedClean();
    p.addShape({ id: 's1', type: 'rect', x: 0 });
    p.clearUndoStack();
    p.updateElement('s1', { x: 50 });
    expect(p.getActiveElements()!.get(0).get('x')).toBe(50);
    p.undo();
    expect(p.getActiveElements()!.get(0).get('x')).toBe(0);
    p.redo();
    expect(p.getActiveElements()!.get(0).get('x')).toBe(50);
  });

  it('removeElement → undo 恢复到原索引位置', () => {
    const p = seedClean();
    p.addShape({ id: 's1' });
    p.addShape({ id: 's2' });
    p.addShape({ id: 's3' });
    p.clearUndoStack();
    expect(p.removeElement('s2')).toBe(1);
    expect(p.getActiveElements()!.length).toBe(2);
    p.undo();
    expect(p.getActiveElements()!.length).toBe(3);
    expect(p.getActiveElements()!.get(1).get('id')).toBe('s2');
  });

  it('addPage → undo 删页 → redo 恢复', () => {
    const p = seedClean();
    p.addPage();
    expect(p.getPages().length).toBe(2);
    p.undo();
    expect(p.getPages().length).toBe(1);
    p.redo();
    expect(p.getPages().length).toBe(2);
  });

  it('viewport/toolState/翻页写入不入撤销栈', () => {
    const p = seedClean();
    p.setViewportOffset(10, 20);
    p.setViewportZoom(150);
    p.setToolState({ color: '#ff0000' });
    p.setCurrentPageIndex(0);
    expect(p.undoManager.undoStack.length).toBe(0);
    expect(p.undo()).toBeNull();
  });

  it('新本地板书操作清空 redo 栈', () => {
    const p = seedClean();
    p.addShape({ id: 's1' });
    p.undo();
    expect(p.undoManager.redoStack.length).toBe(1);
    p.addShape({ id: 's2' });
    expect(p.undoManager.redoStack.length).toBe(0);
    expect(p.undoManager.undoStack.length).toBe(1);
  });

  it('stack-item meta 记录操作发生页 pageIndex', () => {
    const p = seedClean();
    p.addShape({ id: 's1' });
    expect(p.undoManager.undoStack[p.undoManager.undoStack.length - 1]!.meta.get('pageIndex')).toBe(
      0
    );
  });

  it('clearUndoStack 清空双栈，undo 返回 null', () => {
    const p = seedClean();
    p.addShape({ id: 's1' });
    p.undo();
    expect(p.undoManager.redoStack.length).toBe(1);
    p.clearUndoStack();
    expect(p.undoManager.undoStack.length).toBe(0);
    expect(p.undoManager.redoStack.length).toBe(0);
    expect(p.undo()).toBeNull();
    expect(p.redo()).toBeNull();
  });

  it('readOnly undo/redo 返回 null 且不动文档', () => {
    const p = create(true);
    seedPage(p);
    p.clearUndoStack();
    expect(p.undo()).toBeNull();
    expect(p.redo()).toBeNull();
  });

  it('远端 origin 的更新不入撤销栈', () => {
    const p = seedClean();
    const remote = new Y.Doc();
    const remotePage = new Y.Map();
    remotePage.set('id', 'rp');
    remotePage.set('elements', new Y.Array());
    remote.getArray('pages').push([remotePage]);
    Y.applyUpdate(p.doc, Y.encodeStateAsUpdate(remote), { ctor: 'fake-provider' });
    expect(p.getPages().length).toBe(2);
    expect(p.undoManager.undoStack.length).toBe(0);
    remote.destroy();
  });
});

describe('YjsProvider 快照状态帧（type=4，§4.9 F6.2 横幅数据源）', () => {
  const providers: YjsProvider[] = [];
  function create(): YjsProvider {
    const p = new YjsProvider(
      `snapshot-spec-${Math.random().toString(36).slice(2, 8)}`,
      'u1',
      'tester',
      '#000000',
      undefined,
      false
    );
    providers.push(p);
    return p;
  }

  afterEach(() => {
    while (providers.length) providers.pop()!.destroy();
  });

  type FrameHandler = (e: unknown, d: { arr: Uint8Array; pos: number }) => void;
  const frameHandler = (p: YjsProvider): FrameHandler =>
    p.provider.messageHandlers[4] as unknown as FrameHandler;
  const frame = (bytes: number[]) => ({ arr: new Uint8Array(bytes), pos: 0 });

  it('构造时注册 type=4 handler（早于任何网络消息）', () => {
    const p = create();
    expect(typeof frameHandler(p)).toBe('function');
  });

  it('state/attempt 按 varuint 解析并分发；无订阅者不崩溃', () => {
    const p = create();
    // 尚无订阅者：直接分发不抛错
    frameHandler(p)(null, frame([1, 1]));

    const seen: Array<{ state: 0 | 1; attempt: number }> = [];
    p.onSnapshotStatus(s => seen.push(s));
    frameHandler(p)(null, frame([1, 3]));
    expect(seen).toEqual([{ state: 1, attempt: 3 }]);
    // 300 的 varuint 编码 = [0xAC, 0x02]（7bit 续位），state=0
    frameHandler(p)(null, frame([0, 0xac, 0x02]));
    expect(seen[1]).toEqual({ state: 0, attempt: 300 });
  });

  it('退订后不再收到分发', () => {
    const p = create();
    const seen: number[] = [];
    const off = p.onSnapshotStatus(s => seen.push(s.attempt));
    frameHandler(p)(null, frame([1, 1]));
    off();
    frameHandler(p)(null, frame([1, 2]));
    expect(seen).toEqual([1]);
  });
});

// ── F5.2b 缩略图拖拽排序：movePage 深克隆重排 ─────────────────────────────────
// yjs 13.x 没有原生 move：对同一 Y.Map 直接 delete+insert 会因 _prelimContent 已置
// null 抛 TypeError，必须整页深克隆后删旧插新。
describe('YjsProvider movePage（F5.2b 拖拽排序）', () => {
  const providers: YjsProvider[] = [];
  function create(readOnly = false): YjsProvider {
    const p = new YjsProvider(
      `move-spec-${Math.random().toString(36).slice(2, 8)}`,
      'u1',
      'tester',
      '#000000',
      undefined,
      readOnly
    );
    providers.push(p);
    return p;
  }

  afterEach(() => {
    while (providers.length) providers.pop()!.destroy();
  });

  /** A/B/C 三页，每页一个可辨识元素；建页动作清栈，等价于「会话开始即有三页」 */
  function seed3(): { p: YjsProvider; ids: string[] } {
    const p = create(false);
    const ids: string[] = [];
    for (const n of ['A', 'B', 'C']) {
      ids.push(p.addPage());
      p.addShape({ id: `s_${n}`, type: 'rect', x: 0, y: 0, width: 4, height: 4 });
    }
    p.clearUndoStack();
    p.setCurrentPageIndex(0);
    return { p, ids };
  }

  function orderOf(p: YjsProvider): string[] {
    return p
      .getPages()
      .toArray()
      .map(pg => pg.get('id') as string);
  }

  it('正向：movePage(0,2) 把首页移到末位，各页元素随页走且字段保留', () => {
    const { p, ids } = seed3();
    expect(p.movePage(0, 2)).toBe(true);
    expect(orderOf(p)).toEqual([ids[1], ids[2], ids[0]]);
    // 元素必须跟着自己的页（否则拖完页内容串页）
    expect(p.getElementsAtPage(0)!.toArray()[0]!.get('id')).toBe('s_B');
    expect(p.getElementsAtPage(1)!.toArray()[0]!.get('id')).toBe('s_C');
    expect(p.getElementsAtPage(2)!.toArray()[0]!.get('id')).toBe('s_A');
    expect(p.getPages().toArray()[2]!.get('name')).toBe('Page 1');
    p.destroy();
    providers.pop();
  });

  it('正向：反向 movePage(2,0) 末页移到首位', () => {
    const { p, ids } = seed3();
    p.setCurrentPageIndex(0);
    expect(p.movePage(2, 0)).toBe(true);
    expect(orderOf(p)).toEqual([ids[2], ids[0], ids[1]]);
    p.destroy();
    providers.pop();
  });

  it('正向：当前页索引跟页走（跨过位移点时一并修正）', () => {
    const { p } = seed3();
    p.setCurrentPageIndex(1); // B：位于 from=0 与 to=2 之间 → 落到 0
    p.movePage(0, 2);
    expect(p.getCurrentPageIndex()).toBe(0);

    const q = seed3().p;
    q.setCurrentPageIndex(0); // A：被搬走的页 → 跟到 to=2
    q.movePage(0, 2);
    expect(q.getCurrentPageIndex()).toBe(2);

    const r = seed3().p;
    r.setCurrentPageIndex(0); // 反向：A/B 在末页左移后右移一格
    r.movePage(2, 0);
    expect(r.getCurrentPageIndex()).toBe(1);
    q.destroy();
    r.destroy();
    providers.pop();
    providers.pop();
  });

  it('正向：调序是一档 undo，一次回滚恢复原顺序与元素', () => {
    const { p, ids } = seed3();
    p.movePage(1, 0);
    expect(orderOf(p)).toEqual([ids[1], ids[0], ids[2]]);
    expect(p.undoManager.undoStack.length).toBe(1);
    expect(p.undo()).not.toBeNull();
    expect(orderOf(p)).toEqual(ids);
    expect(p.getElementsAtPage(0)!.toArray()[0]!.get('id')).toBe('s_A');
    expect(p.undoManager.redoStack.length).toBe(1);
    p.destroy();
    providers.pop();
  });

  it('正向：调序栈项记录 pageId（undo 后据 id 找页，index 会漂移）', () => {
    const { p, ids } = seed3();
    p.setCurrentPageIndex(1);
    p.movePage(0, 2);
    const item = p.undoManager.undoStack.at(-1)!;
    expect(item.meta.get('pageId')).toBe(ids[1]); // 当前页 B 落在 index0
    p.destroy();
    providers.pop();
  });

  it('负向：只读/越界/原地不动都不改文档且不入 undo 栈', () => {
    const { p } = seed3();
    const before = orderOf(p);
    expect(p.movePage(0, 5)).toBe(false);
    expect(p.movePage(3, 0)).toBe(false);
    expect(p.movePage(1, 1)).toBe(false);
    expect(p.movePage(-1, 2)).toBe(false);
    expect(orderOf(p)).toEqual(before);
    expect(p.undoManager.undoStack.length).toBe(0);
    p.destroy();
    providers.pop();

    const ro = create(true);
    seedPage(ro);
    seedPage(ro);
    seedPage(ro);
    const roBefore = orderOf(ro);
    expect(ro.movePage(0, 2)).toBe(false);
    expect(orderOf(ro)).toEqual(roBefore);
    ro.destroy();
    providers.pop();
  });
});
