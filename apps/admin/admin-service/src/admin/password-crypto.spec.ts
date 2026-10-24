import { describe, expect, it } from 'vitest';
import { hashAdminPassword, verifyAdminPassword } from './password-crypto';

/**
 * 回归点：scryptSync 必须显式放宽 maxmem（OpenSSL 默认 32 MiB < 128*N*r ≈ 128 MiB），
 * 否则 Node 24 抛 ERR_CRYPTO_INVALID_SCRYPT_PARAMS——7a/7b 曾因此完全无法建号/登录。
 */
describe('admin 密码哈希（scrypt）', () => {
  it('hash 格式为 scrypt:$N-r-p$salt$hash', () => {
    const stored = hashAdminPassword('Admin@2025');
    expect(stored).toMatch(/^scrypt:\$131072-8-1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it('正确密码校验通过，错误密码不通过', () => {
    const stored = hashAdminPassword('Admin@2025');
    expect(verifyAdminPassword('Admin@2025', stored)).toBe(true);
    expect(verifyAdminPassword('admin@2025', stored)).toBe(false);
  });

  it('每次哈希使用新盐', () => {
    expect(hashAdminPassword('same-pass')).not.toBe(hashAdminPassword('same-pass'));
  });

  it('格式异常 / 非本算法前缀 / 空哈希一律拒绝', () => {
    expect(verifyAdminPassword('x', '$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
    expect(verifyAdminPassword('x', 'scrypt:$bogus$aa$bb')).toBe(false);
    expect(verifyAdminPassword('x', 'scrypt:$131072-8-1$')).toBe(false);
    expect(verifyAdminPassword('x', 'scrypt:$131072-8-1$zz$00')).toBe(false);
  });
});
