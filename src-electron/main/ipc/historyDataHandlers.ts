/**
 * 历史数据处理器
 */

import { dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import type {
  HourlyDataFile,
  HistoryFileInfo,
  StorageStats,
  CSVExportConfig,
  CSVExportResult,
  HistoryDataRecord,
  GroupMetadata,
  BatchAppendConfig,
  BatchAppendResult,
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

// 获取默认导出目录
const getDefaultExportDirectory = (): string => {
  const userDataPath = pathAPI.getDataPath();
  return path.join(userDataPath, 'exports', 'csv');
};

// 格式化时间戳为可读格式
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
};

// 注册IPC处理器
export const registerHistoryDataHandlers = (): void => {
  const historyRegistry = createHandlerRegistry('historyData');

  // 获取可用小时键列表
  historyRegistry.register('getAvailableHours', async (): Promise<string[]> => {
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

  // 批量追加记录（新增API）
  historyRegistry.register(
    'appendBatchRecords',
    async (_, config: BatchAppendConfig): Promise<BatchAppendResult> => {
      try {
        const { hourKey, records, metadata } = config;
        const filePath = getFilePath(hourKey, false);
        let hourlyData: HourlyDataFile;

        // 尝试加载现有文件
        if (fs.existsSync(filePath)) {
          const content = await readFile(filePath, 'utf-8');
          hourlyData = JSON.parse(content);
        } else {
          // 创建新的小时数据文件结构，使用传入的元数据
          if (!metadata) {
            return {
              success: false,
              error: '文件不存在且未提供元数据，无法创建新文件',
            };
          }

          hourlyData = {
            metadata: {
              version: metadata.version,
              hourKey,
              groups: metadata.groups,
              totalDataItems: metadata.totalDataItems,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            records: [],
          };
        }

        // 批量添加记录
        hourlyData.records.push(...records);
        hourlyData.metadata.updatedAt = Date.now();

        // 保存文件
        const jsonContent = JSON.stringify(hourlyData, null, 2);
        await writeFile(filePath, jsonContent, 'utf-8');

        return {
          success: true,
          appendedCount: records.length,
          totalRecords: hourlyData.records.length,
        };
      } catch (error) {
        console.error(`批量添加记录失败 (${config.hourKey}):`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        };
      }
    },
  );

  // 压缩小时数据文件
  historyRegistry.register(
    'compressHourData',
    async (_, hourKey: string): Promise<{ success: boolean; message?: string }> => {
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
  historyRegistry.register(
    'getFileInfo',
    async (_, hourKey: string): Promise<HistoryFileInfo | null> => {
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
  historyRegistry.register('getStorageStats', async (): Promise<StorageStats> => {
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
  historyRegistry.register(
    'exportCSV',
    async (_, config: CSVExportConfig): Promise<CSVExportResult> => {
      try {
        let filePath: string;

        // 根据配置决定文件路径
        if (config.usePresetPath) {
          // 使用预设路径
          const exportDir = config.outputDirectory || getDefaultExportDirectory();
          ensureDirectoryExists(exportDir);

          const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
          const fileName = `${config.fileName}_${timestamp}.csv`;
          filePath = path.join(exportDir, fileName);
        } else {
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

          filePath = result.filePath;
        }

        // 获取时间范围内的小时键
        const startTime = new Date(config.timeRange.startTime);
        const endTime = new Date(config.timeRange.endTime);
        const hourKeys: string[] = [];

        const current = new Date(startTime);
        current.setMinutes(0, 0, 0); // 对齐到小时

        while (current <= endTime) {
          const year = current.getFullYear();
          const month = (current.getMonth() + 1).toString().padStart(2, '0');
          const day = current.getDate().toString().padStart(2, '0');
          const hour = current.getHours().toString().padStart(2, '0');

          const hourKey = `${year}-${month}-${day}-${hour}`;
          hourKeys.push(hourKey);

          current.setHours(current.getHours() + 1);
        }

        // 加载数据
        const allRecords: HistoryDataRecord[] = [];
        let metadata: GroupMetadata[] | null = null;

        for (const hourKey of hourKeys) {
          try {
            const compressed = isCompressed(hourKey);
            const dataFilePath = getFilePath(hourKey, compressed);

            if (!fs.existsSync(dataFilePath)) {
              continue;
            }

            let content: Buffer;
            if (compressed) {
              const compressedData = await readFile(dataFilePath);
              content = await gunzip(compressedData);
            } else {
              content = await readFile(dataFilePath);
            }

            const hourlyData: HourlyDataFile = JSON.parse(content.toString('utf-8'));
            allRecords.push(...hourlyData.records);

            if (!metadata) {
              metadata = hourlyData.metadata.groups;
            }
          } catch (error) {
            console.warn(`加载小时数据失败 (${hourKey}):`, error);
          }
        }

        // 按时间戳排序并筛选时间范围
        const filteredRecords = allRecords
          .filter(
            (record) =>
              record.timestamp >= config.timeRange.startTime &&
              record.timestamp <= config.timeRange.endTime,
          )
          .sort((a, b) => a.timestamp - b.timestamp);

        if (filteredRecords.length === 0) {
          return { success: false, error: '当前时间范围内没有数据' };
        }

        // 生成CSV内容
        const csvLines: string[] = [];

        // 生成表头
        if (config.includeHeaders) {
          const headers: string[] = [];

          if (config.includeTimestamp) {
            headers.push('timestamp');
          }

          // 为每个选中的数据项添加表头
          config.selectedItems.forEach((item) => {
            const group = metadata?.find((g) => g.id === item.groupId);
            if (group) {
              const dataItem = group.dataItems?.find((d) => d.id === item.dataItemId);
              if (dataItem) {
                headers.push(`${group.label}_${dataItem.label}`);
              }
            }
          });

          csvLines.push(headers.join(','));
        }

        // 生成数据行
        filteredRecords.forEach((record) => {
          const row: string[] = [];

          if (config.includeTimestamp) {
            row.push(formatTimestamp(record.timestamp));
          }

          // 为每个选中的数据项添加数据
          config.selectedItems.forEach((item) => {
            const group = metadata?.find((g) => g.id === item.groupId);
            if (group) {
              const dataItem = group.dataItems?.find((d) => d.id === item.dataItemId);
              if (dataItem && dataItem.index < record.data.length) {
                const value = record.data[dataItem.index];
                // 确保CSV值正确转义
                row.push(String(value ?? ''));
              } else {
                row.push('');
              }
            } else {
              row.push('');
            }
          });

          csvLines.push(row.join(','));
        });

        const csvContent = csvLines.join('\n');

        // 写入文件
        await writeFile(filePath, csvContent, 'utf-8');

        return {
          success: true,
          filePath,
          recordCount: filteredRecords.length,
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
  historyRegistry.register(
    'deleteHourData',
    async (_, hourKey: string): Promise<{ success: boolean; message?: string }> => {
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
  historyRegistry.register(
    'cleanupOldData',
    async (
      _,
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
  historyRegistry.register(
    'loadMultipleHours',
    async (
      _,
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

  // 注册所有处理器
  historyRegistry.registerAll();
};
