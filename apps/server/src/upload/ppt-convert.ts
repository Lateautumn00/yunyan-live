export const PPT_TO_PDF_TIMEOUT_MS = 120000;
export const PDF_TO_PNG_TIMEOUT_MS = 120000;
export const PDF_TO_PNG_DPI = 150;
export const PDFTOPPM_PREFIX = 'page';

export function buildPptToPdfArgs(imagesDir: string, pptPath: string): string[] {
  return ['--headless', '--convert-to', 'pdf', '--outdir', imagesDir, pptPath];
}

export function buildPdfToPngArgs(pdfPath: string, outputPrefix: string): string[] {
  return ['-png', '-r', String(PDF_TO_PNG_DPI), pdfPath, outputPrefix];
}

export function parsePageNumber(filename: string): number | null {
  const match = filename.match(/-(\d+)\.png$/);
  if (!match || match[1] === undefined) return null;
  const num = Number.parseInt(match[1], 10);
  return Number.isNaN(num) ? null : num;
}

export function sortPageFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const na = parsePageNumber(a);
    const nb = parsePageNumber(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a.localeCompare(b);
  });
}
