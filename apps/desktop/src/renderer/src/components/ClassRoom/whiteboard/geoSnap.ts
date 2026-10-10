/**
 * F2.3 几何作图与吸附：吸附目标派生 + 最近点吸附（纯函数，无 Konva 依赖）。
 * 仅做静态吸附（端点/中点/中心/垂足），不引入约束求解（F2.6 Won't）。
 */

export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'perpendicular';

export interface SnapTarget {
  x: number;
  y: number;
  kind: SnapKind;
}

/** 用于垂足吸附的线段（层坐标） */
export interface SnapSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SnapContext {
  targets: SnapTarget[];
  segments: SnapSegment[];
}

export interface SnapResult {
  x: number;
  y: number;
  kind: SnapKind | null;
  snapped: boolean;
}

/** 画布元素记录（Yjs map 展平后的普通对象） */
export type SnapElement = Record<string, unknown>;

/** 默认吸附阈值（层坐标 px） */
export const SNAP_THRESHOLD = 10;

/** 距离并列时的优先级：端点 > 中心 > 中点 > 垂足（数值越小越优先） */
const KIND_PRIORITY: Record<SnapKind, number> = {
  endpoint: 0,
  center: 1,
  midpoint: 2,
  perpendicular: 3
};

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pointsOf(e: SnapElement): number[] | null {
  const raw = e.points;
  if (!Array.isArray(raw)) return null;
  const nums: number[] = [];
  for (const v of raw) {
    const n = finite(v);
    if (n !== null) nums.push(n);
  }
  return nums.length >= 4 ? nums : null;
}

/**
 * 从画布元素派生吸附目标：
 * - 几何图元（line/arrow/force-arrow/leader-label/polygon…）：首尾端点；
 *   恰为两点的图元额外派生中点与线段
 * - rect：四角 + 四边中点 + 中心 + 四条边
 * - circle：圆心 + 四向象限点（radius 缺省时按 radiusX/radiusY 视作椭圆）
 * - 自由笔迹 brush / 函数曲线 curve / 图片与文本不作目标：手绘折线的"线段"是噪声，
 *   吸附到它会产生意外跳动（F5.1 回归即由此触发）
 */
const POINTED_TYPES = new Set(['line', 'arrow', 'force-arrow', 'leader-label', 'polygon']);
export function collectSnapTargets(elements: readonly SnapElement[]): SnapContext {
  const targets: SnapTarget[] = [];
  const segments: SnapSegment[] = [];
  const push = (x: number, y: number, kind: SnapKind): void => {
    if (Number.isFinite(x) && Number.isFinite(y)) targets.push({ x, y, kind });
  };

  for (const e of elements) {
    const type = typeof e.type === 'string' ? e.type : '';

    if (type === 'rect') {
      const x = finite(e.x);
      const y = finite(e.y);
      const w = finite(e.width);
      const h = finite(e.height);
      if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) continue;
      const x2 = x + w;
      const y2 = y + h;
      const mx = x + w / 2;
      const my = y + h / 2;
      push(x, y, 'endpoint');
      push(x2, y, 'endpoint');
      push(x, y2, 'endpoint');
      push(x2, y2, 'endpoint');
      push(mx, y, 'midpoint');
      push(mx, y2, 'midpoint');
      push(x, my, 'midpoint');
      push(x2, my, 'midpoint');
      push(mx, my, 'center');
      segments.push({ x1: x, y1: y, x2: x2, y2: y });
      segments.push({ x1: x2, y1: y, x2: x2, y2: y2 });
      segments.push({ x1: x2, y1: y2, x2: x, y2: y2 });
      segments.push({ x1: x, y1: y2, x2: x, y2: y });
      continue;
    }

    if (type === 'circle') {
      const cx = finite(e.x);
      const cy = finite(e.y);
      if (cx === null || cy === null) continue;
      const r = finite(e.radius);
      const rx = r ?? finite(e.radiusX) ?? 0;
      const ry = r ?? finite(e.radiusY) ?? rx;
      if (rx > 0 || ry > 0) {
        push(cx, cy - ry, 'endpoint');
        push(cx + rx, cy, 'endpoint');
        push(cx, cy + ry, 'endpoint');
        push(cx - rx, cy, 'endpoint');
      }
      push(cx, cy, 'center');
      continue;
    }

    if (!POINTED_TYPES.has(type)) continue;
    const pts = pointsOf(e);
    if (!pts) continue;
    const n = pts.length;
    const fx = pts[0]!;
    const fy = pts[1]!;
    const lx = pts[n - 2]!;
    const ly = pts[n - 1]!;
    push(fx, fy, 'endpoint');
    push(lx, ly, 'endpoint');
    if (n === 4) {
      push((fx + lx) / 2, (fy + ly) / 2, 'midpoint');
      segments.push({ x1: fx, y1: fy, x2: lx, y2: ly });
    }
  }

  return { targets, segments };
}

/** 点到线段的垂足；退化段或垂足落在延长线上（t∉[0,1]）返回 null */
function footOnSegment(
  p: { x: number; y: number },
  s: SnapSegment
): { x: number; y: number } | null {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 0)) return null;
  const t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2;
  if (t < 0 || t > 1) return null;
  return { x: s.x1 + t * dx, y: s.y1 + t * dy };
}

/**
 * 最近点吸附：静态目标 + 线段垂足中取阈值内最近者。
 * 距离并列时按 KIND_PRIORITY 取更高优先级者，同优先级取先出现者（输入序稳定）。
 * 无命中则原样返回坐标，kind 为 null、snapped 为 false。
 */
export function snapPoint(
  p: { x: number; y: number },
  ctx: SnapContext,
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  const raw = { x: p.x, y: p.y, kind: null, snapped: false } as const;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { ...raw };
  const th = Number.isFinite(threshold) && threshold > 0 ? threshold : SNAP_THRESHOLD;

  let bestX = p.x;
  let bestY = p.y;
  let bestKind: SnapKind | null = null;
  let bestD = Infinity;

  const consider = (x: number, y: number, kind: SnapKind): void => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > th) return;
    const better =
      bestKind === null ||
      d < bestD ||
      (d === bestD && KIND_PRIORITY[kind] < KIND_PRIORITY[bestKind]);
    if (better) {
      bestX = x;
      bestY = y;
      bestKind = kind;
      bestD = d;
    }
  };

  for (const t of ctx.targets) consider(t.x, t.y, t.kind);
  for (const s of ctx.segments) {
    const foot = footOnSegment(p, s);
    if (foot) consider(foot.x, foot.y, 'perpendicular');
  }

  if (bestKind === null) return { ...raw };
  return { x: bestX, y: bestY, kind: bestKind, snapped: true };
}
