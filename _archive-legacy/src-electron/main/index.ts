import { app } from 'electron';
import { windowManager } from './window';
import { setupIPC } from './ipc';
import { cleanupTimers } from './ipc/timerManagerHandlers';
import os from 'os';
// import 'uno.css';
const platform = process.platform || os.platform();

// 添加未捕获错误处理
process.on('uncaughtException', (error) => {
	console.error('[Main Process] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('[Main Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

app
	.whenReady()
	.then(() => {
		console.log('[Main Process] App ready');
		console.log('[Main Process] App path:', app.getAppPath());
		console.log('[Main Process] Process platform:', process.platform);
		console.log('[Main Process] Process arch:', process.arch);
		console.log('[Main Process] Node version:', process.version);
		console.log('[Main Process] Electron version:', process.versions.electron);
		console.log('[Main Process] Chrome version:', process.versions.chrome);

		windowManager.createWindow();

		try {
			setupIPC();
			cleanupTimers();
			console.log('[Main Process] IPC setup completed');
		} catch (error) {
			console.error('[Main Process] Error during IPC setup:', error);
			app.quit();
		}
	})
	.catch((error) => {
		console.error('[Main Process] Error during app initialization:', error);
		app.quit();
	});

app.on('window-all-closed', () => {
	// 清理所有定时器
	cleanupTimers();

	if (platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (!windowManager.getWindow()) {
		windowManager.createWindow();
	}
});
