import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SaveDialogOptions, OpenDialogOptions } from '../../src/shared/platform-bridge';
import { atomicWriteFile } from '../../src/shared/utils/atomic-write';

const IPC_READ_TEXT_FILE = 'file:read-text';
const IPC_WRITE_TEXT_FILE = 'file:write-text';
const IPC_SHOW_SAVE_DIALOG = 'file:show-save-dialog';
const IPC_SHOW_OPEN_DIALOG = 'file:show-open-dialog';
const IPC_GET_USER_DATA_PATH = 'file:get-user-data-path';
const IPC_GET_DEFAULT_FRAMES = 'file:get-default-frames';

async function handleReadTextFile(_e: Electron.IpcMainInvokeEvent, filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

async function handleWriteTextFile(_e: Electron.IpcMainInvokeEvent, filePath: string, content: string): Promise<void> {
  // 原子写:tmp + rename(S012 根因 A)。写到一半进程崩溃只会留半截 .tmp,
  // 目标文件保持上次完整内容,下次启动 safeReadJson 不会读到损坏 JSON。
  // IPC 名/签名不变,所有 fileFacade.writeTextFile 调用透明受益。
  await atomicWriteFile(filePath, content);
}

/**
 * 默认帧定义(S012 根因 B):main 进程首次被调时读 assets/default-frames.json
 * (打包后随 main bundle 一起进 app 资源),缓存后同步返回给 renderer。
 * renderer 在 frames.json 缺失/损坏/空且未初始化过时 seed。
 */
let defaultFramesCache: string | null = null;

async function handleGetDefaultFrames(): Promise<string> {
  if (defaultFramesCache !== null) return defaultFramesCache;
  const assetPath = path.join(__dirname, 'assets', 'default-frames.json');
  defaultFramesCache = await fs.readFile(assetPath, 'utf-8');
  return defaultFramesCache;
}

function handleGetUserDataPath(): string {
  return path.join(app.getPath('userData'), 'dongfanghong');
}

async function handleShowSaveDialog(e: Electron.IpcMainInvokeEvent, opts: SaveDialogOptions): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showSaveDialog(win!, {
    title: opts.title,
    defaultPath: opts.defaultPath,
    filters: opts.filters as Electron.FileDialogFilter[] | undefined,
  });
  return result.canceled ? null : result.filePath ?? null;
}

async function handleShowOpenDialog(e: Electron.IpcMainInvokeEvent, opts: OpenDialogOptions): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win!, {
    title: opts.title,
    defaultPath: opts.defaultPath,
    filters: opts.filters as Electron.FileDialogFilter[] | undefined,
    properties: opts.multiple ? ['multiSelections'] : undefined,
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_READ_TEXT_FILE, handleReadTextFile);
  ipcMain.handle(IPC_WRITE_TEXT_FILE, handleWriteTextFile);
  ipcMain.handle(IPC_SHOW_SAVE_DIALOG, handleShowSaveDialog);
  ipcMain.handle(IPC_SHOW_OPEN_DIALOG, handleShowOpenDialog);
  ipcMain.handle(IPC_GET_USER_DATA_PATH, handleGetUserDataPath);
  ipcMain.handle(IPC_GET_DEFAULT_FRAMES, handleGetDefaultFrames);
}

export function cleanupFileHandlers(): void {
  ipcMain.removeHandler(IPC_READ_TEXT_FILE);
  ipcMain.removeHandler(IPC_WRITE_TEXT_FILE);
  ipcMain.removeHandler(IPC_SHOW_SAVE_DIALOG);
  ipcMain.removeHandler(IPC_SHOW_OPEN_DIALOG);
  ipcMain.removeHandler(IPC_GET_USER_DATA_PATH);
  ipcMain.removeHandler(IPC_GET_DEFAULT_FRAMES);
}
