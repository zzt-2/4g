import { ipcMain } from 'electron';
import { windowManager } from '../window';

export function setupMenuIPC() {
  ipcMain.on('set-menu-visibility', (_, visible) => {
    windowManager.getWindow()?.setMenuBarVisibility(visible);
  });

  ipcMain.handle('is-menu-visible', () => {
    return windowManager.getWindow()?.isMenuBarVisible();
  });
}
