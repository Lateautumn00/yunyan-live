// F4.2 手绘图形规整：轨迹采样 + 几何拟合判定。
// 依次尝试直线/圆/矩形拟合，命中返回标准图形参数；全部失败返回 null（调用方保留原笔迹）。
export type Regularized =
  | { kind: 'line'; points: [number, number, number, number] }
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number };

// 阈值（可按手感调）：直线最大垂偏/弦长；圆最大径向残差/半径；矩形点到包围盒边的最大距离与覆盖比例
const LINE_TOL = 0.05;
const CIRCLE_TOL = 0.08;
const RECT_EDGE_TOL = 14;
const RECT_EDGE_FRAC = 0.9;
const MIN_SPAN = 8;

export function regularizePath(flat: number[]): Regularized | null {
  if (flat.length < 6) return null;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i]!, flat[i + 1]!]);
  if (pts.length < 3) return null;

  // 直线最可靠优先；矩形须先于圆（近矩形点列的圆拟合残差也会小，圆会误吞矩形）
  return fitLine(pts) ?? fitRect(pts) ?? fitCircle(pts);
}

function fitLine(pts: Array<[number, number]>): Regularized | null {
  const [x0, y0] = pts[0]!;
  const [xn, yn] = pts[pts.length - 1]!;
  const dx = xn - x0;
  const dy = yn - y0;
  const len = Math.hypot(dx, dy);
  if (len < MIN_SPAN) return null;
  let maxDev = 0;
  for (const [x, y] of pts) {
    const dev = Math.abs(dx * (y - y0) - dy * (x - x0)) / len;
    if (dev > maxDev) maxDev = dev;
  }
  if (maxDev > LINE_TOL * len) return null;
  return { kind: 'line', points: [x0, y0, xn, yn] };
}

// Kasa 代数圆拟合（先去均值提升条件数，再回填圆心）
function fitCircle(pts: Array<[number, number]>): Regularized | null {
  const n = pts.length;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let Suu = 0;
  let Suv = 0;
  let Svv = 0;
  let Suuu = 0;
  let Suvv = 0;
  let Svvv = 0;
  let Svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx;
    const v = y - my;
    const uu = u * u;
    const vv = v * v;
    Suu += uu;
    Suv += u * v;
    Svv += vv;
    Suuu += uu * u;
    Suvv += u * vv;
    Svvv += vv * v;
    Svuu += vv * u;
  }
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-6) return null;
  const a = (0.5 * (Suuu + Suvv) * Svv - 0.5 * (Svvv + Svuu) * Suv) / det;
  const b = (0.5 * (Svvv + Svuu) * Suu - 0.5 * (Suuu + Suvv) * Suv) / det;
  const cx = a + mx;
  const cy = b + my;
  let r = 0;
  for (const [x, y] of pts) r += Math.hypot(x - cx, y - cy);
  r /= n;
  if (r < MIN_SPAN / 2) return null;
  let maxRes = 0;
  for (const [x, y] of pts) {
    const res = Math.abs(Math.hypot(x - cx, y - cy) - r);
    if (res > maxRes) maxRes = res;
  }
  if (maxRes > CIRCLE_TOL * r) return null;
  return { kind: 'circle', x: cx, y: cy, radius: r };
}

// 矩形：点须几乎全部贴近包围盒四边（内部点会拉低比例，scribble/交叉线被排除）
function fitRect(pts: Array<[number, number]>): Regularized | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < MIN_SPAN || height < MIN_SPAN) return null;
  let near = 0;
  for (const [x, y] of pts) {
    const d = Math.min(x - minX, maxX - x, y - minY, maxY - y);
    if (d <= RECT_EDGE_TOL) near++;
  }
  if (near / pts.length < RECT_EDGE_FRAC) return null;
  return { kind: 'rect', x: minX, y: minY, width, height };
}
