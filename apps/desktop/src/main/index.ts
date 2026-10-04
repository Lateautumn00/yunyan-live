import { join } from 'node:path';
import { app, BrowserWindow, shell, protocol } from 'electron';
import log from 'electron-log';
import { loadConfig } from '@yunyan-live/config';
import { registerIpcHandlers } from './ipc';
import { initUpdater } from './update';
import { isHttpUrl, PROTOCOL_SCHEME } from './constants';

const config = loadConfig(import.meta.env as unknown as Record<string, string | undefined>);

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    useContentSize: true,
    width: 1220,
    height: 640,
    minWidth: 1220,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // NOTE: webSecurity disabled for dev cross-origin; re-enabled in production builds
      ...(app.isPackaged ? {} : { webSecurity: false })
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isHttpUrl(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.info('Another instance running, quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    log.info('Second instance detected, focusing main window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  if (!app.isPackaged) {
    app.commandLine.appendSwitch('ignore-certificate-errors');
  }

  app.whenReady().then(() => {
    log.info('App ready, creating window');
    protocol.registerFileProtocol(PROTOCOL_SCHEME, (request, callback) => {
      const filePath = decodeURIComponent(request.url.replace(`${PROTOCOL_SCHEME}://`, ''));
      callback({ path: filePath });
    });
    // IPC 与更新器注册必须在进程生命周期内只执行一次：
    // macOS activate 会再次调用 createWindow()，若在此重复注册
    // ipcMain.handle 将抛出 "Attempted to register a second handler"。
    registerIpcHandlers(() => mainWindow);
    if (app.isPackaged) {
      initUpdater(() => mainWindow, config.uploadUrl);
    }
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}