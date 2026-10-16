import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ElMessage } from 'element-plus';
import {
  createMemoryStickyBackend,
  createStickyNote,
  listStickyNoteImageIds,
  listStickyNotes,
  putStickyNote,
  putStickyNoteImage,
  setStickyBackend
} from '@/components/Notes/stickyNoteStore';
import { STICKY_SAVE_DEBOUNCE_MS, useStickyNotes } from './useStickyNotes';

describe('useStickyNotes — 状态与落盘', () => {
  const sticky = useStickyNotes();

  beforeEach(() => {
    setStickyBackend(createMemoryStickyBackend());
    sticky.reset();
  });

  afterEach(() => {
    setStickyBackend(null);
    vi.useRealTimers();
  });

  it('openNotes 无便签时自动新建第一条，空内容不落库', async () => {
    await sticky.openNotes();
    expect(sticky.open.value).toBe(true);
    expect(sticky.notes.value).toHaveLength(1);
    expect(sticky.activeId.value).toBe(sticky.notes.value[0]!.id);
    await sticky.flushAll();
    expect(await listStickyNotes()).toHaveLength(0);
  });

  it('输入后 800ms 防抖自动落盘', async () => {
    vi.useFakeTimers();
    await sticky.openNotes();
    sticky.updateActive({ content: '第一行\n正文' });
    expect(await listStickyNotes()).toHaveLength(0);
    vi.advanceTimersByTime(STICKY_SAVE_DEBOUNCE_MS);
    await flushPromises();
    const stored = await listStickyNotes();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.content).toContain('第一行');
  });

  it('flushAll 立即落盘（切换/关闭/路由/Ctrl+S 共用路径）', async () => {
    await sticky.openNotes();
    sticky.updateActive({ content: '立即保存' });
    await sticky.flushAll();
    expect((await listStickyNotes())[0]?.content).toBe('立即保存');
  });

  it('切换便签前先全量落盘再切换', async () => {
    await sticky.openNotes();
    const first = sticky.notes.value[0]!;
    sticky.updateActive({ content: '第一条内容' });
    const second = await sticky.createNote();
    await sticky.selectNote(second.id);
    expect(sticky.activeId.value).toBe(second.id);
    expect((await listStickyNotes()).find(n => n.id === first.id)?.content).toBe('第一条内容');
  });

  it('删除便签级联删图，活动项移到剩余便签', async () => {
    await sticky.openNotes();
    const a = sticky.notes.value[0]!;
    sticky.updateActive({ content: '![图片](note-img:dimg)' });
    await sticky.flushAll();
    await putStickyNoteImage('dimg', new Blob(['x']));
    const b = await sticky.createNote();
    sticky.updateActive({ content: '第二条' });
    await sticky.flushAll();

    await sticky.deleteNote(a.id);
    expect(sticky.notes.value.map(n => n.id)).toEqual([b.id]);
    expect(sticky.activeId.value).toBe(b.id);
    expect(await listStickyNoteImageIds()).toEqual([]);
    expect(await listStickyNotes()).toHaveLength(1);
  });

  it('已落库便签清空后仍保留在库（不误删）', async () => {
    await sticky.openNotes();
    sticky.updateActive({ content: 'x' });
    await sticky.flushAll();
    sticky.updateActive({ content: '' });
    await sticky.flushAll();
    expect(await listStickyNotes()).toHaveLength(1);
    expect(sticky.notes.value).toHaveLength(1);
  });

  it('从未落库的脏便签清空后本地清除', async () => {
    await sticky.openNotes();
    sticky.updateActive({ content: 'x' });
    sticky.updateActive({ content: '' });
    await sticky.flushAll();
    expect(await listStickyNotes()).toHaveLength(0);
    expect(sticky.notes.value).toHaveLength(0);
    expect(sticky.activeId.value).toBeNull();
  });

  it('保存失败提示且保持脏标记待重试', async () => {
    const errSpy = vi.spyOn(ElMessage, 'error');
    const failing = createMemoryStickyBackend();
    failing.putNote = vi.fn().mockRejectedValue(new Error('quota')) as never;
    sticky.setBackend(failing);
    await sticky.openNotes();
    sticky.updateActive({ content: '保存会失败' });
    await sticky.flushAll();
    expect(errSpy).toHaveBeenCalled();
    expect(await listStickyNotes()).toHaveLength(0);
    expect(sticky.getActive()?.content).toBe('保存会失败');
    errSpy.mockRestore();
  });

  it('reloadNotes 从存储重取并纠正活动项', async () => {
    await sticky.openNotes();
    await putStickyNote(createStickyNote({ content: '外部写入' }));
    await sticky.reloadNotes();
    expect(sticky.notes.value.some(n => n.content === '外部写入')).toBe(true);
    expect(sticky.activeId.value).toBe(sticky.notes.value[0]?.id ?? null);
  });

  it('updateColor/updateSize 走同一条防抖保存', async () => {
    await sticky.openNotes();
    sticky.updateActive({ content: '带颜色' });
    sticky.updateColor('purple');
    sticky.updateSize('large');
    await sticky.flushAll();
    const stored = (await listStickyNotes())[0];
    expect(stored?.color).toBe('purple');
    expect(stored?.size).toBe('large');
  });
});
