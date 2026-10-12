export const PPT_TO_PDF_TIMEOUT_MS = 120000;

export type ConvertStage = 'soffice-missing' | 'convert' | 'missing-pdf';

export interface ConvertErrorInfo {
  stage: ConvertStage;
  retryable: boolean;
  message: string;
  originalUrl: string;
}

// impress_pdf_Export FilterOptions：无损压缩嵌入图、JPEG 质量 90、不降分辨率（F5.4 参数调优）
const IMPRESS_PDF_EXPORT_FILTER =
  'pdf:impress_pdf_Export:{"UseLosslessCompression":{"type":"boolean","value":"true"},"Quality":{"type":"long","value":"90"},"ReduceImageResolution":{"type":"boolean","value":"false"}}';

export function buildPptToPdfArgs(outDir: string, pptPath: string): string[] {
  return [
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    '--convert-to',
    IMPRESS_PDF_EXPORT_FILTER,
    '--outdir',
    outDir,
    pptPath
  ];
}

export function buildConvertError(
  stage: ConvertStage,
  retryable: boolean,
  message: string,
  originalUrl: string
): ConvertErrorInfo {
  return { stage, retryable, message, originalUrl };
}

interface ExecLikeError {
  message?: string;
  killed?: boolean;
  signal?: string;
}

export function classifyConvertFailure(err: unknown, originalUrl: string): ConvertErrorInfo {
  const e = (err ?? {}) as ExecLikeError;
  const msg = e.message || String(err);
  if (msg.includes('ENOENT')) {
    return buildConvertError(
      'soffice-missing',
      false,
      '未找到 LibreOffice 转换器，请安装或配置 SOFFICE_PATH',
      originalUrl
    );
  }
  if (e.killed && e.signal === 'SIGTERM') {
    return buildConvertError('convert', true, '转换超时，请重试或拆分课件', originalUrl);
  }
  return buildConvertError('convert', true, `转换失败: ${msg}`, originalUrl);
}
