/**
 * 内置违禁词库（F5 起步来源；教师自定义词库需后台支撑 → F8 之后再开）。
 * 仅收录通用垃圾推广/辱骂类词，运营追加词项改这里即可。
 */
export const DEFAULT_BANNED_WORDS: readonly string[] = [
  '傻逼',
  '加微信',
  '刷单',
  '博彩',
  '代开发票',
  '办证'
];

/**
 * 是否命中词库。
 * - fail-open：词库缺省/为空（服务异常或空库）→ 放行（与 forbid 未知口径一致）
 * - 空白词跳过；大小写不敏感（拉丁字母）；词项两侧空白忽略
 */
export function isBlocked(text: string, words?: readonly string[] | null): boolean {
  if (!words || words.length === 0) return false;
  const haystack = text.toLowerCase();
  return words.some(word => {
    const w = word.trim().toLowerCase();
    return w !== '' && haystack.includes(w);
  });
}
