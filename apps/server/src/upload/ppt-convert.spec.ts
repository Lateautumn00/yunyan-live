import { describe, expect, it } from 'vitest';
import {
  buildPptToPdfArgs,
  buildConvertError,
  classifyConvertFailure,
  PPT_TO_PDF_TIMEOUT_MS,
  type ConvertErrorInfo
} from './ppt-convert';

describe('ppt-convert', () => {
  it('buildPptToPdfArgs 使用 impress_pdf_Export 与保真 FilterOptions + headless 硬化参数', () => {
    expect(buildPptToPdfArgs('/tmp/out', '/tmp/a.pptx')).toEqual([
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to',
      'pdf:impress_pdf_Export:{"UseLosslessCompression":{"type":"boolean","value":"true"},"Quality":{"type":"long","value":"90"},"ReduceImageResolution":{"type":"boolean","value":"false"}}',
      '--outdir',
      '/tmp/out',
      '/tmp/a.pptx'
    ]);
  });

  it('PPT_TO_PDF_TIMEOUT_MS allows slow LibreOffice conversions', () => {
    expect(PPT_TO_PDF_TIMEOUT_MS).toBe(120000);
  });
});

describe('buildConvertError', () => {
  it('组装完整判别对象', () => {
    const info = buildConvertError(
      'convert',
      true,
      '转换超时，请重试或拆分课件',
      'http://h/uploads/ppt/1.pptx'
    );
    expect(info).toEqual({
      stage: 'convert',
      retryable: true,
      message: '转换超时，请重试或拆分课件',
      originalUrl: 'http://h/uploads/ppt/1.pptx'
    });
  });
});

describe('classifyConvertFailure（F5.4 失败归类）', () => {
  const ORIGINAL = 'http://h/uploads/ppt/9.pptx';

  it('ENOENT → soffice-missing 且不可重试', () => {
    const info = classifyConvertFailure(new Error('spawn soffice ENOENT'), ORIGINAL);
    expect(info.stage).toBe('soffice-missing');
    expect(info.retryable).toBe(false);
    expect(info.message).toContain('SOFFICE_PATH');
    expect(info.originalUrl).toBe(ORIGINAL);
  });

  it('进程被超时杀死（killed+SIGTERM）→ convert 且可重试', () => {
    const err = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' });
    const info = classifyConvertFailure(err, ORIGINAL);
    expect(info.stage).toBe('convert');
    expect(info.retryable).toBe(true);
    expect(info.message).toContain('超时');
  });

  it('其他转换失败 → convert 可重试并透传原因', () => {
    const info = classifyConvertFailure(new Error('spawn failed'), ORIGINAL);
    expect(info.stage).toBe('convert');
    expect(info.retryable).toBe(true);
    expect(info.message).toContain('spawn failed');
  });

  it('非 Error 输入不抛异常', () => {
    const info = classifyConvertFailure('weird', ORIGINAL);
    expect(info.stage).toBe('convert');
    expect(info.retryable).toBe(true);
  });

  it('返回类型满足 ConvertErrorInfo 契约', () => {
    const info: ConvertErrorInfo = classifyConvertFailure(new Error('x'), ORIGINAL);
    expect(Object.keys(info).sort()).toEqual(['message', 'originalUrl', 'retryable', 'stage']);
  });
});
