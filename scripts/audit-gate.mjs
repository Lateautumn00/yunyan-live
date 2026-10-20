#!/usr/bin/env node
// O4b 依赖审计门禁：prod 依赖 high+ 阻断，白名单仅收“无版本可修”项且必须带理由。
// 用法: node scripts/audit-gate.mjs [--json]
// 环境: AUDIT_REGISTRY 覆盖审计源（repo .npmrc 钉 npmmirror，无审计端点，默认官方源）
import { spawnSync } from 'node:child_process';

const registry = process.env.AUDIT_REGISTRY || 'https://registry.npmjs.org';
const blockLevels = new Set(['high', 'critical']);

// 仅允许“当前 major 内无修复版本”的项；每项必须写清为何可放行、何时重估。
const allowlist = new Map([
  [
    'GHSA-hpwf-8g29-85qm',
    '@nestjs/microservices 10.x 仅有 TCP/JsonSocket 传输受影响；本项目 gRPC 传输不经该路径。修复需 Nest 11 迁移（GAP 批次表跟进）'
  ],
  [
    'GHSA-m8vh-jmq9-5rjg',
    '深层嵌套 microservice 消息仅影响 TCP 传输反序列化；gRPC 走 protobuf。修复需 Nest 11 迁移（GAP 批次表跟进）'
  ],
  [
    'GHSA-vfj7-8cjw-p6xm',
    'braces 无上游修复版本（patched <0.0.0）；仅 mailer>nunjucks>chokidar 模板监听链可达，非运行时攻击面'
  ],
  [
    'GHSA-v53p-9fqp-m79j',
    '仅 nodemailer 10.x 修复；10.x 移除 lib/ 路径会断裂 mailparser 的 require(nodemailer/lib/addressparser)。已钉 9.1.1，待上游 mailparser 适配'
  ],
  [
    'GHSA-prgh-xp8r-p3m5',
    '仅 nodemailer 10.x 修复；10.x 移除 lib/ 路径会断裂 mailparser 的 require(nodemailer/lib/addressparser)。已钉 9.1.1，待上游 mailparser 适配'
  ]
]);

const auditArgs = ['audit', '--prod', '--json', `--registry=${registry}`];
const res =
  process.platform === 'win32'
    ? // shell:true 时传单字符串避免 DEP0190（args 拼接不转义）
      spawnSync(`pnpm ${auditArgs.join(' ')}`, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        shell: true
      })
    : spawnSync('pnpm', auditArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (res.error) {
  console.error(`audit-gate: 无法执行 pnpm audit: ${res.error.message}`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(res.stdout);
} catch {
  console.error('audit-gate: pnpm audit 输出非 JSON（registry 不可达或 pnpm 版本异常）');
  console.error(res.stdout.slice(0, 500));
  console.error(res.stderr.slice(0, 500));
  process.exit(2);
}

const advisories = Object.values(data.advisories || {});
const blocking = [];
const allowed = [];
const belowThreshold = { high: 0, critical: 0 };

for (const a of advisories) {
  if (!blockLevels.has(a.severity)) {
    belowThreshold[a.severity] = (belowThreshold[a.severity] || 0) + 1;
    continue;
  }
  const entry = {
    severity: a.severity,
    module: `${a.module_name}@${a.findings?.[0]?.version ?? '?'}`,
    patched: a.patched_versions,
    ghsa: a.github_advisory_id,
    title: a.title
  };
  const reason = allowlist.get(a.github_advisory_id);
  if (reason) allowed.push({ ...entry, reason });
  else blocking.push(entry);
}

console.log(`audit-gate: registry=${registry} advisories=${advisories.length}`);
console.log(
  `  info(不阻断): low=${belowThreshold.low || 0} moderate=${belowThreshold.moderate || 0}`
);

if (allowed.length) {
  console.log(`\n白名单放行 (${allowed.length}):`);
  for (const e of allowed) {
    console.log(`  [${e.severity}] ${e.ghsa} ${e.module}`);
    console.log(`    理由: ${e.reason}`);
  }
}

if (blocking.length) {
  console.error(`\n阻断 (${blocking.length}):`);
  for (const e of blocking) {
    console.error(`  [${e.severity}] ${e.ghsa} ${e.module} -> ${e.patched}`);
    console.error(`    ${e.title}`);
  }
  console.error(
    '\naudit-gate: FAIL — 请升级依赖；确属误报/无修复项须在脚本 allowlist 中登记并写明理由'
  );
  process.exit(1);
}

console.log('\naudit-gate: PASS');
