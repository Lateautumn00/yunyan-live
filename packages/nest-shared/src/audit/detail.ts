/**
 * S12 detail 白名单脱敏 —— 唯一漏斗：publisher 入口强制过这里。
 * 规则：
 * 1. allowedKeys 给定时只保留顶层这些键（调用侧按记录点显式收口）；
 * 2. 任意深度删除敏感键（token/密码/验证码/session/sid…，比较前剥非字母数字并小写）；
 * 3. 递归深度超限分支整体丢弃；序列化超长替换为 { _truncated: true }（宁可截断不可丢事件）。
 */
export const SENSITIVE_DETAIL_KEYS: ReadonlySet<string> = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'passwd',
  'pwd',
  'oldpassword',
  'newpassword',
  'secret',
  'authorization',
  'cookie',
  'captcha',
  'verifycode',
  'smscode',
  'otp',
  'sid',
  'oldsid',
  'sessionid',
  'invitecode',
  'code'
]);

export const MAX_DETAIL_DEPTH = 8;
export const MAX_DETAIL_JSON_LENGTH = 4096;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveDetailKey(key: string): boolean {
  return SENSITIVE_DETAIL_KEYS.has(normalizeKey(key));
}

function stripDeep(value: unknown, depth: number): unknown {
  if (depth > MAX_DETAIL_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(item => stripDeep(item, depth + 1)).filter(v => v !== undefined);
    return items;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveDetailKey(k)) continue;
      const stripped = stripDeep(v, depth + 1);
      if (stripped !== undefined) out[k] = stripped;
    }
    return out;
  }
  return value;
}

export function sanitizeAuditDetail(
  detail: Record<string, unknown> | undefined,
  allowedKeys?: readonly string[]
): Record<string, unknown> {
  if (!detail) return {};
  const source: Record<string, unknown> = {};
  const keys = allowedKeys ? allowedKeys.filter(k => k in detail) : Object.keys(detail);
  for (const key of keys) source[key] = detail[key];
  const stripped = stripDeep(source, 1);
  const result =
    stripped && typeof stripped === 'object' && !Array.isArray(stripped)
      ? (stripped as Record<string, unknown>)
      : {};
  try {
    if (JSON.stringify(result).length > MAX_DETAIL_JSON_LENGTH) {
      return { _truncated: true };
    }
  } catch {
    // 循环引用等不可序列化形态：publisher 侧也会按 serialize 失败丢弃，这里先收敛为空截断标记
    return { _truncated: true };
  }
  return result;
}
