import { execFileSync } from 'node:child_process';

const DEFAULT_PORTS = [3001, 50051, 50052, 50053, 50054, 50055];
const IS_WIN = process.platform === 'win32';
const TERMINAL_NAMES = new Set([
  'wt',
  'windowsterminal',
  'conhost',
  'opensconsole',
  'sshd',
  'systemd',
  'launchd',
  'explorer',
  'tmux',
  'screen',
  'tmux: server'
]);
const SCRIPT_SHELLS = new Set([
  'powershell',
  'pwsh',
  'cmd',
  'bash',
  'zsh',
  'sh',
  'dash',
  'fish',
  'csh',
  'tcsh',
  'ksh'
]);

function usage() {
  console.log(
    [
      '用法:',
      '  node scripts/kill-backend.mjs                杀死后端微服务栈(3001,50051-50055)并清理父链',
      '  node scripts/kill-backend.mjs 5173           同上,并追加杀指定端口',
      '  node scripts/kill-backend.mjs --port 3001    通用:只杀指定端口的监听进程(叶子),不动父链',
      '  node scripts/kill-backend.mjs --port 3001 50054'
    ].join('\n')
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
let leafMode = false;
const ports = [];
for (const a of argv) {
  if (a === '--port') {
    leafMode = true;
    continue;
  }
  if (/^\d+$/.test(a)) {
    const p = Number(a);
    if (p < 1 || p > 65535) usage();
    ports.push(p);
    continue;
  }
  usage();
}
if (leafMode && ports.length === 0) usage();
const targets = [...new Set(leafMode ? ports : [...DEFAULT_PORTS, ...ports])];

function sh(cmd, args) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
}

function listeners(port) {
  if (IS_WIN) {
    let out;
    try {
      out = sh('netstat', ['-ano', '-p', 'tcp']);
    } catch {
      return [];
    }
    const res = new Set();
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim().split(/\s+/);
      if (
        t.length >= 5 &&
        t[3] === 'LISTENING' &&
        t[1].endsWith(':' + port) &&
        /^\d+$/.test(t[4])
      ) {
        res.add(Number(t[4]));
      }
    }
    return [...res];
  }
  try {
    const out = sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    const pids = out
      .split(/\s+/)
      .map(Number)
      .filter(n => n > 0);
    if (pids.length) return [...new Set(pids)];
  } catch {}
  try {
    const out = sh('ss', ['-lptn', `sport = :${port}`]);
    const pids = [...out.matchAll(/pid=(\d+)/g)].map(m => Number(m[1]));
    if (pids.length) return [...new Set(pids)];
  } catch {}
  return [];
}

let procMap = null;
function loadProcs() {
  if (procMap) return procMap;
  procMap = new Map();
  if (IS_WIN) {
    try {
      const out = sh('powershell', [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'
      ]);
      const arr = JSON.parse(out);
      for (const p of Array.isArray(arr) ? arr : [arr]) {
        procMap.set(Number(p.ProcessId), {
          ppid: Number(p.ParentProcessId),
          name: p.Name || '',
          args: p.CommandLine || ''
        });
      }
    } catch {}
  } else {
    try {
      const out = sh('ps', ['-eo', 'pid=,ppid=,comm=,args=']);
      for (const line of out.split(/\r?\n/)) {
        const t = line.trim().split(/\s+/);
        if (t.length >= 3 && /^\d+$/.test(t[0])) {
          procMap.set(Number(t[0]), { ppid: Number(t[1]), name: t[2], args: t.slice(3).join(' ') });
        }
      }
    } catch {}
  }
  return procMap;
}

function baseName(n) {
  return (n || '').toLowerCase().replace(/\.exe$/, '');
}

function isShell(p) {
  if (!p) return true;
  const b = baseName(p.name);
  if (TERMINAL_NAMES.has(b) || b.startsWith('tmux')) return true;
  if (b === 'ssh') return true;
  if (!SCRIPT_SHELLS.has(b)) return false;
  const args = p.args || '';
  if (b === 'cmd') {
    return !/\/c(\s|$)/i.test(args);
  }
  if (b === 'powershell' || b === 'pwsh') {
    return !/-(Command|File)\b/i.test(args);
  }
  return !/(^|\s)-{1,2}c(\s|$)/.test(args);
}

