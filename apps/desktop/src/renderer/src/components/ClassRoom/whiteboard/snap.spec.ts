import { describe, it, expect } from 'vitest';
import { computeSnap, type Box } from './snap';

// ── F4.5 对齐吸附：拖动元素与邻元素边缘/中心吸附 + 参考线 ──────────────────
// Alt 跳过本次吸附（skip=true 时零位移、无线）；阈值内取最近对齐边。
describe('computeSnap（F4.5 对齐吸附）', () => {
  const drag: Box = { x: 100, y: 100, width: 40, height: 20 };
  // 参照：左边 x=98（与 drag.x 差 2，阈值内）；中心/右边不近
  const others: Box[] = [{ x: 98, y: 300, width: 60, height: 30 }];

  it('正向：左边缘在阈值内吸附到参照左边缘，产生垂直参考线', () => {
    const r = computeSnap(drag, others, 6, false);
    expect(r.dx).toBe(-2); // 100 → 98
    expect(
      r.guides.some(g => g.orientation === 'vertical' && Math.abs(g.position - 98) < 0.01)
    ).toBe(true);
  });

  it('正向：水平中心对齐吸附（drag 中心 y=110 吸到参照中心 y=315 需超出阈值则不吸）', () => {
    // drag 中心 y = 100+10=110；参照中心 y = 300+15=315（远超阈值）→ 不吸附，dy=0
    const r = computeSnap(drag, others, 6, false);
    expect(r.dy).toBe(0);
    expect(r.guides.some(g => g.orientation === 'horizontal')).toBe(false);
  });

  it('负向：按住 Alt 跳过本次吸附（零位移、无参考线）', () => {
    const r = computeSnap(drag, others, 6, true);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guides.length).toBe(0);
  });

  it('边界：无邻元素时不吸附', () => {
    const r = computeSnap(drag, [], 6, false);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guides.length).toBe(0);
  });

  it('边界：超出阈值不吸附（dx=0）', () => {
    const far: Box[] = [{ x: 500, y: 300, width: 60, height: 30 }];
    const r = computeSnap(drag, far, 6, false);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });
});
