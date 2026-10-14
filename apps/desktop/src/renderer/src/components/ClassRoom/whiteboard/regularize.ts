// F4.2 手绘图形规整：轨迹采样 + 几何拟合判定。
// 依次尝试直线/圆/矩形拟合，命中返回标准图形参数；全部失败返回 null（调用方保留原笔迹）。
export type Regularized =
  | { kind: 'line'; points: [number, number, number, number] }
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number };

// 阈值（可按手感调）：直线最大垂偏/弦长；圆闭合最大角间隙、RMS/最大径向残差/半径；
// 矩形点到包围盒边的最大距离、覆盖比例与四角邻域容差
const LINE_TOL = 0.05;
const CIRCLE_MAX_GAP = (70 * Math.PI) / 180; // 闭合性：最大相邻角间隙 ≤70°（覆盖 ≥290°）才算闭合圆，弧保留笔迹
const CIRCLE_RMS_TOL = 0.05; // RMS 径向残差/半径：整体贴合度（容忍单点抖动）
const CIRCLE_MAX_TOL = 0.3; // 最大径向残差/半径：仅防极端畸形（RMS 已管整体贴合）
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
  // 闭合性检查：点相对圆心的角度排序后最大相邻角间隙（含首尾环绕）≤ 阈值
  // 弧（1/4、1/2 圆等）间隙大，保留原笔迹；过冲重叠会缩小间隙，天然鲁棒
  const angles: number[] = [];
  for (const [x, y] of pts) angles.push(Math.atan2(y - cy, x - cx));
  angles.sort((p, q) => p - q);
  let maxGap = angles[0]! + Math.PI * 2 - angles[angles.length - 1]!; // 首尾环绕
  for (let i = 1; i < angles.length; i++) {
    const gap = angles[i]! - angles[i - 1]!;
    if (gap > maxGap) maxGap = gap;
  }
  if (maxGap > CIRCLE_MAX_GAP) return null;
  // 残差双指标：RMS 容忍单点抖动，max 排除严重畸变
  let sumSq = 0;
  let maxRes = 0;
  for (const [x, y] of pts) {
    const res = Math.abs(Math.hypot(x - cx, y - cy) - r);
    sumSq += res * res;
    if (res > maxRes) maxRes = res;
  }
  if (Math.sqrt(sumSq / n) > CIRCLE_RMS_TOL * r) return null;
  if (maxRes > CIRCLE_MAX_TOL * r) return null;
  return { kind: 'circle', x: cx, y: cy, radius: r };
}

// 矩形：点须几乎全部贴近包围盒四边（内部点会拉低比例，scribble/交叉线被排除）；
// 且四个角邻域内都须有笔迹点（矩形手绘必过角，圆/椭圆不过角——否则小圆会因贴边比例高被误判为矩形）
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
  // 四角验证：容差自适应矩形尺寸，四角邻域内各须出现过笔迹点。
  // 正圆 45° 点到包围盒角的逐轴偏移恒 0.293r，本容差恒 0.2r < 0.293r → 正圆必被排除；
  // 矩形描边极值点本就在角上（包围盒由其撑起），10% 短边容差足够覆盖过角抖动
  const cornerTol = Math.max(3, Math.min(width, height) * 0.1);
  const corners: Array<[number, number]> = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY]
  ];
  for (const [cxx, cyy] of corners) {
    let hit = false;
    for (const [x, y] of pts) {
      if (Math.abs(x - cxx) <= cornerTol && Math.abs(y - cyy) <= cornerTol) {
        hit = true;
        break;
      }
    }
    if (!hit) return null;
  }
  return { kind: 'rect', x: minX, y: minY, width, height };
}
