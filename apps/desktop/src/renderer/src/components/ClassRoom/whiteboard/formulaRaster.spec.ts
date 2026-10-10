import { beforeEach, describe, expect, it, vi } from 'vitest';

const html2canvasMock = vi.hoisted(() => vi.fn());

vi.mock('html2canvas', () => ({ default: html2canvasMock }));

import {
  FORMULA_INVALID_MSG,
  clearFormulaCache,
  formulaOversample,
  measureFormula,
  rasterizeFormula,
  validateLatex,
  wrapChem
} from './formulaRaster';

describe('formulaRaster', () => {
  beforeEach(() => {
    clearFormulaCache();
    html2canvasMock.mockReset();
    html2canvasMock.mockImplementation(async () => ({ __formulaCanvas: true }));
    // jsdom 无布局：借 offsetWidth/offsetHeight 读回稳定自然尺寸
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 130
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 40
    });
  });

  it('validateLatex 通过合法源码，拒绝非法源码并给出行内文案（不暴露库报错）', () => {
    expect(validateLatex('E=mc^2').ok).toBe(true);
    const bad = validateLatex('\\frac{1}{');
    expect(bad.ok).toBe(false);
    expect(bad.message).toBe(FORMULA_INVALID_MSG);
    expect(bad.message).not.toContain('KaTeX');
    expect(bad.message).not.toContain('Expected');
  });

  it('formulaOversample = clamp(2×zoom, 1, 8)', () => {
    expect(formulaOversample(100)).toBe(2);
    expect(formulaOversample(400)).toBe(8);
    expect(formulaOversample(300)).toBe(6);
    expect(formulaOversample(50)).toBe(1);
    expect(formulaOversample(10)).toBe(1);
  });

  it('measureFormula 返回自然尺寸并清理离屏节点，不触发光栅', () => {
    const box = measureFormula('E=mc^2', '#ff0000');
    expect(box).toEqual({ width: 130, height: 40 });
    expect(document.body.innerHTML).not.toContain('-100000px');
    expect(html2canvasMock).not.toHaveBeenCalled();
  });

  it('rasterizeFormula 过采样光栅 + 透明底，同键命中缓存，异键重算', async () => {
    const first = await rasterizeFormula('E=mc^2', '#000000', 2);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(html2canvasMock.mock.calls[0]![1]).toMatchObject({
      scale: 2,
      backgroundColor: 'transparent'
    });
    expect(first.width).toBe(130);
    expect(first.height).toBe(40);

    const second = await rasterizeFormula('E=mc^2', '#000000', 2);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    await rasterizeFormula('E=mc^2', '#000000', 4);
    expect(html2canvasMock).toHaveBeenCalledTimes(2);
    await rasterizeFormula('E=mc^2', '#ff0000', 4);
    expect(html2canvasMock).toHaveBeenCalledTimes(3);
    expect(document.body.innerHTML).not.toContain('-100000px');
  });

  it('rasterizeFormula 并发同键去重', async () => {
    let release: (v: unknown) => void = () => {};
    html2canvasMock.mockImplementation(() => new Promise(res => (release = res)));
    const p1 = rasterizeFormula('a+b', '#000000', 2);
    const p2 = rasterizeFormula('a+b', '#000000', 2);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    release({ __formulaCanvas: true });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r2).toBe(r1);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
  });

  it('clearFormulaCache 后同键重新光栅', async () => {
    await rasterizeFormula('x^2', '#000000', 2);
    clearFormulaCache();
    await rasterizeFormula('x^2', '#000000', 2);
    expect(html2canvasMock).toHaveBeenCalledTimes(2);
  });
});

// F1.2 化学方程式（mhchem 扩展）：\ce{} 语法经 katex contrib 注册后可校验/渲染
describe('formulaRaster — F1.2 化学 mhchem', () => {
  beforeEach(() => {
    clearFormulaCache();
  });

  it('validateLatex 接受 \\ce{} 化学式（气体↑/沉淀↓/条件）', () => {
    expect(validateLatex('\\ce{H2O}').ok).toBe(true);
    expect(validateLatex('\\ce{CO2 + Ca(OH)2 -> CaCO3 v + H2O}').ok).toBe(true);
    expect(validateLatex('\\ce{^{227}_{90}Th}').ok).toBe(true);
  });

  it('非法 \\ce{} 仍拒绝并回落行内文案', () => {
    const bad = validateLatex('\\ce{H2O');
    expect(bad.ok).toBe(false);
    expect(bad.message).toBe(FORMULA_INVALID_MSG);
  });

  it('wrapChem：化学模式下裸输入包裹 \\ce{}，已含 \\ce 不重复包裹', () => {
    expect(wrapChem('H2O')).toBe('\\ce{H2O}');
    expect(wrapChem('\\ce{H2O}')).toBe('\\ce{H2O}');
    expect(wrapChem('\\frac{1}{2}')).toBe('\\frac{1}{2}');
  });
});
