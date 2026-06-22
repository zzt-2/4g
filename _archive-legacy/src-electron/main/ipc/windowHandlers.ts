import { ipcMain } from 'electron';
import { windowManager } from '../window';

export function setupWindowIPC() {
  ipcMain.on('window-close', () => {
    windowManager.getWindow()?.close();
  });

  ipcMain.on('window-minimize', () => {
    windowManager.getWindow()?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    windowManager.getWindow()?.maximize();
  });

  ipcMain.on('window-unmaximize', () => {
    windowManager.getWindow()?.unmaximize();
  });

  ipcMain.handle('window-is-maximized', () => {
    return windowManager.getWindow()?.isMaximized();
  });
}
