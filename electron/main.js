
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { spawn } = require('child_process');
const readline = require('readline');

const isWindows = process.platform === 'win32';
const imageCacheDir = path.join(app.getPath('userData'), 'image-cache');
let lastImeStatus = null;

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

const startImeHelper = () => {
  if (!isWindows) return;

  const helperEnvPath = process.env.IME_HELPER_PATH;
  const helperPath = helperEnvPath
    ? helperEnvPath
    : app.isPackaged
      ? path.join(process.resourcesPath, 'ime-helper', 'ime-helper.exe')
      : path.join(__dirname, 'ime-helper', 'ime-helper.exe');

  if (!fs.existsSync(helperPath)) {
    console.warn(`IME helper not found at ${helperPath}`);
    return;
  }

  let child;
  try {
    child = spawn(helperPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.warn('Failed to spawn IME helper', e);
    return;
  }
  const rl = readline.createInterface({ input: child.stdout });

  rl.on('line', (line) => {
    try {
      const payload = JSON.parse(line);
      lastImeStatus = payload;
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('ime-status', payload);
      });
    } catch (e) {
      console.warn('IME helper output parse failed', e);
    }
  });

  child.stderr.on('data', (data) => {
    console.warn(`IME helper error: ${data.toString()}`);
  });

  child.on('exit', (code) => {
    console.warn(`IME helper exited with code ${code}`);
  });
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true, // Open in fullscreen
    autoHideMenuBar: true, // Hide the menu bar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple compatibility
      webSecurity: false // Allow loading local resources if needed
    }
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

  ipcMain.handle('ime-status-get', async () => {
    return lastImeStatus;
  });

  createWindow();
  startImeHelper();

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
