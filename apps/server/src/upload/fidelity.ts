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

/** pdftoppm 输出的 P6 PPM 解析头信息 */
interface PpmData {
  width: number;
  height: number;
  /** 已归一到 0–255 的灰度像素，长度 = width * height */
  gray: Float64Array;
}

function parseP6Ppm(buf: Buffer): PpmData {
  if (buf.length < 2 || buf[0] !== 0x50 || buf[1] !== 0x36) {
    throw new Error('dhashFromPpm: 非 P6 PPM 数据');
  }
  let pos = 2;
  const tokens: number[] = [];
  while (tokens.length < 3 && pos < buf.length) {
    // 跳过空白与 # 注释行
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]!))) pos++;
    if (pos < buf.length && buf[pos] === 0x23) {
      while (pos < buf.length && buf[pos] !== 0x0a) pos++;
      continue;
    }
    let num = 0;
    let seen = false;
    while (pos < buf.length && buf[pos]! >= 0x30 && buf[pos]! <= 0x39) {
      num = num * 10 + (buf[pos]! - 0x30);
      pos++;
      seen = true;
    }
    if (seen) tokens.push(num);
  }
  if (tokens.length < 3) throw new Error('dhashFromPpm: PPM 头不完整');
  const width = tokens[0]!;
  const height = tokens[1]!;
  const maxval = tokens[2]!;
  if (width <= 0 || height <= 0 || maxval <= 0) {
    throw new Error('dhashFromPpm: PPM 头非法');
  }
  pos += 1; // maxval 后单个空白分隔符
  const channels = 3;
  const sampleBytes = maxval > 255 ? 2 : 1;
  const need = width * height * channels * sampleBytes;
  if (pos + need > buf.length) {
    throw new Error('dhashFromPpm: PPM 数据长度不足');
  }
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = pos + i * channels * sampleBytes;
    const read = (k: number): number => {
      const p = off + k * sampleBytes;
      return sampleBytes === 2 ? (buf[p]! << 8) | buf[p + 1]! : buf[p]!;
    };
    const r = read(0) / maxval;
    const g = read(1) / maxval;
    const b = read(2) / maxval;
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { width, height, gray };
}

/**
 * 从 pdftoppm 输出的 P6 PPM 渲染缓冲计算 64bit dHash（16 hex 字符）。
 * 降采样到 9×8 灰度后逐行比较水平相邻像素：左 < 右 → 1。
 * 与 compareFidelityBaseline 的 HASH_WARN_RATIO 阈值配套。
 */
export function dhashFromPpm(buf: Buffer): string {
  const { width, height, gray } = parseP6Ppm(buf);
  const GW = 9;
  const GH = 8;
  const grid = new Float64Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    const y0 = Math.floor((gy * height) / GH);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / GH));
    for (let gx = 0; gx < GW; gx++) {
      const x0 = Math.floor((gx * width) / GW);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / GW));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += gray[y * width + x]!;
          n++;
        }
      }
      grid[gy * GW + gx] = n > 0 ? Math.round((sum / n) * 255) : 0;
    }
  }
  let bits = '';
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW - 1; gx++) {
      bits += grid[gy * GW + gx]! < grid[gy * GW + gx + 1]! ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}
