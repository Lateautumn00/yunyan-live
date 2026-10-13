import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compareFidelityBaseline,
  dhashFromPpm,
  type FidelityBaseline,
  type FidelityBaselineEntry,
  type FidelityCheckInput
} from './fidelity';
import { buildPptToPdfArgs, PPT_TO_PDF_TIMEOUT_MS } from './ppt-convert';

const RUN = !!process.env.COURSEWARE_FIDELITY;
const WRITE_BASELINE = RUN && process.env.FIDELITY_WRITE_BASELINE === '1';
const SOFFICE = process.env.SOFFICE_PATH || 'soffice';

const FIXTURES_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'courseware');
const BASELINE_PATH = join(FIXTURES_DIR, 'baseline.json');
const GENERATOR = join(__dirname, '..', '..', 'scripts', 'generate-courseware-fixtures.mjs');

const REQUIRED_CATEGORIES = [
  'font-missing',
  'font-installed',
  'master-complex',
  'smartart',
  'formula-dense',
  'chart-embedded'
];

interface ManifestCase {
  id: string;
  file: string;
  expectedPages: number;
  note: string;
}

function runGenerator(): void {
  execFileSync(process.execPath, [GENERATOR, '--out', FIXTURES_DIR], { stdio: 'pipe' });
}

function loadManifest(): ManifestCase[] {
  return (
    JSON.parse(readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf-8')) as {
      cases: ManifestCase[];
    }
  ).cases;
}

function cmdAvailable(cmd: string): boolean {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'pipe', timeout: 15_000 });
    return true;
  } catch (err) {
    // 仅 ENOENT 视为不存在；命令存在但参数不被识别/退出码非 0 仍算可用
    return (err as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

function parsePdfPages(pdfinfoOut: string): number {
  const m = /^Pages:\s+(\d+)\s*$/m.exec(pdfinfoOut);
  if (!m) throw new Error(`pdfinfo 输出无 Pages 行：\n${pdfinfoOut}`);
  return parseInt(m[1]!, 10);
}

describe('courseware-fidelity 样例集门（默认关闭）', () => {
  it('fixtures README 存在（构造指引与基线格式）', () => {
    expect(existsSync(join(FIXTURES_DIR, 'README.md'))).toBe(true);
  });

  it('生成器脚本存在', () => {
    expect(existsSync(GENERATOR)).toBe(true);
  });
});

// COURSEWARE_FIDELITY=1 且本机装有 soffice/poppler 时启用；CI 默认全 skip
describe.skipIf(!RUN)('courseware-fidelity 转换样例集（COURSEWARE_FIDELITY=1 启用）', () => {
  const collected: FidelityBaselineEntry[] = [];
  let loVersion = '';
  let baseline: FidelityBaseline | null = null;
  let cases: ManifestCase[] = [];

  beforeAll(() => {
    if (!existsSync(join(FIXTURES_DIR, 'manifest.json'))) runGenerator();
    cases = loadManifest();
    if (existsSync(BASELINE_PATH) && !WRITE_BASELINE) {
      baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as FidelityBaseline;
    }
    loVersion =
      spawnSync(SOFFICE, ['--version'], { encoding: 'utf-8', timeout: 20_000 }).stdout?.trim() ??
      '';
  });

  afterAll(() => {
    if (WRITE_BASELINE && collected.length > 0) {
      const merged: FidelityBaseline = {
        loVersion,
        entries: collected.sort((a, b) => a.caseId.localeCompare(b.caseId))
      };
      writeFileSync(BASELINE_PATH, JSON.stringify(merged, null, 2) + '\n');
      console.log(
        `[fidelity] baseline.json 已写入 ${BASELINE_PATH}（LO: ${loVersion}），请人工复核后入库`
      );
    }
  });

  it('soffice 与 poppler（pdfinfo/pdftoppm）可用', () => {
    expect(
      cmdAvailable(SOFFICE),
      `未找到 soffice（SOFFICE_PATH=${SOFFICE}），请安装 LibreOffice`
    ).toBe(true);
    expect(cmdAvailable('pdfinfo'), '未找到 pdfinfo，请安装 poppler-utils').toBe(true);
    expect(cmdAvailable('pdftoppm'), '未找到 pdftoppm，请安装 poppler-utils').toBe(true);
  });

  it('样例集目录覆盖六类基线分类', () => {
    const ids = cases.map(c => c.id);
    for (const cat of REQUIRED_CATEGORIES) {
      expect(ids, cat).toContain(cat);
    }
  });

  it.each(cases.map(c => [c.id, c] as const))(
    '%s：soffice 转换 → 页数硬断言 → 感知哈希基线比对',
    (_id, c) => {
      const outDir = mkdtempSync(join(tmpdir(), 'fid-'));
      try {
        const pptPath = join(FIXTURES_DIR, c.file);
        expect(existsSync(pptPath), `缺少 ${c.file}，先跑生成器`).toBe(true);

        // 1. soffice 转换
        const conv = spawnSync(SOFFICE, buildPptToPdfArgs(outDir, pptPath), {
          encoding: 'utf-8',
          timeout: PPT_TO_PDF_TIMEOUT_MS
        });
        expect(conv.status, `soffice 转换失败：${conv.stderr || conv.error?.message}`).toBe(0);
        const pdfPath = join(outDir, basename(c.file).replace(/\.pptx$/, '.pdf'));
        expect(existsSync(pdfPath), '转换产物 pdf 缺失').toBe(true);
        const pdfBuf = readFileSync(pdfPath);
        expect(pdfBuf.length).toBeGreaterThan(1000);
        // PDF 魔数
        expect(pdfBuf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

        // 2. pdfinfo 页数硬断言
        const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf-8' });
        expect(info.status, `pdfinfo 失败：${info.stderr}`).toBe(0);
        const pages = parsePdfPages(info.stdout ?? '');
        expect(pages, `页数不符：期望 ${c.expectedPages}`).toBe(c.expectedPages);

        // 3. pdftoppm 渲染 → dhash
        const prefix = join(outDir, 'page');
        const ppm = spawnSync('pdftoppm', ['-r', '32', pdfPath, prefix], {
          encoding: 'utf-8',
          timeout: 60_000
        });
        expect(ppm.status, `pdftoppm 失败：${ppm.stderr}`).toBe(0);
        const ppmFiles = readdirSync(outDir)
          .filter(f => f.startsWith('page') && f.endsWith('.ppm'))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        expect(ppmFiles.length).toBe(pages);
        const hashes = ppmFiles.map(f => dhashFromPpm(readFileSync(join(outDir, f))));

        const input: FidelityCheckInput = {
          caseId: c.id,
          pageCount: pages,
          perceptualHashes: hashes
        };

        if (WRITE_BASELINE) {
          collected.push({ caseId: c.id, pageCount: pages, perceptualHashes: hashes });
        } else {
          const diff = compareFidelityBaseline(baseline, input);
          if (diff.level === 'fail') {
            expect.fail(`${c.id} 基线比对失败：${diff.reasons.join('；')}`);
          }
          if (diff.level === 'warn') {
            console.warn(`[fidelity][warn] ${c.id}: ${diff.reasons.join('；')}`);
          }
        }
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    }
  );
});
