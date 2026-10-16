import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  createMemoryStickyBackend,
  createStickyNote,
  deleteStickyNoteCascade,
  getStickyNoteImage,
  listStickyNoteImageIds,
  listStickyNotes,
  putStickyNote,
  putStickyNoteImage,
  setStickyBackend
} from './stickyNoteStore';
import {
  exportNotesArchive,
  importNotesArchive,
  NOTES_ARCHIVE_FORMAT,
  NOTES_ARCHIVE_VERSION,
  parseNotesArchive
} from './exportImport';

async function buildZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  return (await zip.generateAsync({ type: 'arraybuffer' })) as ArrayBuffer;
}

describe('exportImport — 便签导出与导入', () => {
  let createdBlobs: Blob[];

  beforeEach(() => {
    setStickyBackend(createMemoryStickyBackend());
    createdBlobs = [];
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((b: Blob) => {
      createdBlobs.push(b);
      return `blob:zip-${createdBlobs.length}`;
    });
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    setStickyBackend(null);
    vi.restoreAllMocks();
  });

  it('导出→解析→清库→导入 完整往返', async () => {
    const note = createStickyNote({ content: '导出内容首行 ![图片](note-img:e1)' });
    await putStickyNote(note);
    await putStickyNoteImage('e1', new Blob(['img-bytes'], { type: 'image/png' }));
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const outcome = await exportNotesArchive(await listStickyNotes());
    expect(outcome).toBe('saved');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createdBlobs).toHaveLength(1);

    const buffer = await createdBlobs[0]!.arrayBuffer();
    const parsed = await parseNotesArchive(buffer);
    expect(parsed.archive.format).toBe(NOTES_ARCHIVE_FORMAT);
    expect(parsed.archive.version).toBe(NOTES_ARCHIVE_VERSION);
    expect(parsed.archive.notes).toHaveLength(1);
    expect(parsed.archive.notes[0]!.content).toContain('导出内容首行');
    expect(parsed.images.has('e1')).toBe(true);

    await deleteStickyNoteCascade(note.id);
    expect(await listStickyNotes()).toHaveLength(0);
    expect(await listStickyNoteImageIds()).toEqual([]);

    const result = await importNotesArchive(buffer);
    expect(result.notes).toHaveLength(1);
    expect(result.imageCount).toBe(1);
    expect(await listStickyNotes()).toHaveLength(1);
    expect(await listStickyNoteImageIds()).toEqual(['e1']);
    expect(await getStickyNoteImage('e1')).not.toBeNull();
  });

  it('导出只打包被引用的图片，未引用图不进包', async () => {
    await putStickyNote(createStickyNote({ content: '![r](note-img:used)' }));
    await putStickyNoteImage('used', new Blob(['u']));
    await putStickyNoteImage('unused', new Blob(['x']));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    expect(await exportNotesArchive(await listStickyNotes())).toBe('saved');
    const parsed = await parseNotesArchive(await createdBlobs[0]!.arrayBuffer());
    expect([...parsed.images.keys()]).toEqual(['used']);
  });

  it('非 zip 数据报可读错误', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer;
    await expect(parseNotesArchive(garbage)).rejects.toThrow('便签包无法解压');
  });

  it('缺少 notes.json 报可读错误', async () => {
    const buf = await buildZip({ 'readme.txt': 'hi' });
    await expect(parseNotesArchive(buf)).rejects.toThrow('缺少 notes.json');
  });

  it('非本格式 notes.json 报可读错误', async () => {
    const buf = await buildZip({
      'notes.json': JSON.stringify({ format: 'other', version: 1, notes: [] })
    });
    await expect(parseNotesArchive(buf)).rejects.toThrow('不是云砚便签导出文件');
  });

  it('版本过新拒绝导入', async () => {
    const buf = await buildZip({
      'notes.json': JSON.stringify({
        format: NOTES_ARCHIVE_FORMAT,
        version: 99,
        notes: []
      })
    });
    await expect(parseNotesArchive(buf)).rejects.toThrow('版本过新');
  });

  it('便签字段无效报可读错误', async () => {
    const buf = await buildZip({
      'notes.json': JSON.stringify({
        format: NOTES_ARCHIVE_FORMAT,
        version: 1,
        notes: [{ bad: true }]
      })
    });
    await expect(parseNotesArchive(buf)).rejects.toThrow('便签包中的便签字段无效');
  });

  it('非法 color/size 字段归一化为默认值', async () => {
    const buf = await buildZip({
      'notes.json': JSON.stringify({
        format: NOTES_ARCHIVE_FORMAT,
        version: 1,
        notes: [
          {
            id: 'n1',
            content: 'ok',
            color: 'neon',
            size: 'gigantic',
            createdAt: 1,
            updatedAt: 2
          },
          { id: 'n2', content: 'second' }
        ]
      })
    });
    const parsed = await parseNotesArchive(buf);
    expect(parsed.archive.notes[0]!.color).toBe('yellow');
    expect(parsed.archive.notes[0]!.size).toBe('medium');
    expect(parsed.archive.notes[1]!.createdAt).toBeGreaterThan(0);
  });
});
