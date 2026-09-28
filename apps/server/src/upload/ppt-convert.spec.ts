import { describe, expect, it } from 'vitest';
import {
  buildPdfToPngArgs,
  buildPptToPdfArgs,
  parsePageNumber,
  sortPageFiles,
} from './ppt-convert';

describe('ppt-convert', () => {
  it('buildPptToPdfArgs produces pdf conversion args', () => {
    expect(buildPptToPdfArgs('/tmp/out', '/tmp/a.pptx')).toEqual([
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      '/tmp/out',
      '/tmp/a.pptx',
    ]);
  });

  it('buildPdfToPngArgs produces pdftoppm args with dpi', () => {
    expect(buildPdfToPngArgs('/tmp/out/a.pdf', '/tmp/out/page')).toEqual([
      '-png',
      '-r',
      '150',
      '/tmp/out/a.pdf',
      '/tmp/out/page',
    ]);
  });

  it('parsePageNumber reads pdftoppm suffixes', () => {
    expect(parsePageNumber('page-1.png')).toBe(1);
    expect(parsePageNumber('page-07.png')).toBe(7);
    expect(parsePageNumber('page-12.png')).toBe(12);
    expect(parsePageNumber('1.png')).toBeNull();
    expect(parsePageNumber('page-.png')).toBeNull();
    expect(parsePageNumber('page-1.jpg')).toBeNull();
  });

  it('sortPageFiles orders numerically not lexically', () => {
    const input = ['page-10.png', 'page-2.png', 'page-1.png'];
    expect(sortPageFiles(input)).toEqual(['page-1.png', 'page-2.png', 'page-10.png']);
  });

  it('sortPageFiles handles zero-padded widths', () => {
    const input = ['page-10.png', 'page-02.png', 'page-01.png'];
    expect(sortPageFiles(input)).toEqual(['page-01.png', 'page-02.png', 'page-10.png']);
  });

  it('sortPageFiles puts files without page numbers last', () => {
    const input = ['other.png', 'page-2.png', 'page-1.png'];
    expect(sortPageFiles(input)).toEqual(['page-1.png', 'page-2.png', 'other.png']);
  });

  it('sortPageFiles does not mutate the input', () => {
    const input = ['page-2.png', 'page-1.png'];
    sortPageFiles(input);
    expect(input).toEqual(['page-2.png', 'page-1.png']);
  });
});
