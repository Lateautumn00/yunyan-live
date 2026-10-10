// F4.5 对齐吸附：拖动元素与邻元素边缘/中心对齐，阈值内取最近对齐边并产出参考线。
// skip（按住 Alt）时跳过本次吸附：零位移、无参考线。
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guide {
  orientation: 'vertical' | 'horizontal';
  position: number; // 垂直参考线 = x；水平参考线 = y
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export function computeSnap(
  drag: Box,
  others: Box[],
  threshold: number,
  skip: boolean
): SnapResult {
  const empty: SnapResult = { dx: 0, dy: 0, guides: [] };
  if (skip || others.length === 0) return empty;

  // 拖动元素的三条竖向对齐线（左/中/右）与三条横向对齐线（上/中/下）
  const dragV = [drag.x, drag.x + drag.width / 2, drag.x + drag.width];
  const dragH = [drag.y, drag.y + drag.height / 2, drag.y + drag.height];

  let bestV: { diff: number; guide: number } | null = null;
  let bestH: { diff: number; guide: number } | null = null;

  for (const o of others) {
    const oV = [o.x, o.x + o.width / 2, o.x + o.width];
    const oH = [o.y, o.y + o.height / 2, o.y + o.height];
    for (const d of dragV) {
      for (const t of oV) {
        const diff = t - d;
        if (Math.abs(diff) <= threshold && (!bestV || Math.abs(diff) < Math.abs(bestV.diff))) {
          bestV = { diff, guide: t };
        }
      }
    }
    for (const d of dragH) {
      for (const t of oH) {
        const diff = t - d;
        if (Math.abs(diff) <= threshold && (!bestH || Math.abs(diff) < Math.abs(bestH.diff))) {
          bestH = { diff, guide: t };
        }
      }
    }
  }

  const guides: Guide[] = [];
  if (bestV) guides.push({ orientation: 'vertical', position: bestV.guide });
  if (bestH) guides.push({ orientation: 'horizontal', position: bestH.guide });
  return { dx: bestV?.diff ?? 0, dy: bestH?.diff ?? 0, guides };
}
