import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMemoryStickyBackend,
  createStickyNote,
  deleteStickyNoteCascade,
  extractNoteImageIds,
  getStickyNote,
  getStickyNoteImage,
  isStickyStorageDegraded,
  listStickyNoteImageIds,
  listStickyNotes,
  putStickyNote,
  putStickyNoteImage,
  setStickyBackend,
  sweepOrphanStickyImages
} from './stickyNoteStore';

describe('stickyNoteStore — 便签本地持久化', () => {
  beforeEach(() => {
    setStickyBackend(createMemoryStickyBackend());
  });

  it('put/list/get 往返，list 按 updatedAt 倒序', async () => {
    const a = createStickyNote({ content: '第一条', updatedAt: 100 });
    const b = createStickyNote({ content: '第二条', updatedAt: 200 });
    await putStickyNote(a);
    await putStickyNote(b);
    const list = await listStickyNotes();
    expect(list.map(n => n.id)).toEqual([b.id, a.id]);
    expect((await getStickyNote(a.id))?.content).toBe('第一条');
    expect(await getStickyNote('missing')).toBeNull();
  });

  it('createStickyNote 默认值与字段覆盖', () => {
    const note = createStickyNote();
    expect(note.id).toMatch(/^note-/);
    expect(note.content).toBe('');
    expect(note.color).toBe('yellow');
    expect(note.size).toBe('medium');
    expect(note.updatedAt).toBe(note.createdAt);
    const custom = createStickyNote({ content: 'x', color: 'blue', size: 'large' });
    expect(custom.color).toBe('blue');
    expect(custom.size).toBe('large');
  });

  it('图片 put/get/list，孤儿图被清扫', async () => {
    const blob = new Blob(['img'], { type: 'image/png' });
    await putStickyNoteImage('img1', blob);
    expect((await getStickyNoteImage('img1'))?.blob).toBe(blob);
    expect(await listStickyNoteImageIds()).toEqual(['img1']);
    await sweepOrphanStickyImages();
    expect(await listStickyNoteImageIds()).toEqual([]);
  });

  it('extractNoteImageIds 提取并去重，无引用返回空', () => {
    const ids = extractNoteImageIds(
      '![a](note-img:id1) 文本 ![b](note-img:id2) 再来 ![c](note-img:id1)'
    );
    expect([...ids].sort()).toEqual(['id1', 'id2']);
    expect(extractNoteImageIds('没有图片')).toEqual([]);
  });

  it('deleteStickyNoteCascade 级联删除引用图且不误伤他图', async () => {
    const keepNote = createStickyNote({ content: '![k](note-img:keep) ![d](note-img:del)' });
    const otherNote = createStickyNote({ content: '![k](note-img:keep)' });
    await putStickyNote(keepNote);
    await putStickyNote(otherNote);
    await putStickyNoteImage('keep', new Blob(['k']));
    await putStickyNoteImage('del', new Blob(['d']));

    await deleteStickyNoteCascade(otherNote.id);
    expect(await listStickyNotes()).toHaveLength(1);
    expect([...(await listStickyNoteImageIds())].sort()).toEqual(['del', 'keep']);

    await deleteStickyNoteCascade(keepNote.id);
    expect(await listStickyNotes()).toHaveLength(0);
    expect(await listStickyNoteImageIds()).toEqual([]);
  });

  it('删除不存在的便签是安全空操作', async () => {
    await expect(deleteStickyNoteCascade('nope')).resolves.toBeUndefined();
  });

  it('jsdom 无 IndexedDB → 探测失败自动降级内存且标记 degraded', async () => {
    setStickyBackend(null);
    await putStickyNote(createStickyNote({ content: '降级可写' }));
    expect(await listStickyNotes()).toHaveLength(1);
    expect(isStickyStorageDegraded()).toBe(true);
  });
});
