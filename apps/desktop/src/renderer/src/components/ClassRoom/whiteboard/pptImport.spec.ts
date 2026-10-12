import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadPptFile } from './pptImport';
import { PptConvertError } from './pptConvertError';

// pdfAsset 顶层拉起 pdfjs + ?worker，纯 HTTP 分支测试无须真实管线
vi.mock('./pdfAsset', () => ({
  getPdfPageCount: vi.fn(),
  getPdfPageDims: vi.fn()
}));

const API = 'http://mock.test/ppt';

function jsonRes(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadPptFile（F5.4 转换失败契约）', () => {
  it('convertError 分支：抛 PptConvertError 保留 stage/retryable/originalUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonRes({
        code: 1000,
        msg: 'success',
        data: {
          fileUrl: '',
          convertError: {
            stage: 'soffice-missing',
            retryable: false,
            message: '未找到 LibreOffice 转换器，请安装或配置 SOFFICE_PATH',
            originalUrl: 'http://mock.test/ppt/1.pptx'
          }
        }
      })
    );
    const err = (await uploadPptFile(API, new File(['x'], 'a.pptx')).catch(
      e => e
    )) as PptConvertError;
    expect(err).toBeInstanceOf(PptConvertError);
    expect(err.stage).toBe('soffice-missing');
    expect(err.retryable).toBe(false);
    expect(err.originalUrl).toBe('http://mock.test/ppt/1.pptx');
    expect(err.detail).toContain('未找到 LibreOffice');
    expect(err.message).toContain('PPT上传失败');
  });

  it('旧契约：空 fileUrl 无 convertError → 通用 PPT上传失败', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonRes({ code: 1000, msg: 'success', data: { fileUrl: '' } })
    );
    await expect(uploadPptFile(API, new File(['x'], 'a.pptx'))).rejects.toThrow('PPT上传失败');
  });

  it('HTTP 非 2xx：保留状态码文案', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonRes(null, false, 500, 'Internal'));
    await expect(uploadPptFile(API, new File(['x'], 'a.pptx'))).rejects.toThrow('PPT上传失败: 500');
  });

  it('成功：返回 fileUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonRes({ code: 1000, msg: 'success', data: { fileUrl: 'http://mock.test/ppt/deck.pdf' } })
    );
    await expect(uploadPptFile(API, new File(['x'], 'a.pptx'))).resolves.toBe(
      'http://mock.test/ppt/deck.pdf'
    );
  });

  it('未配置 api：直接抛错', async () => {
    await expect(uploadPptFile('', new File(['x'], 'a.pptx'))).rejects.toThrow('未配置PPT上传接口');
    expect(fetch).not.toHaveBeenCalled();
  });
});
