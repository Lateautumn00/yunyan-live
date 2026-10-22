/** F3.4 截图回填：主视图 canvas 取样结果（dataURL + 背板像素尺寸，供宽高比落图） */
export interface SharedViewCapture {
  url: string;
  width: number;
  height: number;
}

/**
 * 从外挂 iframe 的 contentDocument 抓主视图 canvas → PNG dataURL。
 * CircuitJS 会把引脚对话框（400×400 白底单元件）等画布预挂进 DOM 且先于主视图创建，
 * `querySelector('canvas')` 会抓错——故：优先可见画布，再取背板面积最大者（主视图 ≫ 对话框/滚动条）。
 * 全隐藏或无布局环境（jsdom）时回退全量取最大。
 */
export function captureCanvasFromDoc(
  doc: Pick<Document, 'querySelectorAll'> | null
): SharedViewCapture | null {
  if (!doc) return null;
  const all = Array.from(doc.querySelectorAll('canvas'));
  if (!all.length) return null;
  const visible = all.filter(c => c.getClientRects().length > 0);
  const pool = visible.length ? visible : all;
  const canvas = pool.reduce((best, c) =>
    c.width * c.height > best.width * best.height ? c : best
  );
  try {
    const url = canvas.toDataURL('image/png');
    if (!url.startsWith('data:image')) return null;
    return { url, width: canvas.width || 1, height: canvas.height || 1 };
  } catch {
    return null;
  }
}
