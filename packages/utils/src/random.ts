export function randomString(len: number, isNum: boolean = false): string {
  const charSet = isNum
    ? '0123456789'
    : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomString = '';
  for (let i = 0; i < len; i++) {
    const randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
}

/**
 * 生成时间可排序的唯一 ID：`[prefix]<base36 时间戳><8 位随机>`。
 * 替代散落各处的 `Date.now() + Math.random()` 手写拼接。
 */
export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${randomString(8)}`;
}
