/**
 * 从任意错误值提取可展示的错误信息。
 * 兼容 `Error.message`、API 信封 `{ code, msg }`、`{ message }` 三种形态。
 */
export function extractErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message) {
      return e.message;
    }
    if (typeof e.msg === 'string' && e.msg) {
      return e.msg;
    }
  }
  return fallback;
}
