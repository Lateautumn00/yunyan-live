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
/**
 * OpenSSL 默认 maxmem=32 MiB，而 scrypt 需要 128*N*r ≈ 128 MiB，
 * 不显式放宽会在 Node 24 上抛 ERR_CRYPTO_INVALID_SCRYPT_PARAMS。
 * 留 1 MiB 余量（maxmem 只是上限，不会预分配）。
 */
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R + 1024 * 1024;

const PREFIX = 'scrypt:$';

export function hashAdminPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
  return `${PREFIX}${SCRYPT_N}-${SCRYPT_R}-${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return false;
  const parts = stored.slice(PREFIX.length).split('$');
  // 格式：<N-r-p>$<salt>$<hash> —— 三段（此前误写成 2 段，导致任何密码都校验失败）
  if (parts.length !== 3) return false;
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
  const actual = scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: Math.max(128 * N * r + 1024 * 1024, SCRYPT_MAXMEM)
  });
  return timingSafeEqual(actual, expected);
}
