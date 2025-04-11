import { app } from 'electron';
import { windowManager } from './window';
import { setupIPC } from './ipc';
import os from 'os';
// import 'uno.css';
const platform = process.platform || os.platform();

app
  .whenReady()
  .then(() => {
    windowManager.createWindow();

    try {
      setupIPC();
    } catch (error) {
      console.error('Error during IPC setup:', error);
      app.quit();
    }
  })
  .catch((error) => {
    console.error('Error during app initialization:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!windowManager.getWindow()) {
    windowManager.createWindow();
  }
});
