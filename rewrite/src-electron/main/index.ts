import { app, BrowserWindow } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerSerialHandlers, cleanupSerialHandlers } from './serial-handlers';
import { registerNetworkHandlers, cleanupNetworkHandlers } from './network-handlers';
import { registerFileHandlers, cleanupFileHandlers } from './file-handlers';
import { registerHttpHandlers, cleanupHttpHandlers } from './http-handlers';
import { registerFtpHandlers, cleanupFtpHandlers } from './ftp-handlers';
import { registerStorageHandlers, cleanupStorageHandlers } from './storage-handlers';
import { storageFilter } from './storage-filter';

const platform = process.platform || os.platform();
const currentDir = fileURLToPath(new URL('.', import.meta.url));

let mainWindow: BrowserWindow | undefined;

function getPreloadPath() {
  const preloadFolder = process.env.QUASAR_ELECTRON_PRELOAD_FOLDER ?? 'preload';
  const preloadExtension = process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION ?? '.cjs';

  return path.resolve(currentDir, path.join(preloadFolder, `index${preloadExtension}`));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    useContentSize: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: getPreloadPath(),
    },
  });

  registerSerialHandlers(mainWindow);
  registerNetworkHandlers(mainWindow);
  registerFileHandlers();
  registerHttpHandlers();
  registerFtpHandlers();
  registerStorageHandlers();

  const appUrl = process.env.APP_URL;
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow?.isVisible() === false) {
      mainWindow.show();
    }
  });

  if (process.env.DEV && appUrl) {
    await mainWindow.loadURL(appUrl);
  } else {
    await mainWindow.loadFile('index.html');
  }

  mainWindow.on('closed', () => {
    cleanupSerialHandlers();
    cleanupNetworkHandlers();
    cleanupFileHandlers();
    cleanupHttpHandlers();
    cleanupFtpHandlers();
    cleanupStorageHandlers();
    storageFilter.cleanup();
    mainWindow = undefined;
  });
}

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === undefined) {
    void createWindow();
  }
});
