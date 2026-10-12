/** F2.5 教具仿真（直尺/量角器/圆规）：几何常量、角度归一与直尺贴边吸附 */

export type SimToolKind = 'ruler' | 'protractor' | 'compass';

export const SIM_KINDS: { kind: SimToolKind; label: string }[] = [
  { kind: 'ruler', label: '直尺' },
  { kind: 'protractor', label: '量角器' },
  { kind: 'compass', label: '圆规' }
];

// 尺身 240×48（中心定位）；量角器半径；圆规默认半径（可拖改，钳制区间）
export const RULER_W = 240;
export const RULER_H = 48;
export const PROTRACTOR_R = 120;
export const COMPASS_R = 80;
export const SIM_R_MIN = 30;
export const SIM_R_MAX = 400;
// 贴边吸附半径：落点距尺边在此阈值内即贴到边上（贴上后误差为 0，满足 DoD ≤2px）
export const RULER_SNAP_PX = 6;

/** 旋转角归一到 [0,360)：非法/超范围值钳制（F2.5 负向 DoD） */
export function normDeg(deg: number): number {
  const d = Number(deg);
  if (!Number.isFinite(d)) return 0;
  const m = d % 360;
  return m < 0 ? m + 360 : m;
}

export function clampNum(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 量角器指针角：元素局部坐标（圆心为原点，屏幕 y 向下）→ 0..180°（平边为 0/180） */
export function needleAngleDeg(lx: number, ly: number): number {
  const deg = (Math.atan2(-ly, lx) * 180) / Math.PI;
  return Math.round(clampNum(deg, 0, 180) * 10) / 10;
}

/** 圆规半径：指针距针尖距离钳制到 [SIM_R_MIN, SIM_R_MAX] */
export function compassRadiusFrom(lx: number, ly: number): number {
  return Math.round(clampNum(Math.hypot(lx, ly), SIM_R_MIN, SIM_R_MAX));
}

export type RulerBox = { x: number; y: number; rotation: number; w: number; h: number };

/** 直尺贴边：层坐标点 → 吸附到最近尺边的层坐标；未命中返回 null（四边皆可贴，支持旋转尺） */
export function snapToRulerEdges(
  lp: { x: number; y: number },
  rulers: RulerBox[]
): { x: number; y: number } | null {
  for (const r of rulers) {
    const rad = (r.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = lp.x - r.x;
    const dy = lp.y - r.y;
    // R(-rot) → 尺局部坐标（原点=尺中心）
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const hw = r.w / 2;
    const hh = r.h / 2;
    let nx = lx;
    let ny = ly;
    let hit = false;
    if (Math.abs(ly - hh) <= RULER_SNAP_PX && Math.abs(lx) <= hw) {
      ny = hh;
      hit = true;
    } else if (Math.abs(ly + hh) <= RULER_SNAP_PX && Math.abs(lx) <= hw) {
      ny = -hh;
      hit = true;
    } else if (Math.abs(lx - hw) <= RULER_SNAP_PX && Math.abs(ly) <= hh) {
      nx = hw;
      hit = true;
    } else if (Math.abs(lx + hw) <= RULER_SNAP_PX && Math.abs(ly) <= hh) {
      nx = -hw;
      hit = true;
    }
    if (!hit) continue;
    // R(rot) → 回层坐标
    return { x: r.x + nx * cos - ny * sin, y: r.y + nx * sin + ny * cos };
  }
  return null;
}
