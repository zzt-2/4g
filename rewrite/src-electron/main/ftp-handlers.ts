import { ipcMain } from 'electron';
import { Readable } from 'node:stream';
import * as path from 'node:path/posix';
import * as ftp from 'basic-ftp';
import type { FtpUploadConfig } from '../../src/shared/platform-bridge';

const IPC_FTP_UPLOAD = 'ftp:upload-file';

/**
 * 把字符串内容上传到 FTP(basic-ftp)。
 * 抽成纯函数(不依赖 ipcMain)便于单测:测试 mock basic-ftp 模块即可验证调用形状。
 *
 * basic-ftp 的 uploadFrom 要 Readable stream,不接受 Buffer(Buffer 无 .once,
 * 会抛 "source.once is not a function")。用 Readable.from 把字符串包成 stream。
 *
 * 553 修复:getTestCaseAll 上传到 `basePath/yyyy-mm-dd/testcase_all.json` 这种带动态
 * 子目录的路径。basic-ftp 的 uploadFrom 只发 STOR,不创建父目录,服务端遇到不存在的
 * 父目录会回 `553 Could not create file`(参见 basic-ftp Client.js:uploadFromDir
 * 自身就先 ensureDir 再 uploadFrom,印证 uploadFrom 不建目录)。
 * 因此这里在 uploadFrom 前先 ensureDir(dirname(remotePath))——仅当有父目录时。
 * 注:父目录可能是相对路径(如 `laser/2026-06-23`)或绝对路径(如 `/laser/...`),
 * basic-ftp 的 ensureDir 两种都支持(绝对路径会先 cd / 再逐级 MKD)。
 */
export async function uploadFileContent(
  config: FtpUploadConfig,
  clientFactory: () => ftp.Client = () => new ftp.Client(),
): Promise<void> {
  const client = clientFactory();
  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
    });
    const remoteDir = path.posix.dirname(config.remotePath);
    // posix.dirname('/') → '/'、dirname('file.json') → '.'
    // 这两种情况没有可创建的父目录,跳过 ensureDir。
    if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
      await client.ensureDir(remoteDir);
      // ensureDir 会 cd 进 remoteDir,uploadFrom 用相对文件名写到「当前目录」最稳
      // (绝对路径含空格 basic-ftp 虽有 protectWhitespace,但 cd 后用 basename 更不易出错)。
      const baseName = path.posix.basename(config.remotePath);
      const stream = Readable.from(config.content);
      await client.uploadFrom(stream, baseName);
    } else {
      const stream = Readable.from(config.content);
      await client.uploadFrom(stream, config.remotePath);
    }
  } finally {
    client.close();
  }
}

async function handleUploadFile(
  _e: Electron.IpcMainInvokeEvent,
  config: FtpUploadConfig,
): Promise<void> {
  await uploadFileContent(config);
}

export function registerFtpHandlers(): void {
  ipcMain.handle(IPC_FTP_UPLOAD, handleUploadFile);
}

export function cleanupFtpHandlers(): void {
  ipcMain.removeHandler(IPC_FTP_UPLOAD);
}
