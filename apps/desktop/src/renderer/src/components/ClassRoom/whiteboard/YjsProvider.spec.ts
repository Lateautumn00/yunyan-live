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
