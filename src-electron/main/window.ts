import { BrowserWindow, app, screen } from 'electron';
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
      alwaysOnTop: false,
      skipTaskbar: false, // 确保在任务栏显示
      focusable: true, // 明确设置为可聚焦
      autoHideMenuBar: true,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

    // 添加焦点事件处理
    this.mainWindow.on('focus', () => {
      console.log('Window focused');
    });

    this.mainWindow.on('blur', () => {
      console.log('Window blurred');
    });

    // 等待窗口加载完成后调整到工作区大小并显示
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        // 获取主显示器的工作区域（排除任务栏）
        const { workArea } = screen.getPrimaryDisplay();

        // 设置窗口位置和大小以适应工作区域
        this.mainWindow.setBounds({
          x: workArea.x,
          y: workArea.y,
          width: workArea.width,
          height: workArea.height,
        });

        this.mainWindow.show();
        this.mainWindow.focus(); // 明确要求焦点
        this.mainWindow.setAlwaysOnTop(false); // 确保不会一直置顶
      }
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

  restoreFocus() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.restore();
      this.mainWindow.focus();
      this.mainWindow.show();
    }
  }

  handleFocusLoss() {
    if (this.mainWindow) {
      // 延迟恢复焦点，避免立即冲突
      setTimeout(() => {
        this.restoreFocus();
      }, 100);
    }
  }
}

export const windowManager = new WindowManager();
