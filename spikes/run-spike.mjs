import { app, BrowserWindow, protocol, net, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const spikesRoot = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(spikesRoot, 'evidence');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'spike',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);

const externalRequests = [];
const results = {
  startedAt: new Date().toISOString(),
  env: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  },
  circuit: null,
  molecule: null,
  externalRequests: []
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, intervalMs = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

function createWindow() {
  return new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
}

function rendererMemory(win) {
  const metric = app.getAppMetrics().find(m => m.pid === win.webContents.getOSProcessId());
  return metric
    ? { workingSetKb: metric.memory.workingSetSize, privateBytesKb: metric.memory.privateBytes }
    : null;
}

async function runCircuit(win) {
  const out = {};
  const t0 = Date.now();
  await win.loadURL('spike://app/circuit/harness.html');
  out.pageLoadMs = Date.now() - t0;
  await waitFor(() => win.webContents.executeJavaScript('!!window.__spike', true), 10000);
  await waitFor(
    () =>
      win.webContents
        .executeJavaScript('window.__spike && window.__spike.ready', true)
        .catch(() => false),
    30000
  );
  out.harness = await win.webContents.executeJavaScript(
    'JSON.parse(JSON.stringify(window.__spike))',
    true
  );

  const focusInfo = await win.webContents.executeJavaScript(
    `(() => {
      const f = document.getElementById('sim');
      f.focus();
      return { activeIsIframe: document.activeElement === f };
    })()`,
    true
  );
  await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V' });
  await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V' });
  await sleep(500);
  const iframeKeys = await win.webContents.executeJavaScript(
    'window.__spike.iframeKeys.slice()',
    true
  );
  await win.webContents.executeJavaScript(
    `(() => {
      const f = document.getElementById('sim');
      f.blur();
      document.body.setAttribute('tabindex', '-1');
      document.body.focus();
    })()`,
    true
  );
  await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'P' });
  await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'P' });
  await sleep(500);
  const parentKeys = await win.webContents.executeJavaScript(
    'window.__spike.parentKeys.slice()',
    true
  );
  out.keyboard = { focusedFirst: focusInfo.activeIsIframe, iframeKeys, parentKeys };

  out.fullscreenIframeApi = await win.webContents.executeJavaScript(
    `(async () => {
      const doc = document.getElementById('sim').contentDocument;
      const enabled = doc ? doc.fullscreenEnabled : null;
      let err = null;
      try {
        if (doc) await doc.documentElement.requestFullscreen();
      } catch (e) {
        err = e.name + ': ' + e.message;
      }
      const fsEl = document.fullscreenElement != null;
      if (document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch {}
      }
      return { enabled, err, fsEl };
    })()`,
    true
  );
  win.setFullScreen(true);
  await sleep(500);
  out.fullscreenWindow = win.isFullScreen();
  win.setFullScreen(false);
  await sleep(300);

  out.rendererHeapBytes = await win.webContents.executeJavaScript(
    'performance.memory ? performance.memory.usedJSHeapSize : null',
    true
  );
  out.rendererProcess = rendererMemory(win);
  out.mainRssBytes = process.memoryUsage().rss;

  const img = await win.webContents.capturePage();
  const shotRel = 'evidence/circuit-boot.png';
  fs.writeFileSync(path.join(spikesRoot, shotRel), img.toPNG());
  out.screenshot = shotRel;
  return out;
}

async function runMolecule(win) {
  const out = {};
  const t0 = Date.now();
  await win.loadURL('spike://app/molecule/harness.html');
  out.pageLoadMs = Date.now() - t0;
  await waitFor(() => win.webContents.executeJavaScript('!!window.__spike', true), 10000);
  await waitFor(
    () =>
      win.webContents
        .executeJavaScript(
          'window.__spike && (window.__spike.ready || !!window.__spike.error)',
          true
        )
        .catch(() => false),
    60000
  );
  out.harness = await win.webContents.executeJavaScript(
    'JSON.parse(JSON.stringify(window.__spike))',
    true
  );
  if (out.harness && out.harness.ready) {
    out.fpsWithSpin = await win.webContents.executeJavaScript('window.__measureFps(true)', true);
    out.fpsIdle = await win.webContents.executeJavaScript('window.__measureFps(false)', true);
  }
  out.rendererHeapBytes = await win.webContents.executeJavaScript(
    'performance.memory ? performance.memory.usedJSHeapSize : null',
    true
  );
  out.rendererProcess = rendererMemory(win);
  out.mainRssBytes = process.memoryUsage().rss;

  const img = await win.webContents.capturePage();
  const shotRel = 'evidence/molecule-boot.png';
  fs.writeFileSync(path.join(spikesRoot, shotRel), img.toPNG());
  out.screenshot = shotRel;
  return out;
}

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  protocol.handle('spike', request => {
    const url = new URL(request.url);
    const resolved = path.resolve(spikesRoot, '.' + decodeURIComponent(url.pathname));
    if (!resolved.startsWith(spikesRoot)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(resolved).href);
  });
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (!/^(spike|file|data|blob|about|chrome|devtools):/.test(details.url)) {
      externalRequests.push(details.url);
    }
    callback({});
  });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const hardTimeout = setTimeout(() => {
    console.error('SPIKE TIMEOUT after 180s');
    app.exit(1);
  }, 180000);
  try {
    const win1 = createWindow();
    results.circuit = await runCircuit(win1);
    win1.destroy();
    const win2 = createWindow();
    results.molecule = await runMolecule(win2);
    win2.destroy();
    results.externalRequestCount = externalRequests.length;
    results.externalRequests = [...new Set(externalRequests)];
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    clearTimeout(hardTimeout);
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
