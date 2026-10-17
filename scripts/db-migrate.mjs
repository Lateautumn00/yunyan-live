#!/usr/bin/env node
/**
 * GAP-S9a 唯一数据库迁移 runner — forward-only + checksum 校验。
 *
 * 迁移序列（apply order）：
 *   1. 00000000_baseline   db/schema-baseline.sql      现网库 pg_dump --schema-only 冻结基线（权威）
 *   2. legacy 迁移         apps/{live-service,chat-ws-service}/src/migrations/*.sql
 *                           效果已并入 baseline → 只登记为 merged，永不执行（目录已封存）
 *   3. 后续迁移            db/migrations/*.sql          唯一新增迁移入口（数字前缀排序）
 *
 * 规则：
 *   - 迁移文件 forward-only：已应用（legacy/migration）禁改禁删，checksum 不符 / 文件缺失 → exit 1
 *   - db/schema-baseline.sql 是"期望态快照"（checksum 豁免）：新增迁移的 PR 必须同步重新 dump 更新它，
 *     空库重放结果 vs baseline 的一致性由 CI schema diff 门禁强制
 *   - 重放/dump 时排除记账表：pg_dump --exclude-table=schema_migrations
 *   - 空库：自动执行 baseline；已有 schema 但无记录 → 要求显式 --baseline（登记不执行）
 *   - 每个迁移单条 query（simple query protocol = 单隐式事务），失败回滚退出
 *
 * 用法：
 *   node scripts/db-migrate.mjs              应用全部待办迁移
 *   node scripts/db-migrate.mjs --status     只读状态表
 *   node scripts/db-migrate.mjs --baseline   将现有 schema 登记为 baseline+legacy（不执行 SQL）
 *   node scripts/db-migrate.mjs --dry-run    列出将执行的迁移，不落库
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join('db', 'schema-baseline.sql');
const LEGACY_DIRS = [
  path.join('apps', 'live-service', 'src', 'migrations'),
  path.join('apps', 'chat-ws-service', 'src', 'migrations')
];
// 封存白名单（GAP-S9a）：apps/*/src/migrations 目录已冻结，
// 只有这 4 个历史文件被承认；新增一律走 db/migrations/。
const LEGACY_ALLOWED = new Set([
  '20260907_create_user_watch_times.sql',
  '20260907_migrate_timestamp_to_timestamptz.sql',
  '20261015_create_checkin_tables.sql',
  '20261007_create_chat_messages.sql'
]);
const MIGRATIONS_DIR = path.join('db', 'migrations');

const argv = process.argv.slice(2);
const FLAG = {
  status: argv.includes('--status'),
  baseline: argv.includes('--baseline'),
  dryRun: argv.includes('--dry-run')
};
for (const a of argv) {
  if (!['--status', '--baseline', '--dry-run'].includes(a)) {
    console.error(`[db-migrate] unknown argument: ${a}`);
    process.exit(2);
  }
}

function fail(msg) {
  console.error(`[db-migrate] ERROR: ${msg}`);
  process.exit(1);
}

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const candidates = [
    '.env',
    path.join('apps', 'server', '.env'),
    path.join('apps', 'live-service', '.env'),
    path.join('apps', 'auth-service', '.env'),
    path.join('apps', 'chat-ws-service', '.env')
  ];
  for (const rel of candidates) {
    const p = path.join(ROOT, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  }
  fail('DATABASE_URL not found (process env or .env files)');
}

const sha256 = text => createHash('sha256').update(text).digest('hex');

/** pg_dump 16.15+ 在文件中插入 psql 专用 \restrict/\unrestrict 指令，PG 协议不识别，执行前剥离。 */
function sanitizeSql(sql) {
  return sql.replace(/^\\(restrict|unrestrict).*\n?/gm, '');
}

function readSql(rel) {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) fail(`migration file missing: ${rel}`);
  return readFileSync(p, 'utf8');
}

function listFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => path.join(dir, f));
}

