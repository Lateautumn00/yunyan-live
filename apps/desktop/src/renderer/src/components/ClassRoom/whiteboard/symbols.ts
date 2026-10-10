/** F1.3 符号快捷面板：按学科分组的常用符号 + 光标处插入 */

export interface SymbolGroup {
  id: string;
  label: string;
  symbols: string[];
}

/** 分组页签：通用数学 / 物理 / 化学 / 国际音标（音标服务英语"单词听写与音标板书"） */
export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'math',
    label: '通用数学',
    symbols: [
      '≥',
      '≤',
      '±',
      '×',
      '÷',
      '∠',
      '∥',
      '⊥',
      '≌',
      '∑',
      '∫',
      '√',
      'π',
      'α',
      'β',
      'Δ',
      '→',
      '°',
      '∞',
      '≠',
      '≈'
    ]
  },
  {
    id: 'physics',
    label: '物理',
    symbols: [
      '≈',
      '≠',
      '∞',
      'Ω',
      'α',
      'β',
      'γ',
      'Δ',
      '→',
      '↑',
      '↓',
      '∥',
      '⊥',
      '·',
      '×',
      '÷',
      '°',
      'N',
      'W',
      'V',
      'A',
      'ω'
    ]
  },
  {
    id: 'chem',
    label: '化学',
    symbols: [
      '→',
      '⇌',
      '↑',
      '↓',
      '△',
      '+',
      '=',
      '\\ce{}',
      '\\mathrm{}',
      '\\overset{}',
      '_{}^{}',
      '\\xrightarrow{}',
      '\\overset{点燃}{=}'
    ]
  },
  {
    id: 'phonetic',
    label: '音标',
    symbols: [
      'iː',
      'ɪ',
      'e',
      'æ',
      'ɑː',
      'ɒ',
      'ɔː',
      'ʊ',
      'uː',
      'ʌ',
      'ə',
      'ɜː',
      'θ',
      'ð',
      'ʃ',
      'ʒ',
      'ŋ',
      'tʃ',
      'dʒ',
      'eɪ',
      'aɪ',
      'ɔɪ',
      'əʊ',
      'aʊ',
      'sɪ'
    ]
  }
];

/** 在光标处插入符号：返回新值与前移后的光标位置（textarea selectionStart 同步用） */
export function insertAtCursor(
  value: string,
  cursor: number,
  symbol: string
): { value: string; cursor: number } {
  const next = value.slice(0, cursor) + symbol + value.slice(cursor);
  return { value: next, cursor: cursor + symbol.length };
}
