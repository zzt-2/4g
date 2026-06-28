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
import { registerRecordingHandlers, cleanupRecordingHandlers } from './recording-handlers';
import { registerWindowHandlers, cleanupWindowHandlers } from './window-handlers';
import { storageFilter } from './storage-filter';
import { recordingWriter } from './recording-writer';

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
    // 无边框窗口:去掉系统标题栏(图标/标题/三按钮),改由 AppShell 的 q-header
    // 自画最小化/最大化/关闭按钮 + drag 区(见 D009 取舍:frame:false 全自定义)。
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: getPreloadPath(),
      // 禁用后台节流(Chromium 默认 backgroundThrottling:true 会把失焦窗口的
      // 定时器/任务拉到 ~1次/秒)。工业遥测场景:硬件不停推数据,routingTick(100ms
      // setInterval)一旦被节流,事件在 native/transport 队列堆积;切回前台时
      // 节流解除,routingTick 一次性 drain 成百上千帧 → 超大尖峰冻住 UI("切到别的
      // 软件再回来就巨卡")。上位机常驻前台,后台持续占 CPU 可接受,换不堆积。
      backgroundThrottling: false,
    },
  });

  registerSerialHandlers(mainWindow);
  registerNetworkHandlers(mainWindow);
  registerFileHandlers();
  registerHttpHandlers();
  registerFtpHandlers();
  registerStorageHandlers();
  registerRecordingHandlers();
  registerWindowHandlers(mainWindow);

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
    // dev 默认开 DevTools(detach:独立窗口不遮应用界面)。
    // prod 不开——最终用户不需要;要 prod 开走单独"调试模式"开关,本次不做。
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile('index.html');
  }

  mainWindow.on('closed', () => {
    if (mainWindow) {
      cleanupWindowHandlers(mainWindow);
    }
    cleanupSerialHandlers();
    cleanupNetworkHandlers();
    cleanupFileHandlers();
    cleanupHttpHandlers();
    cleanupFtpHandlers();
    cleanupStorageHandlers();
    cleanupRecordingHandlers();
    storageFilter.cleanup();
    recordingWriter.cleanup();
    mainWindow = undefined;
  });
}

function cleanupAllPlatformResources(): void {
  cleanupSerialHandlers();
  cleanupNetworkHandlers();
  cleanupFileHandlers();
  cleanupHttpHandlers();
  cleanupFtpHandlers();
  cleanupStorageHandlers();
  cleanupRecordingHandlers();
  storageFilter.cleanup();
  recordingWriter.cleanup();
}

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  cleanupAllPlatformResources();
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanupAllPlatformResources();
});

app.on('activate', () => {
  if (mainWindow === undefined) {
    void createWindow();
  }
});
