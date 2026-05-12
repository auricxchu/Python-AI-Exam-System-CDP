
const { app, BrowserWindow, ipcMain, protocol, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const imageCacheDir = path.join(app.getPath('userData'), 'image-cache');
let secureExamMode = false;
let secureExamRefocusPending = false;

const notifyExamSecurityWarning = (reason) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('exam-security-warning', {
        reason,
        occurredAt: new Date().toISOString()
      });
    }
  });
};

const refocusSecureWindow = (win) => {
  if (!secureExamMode || !win || win.isDestroyed() || secureExamRefocusPending) return;
  secureExamRefocusPending = true;

  setTimeout(() => {
    try {
      if (win.isMinimized()) {
        win.restore();
      }
      if (!win.isVisible()) {
        win.show();
      }
      if (!win.isFocused()) {
        win.focus();
      }
      win.moveTop();
    } finally {
      secureExamRefocusPending = false;
    }
  }, 80);
};

const applyExamWindowPolicy = (win) => {
  if (!win || win.isDestroyed()) return;
  secureExamMode = true;
  win.setAutoHideMenuBar(false);
  win.setMenuBarVisibility(false);
  if (typeof win.removeMenu === 'function') {
    win.removeMenu();
  }
  win.setMinimizable(false);
  win.setMaximizable(false);
  win.setResizable(false);
  win.setClosable(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Maximize borderless instead of fullscreen — taskbar with IME toolbar stays visible
  win.setBounds(screen.getPrimaryDisplay().workArea);
  win.center();
  refocusSecureWindow(win);
};

const clearExamWindowPolicy = (win) => {
  if (!win || win.isDestroyed()) return;
  secureExamMode = false;
  secureExamRefocusPending = false;
  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(false);
  win.setClosable(true);
  win.setResizable(true);
  win.setMaximizable(true);
  win.setMinimizable(true);
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
  // Restore borderless maximized state
  win.setBounds(screen.getPrimaryDisplay().workArea);
  win.center();
};

const shouldBlockExamShortcut = (input) => {
  const key = String(input.key || '').toLowerCase();
  return (
    key === 'alt' ||
    key === 'meta' ||
    key === 'f11' ||
    key === 'f5' ||
    (key === 'r' && input.control) ||
    (key === 'tab' && input.alt) ||
    (key === 'f4' && input.alt) ||
    (key === 'escape' && input.control) ||
    input.meta
  );
};

const sanitizeFileName = (value) => {
  const normalized = String(value || '').trim();
  const safe = normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return safe || 'ExamReport.txt';
};

const getUniqueFilePath = async (dirPath, fileName) => {
  const parsed = path.parse(fileName);
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? '' : ` (${attempt})`;
    const candidate = path.join(dirPath, `${parsed.name}${suffix}${parsed.ext || '.txt'}`);
    try {
      await fsp.access(candidate, fs.constants.F_OK);
      attempt += 1;
    } catch {
      return candidate;
    }
  }
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'appimg',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

const ensureImageCacheDir = async () => {
  await fsp.mkdir(imageCacheDir, { recursive: true });
};

const getImageCachePath = async (url, contentType) => {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  let ext = '';
  if (contentType) {
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('svg')) ext = '.svg';
  }

  if (!ext) {
    const urlExt = path.extname(new URL(url).pathname);
    ext = urlExt || '.img';
  }

  const filename = `${hash}${ext}`;
  return { filename, filePath: path.join(imageCacheDir, filename) };
};

const downloadImageToCache = async (url) => {
  await ensureImageCacheDir();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`);
  }
  const contentType = res.headers.get('content-type') || '';
  const { filename, filePath } = await getImageCachePath(url, contentType);
  if (!fs.existsSync(filePath)) {
    const buffer = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(filePath, buffer);
  }
  return { filename, filePath, contentType };
};

const getMimeType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
};

function createWindow() {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'external-sources', 'app_icon.ico')
    : path.join(__dirname, '../build/app_icon.ico');

  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,          // Borderless — taskbar stays visible
    resizable: false,      // Prevent window resize by edge dragging
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  win.on('minimize', (event) => {
    if (!secureExamMode) return;
    event.preventDefault();
    notifyExamSecurityWarning('检测到最小化尝试，系统已阻止并恢复考试窗口。');
    refocusSecureWindow(win);
  });

  win.on('blur', () => {
    if (!secureExamMode) return;
    notifyExamSecurityWarning('检测到切出考试窗口的尝试，系统已重新拉回考试界面。');
    refocusSecureWindow(win);
  });

  // DevTools shortcut (F12 or Ctrl+Shift+I) for debugging
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.key === 'F12' && input.type === 'keyDown')
      || (input.key === 'I' && input.control && input.shift && input.type === 'keyDown')) {
      win.webContents.toggleDevTools();
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (!secureExamMode || input.type !== 'keyDown') return;
    if (!shouldBlockExamShortcut(input)) return;
    event.preventDefault();
    notifyExamSecurityWarning(`检测到受限快捷键 ${input.key || ''}，系统已阻止。`);
  });

  win.webContents.on('devtools-opened', () => {
    if (!secureExamMode) return;
    win.webContents.closeDevTools();
    notifyExamSecurityWarning('检测到调试工具打开尝试，系统已阻止。');
    refocusSecureWindow(win);
  });

  // CRITICAL: Set headers to enable SharedArrayBuffer (COOP/COEP)
  // This allows the "Advanced Input Mode" to work in the packaged app
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }
    });
  });

  // In development, load the Vite dev server
  // In production (executable), load the built index.html
  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Handle exit event from renderer
ipcMain.on('app-exit', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    clearExamWindowPolicy(win);
  }
  app.quit();
});

app.whenReady().then(() => {
  protocol.registerBufferProtocol('appimg', async (request, respond) => {
    try {
      const fileName = decodeURIComponent(request.url.replace('appimg://', ''));
      const filePath = path.join(imageCacheDir, fileName);
      const buffer = await fsp.readFile(filePath);
      respond({
        data: buffer,
        mimeType: getMimeType(fileName),
        headers: {
          'Cross-Origin-Resource-Policy': 'cross-origin'
        }
      });
    } catch (e) {
      respond({ statusCode: 404, data: Buffer.from('Not Found') });
    }
  });

  ipcMain.handle('appimg-cache', async (_event, url) => {
    if (typeof url !== 'string' || !url.startsWith('http')) {
      return url;
    }
    const { filename } = await downloadImageToCache(url);
    return `appimg://${encodeURIComponent(filename)}`;
  });

  ipcMain.handle('export-report-to-desktop', async (_event, payload) => {
    try {
      const filename = sanitizeFileName(payload?.filename);
      const content = typeof payload?.content === 'string' ? payload.content : '';
      const desktopDir = app.getPath('desktop');
      const outputPath = await getUniqueFilePath(desktopDir, path.extname(filename) ? filename : `${filename}.txt`);
      await fsp.writeFile(outputPath, content, 'utf8');
      return { success: true, path: outputPath };
    } catch (error) {
      console.error('Export report to desktop failed:', error);
      return { success: false, error: error.message || '导出失败' };
    }
  });

  ipcMain.handle('exam-security-set', async (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false };
    }

    if (enabled) {
      applyExamWindowPolicy(win);
    } else {
      clearExamWindowPolicy(win);
    }

    return { success: true };
  });

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
