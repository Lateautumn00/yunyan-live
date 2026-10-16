import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryStickyBackend,
  putStickyNoteImage,
  setStickyBackend
} from '@/components/Notes/stickyNoteStore';
import { useStickyNoteImages } from './useStickyNoteImages';

describe('useStickyNoteImages — blob URL 生命周期', () => {
  const images = useStickyNoteImages();
  let seq = 0;

  beforeEach(() => {
    setStickyBackend(createMemoryStickyBackend());
    seq = 0;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(
      () => `blob:mock-${++seq}`
    );
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    images.reset();
    vi.mocked(URL.createObjectURL).mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
  });

  afterEach(() => {
    setStickyBackend(null);
  });

  it('ensureFor 为引用图片创建 blob URL，重复调用不重复创建', async () => {
    await putStickyNoteImage('i1', new Blob(['a'], { type: 'image/png' }));
    await images.ensureFor('![图片](note-img:i1)');
    expect(images.hasUrl('i1')).toBe(true);
    await images.ensureFor('![图片](note-img:i1)');
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledTimes(1);
  });

  it('缺失图片静默跳过（不抛错、不建 URL）', async () => {
    await expect(images.ensureFor('![图片](note-img:ghost)')).resolves.toBeUndefined();
    expect(images.hasUrl('ghost')).toBe(false);
  });

  it('applyTo 注入 src；引用缺失的图片隐藏', async () => {
    await putStickyNoteImage('i2', new Blob(['b'], { type: 'image/png' }));
    await images.ensureFor('![图片](note-img:i2)');
    const root = document.createElement('div');
    root.innerHTML = '<img data-note-img="i2" alt="x"><img data-note-img="ghost" alt="y">';
    images.applyTo(root);
    const [hit, miss] = Array.from(root.querySelectorAll('img'));
    expect(hit?.getAttribute('src')).toBe('blob:mock-1');
    expect(miss?.style.display).toBe('none');
  });

  it('applyTo 传 null 安全无操作', () => {
    expect(() => images.applyTo(null)).not.toThrow();
  });

  it('revokeStale 只回收新内容不再引用的 URL', async () => {
    await putStickyNoteImage('i3', new Blob(['c']));
    await putStickyNoteImage('i4', new Blob(['d']));
    await images.ensureFor('![a](note-img:i3) ![b](note-img:i4)');
    expect(images.hasUrl('i3')).toBe(true);
    expect(images.hasUrl('i4')).toBe(true);
    images.revokeStale('![a](note-img:i3)');
    expect(images.hasUrl('i3')).toBe(true);
    expect(images.hasUrl('i4')).toBe(false);
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1);
  });

  it('revokeAll 全量回收并清空缓存', async () => {
    await putStickyNoteImage('i5', new Blob(['e']));
    await images.ensureFor('![x](note-img:i5)');
    images.revokeAll();
    expect(images.hasUrl('i5')).toBe(false);
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1);
  });
});
