import { describe, expect, it } from 'vitest';
import {
  compareFidelityBaseline,
  hammingDistance,
  type FidelityBaseline,
  type FidelityCheckInput
} from './fidelity';

function input(partial: Partial<FidelityCheckInput> & { caseId: string }): FidelityCheckInput {
  return { pageCount: 3, ...partial };
}

describe('hammingDistance', () => {
  it('等长十六进制串逐位比较', () => {
    expect(hammingDistance('ffff', 'ffff')).toBe(0);
    expect(hammingDistance('0000', 'ffff')).toBe(16);
    expect(hammingDistance('f0f0', '0f0f')).toBe(16);
    expect(hammingDistance('00ff', '0f0f')).toBe(8);
  });
});

describe('compareFidelityBaseline（F5.4 样例集基线比对）', () => {
  it('无基线 → warn（需人工确认后回填）', () => {
    const diff = compareFidelityBaseline(null, input({ caseId: 'font-missing' }));
    expect(diff.level).toBe('warn');
    expect(diff.reasons.join()).toContain('基线');
  });

  it('页数不符 → fail（硬断言）', () => {
    const baseline: FidelityBaseline = {
      entries: [{ caseId: 'formula', pageCount: 2 }]
    };
    const diff = compareFidelityBaseline(baseline, input({ caseId: 'formula', pageCount: 4 }));
    expect(diff.level).toBe('fail');
    expect(diff.reasons.join()).toContain('页数');
  });

  it('哈希一致 → ok', () => {
    const baseline: FidelityBaseline = {
      entries: [{ caseId: 'fonts-installed', pageCount: 1, perceptualHashes: ['aaaa', 'bbbb'] }]
    };
    const diff = compareFidelityBaseline(
      baseline,
      input({ caseId: 'fonts-installed', pageCount: 1, perceptualHashes: ['aaaa', 'bbbb'] })
    );
    expect(diff.level).toBe('ok');
    expect(diff.reasons).toHaveLength(0);
  });

  it('哈希偏差超阈值 → warn（人工复核入口）', () => {
    const baseline: FidelityBaseline = {
      entries: [{ caseId: 'smartart', pageCount: 1, perceptualHashes: ['0000'] }]
    };
    const diff = compareFidelityBaseline(
      baseline,
      input({ caseId: 'smartart', pageCount: 1, perceptualHashes: ['ffff'] })
    );
    expect(diff.level).toBe('warn');
    expect(diff.reasons.join()).toContain('偏差');
  });

  it('基线有哈希、当前缺失 → warn', () => {
    const baseline: FidelityBaseline = {
      entries: [{ caseId: 'chart', pageCount: 1, perceptualHashes: ['aaaa'] }]
    };
    const diff = compareFidelityBaseline(baseline, input({ caseId: 'chart', pageCount: 1 }));
    expect(diff.level).toBe('warn');
    expect(diff.reasons.join()).toContain('哈希');
  });

  it('基线缺该 case → warn（新样例待回填）', () => {
    const baseline: FidelityBaseline = { entries: [{ caseId: 'other', pageCount: 1 }] };
    const diff = compareFidelityBaseline(baseline, input({ caseId: 'new-case' }));
    expect(diff.level).toBe('warn');
  });
});
