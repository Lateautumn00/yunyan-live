import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { execFileSync } from 'child_process';

const GENERATOR = join(__dirname, '..', '..', 'scripts', 'generate-courseware-fixtures.mjs');

const REQUIRED_CATEGORIES = [
  'font-missing',
  'font-installed',
  'master-complex',
  'smartart',
  'formula-dense',
  'chart-embedded'
];

const outDir = mkdtempSync(join(tmpdir(), 'courseware-fixtures-'));

function runGenerator(): void {
  execFileSync(process.execPath, [GENERATOR, '--out', outDir], { stdio: 'pipe' });
}

describe('courseware 样例生成器（F5.4 批A1）', () => {
  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('生成 manifest.json 覆盖六类分类且每例含 file/expectedPages', () => {
    runGenerator();
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8')) as {
      cases: Array<{ id: string; file: string; expectedPages: number; note: string }>;
    };
    const ids = manifest.cases.map(c => c.id);
    for (const cat of REQUIRED_CATEGORIES) {
      expect(ids, cat).toContain(cat);
    }
    for (const c of manifest.cases) {
      expect(c.file, c.id).toMatch(/\.pptx$/);
      expect(c.expectedPages, c.id).toBeGreaterThanOrEqual(1);
      expect(c.note, c.id).toBeTruthy();
    }
  });

  it.each(REQUIRED_CATEGORIES)(
    '%s 的 pptx 为合法 OOXML zip（含 Content_Types 与 presentation）',
    cat => {
      runGenerator();
      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8')) as {
        cases: Array<{ id: string; file: string }>;
      };
      const entry = manifest.cases.find(c => c.id === cat)!;
      const buf = readFileSync(join(outDir, entry.file));
      expect(buf.length).toBeGreaterThan(1000);
      return JSZip.loadAsync(buf).then(zip => {
        expect(zip.file('[Content_Types].xml'), cat).toBeTruthy();
        expect(zip.file('ppt/presentation.xml'), cat).toBeTruthy();
        expect(zip.file('ppt/slides/slide1.xml'), cat).toBeTruthy();
        const contentTypes = zip.file('[Content_Types].xml')!.async('string');
        return contentTypes.then(xml => {
          expect(xml).toContain('presentationml.presentation');
        });
      });
    }
  );

  it('formula-dense 含 OMML 命名空间标记', async () => {
    runGenerator();
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8')) as {
      cases: Array<{ id: string; file: string }>;
    };
    const entry = manifest.cases.find(c => c.id === 'formula-dense')!;
    const zip = await JSZip.loadAsync(readFileSync(join(outDir, entry.file)));
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('oMath');
  });

  it('chart-embedded 含 chart part', async () => {
    runGenerator();
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf-8')) as {
      cases: Array<{ id: string; file: string }>;
    };
    const entry = manifest.cases.find(c => c.id === 'chart-embedded')!;
    const zip = await JSZip.loadAsync(readFileSync(join(outDir, entry.file)));
    expect(zip.file('ppt/charts/chart1.xml'), 'chart1').toBeTruthy();
  });
});
