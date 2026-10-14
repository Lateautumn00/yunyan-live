import { describe, it, expect } from 'vitest';
import { regularizePath } from './regularize';

// ── F4.2 手绘图形规整：轨迹采样 + 几何拟合判定 ────────────────────────────
// 直线度/圆度阈值；失败返回 null（保留原笔迹）。
describe('regularizePath（F4.2 手绘规整拟合）', () => {
  it('正向：近似水平直线拟合为 line（端点）', () => {
    // 轻微抖动的水平线
    const pts = [0, 0, 25, 1, 50, -1, 75, 0, 100, 1];
    const r = regularizePath(pts);
    expect(r?.kind).toBe('line');
    if (r?.kind === 'line') {
      expect(r.points[0]).toBeCloseTo(0, 0);
      expect(r.points[2]).toBeCloseTo(100, 0);
      expect(r.points[3]).toBeCloseTo(1, 0);
    }
  });

  it('正向：近似圆拟合为 circle（圆心+半径）', () => {
    // 半径 50 的圆，采样 24 点带轻微噪声
    const pts: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(100 + 50 * Math.cos(a), 80 + 50 * Math.sin(a));
    }
    const r = regularizePath(pts);
    expect(r?.kind).toBe('circle');
    if (r?.kind === 'circle') {
      expect(r.x).toBeCloseTo(100, 0);
      expect(r.y).toBeCloseTo(80, 0);
      expect(r.radius).toBeCloseTo(50, 0);
    }
  });

  it('正向：闭合矩形拟合为 rect（包围盒）', () => {
    // 沿矩形四边走一圈：左上→右上→右下→左下→左上
    const pts = [10, 10, 110, 12, 108, 80, 12, 78, 10, 10];
    const r = regularizePath(pts);
    expect(r?.kind).toBe('rect');
    if (r?.kind === 'rect') {
      expect(r.x).toBeCloseTo(10, 0);
      expect(r.y).toBeCloseTo(10, 0);
      expect(r.width).toBeCloseTo(100, 0);
      expect(r.height).toBeCloseTo(70, 0);
    }
  });

  it('负向：1/4 圆弧（未闭合）不补成圆，返回 null（保留笔迹）', () => {
    // 90° 弧：点都在圆上，残差小，但角间隙 270° 远超闭合阈值
    const pts: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      pts.push(100 + 50 * Math.cos(a), 80 + 50 * Math.sin(a));
    }
    expect(regularizePath(pts)).toBeNull();
  });

  it('正向：小半径圆（r=25，贴包围盒边）仍拟合为 circle，不被矩形抢走', () => {
    // 旧版 fitRect 绝对容差 14px 下，小圆贴边比例 >90% 会被误判为矩形
    const pts: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(100 + 25 * Math.cos(a), 80 + 25 * Math.sin(a));
    }
    const r = regularizePath(pts);
    expect(r?.kind).toBe('circle');
    if (r?.kind === 'circle') {
      expect(r.x).toBeCloseTo(100, 0);
      expect(r.y).toBeCloseTo(80, 0);
      expect(r.radius).toBeCloseTo(25, 0);
    }
  });

  it('正向：单点抖动较大的圆仍拟合为 circle（RMS 双指标容忍）', () => {
    const pts: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      // 其余点噪声 ±3，第 12 点径向偏 12px（旧版 max 残差判定会被否决）
      const noise = i === 12 ? 12 : (i % 3) - 1;
      pts.push(100 + (50 + noise) * Math.cos(a), 80 + (50 + noise) * Math.sin(a));
    }
    const r = regularizePath(pts);
    expect(r?.kind).toBe('circle');
    if (r?.kind === 'circle') {
      // 单点 +12 噪声会轻微拉偏均值半径，容差放宽到 ±5
      expect(r.radius).toBeGreaterThanOrEqual(45);
      expect(r.radius).toBeLessThanOrEqual(55);
    }
  });

  it('正向：近似正方形仍拟合为 rect（四角验证通过）', () => {
    // 过四角的手绘正方形：角邻域内都有笔迹点
    const pts = [20, 20, 120, 18, 122, 120, 18, 122, 20, 20];
    const r = regularizePath(pts);
    expect(r?.kind).toBe('rect');
    if (r?.kind === 'rect') {
      expect(r.x).toBeCloseTo(18, 0);
      expect(r.y).toBeCloseTo(18, 0);
      expect(r.width).toBeCloseTo(104, 0);
      expect(r.height).toBeCloseTo(104, 0);
    }
  });

  it('负向：不规则折线（非直线/圆/矩形）返回 null（保留笔迹）', () => {
    // 交叉/沙漏形：含包围盒内部点（50,50），非矩形
    const pts = [0, 0, 50, 50, 100, 0, 100, 100, 0, 100, 50, 50];
    expect(regularizePath(pts)).toBeNull();
  });

  it('边界：点数过少（<3 点）不规整，返回 null', () => {
    expect(regularizePath([0, 0, 10, 10])).toBeNull();
    expect(regularizePath([])).toBeNull();
  });
});
