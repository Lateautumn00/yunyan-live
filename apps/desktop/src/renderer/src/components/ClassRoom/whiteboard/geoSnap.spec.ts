import { describe, expect, it } from 'vitest';
import { SNAP_THRESHOLD, collectSnapTargets, snapPoint, type SnapSegment } from './geoSnap';

const line = (x1: number, y1: number, x2: number, y2: number) => ({
  type: 'line',
  points: [x1, y1, x2, y2]
});

describe('geoSnap — F2.3 几何吸附（端点/中点/垂足）', () => {
  it('正向：端点吸附命中阈值内最近点，坐标精确对齐', () => {
    const { targets } = collectSnapTargets([line(0, 0, 100, 0)]);
    const r = snapPoint({ x: 4, y: 3 }, { targets, segments: [] });
    expect(r.snapped).toBe(true);
    expect(r.kind).toBe('endpoint');
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('正向：线段中点吸附（与端点竞争时取更近者）', () => {
    const { targets } = collectSnapTargets([line(0, 0, 100, 0)]);
    const r = snapPoint({ x: 52, y: 2 }, { targets, segments: [] });
    expect(r.snapped).toBe(true);
    expect(r.kind).toBe('midpoint');
    expect(r.x).toBe(50);
    expect(r.y).toBe(0);
  });

  it('正向：垂足吸附——点在线段上方时吸到最近垂足（非端点/中点）', () => {
    const { targets, segments } = collectSnapTargets([line(0, 0, 100, 0)]);
    const r = snapPoint({ x: 30, y: 15 }, { targets, segments }, 20);
    expect(r.snapped).toBe(true);
    expect(r.kind).toBe('perpendicular');
    expect(r.x).toBe(30);
    expect(r.y).toBe(0);
  });

  it('负向：超出阈值不吸附，原样返回且 kind 为空', () => {
    const { targets, segments } = collectSnapTargets([line(0, 0, 100, 0)]);
    const r = snapPoint({ x: 40, y: 60 }, { targets, segments }, 10);
    expect(r.snapped).toBe(false);
    expect(r.kind).toBeNull();
    expect(r.x).toBe(40);
    expect(r.y).toBe(60);
  });

  it('负向：垂足落在线段之外（延长线上）不吸附', () => {
    const { targets, segments } = collectSnapTargets([line(0, 0, 100, 0)]);
    const r = snapPoint({ x: 150, y: 8 }, { targets, segments }, 20);
    expect(r.snapped).toBe(false);
    expect(r.kind).not.toBe('perpendicular');
  });

  it('负向：空元素不产生吸附目标，任何点均不吸附', () => {
    const { targets, segments } = collectSnapTargets([]);
    expect(targets).toHaveLength(0);
    expect(segments).toHaveLength(0);
    const r = snapPoint({ x: 1, y: 2 }, { targets, segments });
    expect(r.snapped).toBe(false);
  });

  it('collectSnapTargets：矩形派生四角（端点）/四边中点/中心', () => {
    const { targets, segments } = collectSnapTargets([
      { type: 'rect', x: 10, y: 20, width: 80, height: 40 }
    ]);
    const kinds = targets.map(t => t.kind);
    expect(kinds).toContain('endpoint');
    expect(kinds).toContain('midpoint');
    expect(kinds).toContain('center');
    expect(targets.filter(t => t.kind === 'endpoint')).toHaveLength(4);
    expect(targets.filter(t => t.kind === 'midpoint')).toHaveLength(4);
    expect(targets.filter(t => t.kind === 'center')).toHaveLength(1);
    expect(segments).toHaveLength(4); // 4 条边
    // 左上角与中心派生正确
    expect(targets.some(t => t.x === 10 && t.y === 20)).toBe(true);
    expect(targets.some(t => t.x === 50 && t.y === 40 && t.kind === 'center')).toBe(true);
  });

  it('collectSnapTargets：圆派生圆心与四向象限点', () => {
    const { targets } = collectSnapTargets([{ type: 'circle', x: 100, y: 100, radius: 50 }]);
    expect(targets.some(t => t.kind === 'center' && t.x === 100 && t.y === 100)).toBe(true);
    expect(targets.filter(t => t.kind === 'endpoint')).toHaveLength(4);
    expect(targets.some(t => t.x === 150 && t.y === 100)).toBe(true);
  });

  it('负向：退化段（零长度）不产生垂足吸附', () => {
    const degenerate: SnapSegment[] = [{ x1: 10, y1: 10, x2: 10, y2: 10 }];
    const r = snapPoint({ x: 14, y: 14 }, { targets: [], segments: degenerate }, 20);
    expect(r.snapped).toBe(false);
  });

  it('负向：自由笔迹/图片/文本不作吸附目标（手绘折线是噪声源）', () => {
    const { targets, segments } = collectSnapTargets([
      { type: 'brush', points: [100, 100, 300, 160] },
      { type: 'curve', x: 10, y: 10, points: [10, 10, 20, 20] },
      { type: 'ppt-image', x: 0, y: 0, width: 100, height: 100 },
      { type: 'text', points: [5, 5, 10, 10] }
    ]);
    expect(targets).toHaveLength(0);
    expect(segments).toHaveLength(0);
    const r = snapPoint({ x: 100, y: 100 }, { targets, segments }, 50);
    expect(r.snapped).toBe(false);
  });

  it('默认阈值为 SNAP_THRESHOLD，且可被覆盖', () => {
    const { targets } = collectSnapTargets([line(0, 0, 100, 0)]);
    const far = { x: SNAP_THRESHOLD + 5, y: 0 };
    expect(snapPoint(far, { targets, segments: [] }).snapped).toBe(false);
    expect(snapPoint(far, { targets, segments: [] }, SNAP_THRESHOLD + 10).snapped).toBe(true);
  });
});
