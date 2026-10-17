import 'reflect-metadata';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { JwtAuthGuard } from '@yunyan-live/nest-shared';
import { UploadController } from './upload.controller';
import { buildPptToPdfArgs, PPT_TO_PDF_TIMEOUT_MS } from './ppt-convert';

const h = vi.hoisted(() => ({
  present: new Set<string>(),
  mkdir: [] as Array<{ dir: string; opts?: { recursive?: boolean } }>,
  written: [] as string[],
  exec: [] as Array<{ file: string; args: string[]; opts?: { timeout?: number } }>,
  execError: null as Error | null,
  producePdf: false,
  pdfSize: 1024
}));

vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: string) => h.present.has(p),
    mkdirSync: (p: string, opts?: { recursive?: boolean }) => {
      h.mkdir.push({ dir: p, opts });
    },
    writeFileSync: (p: string) => {
      h.written.push(p);
    },
    statSync: (p: string) => ({ size: p.endsWith('.pdf') ? h.pdfSize : 1 })
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
  // S3：固定签名密钥，避免随机密钥 warn 与跨用例 URL 漂移
  process.env.UPLOAD_SIGNING_SECRET = 'upload-sign-spec-secret-fixed';
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
  h.pdfSize = 1024;
  delete process.env.BASE_URL;
  delete process.env.SOFFICE_PATH;
});

afterEach(() => {
  process.env = { ...originalEnv };
  process.env.UPLOAD_SIGNING_SECRET = 'upload-sign-spec-secret-fixed';
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
    expect(h.written[0]).toMatch(new RegExp(`[\\\\/]images[\\\\/]\\d+-[0-9a-f]{16}\\.png$`));
    expect(res.fileUrl).toMatch(
      /^http:\/\/localhost:3001\/uploads\/[A-Za-z0-9_-]{22}\/images\/\d+-[0-9a-f]{16}\.png$/
    );
  });

  it('目录已存在不重复创建，BASE_URL 可覆盖', () => {
    process.env.BASE_URL = 'https://cdn.example.com';
    h.present.add(IMAGES);
    const controller = new UploadController();
    const res = controller.uploadImage(makeFile('b.jpeg', 'image/jpeg'));
    expect(h.mkdir).toHaveLength(0);
    expect(res.fileUrl).toMatch(
      /^https:\/\/cdn\.example\.com\/uploads\/[A-Za-z0-9_-]{22}\/images\/\d+-[0-9a-f]{16}\.jpeg$/
    );
  });
});

describe('UploadController.uploadPPT', () => {
  it('缺文件抛 400', async () => {
    const controller = new UploadController();
    await expect(controller.uploadPPT(undefined as never)).rejects.toThrow('请选择文件');
    expect(h.exec).toHaveLength(0);
  });

  it('上传 0 字节文件抛 400，不落盘不转换', async () => {
    const controller = new UploadController();
    const empty = {
      ...makeFile('deck.pptx', 'application/vnd.ms-powerpoint'),
      buffer: Buffer.alloc(0),
      size: 0
    };
    await expect(controller.uploadPPT(empty)).rejects.toThrow('文件内容为空');
    expect(h.written).toHaveLength(0);
    expect(h.exec).toHaveLength(0);
  });

  it('转换成功返回 PDF 地址，携带默认超时参数', async () => {
    h.producePdf = true;
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(h.mkdir).toEqual([{ dir: PPT_DIR, opts: { recursive: true } }]);
    expect(h.written).toHaveLength(1);
    expect(h.written[0]).toMatch(new RegExp(`[\\\\/]ppt[\\\\/]\\d+-[0-9a-f]{16}\\.pptx$`));
    expect(h.exec).toHaveLength(1);
    const call = h.exec[0];
    expect(call?.file).toBe(
      process.env.SOFFICE_PATH ||
        (process.platform === 'win32'
          ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
          : 'soffice')
    );
    expect(call?.opts).toEqual({ timeout: PPT_TO_PDF_TIMEOUT_MS });
    expect(call?.args).toEqual(buildPptToPdfArgs(PPT_DIR, h.written[0] as string));
    expect(res.fileUrl).toMatch(
      /^http:\/\/localhost:3001\/uploads\/[A-Za-z0-9_-]{22}\/ppt\/\d+-[0-9a-f]{16}\.pdf$/
    );
  });

  it('SOFFICE_PATH 环境变量覆盖转换器路径', async () => {
    process.env.SOFFICE_PATH = '/opt/custom/soffice';
    h.producePdf = true;
    const controller = new UploadController();
    await controller.uploadPPT(makeFile('deck.ppt', 'application/vnd.ms-powerpoint'));
    expect(h.exec[0]?.file).toBe('/opt/custom/soffice');
  });

  it('转换进程失败返回判别对象 convertError（convert/可重试）', async () => {
    h.execError = new Error('spawn failed');
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res.fileUrl).toBe('');
    expect(res.convertError?.stage).toBe('convert');
    expect(res.convertError?.retryable).toBe(true);
    expect(res.convertError?.message).toContain('spawn failed');
    expect(res.convertError?.originalUrl).toMatch(
      /^http:\/\/localhost:3001\/uploads\/[A-Za-z0-9_-]{22}\/ppt\/\d+-[0-9a-f]{16}\.pptx$/
    );
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'PPT转PDF失败: spawn failed',
      expect.anything()
    );
  });

  it('转换成功但未生成 PDF 返回 missing-pdf（不可重试）', async () => {
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res.fileUrl).toBe('');
    expect(res.convertError?.stage).toBe('missing-pdf');
    expect(res.convertError?.retryable).toBe(false);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'PPT转PDF失败: 未生成有效 PDF 文件',
      expect.anything()
    );
  });

  it('PDF 产物 0 字节按 missing-pdf 处理', async () => {
    h.producePdf = true;
    h.pdfSize = 0;
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res.fileUrl).toBe('');
    expect(res.convertError?.stage).toBe('missing-pdf');
    expect(res.convertError?.retryable).toBe(false);
  });

  it('ENOENT 返回 soffice-missing 且附原文件地址', async () => {
    h.execError = new Error('spawn soffice ENOENT');
    const controller = new UploadController();
    const res = await controller.uploadPPT(makeFile('deck.pptx', 'application/vnd.ms-powerpoint'));
    expect(res.fileUrl).toBe('');
    expect(res.convertError?.stage).toBe('soffice-missing');
    expect(res.convertError?.retryable).toBe(false);
    expect(res.convertError?.originalUrl).toMatch(/\.pptx$/);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      '未找到 LibreOffice，请安装或配置 SOFFICE_PATH'
    );
  });
});

describe('S3 写入侧鉴权（回归守卫：端点不可回退为匿名）', () => {
  it('uploadImage 挂 JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', UploadController.prototype.uploadImage);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('uploadPPT 挂 JwtAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', UploadController.prototype.uploadPPT);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });
});
