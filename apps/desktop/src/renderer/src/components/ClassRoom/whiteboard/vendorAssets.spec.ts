import { describe, expect, it } from 'vitest';
// 资产经 Vite ?raw 内联（renderer 环境无 node types）：既验在位也验内容非空
import circuitHtml from '../../../../public/vendor/circuitjs/circuitjs.html?raw';
import harnessHtml from '../../../../public/vendor/molecule/harness.html?raw';
import molLib from '../../../../public/vendor/molecule/3Dmol-min.js?raw';
import model1CRN from '../../../../public/vendor/models/1CRN.pdb?raw';
import model4N8T from '../../../../public/vendor/models/4N8T.pdb?raw';
import model7MQ from '../../../../public/vendor/models/7MQ.cif?raw';
import gplText from '../../../../public/vendor/licenses/GPL-2.0.txt?raw';
import noticeText from '../../../../public/vendor/licenses/NOTICE?raw';
import manifestJson from '../../../../public/vendor/manifest.json?raw';

/** F3.4/F3.5：vendor 资产守卫——防止清理/升级误删镜像与 harness */
describe('vendor 资产在位（F3.4/F3.5）', () => {
  it('circuitjs 入口页在位', () => {
    expect(circuitHtml.length).toBeGreaterThan(0);
    expect(circuitHtml).toContain('circuitjs');
  });

  it('3Dmol 运行库在位', () => {
    expect(molLib.length).toBeGreaterThan(100000);
  });

  it('harness.html 含 3 预置模型定义与错误占位逻辑', () => {
    expect(harnessHtml).toContain('1CRN');
    expect(harnessHtml).toContain('4N8T');
    expect(harnessHtml).toContain('7MQ');
    expect(harnessHtml).toContain('加载失败');
  });

  it('3 预置模型在位且为 PDB/CIF 文本', () => {
    expect(model1CRN).toContain('ATOM');
    expect(model4N8T.length).toBeGreaterThan(0);
    expect(model7MQ.length).toBeGreaterThan(0);
  });

  it('GPL 全文与 NOTICE 声明 CircuitJS1 许可', () => {
    expect(gplText).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(noticeText).toContain('CircuitJS1');
    expect(noticeText).toContain('GPL-2.0-or-later');
    expect(noticeText).toContain('3Dmol');
  });

  it('manifest.json 声明镜像来源', () => {
    const m = JSON.parse(manifestJson) as { circuit: { repo: string; license: string } };
    expect(m.circuit.repo).toContain('circuitjs1');
    expect(m.circuit.license).toContain('GPL-2.0');
  });
});
