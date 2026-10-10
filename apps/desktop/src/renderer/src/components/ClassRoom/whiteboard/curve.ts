import type { MathNode } from 'mathjs';

/** F2.2 函数图像：mathjs 解析 + AST 白名单（Q3 硬约束）+ 有界采样 */

/**
 * Q3 包体实测：mathjs 以命名导入虽满足"子集 import"，但实测仍向主 chunk
 * 注入约 1.39MB(min)/259KB(gzip)（ESM 共 2.34MB，parse 依赖图过大，rollup 仅裁掉约四成）。
 * 因此改为动态 import → 独立懒 chunk，仅在首次绘制函数图像时加载（与 formulaRaster 同策略），
 * 主包体增量≈0；`import type` 不产生运行时依赖，不入包。
 */
interface CurveParser {
  parse: (expr: string) => MathNode;
}
let parser: CurveParser | null = null;
let parserLoading: Promise<CurveParser> | null = null;

export function loadCurveParser(): Promise<CurveParser> {
  if (parser) return Promise.resolve(parser);
  if (!parserLoading) {
    parserLoading = import('mathjs')
      .then((m: CurveParser) => {
        parser = m;
        return m;
      })
      .catch((e: unknown) => {
        parserLoading = null;
        throw e;
      });
  }
  return parserLoading;
}

/** Q3 边界：表达式长度上限（拒绝病态/超长输入） */
export const CURVE_MAX_EXPR = 200;
/** 采样步数上限（防止病态定义域下的求值放大） */
const CURVE_MAX_STEPS = 2000;

/** 初版支持的函数集合（Q3：限定支持的函数集合，分段/反三角部分可后置） */
const ALLOWED_FUNCS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'exp',
  'log',
  'log2',
  'log10',
  'sqrt',
  'abs',
  'sign',
  'floor',
  'ceil',
  'round',
  'min',
  'max',
  'pow'
]);

/** 允许的常量 */
const ALLOWED_CONSTS = new Set(['pi', 'PI', 'e', 'E', 'tau']);
/** 允许的自变量（函数图像仅 x） */
const ALLOWED_VARS = new Set(['x']);
/** 结构性拒绝：非"含 x 纯算式"的节点类型（访问器/赋值/条件/区间等） */
const REJECT_TYPES = new Set([
  'AccessorNode',
  'AssignmentNode',
  'FunctionAssignmentNode',
  'RangeNode',
  'ConditionalNode'
]);

export interface CurveValidation {
  ok: boolean;
  message?: string;
}

/**
 * 白名单校验（Q3）：解析为 AST 后遍历，越界即拒。
 * - FunctionNode：函数名必须在白名单（拒 process.exit/random 等）
 * - SymbolNode：变量/常量/函数引用必须在白名单（函数名会额外以符号出现，需放行）
 * - 结构性拒绝：访问器/赋值/条件等非纯表达式形态
 */
export async function validateExpr(expr: string): Promise<CurveValidation> {
  const t = expr.trim();
  if (!t) return { ok: false, message: '请输入函数表达式，如 sin(x)' };
  if (t.length > CURVE_MAX_EXPR) {
    return { ok: false, message: `表达式过长（上限 ${CURVE_MAX_EXPR} 字符）` };
  }
  let parse: CurveParser['parse'];
  try {
    ({ parse } = await loadCurveParser());
  } catch {
    return { ok: false, message: '解析组件加载失败，请重试' };
  }
  let node;
  try {
    node = parse(t);
  } catch {
    return { ok: false, message: '表达式语法有误，请检查括号与运算符' };
  }
  let bad: string | null = null;
  let badStruct = false;
  // MathNode 基接口仅暴露 type:string，按 type 判别后窄化（mathjs 节点恒以类名作 type）
  node.traverse(n => {
    if (bad || badStruct) return;
    const type = n.type;
    if (REJECT_TYPES.has(type)) {
      badStruct = true;
      return;
    }
    if (type === 'FunctionNode') {
      const raw = (n as unknown as { fn?: { name?: unknown } }).fn?.name;
      const name = typeof raw === 'string' ? raw : '';
      if (!name || !ALLOWED_FUNCS.has(name)) bad = name || '复杂函数调用';
    } else if (type === 'SymbolNode') {
      const raw = (n as unknown as { name?: unknown }).name;
      if (
        typeof raw === 'string' &&
        !ALLOWED_VARS.has(raw) &&
        !ALLOWED_CONSTS.has(raw) &&
        !ALLOWED_FUNCS.has(raw)
      ) {
        bad = raw;
      }
    }
  });
  if (badStruct) return { ok: false, message: '暂不支持该表达式结构（仅支持含 x 的算式）' };
  if (bad) return { ok: false, message: `暂不支持的符号：${bad}` };
  return { ok: true };
}

/**
 * 采样：在 [min,max] 上取 steps+1 个点，返回扁平 [x0,y0,x1,y1,…]。
 * 非有限值（渐近线/复数/越界）剔除，断点不连线；编译一次复用，求值次数受步数上限约束。
 */
export async function sampleCurve(
  expr: string,
  min: number,
  max: number,
  steps: number
): Promise<number[]> {
  const t = expr.trim();
  if (!t || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return [];
  const check = await validateExpr(t);
  if (!check.ok) return [];
  const n = Math.max(2, Math.min(Math.round(steps) || 200, CURVE_MAX_STEPS));
  const { parse } = await loadCurveParser();
  const compiled = parse(t).compile();
  const scope: Record<string, number> = { x: 0 };
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = min + ((max - min) * i) / n;
    scope.x = x;
    let y: unknown;
    try {
      y = compiled.evaluate(scope);
    } catch {
      y = NaN;
    }
    const num = typeof y === 'number' ? y : NaN;
    if (Number.isFinite(num)) pts.push(x, num);
  }
  return pts;
}

export interface CurveLayout {
  /** 画布包围盒左上角（存入元素 x/y，供移动/变换锚定） */
  x: number;
  y: number;
  /** 相对 (x,y) 的点集，Konva.Line 直接可用 */
  points: number[];
}

/**
 * 数学坐标 → 画布坐标：以 (originX,originY) 为数学原点，scale 为 px/单位，
 * y 轴翻转（数学向上 / 画布向下），再按包围盒归一化出相对点集。
 */
export function layoutCurve(
  mathPts: number[],
  originX: number,
  originY: number,
  scale: number
): CurveLayout {
  if (mathPts.length < 2 || !Number.isFinite(scale) || scale === 0) {
    return { x: originX, y: originY, points: [] };
  }
  const abs: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i + 1 < mathPts.length; i += 2) {
    const sx = originX + mathPts[i]! * scale;
    const sy = originY - mathPts[i + 1]! * scale;
    abs.push(sx, sy);
    if (sx < minX) minX = sx;
    if (sy < minY) minY = sy;
  }
  const points: number[] = [];
  for (let i = 0; i + 1 < abs.length; i += 2) {
    points.push(abs[i]! - minX, abs[i + 1]! - minY);
  }
  return { x: minX, y: minY, points };
}
