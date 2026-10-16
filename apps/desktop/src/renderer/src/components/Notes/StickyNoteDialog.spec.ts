import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { ElMessage, ElMessageBox } from 'element-plus';
import JSZip from 'jszip';
import { mountPage } from '@/testing/utils';
import { useStickyNotes } from '@/composables/useStickyNotes';
import StickyNoteDialog from './StickyNoteDialog.vue';
import {
  createMemoryStickyBackend,
  listStickyNoteImageIds,
  listStickyNotes,
  putStickyNoteImage,
  setStickyBackend
} from './stickyNoteStore';
import { MAX_NOTE_CHARS } from './markdownNote';
import { NOTES_ARCHIVE_FORMAT, NOTES_ARCHIVE_VERSION } from './exportImport';

const sticky = useStickyNotes();
let mounted: { unmount: () => void } | null = null;

async function mountDialog() {
  const { wrapper } = await mountPage(StickyNoteDialog, {});
  mounted = wrapper;
  await sticky.openNotes();
  await flushPromises();
  return wrapper;
}

async function pasteImage(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], file: File) {
  const textarea = wrapper.find('textarea');
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      getData: () => ''
    }
  });
  textarea.element.dispatchEvent(ev);
  await flushPromises();
}

describe('StickyNoteDialog — 便签对话框', () => {
  beforeEach(() => {
    setStickyBackend(createMemoryStickyBackend());
    sticky.reset();
    let seq = 0;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(
      () => `blob:mock-${++seq}`
    );
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    sticky.reset();
    setStickyBackend(null);
    vi.restoreAllMocks();
  });

  it('打开自动新建第一条并显示未命名标题', async () => {
    const w = await mountDialog();
    expect(w.findAll('.note-item')).toHaveLength(1);
    expect(w.find('.note-item-title').text()).toBe('未命名便签');
    expect(w.find('textarea').exists()).toBe(true);
    expect(w.find('.note-degraded').exists()).toBe(false);
  });

  it('编辑输入实时联动活动便签与列表标题', async () => {
    const w = await mountDialog();
    await w.find('textarea').setValue('今日要点\n第二行');
    expect(sticky.getActive()?.content).toContain('今日要点');
    expect(w.find('.note-item-title').text()).toBe('今日要点');
  });

  it('超过 2 万字触顶禁输不截断并仅警告一次', async () => {
    const warnSpy = vi.spyOn(ElMessage, 'warning');
    const w = await mountDialog();
    const over = 'x'.repeat(MAX_NOTE_CHARS + 1);
    await w.find('textarea').setValue(over);
    expect(sticky.getActive()?.content).toBe('');
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('');
    await w.find('textarea').setValue(over);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('点击色块切换便签颜色并高亮当前色', async () => {
    const w = await mountDialog();
    const colors = w.findAll('.note-color');
    expect(colors).toHaveLength(6);
    await colors[2]!.trigger('click');
    expect(sticky.getActive()?.color).toBe('blue');
    expect(colors[2]!.classes()).toContain('active');
  });

  it('字号切换与字数统计实时更新', async () => {
    const w = await mountDialog();
    await w.find('textarea').setValue('abc');
    expect(w.find('.note-chars').text()).toContain(`3/${MAX_NOTE_CHARS}`);
    const small = w.findAllComponents({ name: 'ElRadioButton' }).find(c => c.text().includes('小'));
    const smallInput = small!.find('input');
    (smallInput.element as HTMLInputElement).checked = true;
    await smallInput.trigger('change');
    expect(sticky.getActive()?.size).toBe('small');
  });

  it('编辑/预览切换，预览渲染 markdown', async () => {
    const w = await mountDialog();
    await w.find('textarea').setValue('**加粗** 与 [链接](https://a.example)');
    const preview = w
      .findAllComponents({ name: 'ElRadioButton' })
      .find(c => c.text().includes('预览'));
    const previewInput = preview!.find('input');
    (previewInput.element as HTMLInputElement).checked = true;
    await previewInput.trigger('change');
    await flushPromises();
    expect(w.find('textarea').exists()).toBe(false);
    const html = w.find('.note-preview').html();
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<a href="https://a.example"');
  });

  it('预览图片 data-note-img 挂载后注入 blob src', async () => {
    await putStickyNoteImage('pimg', new Blob(['x'], { type: 'image/png' }));
    const w = await mountDialog();
    await w.find('textarea').setValue('![图片](note-img:pimg)');
    await flushPromises();
    const img = w.find('.note-preview img[data-note-img="pimg"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toContain('blob:mock-');
  });

  it('粘贴图片插入引用（端到端注入）', async () => {
    const w = await mountDialog();
    const file = new File([new Uint8Array([137, 80])], 'p.png', { type: 'image/png' });
    await pasteImage(w, file);
    expect(sticky.getActive()?.content).toContain('![图片](note-img:');
    expect(await listStickyNoteImageIds()).toHaveLength(1);
  });

  it('拖放图片插入引用', async () => {
    const w = await mountDialog();
    const file = new File([new Uint8Array([1])], 'd.png', { type: 'image/png' });
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } });
    w.find('.note-layout').element.dispatchEvent(ev);
    await flushPromises();
    expect(sticky.getActive()?.content).toContain('note-img:');
    expect(await listStickyNoteImageIds()).toHaveLength(1);
  });

  it('图片按钮选择文件插入引用', async () => {
    const w = await mountDialog();
    const file = new File([new Uint8Array([2])], 'f.png', { type: 'image/png' });
    const input = w.find('input[accept="image/*"]');
    expect(input.exists()).toBe(true);
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
    expect(sticky.getActive()?.content).toContain('note-img:');
    expect(await listStickyNoteImageIds()).toHaveLength(1);
  });

  it('Ctrl+S 立即落盘，Esc 关闭并落盘', async () => {
    const w = await mountDialog();
    await w.find('textarea').setValue('要保存的内容');

    const saveEvt = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(saveEvt);
    await flushPromises();
    expect(saveEvt.defaultPrevented).toBe(true);
    expect((await listStickyNotes())[0]?.content).toBe('要保存的内容');

    const escEvt = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(escEvt);
    await flushPromises();
    expect(sticky.open.value).toBe(false);
    expect((await listStickyNotes())[0]?.content).toBe('要保存的内容');
  });

  it('危险键隔离：编辑区内不拦截，非输入区拦截', async () => {
    const w = await mountDialog();
    const inEditor = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
      cancelable: true
    });
    w.find('textarea').element.dispatchEvent(inEditor);
    expect(inEditor.defaultPrevented).toBe(false);

    const onBody = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    document.body.dispatchEvent(onBody);
    expect(onBody.defaultPrevented).toBe(true);

    const undo = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    document.body.dispatchEvent(undo);
    expect(undo.defaultPrevented).toBe(true);
  });

  it('删除确认后删除并自动补新建空便签', async () => {
    const boxed = ElMessageBox as unknown as {
      confirm: (message?: string, title?: string, opts?: unknown) => Promise<unknown>;
    };
    const confirmSpy = vi.spyOn(boxed, 'confirm').mockResolvedValue('confirm');
    const w = await mountDialog();
    await w.find('textarea').setValue('待删除内容');
    await w.find('.note-item-delete').trigger('click');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalled();
    expect(await listStickyNotes()).toHaveLength(0);
    expect(sticky.notes.value).toHaveLength(1);
    expect(sticky.notes.value[0]!.content).toBe('');
  });

  it('导出按钮打包当前便签为 zip 并提示成功', async () => {
    const successSpy = vi.spyOn(ElMessage, 'success');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const w = await mountDialog();
    await w.find('textarea').setValue('导出我');
    const btn = w.findAll('button').find(b => b.text().includes('导出'));
    await btn!.trigger('click');
    await vi.waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('已导出'));
    });
    expect((await listStickyNotes())[0]?.content).toBe('导出我');
  });

  it('导入按钮从 zip 恢复便签', async () => {
    const successSpy = vi.spyOn(ElMessage, 'success');
    const zip = new JSZip();
    zip.file(
      'notes.json',
      JSON.stringify({
        format: NOTES_ARCHIVE_FORMAT,
        version: NOTES_ARCHIVE_VERSION,
        exportedAt: Date.now(),
        notes: [
          {
            id: 'imp1',
            content: '导入的便签',
            color: 'green',
            size: 'small',
            createdAt: 1,
            updatedAt: 2
          }
        ]
      })
    );
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const w = await mountDialog();
    const input = w.find('input[accept=".zip,application/zip"]');
    expect(input.exists()).toBe(true);
    const file = new File([buffer], 'notes.zip', { type: 'application/zip' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await vi.waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('已导入 1 条便签'));
    });
    expect(sticky.notes.value.some(n => n.content === '导入的便签')).toBe(true);
  });

  it('IndexedDB 不可用时显示降级常驻提示', async () => {
    setStickyBackend(null);
    const w = await mountDialog();
    expect(w.find('.note-degraded').exists()).toBe(true);
  });
});
