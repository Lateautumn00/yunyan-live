import { describe, expect, it } from 'vitest';
import { resolveSynchronize } from './sync-policy';

describe('resolveSynchronize (GAP-S9a freeze)', () => {
  it('默认关闭：未请求 sync 时任何环境都返回 false', () => {
    expect(resolveSynchronize(false, 'production')).toBe(false);
    expect(resolveSynchronize(false, 'development')).toBe(false);
    expect(resolveSynchronize(false, undefined)).toBe(false);
  });

  it('生产环境显式请求 sync → 抛错拒启动（硬禁）', () => {
    expect(() => resolveSynchronize(true, 'production')).toThrow(/GAP-S9a/);
    expect(() => resolveSynchronize(true, 'production')).toThrow(/TYPEORM_SYNC/);
  });

  it('非生产显式请求 sync → 放行（仅本地开发逃生舱）', () => {
    expect(resolveSynchronize(true, 'development')).toBe(true);
    expect(resolveSynchronize(true, undefined)).toBe(true);
  });
});
