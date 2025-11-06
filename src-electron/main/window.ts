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
						'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION
					)
				),
			},
		});

		// this.mainWindow.setFullScreen(true);
		this.mainWindow.setMenuBarVisibility(false);

		// 加载 index.html
		if (process.env.NODE_ENV === 'development' && process.env.APP_URL) {
			// 开发环境：从开发服务器加载
			const url = process.env.APP_URL;
			console.log('[WindowManager] Loading from dev server:', url);
			this.mainWindow.loadURL(url).catch((error) => {
				console.error('[WindowManager] Failed to load dev server URL:', url, error);
				app.quit();
			});
		} else {
			// 生产环境：从应用路径加载 index.html
			// 使用 loadFile() 而不是 loadURL()，这样可以正确处理 asar 内的文件
			const resourcePath = app.getAppPath();
			const indexPath = path.join(resourcePath, 'index.html');

			console.log('[WindowManager] Resource path:', resourcePath);
			console.log('[WindowManager] Index path:', indexPath);
			console.log('[WindowManager] Loading file from path:', indexPath);

			// loadFile() 可以直接加载 asar 内的文件，无需 file:// 协议
			this.mainWindow.loadFile(indexPath).catch((error) => {
				console.error('[WindowManager] Failed to load file:', indexPath, error);
				console.error('[WindowManager] Error details:', {
					message: error.message,
					stack: error.stack,
				});
				// 如果加载失败，尝试使用 loadURL 作为备用
				const fallbackUrl = `file://${indexPath}`;
				console.log('[WindowManager] Trying fallback with loadURL:', fallbackUrl);
				this.mainWindow?.loadURL(fallbackUrl).catch((fallbackError) => {
					console.error('[WindowManager] Fallback also failed:', fallbackError);
					app.quit();
				});
			});
		}

		// 添加焦点事件处理
		this.mainWindow.on('focus', () => {
			console.log('Window focused');
		});

		this.mainWindow.on('blur', () => {
			console.log('Window blurred');
		});

		// 添加页面加载失败的处理
		this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
			console.error('[WindowManager] Page failed to load:', errorCode, errorDescription);
			console.error('[WindowManager] Error details:', {
				errorCode,
				errorDescription,
				validatedURL: this.mainWindow?.webContents.getURL(),
			});
		});

		// 添加控制台消息监听（用于调试）
		this.mainWindow.webContents.on('console-message', (event, level, message) => {
			if (level === 1) {
				// level 1 = error
				console.error('[Renderer Console]', message);
			}
		});

		// 等待窗口加载完成后调整到工作区大小并显示
		this.mainWindow.once('ready-to-show', () => {
			console.log('[WindowManager] Window ready to show');
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
				console.log('[WindowManager] Window shown and focused');
			}
		});

		// 添加超时处理：如果 10 秒后窗口仍未显示，强制显示
		setTimeout(() => {
			if (this.mainWindow && !this.mainWindow.isVisible()) {
				console.warn('[WindowManager] Window not visible after timeout, forcing show');
				this.mainWindow.show();
				this.mainWindow.focus();
			}
		}, 10000);

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