/** 收集完整迁移序列（baseline → legacy(merged) → db/migrations）。 */
function collectMigrations() {
  const items = [{ version: '00000000_baseline', file: BASELINE_FILE, origin: 'baseline' }];
  for (const dir of LEGACY_DIRS) {
    for (const f of listFiles(dir)) {
      if (!LEGACY_ALLOWED.has(path.basename(f))) {
        fail(
          `frozen directory ${dir} must not gain new files (found ${path.basename(f)}) — ` +
            'put new migrations in db/migrations/ instead (GAP-S9a)'
        );
      }
      items.push({ version: path.basename(f, '.sql'), file: f, origin: 'legacy' });
    }
  }
  for (const f of listFiles(MIGRATIONS_DIR)) {
    items.push({ version: path.basename(f, '.sql'), file: f, origin: 'migration' });
  }
  // legacy 按原时间戳名排序已由 listFiles 保证；不同目录间按 LEGACY_DIRS 顺序
  return items;
}

function verifyChecksums(items, rows) {
  const byVersion = new Map(items.map(i => [i.version, i]));
  for (const row of rows) {
    // baseline 是"期望态快照"（新迁移 PR 会同步更新该文件）——checksum 豁免；
    // 它的正确性由 CI schema diff 门禁守护。迁移文件本身仍然 forward-only 锁死。
    if (row.origin === 'baseline') continue;
    const item = byVersion.get(row.version);
    if (!item) {
      fail(
        `recorded migration ${row.version} no longer exists in repo — ` +
          'forward-only: applied migrations must not be deleted'
      );
    }
    const sum = sha256(readSql(item.file));
    if (sum !== row.checksum) {
      fail(
        `checksum mismatch for ${row.version} (${item.file}) — ` +
          'forward-only: applied migrations must not be edited. ' +
          `recorded=${row.checksum.slice(0, 12)}… file=${sum.slice(0, 12)}…`
      );
    }
  }
  return new Set(rows.map(r => r.version));
}

