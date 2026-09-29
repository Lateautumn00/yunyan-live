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
    p.setToolState({ color: '#ff0000' });
    expect(p.getToolState().color).toBe(DEFAULT_TOOL.color);
  });

  it('可写 setToolState 正常写入（对照）', () => {
    const p = create(false);
    p.setToolState({ color: '#ff0000' });
    expect(p.getToolState().color).toBe('#ff0000');
  });

  it('readOnly setViewportOffset 不写入', () => {
    const p = create(true);
    p.setViewportOffset(10, 20);
    expect(p.getViewportOffset()).toEqual({ x: 0, y: 0 });
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
});
