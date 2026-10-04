import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { UploadController } from './upload.controller';
import { buildPptToPdfArgs, PPT_TO_PDF_TIMEOUT_MS } from './ppt-convert';

const h = vi.hoisted(() => ({
  present: new Set<string>(),
  mkdir: [] as Array<{ dir: string; opts?: { recursive?: boolean } }>,
  written: [] as string[],
  exec: [] as Array<{ file: string; args: string[]; opts?: { timeout?: number } }>,
  execError: null as Error | null,
  producePdf: false
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: string) => h.present.has(p),
    mkdirSync: (p: string, opts?: { recursive?: boolean }) => {
      h.mkdir.push({ dir: p, opts });
    },
    writeFileSync: (p: string) => {
      h.written.push(p);
    }
  };
});

vi.mock('child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    opts: { timeout?: number },
    cb: (err: Error | null, stdout?: string, stderr?: string) => void
  ) => {
    h.exec.push({ file, args, opts });
    if (h.producePdf) {
      const ppt = h.written[h.written.length - 1];
      if (ppt) h.present.add(ppt.replace(/\.(pptx?)$/i, '.pdf'));
    }
    if (h.execError) cb(h.execError);
    else cb(null, 'ok', '');
  }
}));

const UP = join(process.cwd(), 'uploads');
const IMAGES = join(UP, 'images');
const PPT_DIR = join(UP, 'ppt');
const originalEnv = { ...process.env };

function makeFile(originalname: string, mimetype: string) {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    buffer: Buffer.from('x'),
    size: 1
  };
}

beforeAll(() => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

beforeEach(() => {
  h.present.clear();
  h.mkdir.length = 0;
  h.written.length = 0;
  h.exec.length = 0;
  h.execError = null;
  h.producePdf = false;
  delete process.env.BASE_URL;
  delete process.env.SOFFICE_PATH;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe('UploadController.uploadImage', () => {
  it('缺文件抛 400', () => {
    const controller = new UploadController();
    expect(() => controller.uploadImage(undefined as never)).toThrow('请选择文件');
    expect(h.written).toHaveLength(0);
  });

  it('目录不存在时递归创建并落盘，返回默认 BASE_URL', () => {
    const controller = new UploadController();
    const res = controller.uploadImage(makeFile('a.png', 'image/png'));
    expect(h.mkdir).toEqual([{ dir: IMAGES, opts: { recursive: true } }]);
    expect(h.written).toHaveLength(1);
    expect(h.written[0]).toMatch(new RegExp(`[\\\\/]images[\\\\/]\\d+-\\d+\\.png$`));
    expect(res.fileUrl).toMatch(/^http:\/\/localhost:3001\/uploads\/images\/\d+-\d+\.png$/);
  });

  it('目录已存在不重复创建，BASE_URL 可覆盖', () => {
    process.env.BASE_URL = 'https://cdn.example.com';
    h.present.add(IMAGES);
    const controller = new UploadController();
    const res = controller.uploadImage(makeFile('b.jpeg', 'image/jpeg'));
    expect(h.mkdir).toHaveLength(0);
    expect(res.fileUrl).toMatch(/^https:\/\/cdn\.example\.com\/uploads\/images\/\d+-\d+\.jpeg$/);
  });
});

describe('UploadController.uploadPPT', () => {
  it('缺文件抛 400', async () => {
    const controller = new UploadController();
    await expect(controller.uploadPPT(undefined as never)).rejects.toThrow('请选择文件');
    expect(h.exec).toHaveLength(0);
  });

  it('转换成功返回 PDF 地址，携带默认超时参数', async () => {
    h.producePdf = true;
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(h.mkdir).toEqual([{ dir: PPT_DIR, opts: { recursive: true } }]);
    expect(h.written).toHaveLength(1);
    expect(h.written[0]).toMatch(new RegExp(`[\\\\/]ppt[\\\\/]\\d+-\\d+\\.pptx$`));
    expect(h.exec).toHaveLength(1);
    const call = h.exec[0];
    expect(call?.file).toBe(process.env.SOFFICE_PATH || (process.platform === 'win32'
      ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
      : 'soffice'));
    expect(call?.opts).toEqual({ timeout: PPT_TO_PDF_TIMEOUT_MS });
    expect(call?.args).toEqual(buildPptToPdfArgs(PPT_DIR, h.written[0] as string));
    expect(res.fileUrl).toMatch(/^http:\/\/localhost:3001\/uploads\/ppt\/\d+-\d+\.pdf$/);
  });

  it('SOFFICE_PATH 环境变量覆盖转换器路径', async () => {
    process.env.SOFFICE_PATH = '/opt/custom/soffice';
    h.producePdf = true;
    const controller = new UploadController();
    await controller.uploadPPT(makeFile('deck.ppt', 'application/vnd.ms-powerpoint'));
    expect(h.exec[0]?.file).toBe('/opt/custom/soffice');
  });

  it('转换进程失败返回空 fileUrl', async () => {
    h.execError = new Error('spawn failed');
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res).toEqual({ fileUrl: '' });
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'PPT转PDF失败: spawn failed',
      expect.anything()
    );
  });

  it('转换成功但未生成 PDF 返回空 fileUrl', async () => {
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res).toEqual({ fileUrl: '' });
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'PPT转PDF失败: LibreOffice 未生成 PDF 文件',
      expect.anything()
    );
  });

  it('ENOENT 额外记录 LibreOffice 缺失提示', async () => {
    h.execError = new Error('spawn soffice ENOENT');
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res).toEqual({ fileUrl: '' });
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      '未找到 LibreOffice，请安装或配置 SOFFICE_PATH'
    );
  });
});
