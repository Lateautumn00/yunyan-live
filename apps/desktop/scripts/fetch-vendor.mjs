#!/usr/bin/env node
/**
 * F3.4/F3.5 vendor 资产刷新工具（正式版；spikes/fetch-vendor.mjs 为 spike 复跑装置，保持独立）。
 *
 * 用法：node apps/desktop/scripts/fetch-vendor.mjs [--force]
 * - 默认跳过已存在文件（幂等）；--force 全量重下
 * - 目标：apps/desktop/src/renderer/public/vendor/{circuitjs,molecule,licenses,models}
 * - 产物含 manifest.json（逐文件 sha256），升级镜像后人工比对
 *
 * 注意：CircuitJS1 为 GPL-2.0-or-later 纯镜像（未修改上游产物）；
 * 升级只做镜像刷新，不 fork 不 patch。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const vendorRoot = path.join(scriptDir, '..', 'src', 'renderer', 'public', 'vendor');
const force = process.argv.includes('--force');

const entries = [];

function record(rel, buf) {
  entries.push({
    file: rel.replaceAll('\\', '/'),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex')
  });
}

async function download(url, destRel) {
  const dest = path.join(vendorRoot, destRel);
  if (!force && fs.existsSync(dest)) {
    const buf = fs.readFileSync(dest);
    record(destRel, buf);
    return buf;
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  record(destRel, buf);
  return buf;
}

const CIRCUIT_BASE = 'https://pfalstad.github.io/circuitjs1/';

function extractRefs(text, kind) {
  const refs = new Set();
  if (kind === 'html' || kind === 'js') {
    for (const m of text.matchAll(/(?:href|src)=["']([^"']+)["']/g)) refs.add(m[1]);
  }
  if (kind === 'css') {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.add(m[1]);
    for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) refs.add(m[1]);
  }
  if (kind === 'js') {
    for (const m of text.matchAll(
      /["'`]([\w./@-]+\.(?:js|mjs|wasm|json|css|html|txt|png|jpg|jpeg|gif|svg|mp3|ogg|wav|ttf|woff2?))["'`]/g
    )) {
      refs.add(m[1]);
    }
  }
  return [...refs].filter(r => !/^(https?:|data:|blob:|#|mailto:|javascript:)/.test(r));
}

async function fetchCircuitJs() {
  const queue = [{ url: CIRCUIT_BASE + 'circuitjs.html', rel: 'circuitjs/circuitjs.html' }];
  const seen = new Set();
  let total = 0;
  while (queue.length) {
    const { url, rel } = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let buf;
    try {
      buf = await download(url, rel);
    } catch (e) {
      console.warn(`WARN skip ${rel}: ${e.message}`);
      continue;
    }
    total += buf.length;
    const ext = path.posix.extname(rel).toLowerCase();
    if (!['.html', '.css', '.js', '.mjs'].includes(ext)) continue;
    const kind = ext === '.html' ? 'html' : ext === '.css' ? 'css' : 'js';
    const text = buf.toString('utf8');
    const dirUrl = new URL('.', url);
    for (const ref of extractRefs(text, kind)) {
      const abs = new URL(ref, dirUrl).href;
      if (!abs.startsWith(CIRCUIT_BASE)) continue;
      const refPath = abs.slice(CIRCUIT_BASE.length).split(/[?#]/)[0];
      if (!refPath) continue;
      queue.push({ url: abs, rel: path.posix.join('circuitjs', refPath) });
    }
  }
  if (!fs.existsSync(path.join(vendorRoot, 'circuitjs/circuitjs.html'))) {
    throw new Error('circuitjs1: entry circuitjs.html failed to download');
  }
  // setuplist.txt + circuits/ 全量必须镜像，否则默认电路空白（spike 实测坑）
  const setupListPath = path.join(vendorRoot, 'circuitjs/circuitjs/setuplist.txt');
  if (fs.existsSync(setupListPath)) {
    const base = CIRCUIT_BASE + 'circuitjs/';
    for (const line of fs.readFileSync(setupListPath, 'utf8').split(/\r?\n/)) {
      if (!line || line[0] === '#' || line[0] === '+' || line[0] === '-') continue;
      const stripped = line.startsWith('>') ? line.slice(1) : line;
      const name = stripped.split(' ')[0];
      if (!name) continue;
      try {
        await download(base + 'circuits/' + name, 'circuitjs/circuitjs/circuits/' + name);
      } catch (e) {
        console.warn(`WARN circuit ${name}: ${e.message}`);
      }
    }
  } else {
    console.warn('WARN: setuplist.txt missing; circuits/ not mirrored');
  }
  return total;
}

async function main() {
  const circuitTotal = await fetchCircuitJs();

  await download('https://3dmol.org/build/3Dmol-min.js', 'molecule/3Dmol-min.js');
  await download('https://files.rcsb.org/download/1CRN.pdb', 'models/1CRN.pdb');
  await download('https://files.rcsb.org/download/4N8T.pdb', 'models/4N8T.pdb');
  // 7MQ 是化学组分编号（CCD），非 PDB ID；走 ligand CIF 通道
  await download('https://files.rcsb.org/ligands/download/7MQ.cif', 'models/7MQ.cif');
  // gnu.org 对非浏览器 UA 403 且网络不稳；SPDX 数据经 jsdelivr 镜像取纯文本 GPL-2.0
  await download(
    'https://cdn.jsdelivr.net/gh/spdx/license-list-data@main/text/GPL-2.0-only.txt',
    'licenses/GPL-2.0.txt'
  );

  // NOTICE 本地生成（不从网络取，内容由本仓库维护）
  const notice = `Third-party components bundled under apps/desktop/src/renderer/public/vendor/
(aggregate distribution; upstream products are unmodified mirrors)

1. CircuitJS1 — GPL-2.0-or-later
   Source: https://github.com/pfalstad/circuitjs1
   Mirrored from: ${CIRCUIT_BASE}
   Full license text: ./GPL-2.0.txt (same directory)
   This application does not modify CircuitJS1; it is aggregated as an
   independent program communicating via iframe only.

2. 3Dmol.js — BSD-3-Clause
   Source: https://github.com/3dmol/3Dmol.js
   Mirrored build: https://3dmol.org/build/3Dmol-min.js
   License: https://github.com/3dmol/3Dmol.js/blob/master/LICENSE (BSD-3-Clause;
   bundles GLmol MIT/LGPL dual and Three.js MIT as noted upstream)

3. PDB/CCD model files (1CRN, 4N8T, 7MQ.cif) — obtained from RCSB PDB (https://www.rcsb.org),
   released under CC0 1.0 (https://www.rcsb.org/pages/policies)
`;
  fs.writeFileSync(path.join(vendorRoot, 'licenses/NOTICE'), notice);

  const manifest = {
    generatedAt: new Date().toISOString(),
    circuit: {
      repo: 'https://github.com/pfalstad/circuitjs1',
      license: 'GPL-2.0-or-later',
      ref: 'github-pages',
      html: 'circuitjs/circuitjs.html'
    },
    molecule: {
      lib: 'molecule/3Dmol-min.js',
      models: ['models/1CRN.pdb', 'models/4N8T.pdb', 'models/7MQ.cif']
    },
    licenses: ['licenses/GPL-2.0.txt', 'licenses/NOTICE']
  };
  fs.writeFileSync(path.join(vendorRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

  let total = 0;
  for (const e of entries) {
    total += e.bytes;
    console.log(`${String(e.bytes).padStart(10)}  ${e.sha256.slice(0, 16)}  ${e.file}`);
  }
  fs.writeFileSync(
    path.join(vendorRoot, 'manifest.files.json'),
    JSON.stringify({ generatedAt: manifest.generatedAt, files: entries }, null, 2)
  );
  console.log('---');
  console.log(
    `files: ${entries.length}, total bytes: ${total} (${(total / 1024 / 1024).toFixed(2)} MB), circuit bytes: ${circuitTotal}`
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
