import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SaveDialogOptions, OpenDialogOptions } from '../../src/shared/platform-bridge';

const IPC_READ_TEXT_FILE = 'file:read-text';
const IPC_WRITE_TEXT_FILE = 'file:write-text';
const IPC_SHOW_SAVE_DIALOG = 'file:show-save-dialog';
const IPC_SHOW_OPEN_DIALOG = 'file:show-open-dialog';
const IPC_GET_USER_DATA_PATH = 'file:get-user-data-path';

async function handleReadTextFile(_e: Electron.IpcMainInvokeEvent, filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

async function handleWriteTextFile(_e: Electron.IpcMainInvokeEvent, filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
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
}

export function cleanupFileHandlers(): void {
  ipcMain.removeHandler(IPC_READ_TEXT_FILE);
  ipcMain.removeHandler(IPC_WRITE_TEXT_FILE);
  ipcMain.removeHandler(IPC_SHOW_SAVE_DIALOG);
  ipcMain.removeHandler(IPC_SHOW_OPEN_DIALOG);
  ipcMain.removeHandler(IPC_GET_USER_DATA_PATH);
}
