import { describe, expect, it } from 'vitest';
import { captureCanvasFromDoc } from './sharedViewCapture';

function fakeDoc(canvas?: { toDataURL?: () => string } | null): Pick<Document, 'querySelector'> {
  const el = canvas ? ({ tagName: 'CANVAS', ...canvas } as unknown as HTMLCanvasElement) : null;
  return { querySelector: () => el } as unknown as Pick<Document, 'querySelector'>;
}

describe('captureCanvasFromDoc（F3.4 截图回填取样）', () => {
  it('正向：取首个 canvas 的 PNG dataURL', () => {
    expect(captureCanvasFromDoc(fakeDoc({ toDataURL: () => 'data:image/png;base64,AAA' }))).toBe(
      'data:image/png;base64,AAA'
    );
  });

  it('负向：doc 为 null（跨域/未加载）→ null', () => {
    expect(captureCanvasFromDoc(null)).toBe(null);
  });

  it('负向：无 canvas → null', () => {
    expect(captureCanvasFromDoc(fakeDoc())).toBe(null);
  });

  it('负向：toDataURL 抛错（jsdom/污染）→ null', () => {
    expect(
      captureCanvasFromDoc(
        fakeDoc({
          toDataURL: () => {
            throw new Error('tainted');
          }
        })
      )
    ).toBe(null);
  });

  it('负向：非 data:image 开头的返回值 → null', () => {
    expect(captureCanvasFromDoc(fakeDoc({ toDataURL: () => '' }))).toBe(null);
    expect(captureCanvasFromDoc(fakeDoc({ toDataURL: () => 'javascript:alert(1)' }))).toBe(null);
  });
});
