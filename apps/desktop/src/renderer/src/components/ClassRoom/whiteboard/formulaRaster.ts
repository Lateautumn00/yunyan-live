import katex from 'katex';
import html2canvas from 'html2canvas';
import 'katex/dist/katex.min.css';
// F1.2：mhchem 扩展注册 \ce{} 化学式语法（副作用 import，随本懒 chunk 加载，不进主包）
import 'katex/dist/contrib/mhchem.mjs';

/** 公式逻辑字号与内边距（自然尺寸基准；光栅过采样见 scale 参数，F1.1/5.7.1 B1 路线） */
export const FORMULA_FONT_SIZE = 16;
export const FORMULA_PAD = 6;

/** 非法 LaTeX 行内文案（不暴露库原始报错，§4.9 写死） */
export const FORMULA_INVALID_MSG = 'LaTeX 语法有误，请检查括号与命令是否完整';

export interface FormulaRaster {
  canvas: HTMLCanvasElement;
  /** 自然逻辑尺寸（font-size 基准，无缩放）——存入元素 width/height 的值 */
  width: number;
  height: number;
}

export interface FormulaValidateResult {
  ok: boolean;
  message?: string;
}

/** 输入态校验：同步 renderToString，抛错即非法（供浮层红框，不进渲染管线） */
export function validateLatex(latex: string): FormulaValidateResult {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode: true });
    return { ok: true };
  } catch {
    return { ok: false, message: FORMULA_INVALID_MSG };
  }
}

/** F1.2 化学模式：裸化学输入自动包裹 \ce{}；已含 \ce 或非化学（纯数学）输入原样返回 */
export function wrapChem(latex: string): string {
  if (latex.includes('\\ce')) return latex;
  // 化学特征：字母紧邻数字（H2O/CO2）或反应箭头
  return /[A-Za-z]\d|->/.test(latex) ? `\\ce{${latex}}` : latex;
}

/** 过采样系数（5.7.1 实测）：S = clamp(2×zoom, 1, 8)，4× 缩放仍清晰；固定 S 在高倍缩放下发糊 */
export function formulaOversample(zoomPct: number): number {
  return Math.max(1, Math.min(8, 2 * (zoomPct / 100)));
}

function makeHost(latex: string, color: string): HTMLDivElement {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;padding:${FORMULA_PAD}px;white-space:nowrap;font-size:${FORMULA_FONT_SIZE}px;line-height:1.4;color:${color};`;
  document.body.appendChild(host);
  try {
    katex.render(latex, host, { throwOnError: false, displayMode: true });
  } catch {
    host.textContent = latex;
  }
  return host;
}

const cache = new Map<string, FormulaRaster>();
const inflight = new Map<string, Promise<FormulaRaster>>();
const CACHE_MAX = 48;

function cacheKey(latex: string, color: string, scale: number): string {
  return `${scale}|${color}|${latex}`;
}

function putCache(key: string, value: FormulaRaster): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** 清空光栅缓存（字体加载完成/测试隔离用） */
export function clearFormulaCache(): void {
  cache.clear();
}

/** 测量自然尺寸（不光栅化）：提交态"渲染中"只付 katex 排版成本，光栅由节点侧带缓存完成 */
export function measureFormula(
  latex: string,
  color = '#000000'
): { width: number; height: number } | null {
  const host = makeHost(latex, color);
  try {
    if (!host.firstChild) return null;
    return { width: host.offsetWidth, height: host.offsetHeight };
  } finally {
    host.remove();
  }
}

/** B1 光栅管线：katex DOM → html2canvas → canvas。并发同键去重，结果进 LRU 缓存（提交与
 *  节点建树共享，缩放重栅格以新 S 换新键） */
export function rasterizeFormula(
  latex: string,
  color: string,
  scale: number
): Promise<FormulaRaster> {
  const key = cacheKey(latex, color, scale);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running) return running;
  const task = (async () => {
    const host = makeHost(latex, color);
    try {
      const width = host.offsetWidth;
      const height = host.offsetHeight;
      const canvas = await html2canvas(host, {
        scale,
        backgroundColor: 'transparent',
        logging: false
      });
      const result: FormulaRaster = { canvas, width, height };
      putCache(key, result);
      return result;
    } finally {
      host.remove();
    }
  })();
  inflight.set(key, task);
  // 先于调用方 await 注册清理：settled 后同键后续调用走缓存或新任务，不会拿到已过期的 inflight 占位
  task.then(
    () => inflight.delete(key),
    () => inflight.delete(key)
  );
  return task;
}
