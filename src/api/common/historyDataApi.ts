/**
 * 历史数据API封装
 * 提供历史数据存储和查询的统一接口
 */

import { deepClone } from '../../utils/frames/frameUtils';
import type {
  HourlyDataFile,
  HistoryFileInfo,
  StorageStats as HistoryStorageStats,
  CSVExportConfig,
  CSVExportResult,
  BatchAppendConfig,
  BatchAppendResult,
} from '../../types/storage/historyData';

// 导出历史数据API
export const historyDataAPI = {
  // 获取可用小时键列表
  getAvailableHours: (): Promise<string[]> => {
    if (window.electron?.historyData?.getAvailableHours) {
      return window.electron.historyData.getAvailableHours();
    }
    return Promise.resolve([]);
  },

  // 批量追加记录
  appendBatchRecords: (config: BatchAppendConfig): Promise<BatchAppendResult> => {
    if (window.electron?.historyData?.appendBatchRecords) {
      return window.electron.historyData.appendBatchRecords(deepClone(config));
    }
    return Promise.resolve({
      success: false,
      error: 'Electron historyData API(appendBatchRecords) 不可用',
    });
  },

  // 压缩小时数据文件
  compressHourData: (hourKey: string): Promise<{ success: boolean; message?: string }> => {
    if (window.electron?.historyData?.compressHourData) {
      return window.electron.historyData.compressHourData(hourKey);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron historyData API(compressHourData) 不可用',
    });
  },

  // 获取文件信息
  getFileInfo: (hourKey: string): Promise<HistoryFileInfo | null> => {
    if (window.electron?.historyData?.getFileInfo) {
      return window.electron.historyData.getFileInfo(hourKey);
    }
    return Promise.resolve(null);
  },

  // 获取存储统计信息
  getStorageStats: (): Promise<HistoryStorageStats> => {
    if (window.electron?.historyData?.getStorageStats) {
      return window.electron.historyData.getStorageStats();
    }
    return Promise.resolve({
      totalFiles: 0,
      totalSize: 0,
      totalRecords: 0,
      dateRange: { earliest: '', latest: '' },
      compressionRatio: 0,
    });
  },

  // 导出CSV文件
  exportCSV: (config: CSVExportConfig): Promise<CSVExportResult> => {
    if (window.electron?.historyData?.exportCSV) {
      return window.electron.historyData.exportCSV(deepClone(config));
    }
    return Promise.resolve({
      success: false,
      error: 'Electron historyData API(exportCSV) 不可用',
    });
  },

  // 删除小时数据文件
  deleteHourData: (hourKey: string): Promise<{ success: boolean; message?: string }> => {
    if (window.electron?.historyData?.deleteHourData) {
      return window.electron.historyData.deleteHourData(hourKey);
    }
    return Promise.resolve({
      success: false,
      message: 'Electron historyData API(deleteHourData) 不可用',
    });
  },

  // 清理过期数据
  cleanupOldData: (
    daysToKeep: number,
  ): Promise<{ success: boolean; deletedFiles: number; message?: string }> => {
    if (window.electron?.historyData?.cleanupOldData) {
      return window.electron.historyData.cleanupOldData(daysToKeep);
    }
    return Promise.resolve({
      success: false,
      deletedFiles: 0,
      message: 'Electron historyData API(cleanupOldData) 不可用',
    });
  },

  // 批量加载多个小时的数据
  loadMultipleHours: (
    hourKeys: string[],
  ): Promise<{
    success: boolean;
    data: Record<string, HourlyDataFile>;
    errors?: string[];
  }> => {
    if (window.electron?.historyData?.loadMultipleHours) {
      return window.electron.historyData.loadMultipleHours(hourKeys);
    }
    return Promise.resolve({
      success: false,
      data: {},
      errors: ['Electron historyData API(loadMultipleHours) 不可用'],
    });
  },
};
