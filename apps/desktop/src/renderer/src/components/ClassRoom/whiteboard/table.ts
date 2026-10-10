// F4.4 表格数据模型：固定模板 + 增删行列（单元格文本/底色可调）。
// 所有变更返回新对象（不可变），便于 Yjs 落库与撤销对比。
export interface TableCell {
  text: string;
  bg?: string;
}

export interface TableData {
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  cells: TableCell[][];
}

function emptyRow(cols: number): TableCell[] {
  return Array.from({ length: cols }, () => ({ text: '' }));
}

export function createTable(rows: number, cols: number, cellW: number, cellH: number): TableData {
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  return { rows: r, cols: c, cellW, cellH, cells: Array.from({ length: r }, () => emptyRow(c)) };
}

export function addRow(t: TableData, index?: number): TableData {
  const at = index === undefined ? t.rows : Math.max(0, Math.min(t.rows, index));
  const cells = [...t.cells];
  cells.splice(at, 0, emptyRow(t.cols));
  return { ...t, rows: t.rows + 1, cells };
}

export function removeRow(t: TableData, index: number): TableData {
  if (t.rows <= 1) return t; // 保底 1 行
  if (index < 0 || index >= t.rows) return t;
  const cells = t.cells.filter((_, i) => i !== index);
  return { ...t, rows: t.rows - 1, cells };
}

export function addCol(t: TableData, index?: number): TableData {
  const at = index === undefined ? t.cols : Math.max(0, Math.min(t.cols, index));
  const cells = t.cells.map(row => {
    const next = [...row];
    next.splice(at, 0, { text: '' });
    return next;
  });
  return { ...t, cols: t.cols + 1, cells };
}

export function removeCol(t: TableData, index: number): TableData {
  if (t.cols <= 1) return t; // 保底 1 列
  if (index < 0 || index >= t.cols) return t;
  const cells = t.cells.map(row => row.filter((_, i) => i !== index));
  return { ...t, cols: t.cols - 1, cells };
}

export function setCell(
  t: TableData,
  row: number,
  col: number,
  patch: Partial<TableCell>
): TableData {
  if (row < 0 || row >= t.rows || col < 0 || col >= t.cols) return t;
  const cells = t.cells.map((r, ri) =>
    ri === row ? r.map((cell, ci) => (ci === col ? { ...cell, ...patch } : cell)) : r
  );
  return { ...t, cells };
}
