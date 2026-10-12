// F2.4 度量标注：几何量纯函数（长度/面积/周长/内角）——无 Konva 依赖。
// KonvaRenderer.rebuildMetrics 派生绘制与本文件单测共用；
// 退化输入返回空数组/零值，不抛异常
export interface MetricLabel {
  text: string;
  x: number;
  y: number;
  w: number;
}

type Getter = { get: (k: string) => unknown };

/** 数值格式化：整数不带小数，其余保留 1 位 */
export function fmtNum(n: number): string {
  const s = (Math.round(n * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** 折线总长（不闭合；多边形闭合段由调用方补） */
export function segLength(pts: number[]): number {
  let total = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    total += Math.hypot((pts[i] ?? 0) - (pts[i - 2] ?? 0), (pts[i + 1] ?? 0) - (pts[i - 1] ?? 0));
  }
  return total;
}

/** 鞋带公式面积（绝对值；<3 点为 0，共线为 0） */
export function polyArea(pts: number[]): number {
  const n = Math.floor(pts.length / 2);
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = pts[i * 2] ?? 0;
    const yi = pts[i * 2 + 1] ?? 0;
    const xj = pts[j * 2] ?? 0;
    const yj = pts[j * 2 + 1] ?? 0;
    sum += xi * yj - xj * yi;
  }
  return Math.abs(sum) / 2;
}

/** 各顶点内角（0–180°；<3 点为空数组） */
export function interiorAngles(pts: number[]): number[] {
  const n = Math.floor(pts.length / 2);
  const out: number[] = [];
  if (n < 3) return out;
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const q = (i + 1) % n;
    const ax = (pts[p * 2] ?? 0) - (pts[i * 2] ?? 0);
    const ay = (pts[p * 2 + 1] ?? 0) - (pts[i * 2 + 1] ?? 0);
    const bx = (pts[q * 2] ?? 0) - (pts[i * 2] ?? 0);
    const by = (pts[q * 2 + 1] ?? 0) - (pts[i * 2 + 1] ?? 0);
    const dot = ax * bx + ay * by;
    const cross = ax * by - ay * bx;
    out.push((Math.atan2(Math.abs(cross), dot) * 180) / Math.PI);
  }
  return out;
}

/**
 * 元素 → 度量标注列表（层局部绝对坐标；w=文本框宽、文本居中绘制）。
 * 仅几何类型（line/arrow/rect/circle/polygon）+ measure 开关为真时产出；
 * 退化几何（零长/塌缩/共线）降级为不产出或仅周长
 */
export function computeMetrics(el: Getter): MetricLabel[] {
  if (!el.get('measure')) return [];
  const type = String(el.get('type') ?? '');
  const x = Number(el.get('x')) || 0;
  const y = Number(el.get('y')) || 0;

  if (type === 'line' || type === 'arrow') {
    const raw = el.get('points');
    if (!Array.isArray(raw) || raw.length < 4) return [];
    const pts = raw as number[];
    const len = segLength(pts);
    if (len <= 0.5) return [];
    // 包围盒中心（两点线段即中点）
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const px = pts[i] ?? 0;
      const py = pts[i + 1] ?? 0;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return [
      { text: fmtNum(len), x: x + (minX + maxX) / 2 - 30, y: y + (minY + maxY) / 2 - 8, w: 60 }
    ];
  }

  if (type === 'rect') {
    const w = Number(el.get('width')) || 0;
    const h = Number(el.get('height')) || 0;
    if (w <= 0.5 || h <= 0.5) return [];
    return [{ text: `${fmtNum(w)}×${fmtNum(h)}`, x: x + w / 2 - 45, y: y + h / 2 - 8, w: 90 }];
  }

  if (type === 'circle') {
    const rxRaw = el.get('radiusX');
    if (rxRaw !== undefined && rxRaw !== null) {
      // 椭圆（createNode 以 radiusX 优先判定）
      const rx = Number(rxRaw) || 0;
      const ry = Number(el.get('radiusY')) || 0;
      if (rx <= 0.5 || ry <= 0.5) return [];
      return [{ text: `S=${fmtNum(Math.PI * rx * ry)}`, x: x - 50, y: y - 8, w: 100 }];
    }
    const r = Number(el.get('radius')) || 0;
    if (r <= 0.5) return [];
    return [
      {
        text: `C=${fmtNum(2 * Math.PI * r)} · S=${fmtNum(Math.PI * r * r)}`,
        x: x - 70,
        y: y - 8,
        w: 140
      }
    ];
  }

  if (type === 'polygon') {
    const raw = el.get('points');
    if (!Array.isArray(raw) || raw.length < 6 || raw.length % 2 !== 0) return [];
    const pts = raw as number[];
    const n = pts.length / 2;
    const area = polyArea(pts);
    const last = (n - 1) * 2;
    const perim =
      segLength(pts) +
      Math.hypot((pts[0] ?? 0) - (pts[last] ?? 0), (pts[1] ?? 0) - (pts[last + 1] ?? 0));
    if (perim <= 0.5) return [];
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      sumX += pts[i * 2] ?? 0;
      sumY += pts[i * 2 + 1] ?? 0;
    }
    const lcx = sumX / n;
    const lcy = sumY / n;
    const cx = x + lcx;
    const cy = y + lcy;
    // 共线退化：面积/内角无意义，仅周长
    if (area <= 0.5) return [{ text: `C=${fmtNum(perim)}`, x: cx - 40, y: cy - 8, w: 80 }];
    const labels: MetricLabel[] = [
      { text: `S=${fmtNum(area)} · C=${fmtNum(perim)}`, x: cx - 70, y: cy - 8, w: 140 }
    ];
    interiorAngles(pts).forEach((a, i) => {
      const vx = pts[i * 2] ?? 0;
      const vy = pts[i * 2 + 1] ?? 0;
      const dx = vx - lcx;
      const dy = vy - lcy;
      const d = Math.hypot(dx, dy) || 1;
      //顶点朝外推 16px 放内角标签，避免压线
      labels.push({
        text: `${Math.round(a)}°`,
        x: x + vx + (dx / d) * 16 - 13,
        y: y + vy + (dy / d) * 16 - 8,
        w: 26
      });
    });
    return labels;
  }

  return [];
}
