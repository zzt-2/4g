/**
 * 历史数据处理器
 */

import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type {
  HourlyDataFile,
  HistoryFileInfo,
  StorageStats,
  CSVExportConfig,
  CSVExportResult,
  HistoryDataRecord,
} from '../../../src/types/storage/historyData';
import { pathAPI } from 'app/src-electron/preload/api/path';

// 异步文件操作
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 历史数据保存的基础目录
const getHistoryDataDirectory = (): string => {
  const userDataPath = pathAPI.getDataPath();
  return path.join(userDataPath, 'data', 'history-statistics');
};

// 确保目录存在
const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// 获取文件路径
const getFilePath = (hourKey: string, compressed = false): string => {
  const baseDir = getHistoryDataDirectory();
  ensureDirectoryExists(baseDir);
  const extension = compressed ? '.json.gz' : '.json';
  return path.join(baseDir, `${hourKey}${extension}`);
};

// 检查文件是否压缩
const isCompressed = (hourKey: string): boolean => {
  const compressedPath = getFilePath(hourKey, true);
  const uncompressedPath = getFilePath(hourKey, false);
  return fs.existsSync(compressedPath) && !fs.existsSync(uncompressedPath);
};

// 注册IPC处理器
export const registerHistoryDataHandlers = (): void => {
  // 获取可用小时键列表
  ipcMain.handle('historyData:getAvailableHours', async (): Promise<string[]> => {
    try {
      const baseDir = getHistoryDataDirectory();
      if (!fs.existsSync(baseDir)) {
        return [];
      }

      const files = await readdir(baseDir);
      const hourKeys = files
        .filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
        .map((file) => file.replace(/\.json(\.gz)?$/, ''))
        .sort();

      return [...new Set(hourKeys)]; // 去重并排序
    } catch (error) {
      console.error('获取可用小时键失败:', error);
      return [];
    }
  });

  // 加载指定小时的数据
  ipcMain.handle(
    'historyData:loadHourData',
    async (event, hourKey: string): Promise<HourlyDataFile | null> => {
      try {
        const compressed = isCompressed(hourKey);
        const filePath = getFilePath(hourKey, compressed);

        if (!fs.existsSync(filePath)) {
          return null;
        }

        let content: Buffer;
        if (compressed) {
          const compressedData = await readFile(filePath);
          content = await gunzip(compressedData);
        } else {
          content = await readFile(filePath);
        }

        return JSON.parse(content.toString('utf-8'));
      } catch (error) {
        console.error(`加载小时数据失败 (${hourKey}):`, error);
        return null;
      }
    },
  );

  // 保存小时数据到文件
  ipcMain.handle(
    'historyData:saveHourData',
    async (
      event,
      hourKey: string,
      data: HourlyDataFile,
    ): Promise<{ success: boolean; message?: string }> => {
      try {
        const filePath = getFilePath(hourKey, false);
        const jsonContent = JSON.stringify(data, null, 2);
        await writeFile(filePath, jsonContent, 'utf-8');

        return { success: true };
      } catch (error) {
        console.error(`保存小时数据失败 (${hourKey}):`, error);
        return {
          success: false,
          message: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 添加实时数据记录
  ipcMain.handle(
    'historyData:appendRecord',
    async (
      event,
      hourKey: string,
      timestamp: number,
      data: unknown[],
    ): Promise<{ success: boolean; message?: string }> => {
      try {
        const filePath = getFilePath(hourKey, false);
        let hourlyData: HourlyDataFile;

        // 尝试加载现有文件
        if (fs.existsSync(filePath)) {
          const content = await readFile(filePath, 'utf-8');
          hourlyData = JSON.parse(content);
        } else {
          // 创建新的小时数据文件结构（需要从外部传入元数据）
          hourlyData = {
            metadata: {
              version: '1.0.0',
              hourKey,
              groups: [], // 这里需要从调用方传入
              totalDataItems: data.length,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            records: [],
          };
        }

        // 添加新记录
        const newRecord: HistoryDataRecord = {
          timestamp,
          data,
        };

        hourlyData.records.push(newRecord);
        hourlyData.metadata.updatedAt = timestamp;

        // 保存文件
        const jsonContent = JSON.stringify(hourlyData, null, 2);
        await writeFile(filePath, jsonContent, 'utf-8');

        return { success: true };
      } catch (error) {
        console.error(`添加记录失败 (${hourKey}):`, error);
        return {
          success: false,
          message: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 压缩小时数据文件
  ipcMain.handle(
    'historyData:compressHourData',
    async (event, hourKey: string): Promise<{ success: boolean; message?: string }> => {
      try {
        const uncompressedPath = getFilePath(hourKey, false);
        const compressedPath = getFilePath(hourKey, true);

        if (!fs.existsSync(uncompressedPath)) {
          return { success: false, message: '源文件不存在' };
        }

        // 读取原文件
        const content = await readFile(uncompressedPath);

        // 压缩
        const compressed = await gzip(content);

        // 写入压缩文件
        await writeFile(compressedPath, compressed);

        // 删除原文件
        await unlink(uncompressedPath);

        return { success: true };
      } catch (error) {
        console.error(`压缩数据失败 (${hourKey}):`, error);
        return {
          success: false,
          message: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 获取文件信息
  ipcMain.handle(
    'historyData:getFileInfo',
    async (event, hourKey: string): Promise<HistoryFileInfo | null> => {
      try {
        const compressed = isCompressed(hourKey);
        const filePath = getFilePath(hourKey, compressed);

        if (!fs.existsSync(filePath)) {
          return null;
        }

        const stats = await stat(filePath);

        // 获取记录数量（需要解析文件）
        let recordCount = 0;
        try {
          let content: Buffer;
          if (compressed) {
            const compressedData = await readFile(filePath);
            content = await gunzip(compressedData);
          } else {
            content = await readFile(filePath);
          }

          const data: HourlyDataFile = JSON.parse(content.toString('utf-8'));
          recordCount = data.records.length;
        } catch (parseError) {
          console.warn(`解析文件获取记录数失败 (${hourKey}):`, parseError);
        }

        return {
          hourKey,
          filePath,
          size: stats.size,
          recordCount,
          compressed,
          lastModified: stats.mtime.getTime(),
        };
      } catch (error) {
        console.error(`获取文件信息失败 (${hourKey}):`, error);
        return null;
      }
    },
  );

  // 获取存储统计信息
  ipcMain.handle('historyData:getStorageStats', async (): Promise<StorageStats> => {
    try {
      const baseDir = getHistoryDataDirectory();
      if (!fs.existsSync(baseDir)) {
        return {
          totalFiles: 0,
          totalSize: 0,
          totalRecords: 0,
          dateRange: { earliest: '', latest: '' },
          compressionRatio: 0,
        };
      }

      const files = await readdir(baseDir);
      const dataFiles = files.filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'));

      let totalSize = 0;
      const totalRecords = 0;
      let compressedSize = 0;
      let uncompressedSize = 0;
      const hourKeys: string[] = [];

      for (const file of dataFiles) {
        const filePath = path.join(baseDir, file);
        const stats = await stat(filePath);
        totalSize += stats.size;

        const hourKey = file.replace(/\.json(\.gz)?$/, '');
        hourKeys.push(hourKey);

        if (file.endsWith('.gz')) {
          compressedSize += stats.size;
        } else {
          uncompressedSize += stats.size;
        }

        // 获取记录数（简化处理，避免解析所有文件）
        // 在实际应用中可以考虑缓存这些信息
      }

      const uniqueHourKeys = [...new Set(hourKeys)].sort();
      const earliest = uniqueHourKeys[0] || '';
      const latest = uniqueHourKeys[uniqueHourKeys.length - 1] || '';

      return {
        totalFiles: uniqueHourKeys.length,
        totalSize,
        totalRecords, // 这里简化处理，实际应用中需要遍历所有文件计算
        dateRange: { earliest, latest },
        compressionRatio: uncompressedSize > 0 ? compressedSize / uncompressedSize : 0,
      };
    } catch (error) {
      console.error('获取存储统计信息失败:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        totalRecords: 0,
        dateRange: { earliest: '', latest: '' },
        compressionRatio: 0,
      };
    }
  });

  // 导出CSV文件
  ipcMain.handle(
    'historyData:exportCSV',
    async (event, config: CSVExportConfig): Promise<CSVExportResult> => {
      try {
        // 显示保存对话框
        const result = await dialog.showSaveDialog({
          title: '导出CSV文件',
          defaultPath: `${config.fileName}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
          filters: [
            { name: 'CSV文件', extensions: ['csv'] },
            { name: '所有文件', extensions: ['*'] },
          ],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, error: '用户取消导出' };
        }

        // 这里需要实现CSV内容生成逻辑
        // 暂时返回成功，实际实现需要根据config生成CSV内容
        const csvContent = 'timestamp,data\n'; // 占位符

        await writeFile(result.filePath, csvContent, 'utf-8');

        return {
          success: true,
          filePath: result.filePath,
          recordCount: 0, // 实际记录数
        };
      } catch (error) {
        console.error('导出CSV失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 删除小时数据文件
  ipcMain.handle(
    'historyData:deleteHourData',
    async (event, hourKey: string): Promise<{ success: boolean; message?: string }> => {
      try {
        const uncompressedPath = getFilePath(hourKey, false);
        const compressedPath = getFilePath(hourKey, true);

        let deleted = false;

        if (fs.existsSync(uncompressedPath)) {
          await unlink(uncompressedPath);
          deleted = true;
        }

        if (fs.existsSync(compressedPath)) {
          await unlink(compressedPath);
          deleted = true;
        }

        if (!deleted) {
          return { success: false, message: '文件不存在' };
        }

        return { success: true };
      } catch (error) {
        console.error(`删除数据失败 (${hourKey}):`, error);
        return {
          success: false,
          message: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 清理过期数据
  ipcMain.handle(
    'historyData:cleanupOldData',
    async (
      event,
      daysToKeep: number,
    ): Promise<{ success: boolean; deletedFiles: number; message?: string }> => {
      try {
        const baseDir = getHistoryDataDirectory();
        if (!fs.existsSync(baseDir)) {
          return { success: true, deletedFiles: 0 };
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffHourKey = cutoffDate.toISOString().slice(0, 13).replace('T', '-');

        const files = await readdir(baseDir);
        const dataFiles = files.filter(
          (file) => file.endsWith('.json') || file.endsWith('.json.gz'),
        );

        let deletedFiles = 0;

        for (const file of dataFiles) {
          const hourKey = file.replace(/\.json(\.gz)?$/, '');
          if (hourKey < cutoffHourKey) {
            const filePath = path.join(baseDir, file);
            await unlink(filePath);
            deletedFiles++;
          }
        }

        return { success: true, deletedFiles };
      } catch (error) {
        console.error('清理过期数据失败:', error);
        return {
          success: false,
          deletedFiles: 0,
          message: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 批量加载多个小时的数据
  ipcMain.handle(
    'historyData:loadMultipleHours',
    async (
      event,
      hourKeys: string[],
    ): Promise<{
      success: boolean;
      data: Record<string, HourlyDataFile>;
      errors?: string[];
    }> => {
      try {
        const data: Record<string, HourlyDataFile> = {};
        const errors: string[] = [];

        for (const hourKey of hourKeys) {
          try {
            const compressed = isCompressed(hourKey);
            const filePath = getFilePath(hourKey, compressed);

            if (!fs.existsSync(filePath)) {
              errors.push(`文件不存在: ${hourKey}`);
              continue;
            }

            let content: Buffer;
            if (compressed) {
              const compressedData = await readFile(filePath);
              content = await gunzip(compressedData);
            } else {
              content = await readFile(filePath);
            }

            data[hourKey] = JSON.parse(content.toString('utf-8'));
          } catch (error) {
            errors.push(
              `加载失败 ${hourKey}: ${error instanceof Error ? error.message : '未知错误'}`,
            );
          }
        }

        const result: {
          success: boolean;
          data: Record<string, HourlyDataFile>;
          errors?: string[];
        } = {
          success: true,
          data,
        };

        if (errors.length > 0) {
          result.errors = errors;
        }

        return result;
      } catch (error) {
        console.error('批量加载数据失败:', error);
        return {
          success: false,
          data: {},
          errors: [error instanceof Error ? error.message : '未知错误'],
        };
      }
    },
  );
};
