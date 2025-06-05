/**
 * CSV文件操作处理函数 - 主进程
 */

import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathAPI } from '../../preload/api/path';

// CSV文件保存的基础目录
const getCSVDataDirectory = (): string => {
  const userDataPath = pathAPI.getDataPath();
  return path.join(userDataPath, 'csv');
};

// 确保目录存在
const ensureDirectoryExists = async (dirPath: string): Promise<void> => {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

/**
 * 保存CSV数据到文件
 * @param hourKey 小时键
 * @param csvContent CSV内容
 * @param append 是否追加模式
 * @returns 保存结果
 */
export const saveCSVData = async (
  hourKey: string,
  csvContent: string,
  append = true,
): Promise<{ success: boolean; filePath: string; error?: string }> => {
  try {
    const dataDir = getCSVDataDirectory();
    await ensureDirectoryExists(dataDir);

    const fileName = `data_${hourKey}.csv`;
    const filePath = path.join(dataDir, fileName);

    if (append) {
      // 检查文件是否存在，如果不存在则先写入头部
      try {
        await fs.access(filePath);
        // 文件存在，追加内容（去掉头部）
        const lines = csvContent.split('\n');
        const contentWithoutHeader = lines.slice(1).join('\n');
        await fs.appendFile(filePath, contentWithoutHeader);
      } catch {
        // 文件不存在，写入完整内容
        await fs.writeFile(filePath, csvContent, 'utf-8');
      }
    } else {
      // 覆盖模式
      await fs.writeFile(filePath, csvContent, 'utf-8');
    }

    return {
      success: true,
      filePath,
    };
  } catch (error) {
    console.error('保存CSV文件失败:', error);
    return {
      success: false,
      filePath: '',
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
};

/**
 * 读取CSV文件内容
 * @param hourKey 小时键
 * @returns 文件内容
 */
export const readCSVData = async (
  hourKey: string,
): Promise<{ success: boolean; content: string; error?: string }> => {
  try {
    const dataDir = getCSVDataDirectory();
    const fileName = `data_${hourKey}.csv`;
    const filePath = path.join(dataDir, fileName);

    const content = await fs.readFile(filePath, 'utf-8');

    return {
      success: true,
      content,
    };
  } catch (error) {
    console.error('读取CSV文件失败:', error);
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : '文件不存在或读取失败',
    };
  }
};

/**
 * 获取CSV文件信息
 * @param hourKey 小时键
 * @returns 文件信息
 */
export const getCSVFileInfo = async (
  hourKey: string,
): Promise<{
  success: boolean;
  exists: boolean;
  size?: number;
  lastModified?: number;
  error?: string;
}> => {
  try {
    const dataDir = getCSVDataDirectory();
    const fileName = `data_${hourKey}.csv`;
    const filePath = path.join(dataDir, fileName);

    const stats = await fs.stat(filePath);

    return {
      success: true,
      exists: true,
      size: stats.size,
      lastModified: stats.mtime.getTime(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: true,
        exists: false,
      };
    }

    console.error('获取CSV文件信息失败:', error);
    return {
      success: false,
      exists: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
};

/**
 * 列出所有CSV文件
 * @returns 文件列表
 */
export const listCSVFiles = async (): Promise<{
  success: boolean;
  files: Array<{
    hourKey: string;
    fileName: string;
    size: number;
    lastModified: number;
  }>;
  error?: string;
}> => {
  try {
    const dataDir = getCSVDataDirectory();
    await ensureDirectoryExists(dataDir);

    const files = await fs.readdir(dataDir);
    const csvFiles = files.filter((file) => file.endsWith('.csv') && file.startsWith('data_'));

    const fileInfos = await Promise.all(
      csvFiles.map(async (fileName) => {
        const filePath = path.join(dataDir, fileName);
        const stats = await fs.stat(filePath);
        const hourKey = fileName.replace('data_', '').replace('.csv', '');

        return {
          hourKey,
          fileName,
          size: stats.size,
          lastModified: stats.mtime.getTime(),
        };
      }),
    );

    // 按时间倒序排列
    fileInfos.sort((a, b) => b.lastModified - a.lastModified);

    return {
      success: true,
      files: fileInfos,
    };
  } catch (error) {
    console.error('列出CSV文件失败:', error);
    return {
      success: false,
      files: [],
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
};

/**
 * 删除CSV文件
 * @param hourKey 小时键
 * @returns 删除结果
 */
export const deleteCSVFile = async (
  hourKey: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const dataDir = getCSVDataDirectory();
    const fileName = `data_${hourKey}.csv`;
    const filePath = path.join(dataDir, fileName);

    await fs.unlink(filePath);

    return { success: true };
  } catch (error) {
    console.error('删除CSV文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '文件不存在或删除失败',
    };
  }
};

/**
 * 注册CSV相关的IPC处理函数
 */
export const registerCSVHandlers = (): void => {
  // 保存CSV数据
  ipcMain.handle('csv:save', async (_, hourKey: string, csvContent: string, append = true) => {
    return await saveCSVData(hourKey, csvContent, append);
  });

  // 读取CSV数据
  ipcMain.handle('csv:read', async (_, hourKey: string) => {
    return await readCSVData(hourKey);
  });

  // 获取文件信息
  ipcMain.handle('csv:info', async (_, hourKey: string) => {
    return await getCSVFileInfo(hourKey);
  });

  // 列出所有文件
  ipcMain.handle('csv:list', async () => {
    return await listCSVFiles();
  });

  // 删除文件
  ipcMain.handle('csv:delete', async (_, hourKey: string) => {
    return await deleteCSVFile(hourKey);
  });

  console.log('CSV处理函数已注册');
};
