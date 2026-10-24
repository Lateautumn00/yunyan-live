#!/usr/bin/env node
/**
 * .env 补齐工具（只追加缺失的键，绝不覆盖已有值）。
 *
 * 用法：
 *   node scripts/sync-env.mjs          # 预览（默认 dry-run）
 *   node scripts/sync-env.mjs --write  # 实际写入
 *
 * 取值规则：
 *   - UPLOAD_SIGNING_SECRET 缺失 → 生成 32 字节随机值（部署机必须持久，否则重启后签名 URL 失效）
 *   - RABBITMQ_URL 缺失 → 借用其他服务 .env 里已有的连接串（保证与 live-service/chat-ws 一致）
 *   - 模板值是占位符（XXXXX / your- / 你的 / <...>）→ 不写入，列为"需手工填写"
 *   - VITE_* 且模板值为空 → 需手工填写（前端地址没有合理默认）
 *   - 其余 → 使用模板给的值
 */
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const WRITE = process.argv.includes('--write');

/** 环境文件与对应模板；模板不存在时跳过 */
const PAIRS = [
  ['init/.env', 'init/.env.example'],
  ['apps/server/.env', 'apps/server/.env.example'],
  ['apps/auth-service/.env', 'apps/auth-service/.env.example'],
  ['apps/live-service/.env', 'apps/live-service/.env.example'],
  ['apps/mail-service/.env', 'apps/mail-service/.env.example'],
  ['apps/chat-ws-service/.env', 'apps/chat-ws-service/.env.example'],
  ['apps/yjs-ws-service/.env', 'apps/yjs-ws-service/.env.example'],
  ['apps/admin/admin-service/.env', 'apps/admin/admin-service/.env.example'],
  ['apps/admin/web/.env', 'apps/admin/web/.env.example'],
  ['apps/desktop/.env.development', 'apps/desktop/.env.example'],
  ['apps/desktop/.env.production', 'apps/desktop/.env.example']
];

const PLACEHOLDER = /XXXXX|你的|your-|<[^>]*>/i;

/** 打印时抹掉连接串里的口令，避免把凭据打到终端/日志 */
function mask(value) {
  return value.replace(/\/\/([^:/@\s]+):([^@\s]*)@/, '//$1:***@');
}

/** 解析 KEY=VALUE；忽略注释行，剥离未加引号值后面的行内注释 */
function parse(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (!/^['"`]/.test(value)) value = value.replace(/\s+#.*$/, '').trim();
    out[m[1]] = value;
  }
  return out;
}

const parsed = new Map(PAIRS.map(([env]) => [env, parse(env)]));
const borrow = key => {
  for (const values of parsed.values()) if (values[key]) return values[key];
  return null;
};

let totalAdded = 0;
let totalTodo = 0;

for (const [envFile, exampleFile] of PAIRS) {
  if (!fs.existsSync(envFile)) {
    console.log(`- ${envFile}: 不存在，跳过`);
    continue;
  }
  if (!fs.existsSync(exampleFile)) continue;

  const current = parsed.get(envFile);
  const example = parse(exampleFile);
  const missing = Object.keys(example).filter(k => !(k in current));
  if (missing.length === 0) continue;

  const toWrite = [];
  const todos = [];
  for (const key of missing) {
    let value = example[key];
    let note = '';

    if (key === 'UPLOAD_SIGNING_SECRET') {
      value = randomBytes(32).toString('hex');
      note = '（随机生成）';
    } else if (key === 'RABBITMQ_URL') {
      const borrowed = borrow(key);
      if (borrowed) {
        value = borrowed;
        note = '（取自其他服务，保持一致）';
      }
    }

    const isPlaceholder = !value || PLACEHOLDER.test(value);
    if (key === 'UPLOAD_SIGNING_SECRET' || !isPlaceholder) {
      toWrite.push({ key, value, note });
    } else if (key.startsWith('VITE_')) {
      todos.push({ key, reason: '前端地址需手工填写' });
    } else if (PLACEHOLDER.test(value)) {
      todos.push({ key, reason: `模板值 ${value} 是占位符` });
    } else {
      // 空值且非前端变量：追加空键，保证键结构完整（运行时走代码默认值）
      toWrite.push({ key, value, note: '（空，走代码默认值）' });
    }
  }

  if (toWrite.length === 0 && todos.length === 0) continue;

  console.log(`\n== ${envFile}`);
  for (const { key, value, note } of toWrite) {
    const shown = key === 'UPLOAD_SIGNING_SECRET' ? '<随机值>' : mask(value);
    console.log(`  + ${key}=${shown} ${note}`.trimEnd());
  }
  for (const { key, reason } of todos) console.log(`  ! ${key} — ${reason}`);

  if (WRITE && toWrite.length > 0) {
    const lines = toWrite.map(({ key, value }) => `${key}=${value}`).join('\n');
    const header = `\n# --- env:sync 补齐（${new Date().toISOString().slice(0, 10)}）---\n`;
    fs.appendFileSync(envFile, `${header}${lines}\n`, 'utf8');
  }
  totalAdded += toWrite.length;
  totalTodo += todos.length;
}

console.log(
  `\n${WRITE ? '已写入' : '预览'}：${totalAdded} 个键${totalTodo ? `，${totalTodo} 项需手工填写` : ''}。`
);
if (!WRITE && totalAdded > 0) console.log('确认无误后执行：node scripts/sync-env.mjs --write');
