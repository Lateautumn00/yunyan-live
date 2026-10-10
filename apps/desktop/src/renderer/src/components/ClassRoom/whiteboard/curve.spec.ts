import { describe, expect, it } from 'vitest';
import { CURVE_MAX_EXPR, layoutCurve, sampleCurve, validateExpr } from './curve';

describe('curve — F2.2 函数表达式（Q3 白名单/边界）', () => {
  it('正向：白名单内表达式通过校验', async () => {
    expect((await validateExpr('sin(x)+x^2')).ok).toBe(true);
    expect((await validateExpr('2*x+1')).ok).toBe(true);
    expect((await validateExpr('sqrt(abs(x))')).ok).toBe(true);
    expect((await validateExpr('log(x)')).ok).toBe(true);
    expect((await validateExpr('exp(-x^2)')).ok).toBe(true);
  });

  it('负向：非白名单函数/变量被拒并给可读文案', async () => {
    expect((await validateExpr('foo(x)')).ok).toBe(false);
    expect((await validateExpr('process.exit(1)')).ok).toBe(false);
    expect((await validateExpr('random()')).ok).toBe(false);
    expect((await validateExpr('y+1')).ok).toBe(false);
    const r = await validateExpr('foo(x)');
    expect(r.message).toBeTruthy();
  });

  it('负向：空/超长表达式被拒（Q3 边界）', async () => {
    expect((await validateExpr('')).ok).toBe(false);
    expect((await validateExpr('   ')).ok).toBe(false);
    expect((await validateExpr('x'.repeat(CURVE_MAX_EXPR + 1))).ok).toBe(false);
  });

  it('sampleCurve：在定义域内采样，偶数长度、首尾命中边界、全有限', async () => {
    const pts = await sampleCurve('2*x+1', -5, 5, 100);
    expect(pts.length % 2).toBe(0);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts[0]).toBeCloseTo(-5, 6);
    expect(pts[pts.length - 2]).toBeCloseTo(5, 6);
    // 线性 y=2x+1：逐点校验采样值正确（非仅结构正确）
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i + 1]).toBeCloseTo(2 * pts[i]! + 1, 6);
    }
  });

  it('sampleCurve：断点（tan 渐近线）剔除非有限值，不产生 NaN', async () => {
    const pts = await sampleCurve('tan(x)', -7, 7, 400);
    for (let i = 0; i < pts.length; i++) expect(Number.isFinite(pts[i]!)).toBe(true);
  });

  it('layoutCurve：数学坐标→画布坐标（y 轴翻转），归一化出包围盒原点', () => {
    // 数学点 (0,0)、(1,2)；原点画布 (100,100)，scale=10
    const laid = layoutCurve([0, 0, 1, 2], 100, 100, 10);
    // (0,0)→(100,100)；(1,2)→(110, 80)（x 右移、y 上移即画布减小）
    const abs = laid.points.map((v, i) => (i % 2 === 0 ? v + laid.x : v + laid.y));
    expect(abs[0]).toBeCloseTo(100, 6);
    expect(abs[1]).toBeCloseTo(100, 6);
    expect(abs[2]).toBeCloseTo(110, 6);
    expect(abs[3]).toBeCloseTo(80, 6);
    // 包围盒原点 = 最小 x/y（此处 x 最小 100，y 最小 80）
    expect(laid.x).toBeCloseTo(100, 6);
    expect(laid.y).toBeCloseTo(80, 6);
  });

  it('layoutCurve：空输入返回空点集', () => {
    const laid = layoutCurve([], 0, 0, 30);
    expect(laid.points).toHaveLength(0);
  });
});
