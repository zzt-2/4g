import { BrowserWindow, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = fileURLToPath(new URL('.', import.meta.url));

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createWindow() {
    this.mainWindow = new BrowserWindow({
      icon: path.resolve(currentDir, 'icons/icon.png'), // tray icon
      width: 1000,
      height: 600,
      useContentSize: true,
      frame: false,
      transparent: false,
      resizable: true, // 允许调整大小
      movable: true, // 允许移动窗口
      minWidth: 800, // 最小宽度
      minHeight: 600, // 最小高度
      show: false, // 先隐藏窗口
      webPreferences: {
        contextIsolation: true, // 必须为 true
        nodeIntegration: false, // 必须为 false
        sandbox: false,
        preload: path.resolve(
          currentDir,
          path.join(
            process.env.QUASAR_ELECTRON_PRELOAD_FOLDER,
            'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION,
          ),
        ),
      },
    });

    // this.mainWindow.setFullScreen(true);
    this.mainWindow.setMenuBarVisibility(false);

    // 如果不存在 url 则从 asar 中加载 index.html
    const resourcePath = app.getAppPath();
    const indexPath = path.join(resourcePath, 'index.html');

    console.log(resourcePath, indexPath);
    const url = process.env.NODE_ENV !== 'development' ? indexPath : process.env.APP_URL;
    this.mainWindow.loadURL(url);

    // 等待窗口加载完成后最大化并显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.maximize();
      this.mainWindow?.show();
    });

    if (process.env.DEBUGGING) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  getWindow() {
    return this.mainWindow;
  }
}

export const windowManager = new WindowManager();
