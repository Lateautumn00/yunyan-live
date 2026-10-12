import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { ok } from '@/testing/utils';
import CoursewareUpload from '@/components/teacher/CoursewareUpload.vue';
import { PptConvertError } from '@/components/ClassRoom/whiteboard/pptConvertError';

enableAutoUnmount(afterEach);

const mocks = vi.hoisted(() => ({
  saveCourseware: vi.fn(),
  coursewareList: vi.fn(),
  deleteCourseware: vi.fn(),
  uploadPptFile: vi.fn(),
  loadPptMeta: vi.fn()
}));

vi.mock('@/api/backstage', () => ({
  default: {
    save_courseware: (params: unknown) => mocks.saveCourseware(params),
    courseware_list: (params: unknown) => mocks.coursewareList(params),
    delete_courseware: (params: unknown) => mocks.deleteCourseware(params)
  }
}));

// pdf.js 管线在单测中不可用，mock 整个 pptImport（组件只用 upload/load 两个函数）
vi.mock('@/components/ClassRoom/whiteboard/pptImport', () => ({
  uploadPptFile: (api: string, file: File) => mocks.uploadPptFile(api, file),
  loadPptMeta: (url: string) => mocks.loadPptMeta(url)
}));

const listItem = {
  id: 'cw1',
  filename: '课前预习',
  filext: 'pptx',
  filesize: 2048,
  fileUrl: 'http://mock.test/ppt/deck.pdf'
};

function bodyText() {
  return document.body.textContent ?? '';
}

async function mountUpload() {
  const wrapper = mount(CoursewareUpload, {
    props: { modelValue: false, roomId: 'R1' },
    global: { plugins: [ElementPlus] },
    attachTo: document.body
  });
  return wrapper;
}

async function openDialog(wrapper: VueWrapper) {
  await wrapper.setProps({ modelValue: true });
  await flushPromises();
}

