import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// worker 延迟初始化：未实际加载 PDF 前不创建 Worker（便于单测 mock 本模块）
let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  workerReady = true;
}

const docCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();

export function loadPdfDoc(url: string): Promise<pdfjs.PDFDocumentProxy> {
  ensureWorker();
  let doc = docCache.get(url);
  if (!doc) {
    doc = pdfjs.getDocument({ url }).promise;
    docCache.set(url, doc);
    void doc.catch(() => docCache.delete(url));
  }
  return doc;
}

export async function getPdfPageCount(url: string): Promise<number> {
  const doc = await loadPdfDoc(url);
  return doc.numPages;
}

export async function getPdfPageDims(
  url: string,
  pageNum: number,
): Promise<{ w: number; h: number }> {
  const doc = await loadPdfDoc(url);
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  return { w: viewport.width, h: viewport.height };
}

// 渲染缓存：同一 (url, page, scale) 只渲染一次，画布可在多个 Konva.Image 间复用
const renderCache = new Map<string, HTMLCanvasElement>();

export async function renderPdfPage(
  url: string,
  pageNum: number,
  scale = 3,
): Promise<HTMLCanvasElement> {
  const key = `${url}#${pageNum}@${scale}`;
  const hit = renderCache.get(key);
  if (hit) return hit;

  const doc = await loadPdfDoc(url);
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  renderCache.set(key, canvas);
  return canvas;
}