async function tableExists(client, name) {
  const r = await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${name}`]);
  return r.rows[0].ok === true;
}

async function anyUserTable(client) {
  const r = await client.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
  );
  return r.rows[0].n > 0;
}

const DDL_SCHEMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  file       TEXT NOT NULL,
  origin     TEXT NOT NULL CHECK (origin IN ('baseline', 'legacy', 'migration')),
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

function pad(s, n) {
  return String(s).padEnd(n);
}

async function main() {
  const url = loadDatabaseUrl();
  const items = collectMigrations();
  const client = new pg.Client({ connectionString: url, statement_timeout: 120000 });
  await client.connect();

  try {
    const hasTable = await tableExists(client, 'schema_migrations');

    if (FLAG.status) {
      if (!hasTable) {
        console.log('[db-migrate] schema_migrations does not exist yet — nothing applied.');
        console.log(
          '[db-migrate] run `node scripts/db-migrate.mjs` (empty db) or --baseline (existing schema).'
        );
        return;
      }
      const { rows } = await client.query(
        'SELECT version, origin, checksum, applied_at FROM schema_migrations ORDER BY version'
      );
      const recorded = new Map(rows.map(r => [r.version, r]));
      console.log(
        `${pad('VERSION', 40)} ${pad('ORIGIN', 11)} ${pad('STATE', 9)} ${pad('CHECKSUM', 14)} APPLIED_AT`
      );
      for (const item of items) {
        const row = recorded.get(item.version);
        const state = row ? (row.origin === 'legacy' ? 'merged' : 'applied') : 'pending';
        console.log(
          `${pad(item.version, 40)} ${pad(item.origin, 11)} ${pad(state, 9)} ` +
            `${pad(row ? row.checksum.slice(0, 12) : '-', 14)} ${row ? row.applied_at.toISOString() : '-'}`
        );
      }
      for (const row of rows) {
        if (!items.some(i => i.version === row.version)) {
          console.log(
            `${pad(row.version, 40)} ${pad(row.origin, 11)} MISSING   (file deleted from repo!)`
          );
        }
      }
      const pending = items.filter(i => !recorded.has(i.version));
      console.log(`[db-migrate] ${rows.length} recorded, ${pending.length} pending.`);
      return;
    }

    // ── 校验已应用记录（forward-only 红线） ─────────────────────────────
    const rows = hasTable
      ? (await client.query('SELECT version, origin, checksum FROM schema_migrations')).rows
      : [];
    const appliedSet = verifyChecksums(items, rows);

    // ── --baseline：把既有 schema 登记为 baseline+legacy（不执行 SQL） ──
    if (FLAG.baseline) {
      if (appliedSet.has('00000000_baseline')) {
        console.log('[db-migrate] baseline already recorded — nothing to do.');
        return;
      }
      if (!hasTable) await client.query(DDL_SCHEMA_MIGRATIONS);
      if (!(await anyUserTable(client))) {
        fail(
          '--baseline requires an existing schema (database has no tables). Use plain migrate instead.'
        );
      }
      for (const item of items.filter(i => i.origin !== 'migration')) {
        const sum = sha256(readSql(item.file));
        await client.query(
          'INSERT INTO schema_migrations (version, file, origin, checksum) VALUES ($1,$2,$3,$4) ON CONFLICT (version) DO NOTHING',
          [item.version, item.file, item.origin === 'baseline' ? 'baseline' : 'legacy', sum]
        );
        console.log(`[db-migrate] marked ${item.origin}: ${item.version}`);
      }
      console.log('[db-migrate] existing schema registered as baseline. Run --status to verify.');
      return;
    }

    // ── 空库 vs 已有 schema 无记录 → 防误执行 ──────────────────────────
    if (!appliedSet.has('00000000_baseline')) {
      if (await anyUserTable(client)) {
        fail(
          'database already has tables but no baseline record — ' +
            'run with --baseline to register the existing schema (see db/README.md)'
        );
      }
      if (FLAG.dryRun) {
        console.log(`[db-migrate] dry-run: would apply baseline ${BASELINE_FILE}`);
      } else {
        if (!hasTable) await client.query(DDL_SCHEMA_MIGRATIONS);
        const sql = sanitizeSql(readSql(BASELINE_FILE));
        const t0 = Date.now();
        await client.query(sql);
        // pg_dump 脚本内含 set_config('search_path','',false)（会话级）——重置回默认，
        // 否则后续不带限定名的 DML 找不到 relation。
        await client.query('RESET search_path');
        await client.query(
          'INSERT INTO schema_migrations (version, file, origin, checksum) VALUES ($1,$2,$3,$4)',
          ['00000000_baseline', BASELINE_FILE, 'baseline', sha256(readSql(BASELINE_FILE))]
        );
        console.log(`[db-migrate] applied baseline: 00000000_baseline (${Date.now() - t0}ms)`);
      }
      appliedSet.add('00000000_baseline');
    }

    // ── legacy：效果并入 baseline，只登记 merged，不执行 ────────────────
    for (const item of items.filter(i => i.origin === 'legacy' && !appliedSet.has(i.version))) {
      if (FLAG.dryRun) {
        console.log(`[db-migrate] dry-run: would mark legacy (merged): ${item.version}`);
        continue;
      }
      if (!hasTable) await client.query(DDL_SCHEMA_MIGRATIONS);
      await client.query(
        'INSERT INTO schema_migrations (version, file, origin, checksum) VALUES ($1,$2,$3,$4)',
        [item.version, item.file, 'legacy', sha256(readSql(item.file))]
      );
      console.log(`[db-migrate] merged into baseline (not executed): ${item.version}`);
    }

    // ── 后续迁移：顺序执行，单 query 事务 ──────────────────────────────
    for (const item of items.filter(i => i.origin === 'migration' && !appliedSet.has(i.version))) {
      if (FLAG.dryRun) {
        console.log(`[db-migrate] dry-run: would apply ${item.version} (${item.file})`);
        continue;
      }
      const sql = sanitizeSql(readSql(item.file));
      const sum = sha256(readSql(item.file));
      const t0 = Date.now();
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, file, origin, checksum) VALUES ($1,$2,$3,$4)',
          [item.version, item.file, 'migration', sum]
        );
      } catch (e) {
        fail(`migration ${item.version} failed and was rolled back: ${e.message}`);
      }
      console.log(`[db-migrate] applied: ${item.version} (${Date.now() - t0}ms)`);
    }

    console.log('[db-migrate] done.');
  } finally {
    await client.end();
  }
}

main().catch(e => fail(e.stack || String(e)));