function pickFile(name: string) {
  const input = document.body.querySelector('input[accept=".ppt,.pptx"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  const file = new File(['x'], name, {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  return { input, file };
}

beforeEach(() => {
  // uploadPptApi 在 setup()（mount 时）求值，测试环境无 .env.test
  vi.stubEnv('VITE_UPLOAD_PPT_URL', 'http://mock.test/ppt');
  mocks.coursewareList.mockResolvedValue(ok({ list: [listItem], pageInfo: { totalElements: 1 } }));
  mocks.saveCourseware.mockResolvedValue(ok(null));
  mocks.deleteCourseware.mockResolvedValue(ok(null));
  mocks.uploadPptFile.mockResolvedValue('http://mock.test/ppt/deck.pdf');
  mocks.loadPptMeta.mockResolvedValue({ numPages: 2, dims: [{ w: 1000, h: 500 }] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('components/teacher/CoursewareUpload.vue', () => {
  it('打开弹窗时按 roomId 拉取课件列表并渲染', async () => {
    const wrapper = await mountUpload();
    expect(mocks.coursewareList).not.toHaveBeenCalled();
    await openDialog(wrapper);
    expect(mocks.coursewareList).toHaveBeenCalledWith('R1');
    expect(bodyText()).toContain('课前预习');
    wrapper.unmount();
  });

  it('非 ppt/pptx 扩展名直接拒绝，不触发上传', async () => {
    const wrapper = await mountUpload();
    await openDialog(wrapper);
    const { input } = pickFile('讲义.pdf');
    await input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(mocks.uploadPptFile).not.toHaveBeenCalled();
    expect(mocks.saveCourseware).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('上传成功：校验 PDF 后 save_courseware 并刷新列表', async () => {
    const wrapper = await mountUpload();
    await openDialog(wrapper);
    const { input, file } = pickFile('新课件.pptx');
    await input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(mocks.uploadPptFile).toHaveBeenCalledWith('http://mock.test/ppt', file);
    expect(mocks.loadPptMeta).toHaveBeenCalledWith('http://mock.test/ppt/deck.pdf');
    expect(mocks.saveCourseware).toHaveBeenCalledWith({
      roomId: 'R1',
      filename: '新课件',
      filext: 'pptx',
      filesize: file.size,
      fileUrl: 'http://mock.test/ppt/deck.pdf'
    });
    // 上传后刷新列表（第 2 次拉取）
    expect(mocks.coursewareList).toHaveBeenCalledTimes(2);
    expect(bodyText()).toContain('课件已上传');
    wrapper.unmount();
  });

  it('上传失败：展示错误且不登记课件', async () => {
    mocks.uploadPptFile.mockRejectedValue(new Error('PPT上传失败: 500 Internal'));
    const wrapper = await mountUpload();
    await openDialog(wrapper);
    const { input } = pickFile('坏文件.pptx');
    await input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(mocks.saveCourseware).not.toHaveBeenCalled();
    expect(mocks.loadPptMeta).not.toHaveBeenCalled();
    expect(bodyText()).toContain('PPT上传失败: 500 Internal');
    wrapper.unmount();
  });

  it('删除确认后调用 delete_courseware 并刷新列表', async () => {
    // ElMessageBox 是可调用对象，直接 spy 其 confirm 属性会走函数重载，需先收窄为普通对象类型
    const boxed = ElMessageBox as unknown as { confirm: (message?: string) => Promise<unknown> };
    const confirmSpy = vi.spyOn(boxed, 'confirm').mockResolvedValue('confirm');
    try {
      const wrapper = await mountUpload();
      await openDialog(wrapper);
      const delBtn = Array.from(document.body.querySelectorAll('button')).find(b =>
        (b.textContent ?? '').includes('删除')
      );
      expect(delBtn).toBeTruthy();
      delBtn!.click();
      await flushPromises();
      expect(confirmSpy).toHaveBeenCalled();
      expect(mocks.deleteCourseware).toHaveBeenCalledWith('cw1');
      expect(mocks.coursewareList).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('条目缺少ID时不调用删除接口，直接提示', async () => {
    // 不能用 id:''（会让删除按钮进入 loading 被禁用），直接省略 id 字段模拟脏数据
    mocks.coursewareList.mockResolvedValue(
      ok({
        list: [
          {
            filename: '无ID课件',
            filext: 'pptx',
            filesize: 1,
            fileUrl: 'http://mock.test/ppt/x.pdf'
          }
        ],
        pageInfo: { totalElements: 1 }
      })
    );
    const wrapper = await mountUpload();
    await openDialog(wrapper);
    const delBtn = Array.from(document.body.querySelectorAll('button')).find(b =>
      (b.textContent ?? '').includes('删除')
    );
    expect(delBtn).toBeTruthy();
    delBtn!.click();
    await flushPromises();
    expect(mocks.deleteCourseware).not.toHaveBeenCalled();
    expect(bodyText()).toContain('缺少ID');
    wrapper.unmount();
  });
});

describe('CoursewareUpload 转换失败降级（F5.4）', () => {
  it('convertError：展示转换错误文案且不登记课件', async () => {
    mocks.uploadPptFile.mockRejectedValue(
      new PptConvertError({
        stage: 'convert',
        retryable: true,
        message: '转换超时，请重试或拆分课件',
        originalUrl: 'http://mock.test/ppt/1.pptx'
      })
    );
    const wrapper = await mountUpload();
    await openDialog(wrapper);
    const { input } = pickFile('超时课件.pptx');
    await input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(mocks.saveCourseware).not.toHaveBeenCalled();
    expect(mocks.loadPptMeta).not.toHaveBeenCalled();
    expect(bodyText()).toContain('课件转换失败');
    expect(bodyText()).toContain('转换超时');
    wrapper.unmount();
  });

  it('convertError 带原文件：确认后打开 originalUrl', async () => {
    const boxed = ElMessageBox as unknown as { confirm: (message?: string) => Promise<unknown> };
    const confirmSpy = vi.spyOn(boxed, 'confirm').mockResolvedValue('confirm');
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    try {
      mocks.uploadPptFile.mockRejectedValue(
        new PptConvertError({
          stage: 'soffice-missing',
          retryable: false,
          message: '未找到 LibreOffice 转换器，请安装或配置 SOFFICE_PATH',
          originalUrl: 'http://mock.test/ppt/orig.pptx'
        })
      );
      const wrapper = await mountUpload();
      await openDialog(wrapper);
      const { input } = pickFile('缺转换器.pptx');
      await input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
      expect(confirmSpy).toHaveBeenCalled();
      expect(String(confirmSpy.mock.calls[0]?.[0] ?? '')).toContain('原');
      expect(openSpy).toHaveBeenCalledWith('http://mock.test/ppt/orig.pptx', '_blank');
      wrapper.unmount();
    } finally {
      confirmSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('convertError 无原文件地址：不弹确认框', async () => {
    const boxed = ElMessageBox as unknown as { confirm: (message?: string) => Promise<unknown> };
    const confirmSpy = vi.spyOn(boxed, 'confirm').mockResolvedValue('confirm');
    try {
      mocks.uploadPptFile.mockRejectedValue(
        new PptConvertError({
          stage: 'convert',
          retryable: true,
          message: '转换失败: boom',
          originalUrl: ''
        })
      );
      const wrapper = await mountUpload();
      await openDialog(wrapper);
      const { input } = pickFile('坏课件.pptx');
      await input.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(bodyText()).toContain('课件转换失败');
      wrapper.unmount();
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
