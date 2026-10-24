import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * 批次 7 / GAP-F8：admins 表密码哈希（scrypt，node:crypto，无新依赖）。
 * 格式：scrypt:$<N-r-p>$<salt-hex>$<hash-hex>。
 * 与 users 的 bcrypt 格式互不识别，防交叉登录（拍板：管理员不复用 users RSA 加密链路）。
 */
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

const PREFIX = 'scrypt:$';

export function hashAdminPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `${PREFIX}${SCRYPT_N}-${SCRYPT_R}-${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return false;
  const parts = stored.slice(PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const [params, saltHex, hashHex] = parts as [string, string, string];
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(params);
  if (!m || !saltHex || !hashHex) return false;
  const N = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  if (!N || !r || !p) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, { N, r, p });
  return timingSafeEqual(actual, expected);
}
