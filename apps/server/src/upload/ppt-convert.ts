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
  stderr?: string | Buffer;
  stdout?: string | Buffer;
}

function toText(v: string | Buffer | undefined): string {
  if (!v) return '';
  return typeof v === 'string' ? v : v.toString();
}

// libreoffice-impress 缺失或文件损坏时 soffice 输出此错误（非瞬时故障，重试无意义）
const SOURCE_FILE_UNLOADABLE = /source file could not be loaded/i;

export function classifyConvertFailure(err: unknown, originalUrl: string): ConvertErrorInfo {
  const e = (err ?? {}) as ExecLikeError;
  const msg = e.message || String(err);
  const detail = `${msg}\n${toText(e.stderr)}\n${toText(e.stdout)}`;
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
  if (SOURCE_FILE_UNLOADABLE.test(detail)) {
    return buildConvertError(
      'convert',
      false,
      '课件无法解析：文件可能损坏，或服务器缺少 LibreOffice Impress 导入组件',
      originalUrl
    );
  }
  return buildConvertError('convert', true, `转换失败: ${msg}`, originalUrl);
}
