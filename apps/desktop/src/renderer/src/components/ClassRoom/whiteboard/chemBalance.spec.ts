import { describe, expect, it } from 'vitest';
import { balanceEquation } from './chemBalance';
import type { BalanceResult } from './chemBalance';

function coef(src: string): number[] {
  const r = balanceEquation(src);
  if (!r.ok) throw new Error(`期望配平成功: ${src} → ${r.reason}`);
  return r.coefficients;
}

function errOf(src: string): string {
  const r = balanceEquation(src);
  if (r.ok) throw new Error(`期望失败但成功了: ${src} → ${r.display}`);
  return r.reason;
}

function display(src: string): string {
  const r: BalanceResult = balanceEquation(src);
  if (!r.ok) throw new Error(`期望配平成功: ${src} → ${r.reason}`);
  return r.display;
}

const TESTSET: Array<[string, number[]]> = [
  ['H2 + O2 -> H2O', [2, 1, 2]],
  ['N2 + H2 -> NH3', [1, 3, 2]],
  ['CH4 + O2 -> CO2 + H2O', [1, 2, 1, 2]],
  ['Fe + O2 -> Fe2O3', [4, 3, 2]],
  ['Al + H2SO4 -> Al2(SO4)3 + H2', [2, 3, 1, 3]],
  ['Na + H2O -> NaOH + H2', [2, 2, 2, 1]],
  ['CaCO3 + HCl -> CaCl2 + H2O + CO2', [1, 2, 1, 1, 1]],
  ['KClO3 -> KCl + O2', [2, 2, 3]],
  ['C + CO2 -> CO', [1, 1, 2]],
  ['P + O2 -> P2O5', [4, 5, 2]],
  ['Mg + O2 -> MgO', [2, 1, 2]],
  ['H2 + Cl2 -> HCl', [1, 1, 2]],
  ['S + O2 -> SO2', [1, 1, 1]],
  ['SO2 + O2 -> SO3', [2, 1, 2]],
  ['NH3 + O2 -> NO + H2O', [4, 5, 4, 6]],
  ['C2H6 + O2 -> CO2 + H2O', [2, 7, 4, 6]],
  ['H2SO4 + NaOH -> Na2SO4 + H2O', [1, 2, 1, 2]],
  ['AgNO3 + NaCl -> AgCl + NaNO3', [1, 1, 1, 1]],
  ['BaCl2 + H2SO4 -> BaSO4 + HCl', [1, 1, 1, 2]],
  ['Ca(OH)2 + HCl -> CaCl2 + H2O', [1, 2, 1, 2]],
  ['KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2', [2, 16, 2, 2, 8, 5]],
  ['Cu + HNO3 -> Cu(NO3)2 + NO2 + H2O', [1, 4, 1, 2, 2]],
  ['Fe2O3 + CO -> Fe + CO2', [1, 3, 2, 3]]
];

describe('chemBalance：化学方程式配平（F3.6 矩阵法）', () => {
  it('正向：23 式测试集全部配平为最小整数比', () => {
    for (const [src, expected] of TESTSET) {
      expect(coef(src), src).toEqual(expected);
    }
  });

  it('正向：\\ce{} 包裹、状态符号、条件箭头与显式系数均可解析', () => {
    expect(coef('\\ce{2H2 + O2 -> 2H2O}')).toEqual([2, 1, 2]);
    expect(coef('CaCO3(s) + HCl(aq) -> CaCl2(aq) + H2O(l) + CO2(g)')).toEqual([1, 2, 1, 1, 1]);
    expect(coef('2KClO3 \\xrightarrow{MnO2} 2KCl + 3O2')).toEqual([2, 2, 3]);
    expect(coef('2H2 + O2 == 2H2O')).toEqual([2, 1, 2]);
  });

  it('正向：display 输出可读字串（含系数，1 也显式标出）', () => {
    expect(display('H2 + O2 -> H2O')).toBe('2H2 + 1O2 -> 2H2O');
    expect(display('Fe + O2 -> Fe2O3')).toBe('4Fe + 3O2 -> 2Fe2O3');
  });

  it('负向：空输入/无箭头/多个箭头返回可读错误且不抛异常', () => {
    expect(errOf('')).toContain('空');
    expect(errOf('   ')).toContain('空');
    expect(errOf('H2O')).toContain('箭头');
    expect(errOf('H2 -> O2 -> H2O')).toContain('箭头');
  });

  it('负向：不可配平式与空化学式返回错误', () => {
    expect(errOf('H2 -> O2')).toBeTruthy();
    expect(errOf('H2 + -> H2O')).toBeTruthy();
    expect(errOf('H2 + O2')).toContain('箭头');
  });
});
