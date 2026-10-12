export interface PptConvertErrorInfo {
  stage: string;
  retryable: boolean;
  message: string;
  originalUrl: string;
}

// PPT→PDF 转换失败的结构化错误（F5.4）：
// stage/retryable 供上端决定提示与重试策略，originalUrl 指向已落盘的原 PPT（下载兜底）
export class PptConvertError extends Error {
  readonly stage: string;
  readonly retryable: boolean;
  readonly originalUrl: string;
  /** 可直接展示的失败描述（不含网络层前缀） */
  readonly detail: string;

  constructor(info: PptConvertErrorInfo, options?: { cause?: unknown }) {
    super(`PPT上传失败: ${info.message}`, options);
    this.name = 'PptConvertError';
    this.stage = info.stage;
    this.retryable = info.retryable;
    this.originalUrl = info.originalUrl;
    this.detail = info.message;
  }
}
