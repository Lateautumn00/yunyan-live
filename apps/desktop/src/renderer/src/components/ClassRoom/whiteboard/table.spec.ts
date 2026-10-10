import { describe, it, expect } from 'vitest';
import { createTable, addRow, removeRow, addCol, removeCol, setCell } from './table';

// ── F4.4 表格数据模型：固定模板 + 增删行列（单元格文本/底色可调） ──────────
describe('table 数据模型（F4.4）', () => {
  it('正向：createTable 生成 rows×cols 空单元格', () => {
    const t = createTable(3, 4, 80, 30);
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(4);
    expect(t.cells).toHaveLength(3);
    expect(t.cells[0]).toHaveLength(4);
    expect(t.cells[0]![0]!.text).toBe('');
  });

  it('正向：addRow 末尾加行且保留既有单元格文本', () => {
    let t = createTable(2, 2, 80, 30);
    t = setCell(t, 0, 0, { text: 'A' });
    t = addRow(t);
    expect(t.rows).toBe(3);
    expect(t.cells).toHaveLength(3);
    expect(t.cells[0]![0]!.text).toBe('A');
    expect(t.cells[2]).toHaveLength(2);
  });

  it('正向：removeRow 删除指定行', () => {
    let t = createTable(3, 2, 80, 30);
    t = setCell(t, 1, 0, { text: 'B' });
    t = removeRow(t, 1);
    expect(t.rows).toBe(2);
    expect(t.cells[1]![0]!.text).toBe(''); // 原第 2 行被删，新第 2 行为空
  });

  it('正向：addCol/removeCol 增删列且保留既有文本', () => {
    let t = createTable(2, 2, 80, 30);
    t = setCell(t, 0, 1, { text: 'C' });
    t = addCol(t);
    expect(t.cols).toBe(3);
    expect(t.cells[0]).toHaveLength(3);
    expect(t.cells[0]![1]!.text).toBe('C');
    t = removeCol(t, 0);
    expect(t.cols).toBe(2);
    expect(t.cells[0]![0]!.text).toBe('C'); // 删第 0 列后原第 1 列左移
  });

  it('正向：setCell 写入文本与底色', () => {
    let t = createTable(2, 2, 80, 30);
    t = setCell(t, 1, 1, { text: 'X', bg: '#ff0' });
    expect(t.cells[1]![1]!.text).toBe('X');
    expect(t.cells[1]![1]!.bg).toBe('#ff0');
  });

  it('负向：仅剩 1 行时 removeRow 不变（保底 1 行）', () => {
    const t = createTable(1, 2, 80, 30);
    const r = removeRow(t, 0);
    expect(r.rows).toBe(1);
    expect(r.cells).toHaveLength(1);
  });

  it('负向：仅剩 1 列时 removeCol 不变（保底 1 列）', () => {
    const t = createTable(2, 1, 80, 30);
    const r = removeCol(t, 0);
    expect(r.cols).toBe(1);
    expect(r.cells[0]).toHaveLength(1);
  });
});
