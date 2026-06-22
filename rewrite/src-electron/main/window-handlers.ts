import { ipcMain, type BrowserWindow } from 'electron';

// 无边框窗口(frame:false)的自定义标题栏控制 IPC。
// 命名沿用项目 `domain:action` 风格(见 file-handlers/serial-handlers)。
// renderer 通过 preload expose 的 windowControl 调用,主进程操作 mainWindow。
const IPC_MINIMIZE = 'window:minimize';
const IPC_MAXIMIZE_TOGGLE = 'window:maximize-toggle';
const IPC_IS_MAXIMIZED = 'window:is-maximized';
const IPC_CLOSE = 'window:close';
// 主→renderer 事件:窗口最大化状态变化(用于图标在 fullscreen/fullscreen_exit 间切换)。
const IPC_MAXIMIZE_CHANGED = 'window:maximize-changed';

export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_MINIMIZE, () => {
    mainWindow.minimize();
  });

  ipcMain.handle(IPC_MAXIMIZE_TOGGLE, (): boolean => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });

  ipcMain.handle(IPC_IS_MAXIMIZED, (): boolean => mainWindow.isMaximized());

  ipcMain.handle(IPC_CLOSE, () => {
    mainWindow.close();
  });

  // 最大化/还原由系统(标题栏双击、Win+Up、Snap)或按钮触发时,
  // 推送一次状态让 renderer 图标同步。监听器随 cleanup 移除。
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC_MAXIMIZE_CHANGED, true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC_MAXIMIZE_CHANGED, false);
  });
}

export function cleanupWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.removeHandler(IPC_MINIMIZE);
  ipcMain.removeHandler(IPC_MAXIMIZE_TOGGLE);
  ipcMain.removeHandler(IPC_IS_MAXIMIZED);
  ipcMain.removeHandler(IPC_CLOSE);
  mainWindow.removeAllListeners('maximize');
  mainWindow.removeAllListeners('unmaximize');
}
