import { describe, expect, it } from 'vitest';
import { dhashFromPpm, hammingDistance } from './fidelity';

/** 构造 P6 PPM 缓冲：w*h*3 字节 RGB */
function makePpm(
  w: number,
  h: number,
  pixel: (x: number, y: number) => [number, number, number]
): Buffer {
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`, 'ascii');
  const body = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const off = (y * w + x) * 3;
      body[off] = r;
      body[off + 1] = g;
      body[off + 2] = b;
    }
  }
  return Buffer.concat([header, body]);
}

describe('dhashFromPpm（F5.4 批A2）', () => {
  it('返回 16 位 hex', () => {
    const ppm = makePpm(20, 20, () => [128, 128, 128]);
    const hash = dhashFromPpm(ppm);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('全黑与全白灰度均匀 → 哈希稳定且相同（相邻差为 0）', () => {
    const black = dhashFromPpm(makePpm(16, 16, () => [0, 0, 0]));
    const white = dhashFromPpm(makePpm(16, 16, () => [255, 255, 255]));
    expect(black).toBe('0'.repeat(16));
    expect(white).toBe('0'.repeat(16));
  });

  it('水平渐变与反向渐变的汉明距离接近 64', () => {
    const gradient = makePpm(64, 64, x => [x * 4, x * 4, x * 4]);
    const reversed = makePpm(64, 64, x => [255 - x * 4, 255 - x * 4, 255 - x * 4]);
    const a = dhashFromPpm(gradient);
    const b = dhashFromPpm(reversed);
    expect(a).not.toBe(b);
    // 64 bit 全异 → 距离 64；渐变边界处可能个别相等，宽松 ≥48
    expect(hammingDistance(a, b)).toBeGreaterThanOrEqual(48);
  });

  it('垂直渐变相邻行相等 → 哈希为 0（dhash 只比较水平相邻）', () => {
    const vGrad = makePpm(32, 32, (_x, y) => [y * 8, y * 8, y * 8]);
    expect(dhashFromPpm(vGrad)).toBe('0'.repeat(16));
  });

  it('支持 maxval=65535 的 16bit PPM（pdftoppm -r16 可能输出）', () => {
    const header = Buffer.from('P6\n4 4\n65535\n', 'ascii');
    const body = Buffer.alloc(4 * 4 * 3 * 2); // 全 0
    const hash = dhashFromPpm(Buffer.concat([header, body]));
    expect(hash).toBe('0'.repeat(16));
  });

  it('容错：CRLF 头 + 注释行', () => {
    const header = Buffer.from('P6\r\n# comment\r\n8 8\r\n255\r\n', 'ascii');
    const body = Buffer.alloc(8 * 8 * 3, 128);
    const hash = dhashFromPpm(Buffer.concat([header, body]));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('坏输入抛错', () => {
    expect(() => dhashFromPpm(Buffer.from('not a ppm'))).toThrow();
  });
});
