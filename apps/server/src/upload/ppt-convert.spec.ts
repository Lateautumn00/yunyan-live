import { describe, expect, it } from 'vitest';
import { buildPptToPdfArgs, PPT_TO_PDF_TIMEOUT_MS } from './ppt-convert';

describe('ppt-convert', () => {
  it('buildPptToPdfArgs produces pdf conversion args', () => {
    expect(buildPptToPdfArgs('/tmp/out', '/tmp/a.pptx')).toEqual([
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      '/tmp/out',
      '/tmp/a.pptx'
    ]);
  });

  it('PPT_TO_PDF_TIMEOUT_MS allows slow LibreOffice conversions', () => {
    expect(PPT_TO_PDF_TIMEOUT_MS).toBe(120000);
  });
});