function chainOf(pid) {
  const map = loadProcs();
  const chain = [pid];
  const seen = new Set([pid]);
  let cur = pid;
  while (chain.length < 30) {
    const info = map.get(cur);
    if (!info || !info.ppid) break;
    const parent = info.ppid;
    if (parent <= 4 || parent === process.pid || seen.has(parent)) break;
    if (isShell(map.get(parent))) break;
    chain.push(parent);
    seen.add(parent);
    cur = parent;
  }
  return chain;
}

function killPid(pid, tree = false) {
  if (pid === process.pid || pid <= 4) return false;
  if (IS_WIN) {
    try {
      sh('taskkill', tree ? ['/F', '/T', '/PID', String(pid)] : ['/F', '/PID', String(pid)]);
      return true;
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch (e) {
    return e && e.code === 'ESRCH';
  }
}

function nameOf(pid) {
  const i = loadProcs().get(pid);
  return i ? baseName(i.name) : '?';
}

function killChain(chain, killed) {
  const todo = chain.filter(p => !killed.has(p) && p !== process.pid);
  if (!todo.length) return { count: 0, failed: [] };
  const failed = [];
  if (IS_WIN) {
    const root = todo[todo.length - 1];
    if (!killPid(root, true)) failed.push(root);
    killed.add(root);
    for (const p of todo.slice(0, -1).reverse()) {
      if (killed.has(p)) continue;
      killed.add(p);
      if (!killPid(p)) {
        if (listenersStillHas(p)) failed.push(p);
      }
    }
  } else {
    for (const p of [...todo].reverse()) {
      killed.add(p);
      if (!killPid(p)) {
        if (listenersStillHas(p)) failed.push(p);
      }
    }
  }
  return { count: todo.length, failed };
}

function listenersStillHas(pid) {
  try {
    if (IS_WIN) {
      const out = sh('tasklist', ['/FI', `PID eq ${pid}`]);
      return out.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(
    (leafMode ? '叶子模式(只杀监听进程)' : '栈模式(含父链,防 watch 重启)') +
      ` → 端口: ${targets.join(', ')}`
  );
  const killed = new Set();
  let killFail = 0;

  for (const port of targets) {
    const pids = listeners(port).filter(p => !killed.has(p));
    if (pids.length === 0) {
      console.log(`  ${port} 无人占用`);
      continue;
    }
    for (const pid of pids) {
      const nm = nameOf(pid);
      if (leafMode) {
        const ok = killPid(pid);
        killed.add(pid);
        console.log(`  ${port} → PID ${pid} (${nm}) ${ok ? '已终止' : '✗ 终止失败(权限?)'}`);
        if (!ok) killFail++;
      } else {
        const chain = chainOf(pid);
        const { count, failed } = killChain(chain, killed);
        console.log(
          `  ${port} → PID ${pid} (${nm}) 及父链 ${count} 个进程已终止` +
            (failed.length ? ` ✗ 失败: ${failed.join(',')}` : '')
        );
        killFail += failed.length;
      }
    }
  }

  await sleep(1300);

  const residual = [];
  console.log('复查端口:');
  for (const port of targets) {
    const pids = listeners(port);
    if (pids.length === 0) {
      console.log(`  ${port} ✓ 已释放`);
    } else {
      console.log(`  ${port} ✗ 仍被占用 (PID ${pids.join(', ')})`);
      residual.push(port);
    }
  }

  if (leafMode && residual.length) {
    console.log('提示: nest start --watch 可能已重启该服务(--port 模式只杀叶子)');
  }
  if (residual.length || killFail) {
    process.exit(1);
  }
  console.log('完成');
}

main().catch(e => {
  console.error('ERROR:', e && e.message ? e.message : e);
  process.exit(1);
});
