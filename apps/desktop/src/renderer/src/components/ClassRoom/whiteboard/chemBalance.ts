// F3.6：化学方程式配平（矩阵法——高斯消元求零空间 + 最小整数解）
export type BalanceOk = { ok: true; coefficients: number[]; display: string };
export type BalanceErr = { ok: false; reason: string };
export type BalanceResult = BalanceOk | BalanceErr;

type Frac = { readonly n: number; readonly d: number };

function gcd2(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function lcm2(a: number, b: number): number {
  return Math.abs(a * b) / gcd2(a, b);
}

function fr(n: number, d = 1): Frac {
  if (d === 0) throw new Error('分母为零');
  const g = gcd2(n, d);
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

const fAdd = (a: Frac, b: Frac): Frac => fr(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a: Frac, b: Frac): Frac => fr(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a: Frac, b: Frac): Frac => fr(a.n * b.n, a.d * b.d);
const fDiv = (a: Frac, b: Frac): Frac => {
  if (b.n === 0) throw new Error('除零');
  return fr(a.n * b.d, a.d * b.n);
};
const fIsZero = (a: Frac): boolean => a.n === 0;

function normalize(src: string): { ok: true; text: string } | BalanceErr {
  let s = src.trim();
  if (!s) return { ok: false, reason: '输入为空' };
  const ce = s.match(/^\\ce\s*\{([\s\S]*)\}$/);
  if (ce && ce[1] !== undefined) s = ce[1];
  s = s.replace(/\\uparrow|\\downarrow|↑|↓/g, '');
  s = s.replace(/\\xrightarrow\{[^}]*\}/g, '->');
  s = s.replace(/\\longrightarrow|\\rightarrow|\\to(?![a-zA-Z])/g, '->');
  s = s.replace(/\((?:aq|s|l|g)\)/g, '');
  s = s.replace(/\^\{[^}]*\}/g, '');
  s = s.replace(/\^[0-9]*[+-]/g, '');
  s = s.replace(/={1,}/g, '->');
  return { ok: true, text: s };
}

