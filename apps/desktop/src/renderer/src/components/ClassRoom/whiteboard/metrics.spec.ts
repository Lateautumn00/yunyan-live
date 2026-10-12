import { describe, expect, it } from 'vitest';
import { computeMetrics, fmtNum, interiorAngles, polyArea, segLength } from './metrics';

// F2.4 度量标注：几何量纯函数（无 Konva 依赖，KonvaRenderer 派生绘制调用）
function el(data: Record<string, unknown>) {
  return { get: (k: string) => data[k] };
}

describe('metrics 纯函数（F2.4 度量标注）', () => {
  it('正向：格式化 / 折线长度 / 鞋带面积 / 顶点多边形内角', () => {
    expect(fmtNum(100)).toBe('100');
    expect(fmtNum(123.456)).toBe('123.5');
    expect(fmtNum(7853.981)).toBe('7854');
    expect(segLength([0, 0, 30, 40])).toBeCloseTo(50, 5);
    expect(polyArea([0, 0, 100, 0, 100, 80, 0, 80])).toBeCloseTo(8000, 5);
    const angles = interiorAngles([0, 0, 100, 0, 100, 80, 0, 80]);
    expect(angles).toHaveLength(4);
    angles.forEach(a => expect(a).toBeCloseTo(90, 4));
  });

  it('正向：computeMetrics 按类型产出标注（线长 / 矩形 / 圆 / 多边形+内角）', () => {
    expect(computeMetrics(el({ type: 'line', points: [0, 0, 100, 0], measure: true }))).toEqual([
      { text: '100', x: 20, y: -8, w: 60 }
    ]);
    const rect = computeMetrics(
      el({ type: 'rect', x: 10, y: 10, width: 100, height: 80, measure: true })
    );
    expect(rect[0]!.text).toBe('100×80');
    const circle = computeMetrics(el({ type: 'circle', x: 50, y: 50, radius: 50, measure: true }));
    expect(circle[0]!.text).toBe('C=314.2 · S=7854');
    const poly = computeMetrics(
      el({ type: 'polygon', points: [0, 0, 100, 0, 100, 80, 0, 80], measure: true })
    );
    expect(poly.map(l => l.text)).toContain('S=8000 · C=360');
    expect(poly.filter(l => l.text.endsWith('°'))).toHaveLength(4);
  });

  it('负向：未开度量 / 退化几何 / 未知类型返回空且不抛异常', () => {
    expect(computeMetrics(el({ type: 'line', points: [0, 0, 100, 0] }))).toEqual([]);
    expect(computeMetrics(el({ type: 'line', points: [5, 5, 5, 5], measure: true }))).toEqual([]);
    expect(computeMetrics(el({ type: 'text', measure: true }))).toEqual([]);
    // 共线多边形：面积/内角不产（防噪声），周长仍显示
    const flat = computeMetrics(
      el({ type: 'polygon', points: [0, 0, 10, 0, 20, 0], measure: true })
    );
    expect(flat.map(l => l.text).join()).not.toContain('S=');
    expect(flat.map(l => l.text).join()).toContain('C=40');
    // 顶点不足：不产标注也不抛
    expect(computeMetrics(el({ type: 'polygon', points: [0, 0], measure: true }))).toEqual([]);
    expect(() =>
      computeMetrics(el({ type: 'polygon', points: [0, 0], measure: true }))
    ).not.toThrow();
  });
});
