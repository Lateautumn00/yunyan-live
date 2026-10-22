import { describe, expect, it } from 'vitest';
import { captureCanvasFromDoc } from './sharedViewCapture';

interface StubOpts {
  width?: number;
  height?: number;
  toDataURL?: () => string;
  visible?: boolean;
}

function stubCanvas({
  width = 300,
  height = 150,
  toDataURL = () => 'data:image/png;base64,AAA',
  visible = false
}: StubOpts = {}): HTMLCanvasElement {
  return {
    width,
    height,
    toDataURL,
    getClientRects: () => ({ length: visible ? 1 : 0 }) as unknown as DOMRectList
  } as unknown as HTMLCanvasElement;
}

function fakeDoc(canvases: HTMLCanvasElement[]): Pick<Document, 'querySelectorAll'> {
  return { querySelectorAll: () => canvases } as unknown as Pick<Document, 'querySelectorAll'>;
}

describe('captureCanvasFromDoc（F3.4 截图回填取样）', () => {
  it('正向：多画布取背板面积最大者（主视图 > 引脚对话框 400×400）', () => {
    const dialog = stubCanvas({
      width: 400,
      height: 400,
      toDataURL: () => 'data:image/png;base64,DIALOG'
    });
    const main = stubCanvas({
      width: 1400,
      height: 860,
      toDataURL: () => 'data:image/png;base64,MAIN'
    });
    const r = captureCanvasFromDoc(fakeDoc([dialog, main]));
    expect(r).toMatchObject({ url: 'data:image/png;base64,MAIN', width: 1400, height: 860 });
  });

  it('正向：优先可见画布（隐藏对话框画布即使更大也排除）', () => {
    const hiddenBig = stubCanvas({ width: 2000, height: 2000, visible: false });
    const visibleMain = stubCanvas({
      width: 800,
      height: 600,
      visible: true,
      toDataURL: () => 'data:image/png;base64,VIS'
    });
    expect(captureCanvasFromDoc(fakeDoc([hiddenBig, visibleMain]))?.url).toBe(
      'data:image/png;base64,VIS'
    );
  });

  it('正向：全隐藏（jsdom 无布局）回退全量取最大', () => {
    const a = stubCanvas({ width: 400, height: 400 });
    const b = stubCanvas({ width: 800, height: 600, toDataURL: () => 'data:image/png;base64,B' });
    expect(captureCanvasFromDoc(fakeDoc([a, b]))?.url).toBe('data:image/png;base64,B');
  });

  it('负向：doc 为 null（跨域/未加载）→ null', () => {
    expect(captureCanvasFromDoc(null)).toBe(null);
  });

  it('负向：无 canvas → null', () => {
    expect(captureCanvasFromDoc(fakeDoc([]))).toBe(null);
  });

  it('负向：toDataURL 抛错（jsdom/污染）→ null', () => {
    expect(
      captureCanvasFromDoc(
        fakeDoc([
          stubCanvas({
            toDataURL: () => {
              throw new Error('tainted');
            }
          })
        ])
      )
    ).toBe(null);
  });

  it('负向：非 data:image 开头的返回值 → null', () => {
    expect(captureCanvasFromDoc(fakeDoc([stubCanvas({ toDataURL: () => '' })]))).toBe(null);
    expect(
      captureCanvasFromDoc(fakeDoc([stubCanvas({ toDataURL: () => 'javascript:alert(1)' })]))
    ).toBe(null);
  });
});
