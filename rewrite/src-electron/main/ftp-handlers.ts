import { ipcMain } from 'electron';
import * as ftp from 'basic-ftp';
import type { FtpUploadConfig } from '../../src/shared/platform-bridge';

const IPC_FTP_UPLOAD = 'ftp:upload-file';

async function handleUploadFile(
  _e: Electron.IpcMainInvokeEvent,
  config: FtpUploadConfig,
): Promise<void> {
  const client = new ftp.Client();
  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
    });
    await client.uploadFrom(
      Buffer.from(config.content, 'utf-8'),
      config.remotePath,
    );
  } finally {
    client.close();
  }
}

export function registerFtpHandlers(): void {
  ipcMain.handle(IPC_FTP_UPLOAD, handleUploadFile);
}

export function cleanupFtpHandlers(): void {
  ipcMain.removeHandler(IPC_FTP_UPLOAD);
}
