import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const spikesRoot = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(spikesRoot, 'vendor');

const entries = [];

function record(rel, buf) {
  entries.push({
    file: rel.replaceAll('\\', '/'),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex')
  });
}

async function download(url, destRel) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(spikesRoot, destRel);
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
  const queue = [{ url: CIRCUIT_BASE + 'circuitjs.html', rel: 'vendor/circuitjs/circuitjs.html' }];
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
      queue.push({ url: abs, rel: path.posix.join('vendor/circuitjs', refPath) });
    }
  }
  if (!entries.some(e => e.file === 'vendor/circuitjs/circuitjs.html')) {
    throw new Error('circuitjs1: entry circuitjs.html failed to download');
  }
  const setupListRel = 'vendor/circuitjs/circuitjs/setuplist.txt';
  const setupListPath = path.join(spikesRoot, setupListRel);
  if (fs.existsSync(setupListPath)) {
    const base = CIRCUIT_BASE + 'circuitjs/';
    for (const line of fs.readFileSync(setupListPath, 'utf8').split(/\r?\n/)) {
      if (!line || line[0] === '#' || line[0] === '+' || line[0] === '-') continue;
      const stripped = line.startsWith('>') ? line.slice(1) : line;
      const name = stripped.split(' ')[0];
      if (!name) continue;
      await download(base + 'circuits/' + name, 'vendor/circuitjs/circuitjs/circuits/' + name);
    }
  } else {
    console.warn('WARN: setuplist.txt missing; circuits/ not mirrored');
  }
  return {
    ref: 'github-pages (' + CIRCUIT_BASE + ')',
    mainHtml: 'vendor/circuitjs/circuitjs.html',
    total
  };
}

async function main() {
  fs.rmSync(path.join(spikesRoot, 'vendor'), { recursive: true, force: true });

  const circuit = await fetchCircuitJs();
  await download('https://3dmol.org/build/3Dmol-min.js', 'vendor/3dmol/3Dmol-min.js');
  await download('https://files.rcsb.org/download/1CRN.pdb', 'vendor/models/1CRN.pdb');

  const manifest = {
    generatedAt: new Date().toISOString(),
    circuit: {
      repo: 'https://github.com/pfalstad/circuitjs1',
      license: 'GPL-2.0-or-later',
      ref: circuit.ref,
      html: circuit.mainHtml
    },
    molecule: {
      lib: 'vendor/3dmol/3Dmol-min.js',
      pdb: 'vendor/models/1CRN.pdb'
    }
  };
  fs.writeFileSync(
    path.join(spikesRoot, 'vendor/manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  let total = 0;
  for (const e of entries) {
    total += e.bytes;
    console.log(`${String(e.bytes).padStart(10)}  ${e.sha256.slice(0, 16)}  ${e.file}`);
  }
  console.log('---');
  console.log(
    `files: ${entries.length}, total bytes: ${total} (${(total / 1024 / 1024).toFixed(2)} MB)`
  );
  console.log(`circuit html: ${circuit.mainHtml} (branch ${circuit.ref})`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
