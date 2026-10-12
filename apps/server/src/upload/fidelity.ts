// 转换样例集基线比对（F5.4）：纯函数，无 soffice/pdf 依赖，CI 可全量跑

export interface FidelityBaselineEntry {
  caseId: string;
  pageCount: number;
  perceptualHashes?: string[];
}

export interface FidelityBaseline {
  loVersion?: string;
  entries: FidelityBaselineEntry[];
}

export interface FidelityCheckInput {
  caseId: string;
  pageCount: number;
  perceptualHashes?: string[];
}

export type FidelityLevel = 'ok' | 'warn' | 'fail';

export interface FidelityDiff {
  caseId: string;
  level: FidelityLevel;
  reasons: string[];
}

/** 感知哈希偏差阈值（占总 bit 数比例）；超阈仅 warn，走人工复核 */
const HASH_WARN_RATIO = 0.1;

export function hammingDistance(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    const x = parseInt(a[i] ?? '0', 16);
    const y = parseInt(b[i] ?? '0', 16);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      dist += 4;
      continue;
    }
    let bits = x ^ y;
    while (bits) {
      dist += bits & 1;
      bits >>= 1;
    }
  }
  return dist;
}

export function compareFidelityBaseline(
  baseline: FidelityBaseline | null,
  current: FidelityCheckInput
): FidelityDiff {
  const reasons: string[] = [];
  const entry = baseline?.entries.find(e => e.caseId === current.caseId);
  if (!entry) {
    return {
      caseId: current.caseId,
      level: 'warn',
      reasons: ['无基线记录，需人工确认后回填 baseline.json']
    };
  }

  let level: FidelityLevel = 'ok';
  if (entry.pageCount !== current.pageCount) {
    level = 'fail';
    reasons.push(`页数不符：基线 ${entry.pageCount}，当前 ${current.pageCount}`);
  }

  if (entry.perceptualHashes?.length) {
    if (!current.perceptualHashes?.length) {
      if (level !== 'fail') level = 'warn';
      reasons.push('当前缺少渲染哈希，无法比对版式偏差');
    } else {
      const bits = (entry.perceptualHashes[0]?.length ?? 0) * 4;
      for (let i = 0; i < entry.perceptualHashes.length; i++) {
        const base = entry.perceptualHashes[i];
        const cur = current.perceptualHashes[i];
        if (base === undefined || cur === undefined) continue;
        const dist = hammingDistance(base, cur);
        if (bits > 0 && dist / bits > HASH_WARN_RATIO) {
          if (level !== 'fail') level = 'warn';
          reasons.push(`第${i + 1}页哈希偏差 ${dist}/${bits} 超阈值，需人工复核`);
        }
      }
    }
  }

  return { caseId: current.caseId, level, reasons };
}