function splitSides(text: string): { ok: true; left: string[]; right: string[] } | BalanceErr {
  const arrows = text.split('->');
  if (arrows.length === 1) return { ok: false, reason: '未找到反应箭头（需 -> 或 =）' };
  if (arrows.length !== 2) return { ok: false, reason: '箭头数量需恰好 1 个' };
  const cleanSide = (side: string): { ok: true; list: string[] } | BalanceErr => {
    const list: string[] = [];
    for (const part of side.split('+')) {
      const sp = part.trim().replace(/^\d+(?=[A-Z([])/, '');
      if (!sp) return { ok: false, reason: '存在空化学式' };
      list.push(sp);
    }
    return { ok: true, list };
  };
  const l = cleanSide(arrows[0] ?? '');
  if (!l.ok) return l;
  const r = cleanSide(arrows[1] ?? '');
  if (!r.ok) return r;
  return { ok: true, left: l.list, right: r.list };
}

function parseFormula(f: string): Map<string, number> | null {
  const root = new Map<string, number>();
  const stack: Array<Map<string, number>> = [root];
  let i = 0;
  const cur = (): Map<string, number> => stack[stack.length - 1]!;
  const addEl = (m: Map<string, number>, el: string, n: number): void => {
    m.set(el, (m.get(el) ?? 0) + n);
  };
  const readCount = (): number => {
    let digits = '';
    while (i < f.length && f[i]! >= '0' && f[i]! <= '9') {
      digits += f[i]!;
      i++;
    }
    return digits ? parseInt(digits, 10) : 1;
  };
  while (i < f.length) {
    const c = f[i]!;
    if (c >= 'A' && c <= 'Z') {
      let j = i + 1;
      if (j < f.length && f[j]! >= 'a' && f[j]! <= 'z') j++;
      const el = f.slice(i, j);
      i = j;
      addEl(cur(), el, readCount());
    } else if (c === '(' || c === '[') {
      stack.push(new Map());
      i++;
    } else if (c === ')' || c === ']') {
      if (stack.length === 1) return null;
      const inner = stack.pop()!;
      i++;
      const mul = readCount();
      for (const [el, n] of inner) addEl(cur(), el, n * mul);
    } else {
      return null;
    }
  }
  if (stack.length !== 1) return null;
  return root;
}

function toMinimalInt(x: Frac[]): number[] | null {
  let base = 1;
  for (const f of x) base = lcm2(base, f.d);
  const ints = x.map(f => Math.round((f.n * base) / f.d));
  if (ints.every(v => v < 0)) {
    for (let i = 0; i < ints.length; i++) ints[i] = -ints[i]!;
  }
  if (!ints.every(v => v > 0)) return null;
  const g = ints.reduce((acc, v) => gcd2(acc, v), 0);
  return ints.map(v => v / g);
}

function balanceSides(
  left: string[],
  right: string[],
  species: string[]
): BalanceResult | { ok: false; reason: string } | BalanceOk {
  const maps: Array<Map<string, number>> = [];
  for (const sp of species) {
    const m = parseFormula(sp);
    if (!m) return { ok: false, reason: `无法解析化学式：${sp}` };
    maps.push(m);
  }
  const elements = [...new Set(maps.flatMap(m => [...m.keys()]))].sort();
  if (elements.length === 0) return { ok: false, reason: '未解析到任何元素' };
  const rows = elements.length;
  const cols = species.length;
  const mat: Frac[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => fr(0))
  );
  elements.forEach((el, r) => {
    maps.forEach((m, c) => {
      const n = m.get(el) ?? 0;
      const sign = c < left.length ? 1 : -1;
      if (n !== 0) mat[r]![c] = fr(sign * n);
    });
  });

  // 全主元高斯-约当消元 → 行最简形
  const pivots: number[] = [];
  let rank = 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    let p = -1;
    for (let r = rank; r < rows; r++) {
      if (!fIsZero(mat[r]![c]!)) {
        p = r;
        break;
      }
    }
    if (p === -1) continue;
    const tmp = mat[rank]!;
    mat[rank] = mat[p]!;
    mat[p] = tmp;
    const pv = mat[rank]![c]!;
    for (let j = c; j < cols; j++) mat[rank]![j] = fDiv(mat[rank]![j]!, pv);
    for (let r = 0; r < rows; r++) {
      if (r === rank) continue;
      const f = mat[r]![c]!;
      if (fIsZero(f)) continue;
      for (let j = c; j < cols; j++) {
        mat[r]![j] = fSub(mat[r]![j]!, fMul(f, mat[rank]![j]!));
      }
    }
    pivots.push(c);
    rank++;
  }

  const pivotSet = new Set(pivots);
  const freeCols: number[] = [];
  for (let c = 0; c < cols; c++) if (!pivotSet.has(c)) freeCols.push(c);
  if (freeCols.length === 0) return { ok: false, reason: '该方程式无法配平（无解）' };

  const solveVec = (freeVals: Frac[]): Frac[] => {
    const x: Frac[] = Array.from({ length: cols }, () => fr(0));
    freeCols.forEach((fc, idx) => {
      x[fc] = freeVals[idx]!;
    });
    pivots.forEach((pc, r) => {
      let acc = fr(0);
      for (let idx = 0; idx < freeCols.length; idx++) {
        const f = freeCols[idx]!;
        acc = fAdd(acc, fMul(mat[r]![f]!, x[f]!));
      }
      x[pc] = fr(-acc.n, acc.d);
    });
    return x;
  };

  // 维数 1 直接取 1；>1 时在小范围内网格搜索全正整数解（取最小）
  let best: number[] | null = null;
  const grid = freeCols.length === 1 ? [1] : [1, 2, 3, 4];
  const combos: Frac[][] = [];
  if (freeCols.length === 1) {
    combos.push([fr(1)]);
  } else {
    let acc: Frac[][] = [[]];
    for (let k = 0; k < freeCols.length; k++) {
      const next: Frac[][] = [];
      for (const prefix of acc) for (const v of grid) next.push([...prefix, fr(v)]);
      acc = next;
    }
    combos.push(...acc);
  }
  for (const combo of combos) {
    const ints = toMinimalInt(solveVec(combo));
    if (!ints) continue;
    const score = [Math.max(...ints), ints.reduce((a, b) => a + b, 0)];
    const bestScore = best ? [Math.max(...best), best.reduce((a, b) => a + b, 0)] : null;
    if (
      !best ||
      score[0]! < bestScore![0]! ||
      (score[0] === bestScore![0] && score[1]! < bestScore![1]!)
    ) {
      best = ints;
    }
  }
  if (!best) {
    return {
      ok: false,
      reason:
        freeCols.length > 1
          ? '配平解不唯一，未在小系数范围内找到全正整数解'
          : '该方程式无法配平（存在系数为 0 或负数的物质）'
    };
  }

  const coefficients = best;
  const disp =
    left.map((sp, i) => `${coefficients[i]}${sp}`).join(' + ') +
    ' -> ' +
    right.map((sp, i) => `${coefficients[left.length + i]}${sp}`).join(' + ');
  return { ok: true, coefficients, display: disp };
}

export function balanceEquation(src: string): BalanceResult {
  try {
    const norm = normalize(src);
    if (!norm.ok) return norm;
    const sides = splitSides(norm.text);
    if (!sides.ok) return sides;
    return balanceSides(sides.left, sides.right, [...sides.left, ...sides.right]);
  } catch (e) {
    return { ok: false, reason: `解析异常：${(e as Error).message}` };
  }
}
