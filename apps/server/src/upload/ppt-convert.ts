export const PPT_TO_PDF_TIMEOUT_MS = 120000;

export function buildPptToPdfArgs(outDir: string, pptPath: string): string[] {
  return ['--headless', '--convert-to', 'pdf', '--outdir', outDir, pptPath];
}
