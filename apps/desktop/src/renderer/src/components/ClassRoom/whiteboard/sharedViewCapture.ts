/** F3.4 截图回填：从外挂 iframe 的 contentDocument 抓首个 canvas → PNG dataURL */
export function captureCanvasFromDoc(doc: Pick<Document, 'querySelector'> | null): string | null {
  if (!doc) return null;
  const canvas = doc.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL('image/png');
    return url && url.startsWith('data:image') ? url : null;
  } catch {
    return null;
  }
}
