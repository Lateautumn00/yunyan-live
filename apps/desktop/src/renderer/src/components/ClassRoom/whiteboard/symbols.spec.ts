import { describe, expect, it } from 'vitest';
import { SYMBOL_GROUPS, insertAtCursor } from './symbols';

describe('symbols — F1.3 符号快捷面板', () => {
  it('四分组齐全：通用数学/物理/化学/国际音标，各组符号非空', () => {
    const ids = SYMBOL_GROUPS.map(g => g.id);
    expect(ids).toEqual(['math', 'physics', 'chem', 'phonetic']);
    for (const g of SYMBOL_GROUPS) {
      expect(g.symbols.length).toBeGreaterThan(0);
      expect(g.label).toBeTruthy();
    }
  });

  it('音标分组覆盖核心元音/辅音（iː θ ð ʃ ŋ tʃ dʒ）', () => {
    const phonetic = SYMBOL_GROUPS.find(g => g.id === 'phonetic')!;
    for (const s of ['iː', 'θ', 'ð', 'ʃ', 'ŋ', 'tʃ', 'dʒ']) {
      expect(phonetic.symbols).toContain(s);
    }
  });

  it('insertAtCursor：中间插入值与光标同步前移', () => {
    const r = insertAtCursor('ab', 1, '≥');
    expect(r.value).toBe('a≥b');
    expect(r.cursor).toBe(2);
  });

  it('insertAtCursor：头部/尾部插入', () => {
    expect(insertAtCursor('x', 0, 'π')).toEqual({ value: 'πx', cursor: 1 });
    expect(insertAtCursor('x', 1, 'π')).toEqual({ value: 'xπ', cursor: 2 });
  });
});
