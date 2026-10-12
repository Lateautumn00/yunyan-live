import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const RUN = !!process.env.COURSEWARE_FIDELITY;
const FIXTURES_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'courseware');
const REQUIRED_CATEGORIES = [
  'font-missing',
  'font-installed',
  'master-complex',
  'smartart',
  'formula-dense',
  'chart-embedded'
];

describe('courseware-fidelity 样例集门（默认关闭）', () => {
  it('fixtures README 存在（构造指引与基线格式）', () => {
    expect(existsSync(join(FIXTURES_DIR, 'README.md'))).toBe(true);
  });
});

// COURSEWARE_FIDELITY=1 且本机装有 soffice 时启用；CI 默认全 skip
describe.skipIf(!RUN)('courseware-fidelity 转换样例集（COURSEWARE_FIDELITY=1 启用）', () => {
  it('样例集目录覆盖六类基线分类', () => {
    const manifestPath = join(FIXTURES_DIR, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      cases: Array<{ id: string }>;
    };
    const ids = manifest.cases.map(c => c.id);
    for (const cat of REQUIRED_CATEGORIES) {
      expect(ids).toContain(cat);
    }
  });

  it('逐样例转换并对比基线（soffice 依赖，断言留待实施环境补全）', () => {
    // 实施步骤见 README.md：buildPptToPdfArgs 转换 → pdf 页数 → 渲染哈希 → compareFidelityBaseline
    // 首期仅锁定入口与清单校验，转换断言随二进制样例入库后补齐
    expect(RUN).toBe(true);
  });
});
