/**
 * 历史数据 API
 */

import { ipcRenderer } from 'electron';
import type {
  HourlyDataFile,
  HistoryFileInfo,
  StorageStats,
  CSVExportConfig,
  CSVExportResult,
} from '../../../src/types/storage/historyData';

export const historyDataAPI = {
  /**
   * 获取可用小时键列表
   */
  getAvailableHours: () => ipcRenderer.invoke('historyData:getAvailableHours') as Promise<string[]>,

  /**
   * 加载指定小时的数据
   * @param hourKey 小时键 YYYY-MM-DD-HH
   */
  loadHourData: (hourKey: string) =>
    ipcRenderer.invoke('historyData:loadHourData', hourKey) as Promise<HourlyDataFile | null>,

  /**
   * 保存小时数据到文件
   * @param hourKey 小时键
   * @param data 小时数据
   */
  saveHourData: (hourKey: string, data: HourlyDataFile) =>
    ipcRenderer.invoke('historyData:saveHourData', hourKey, data) as Promise<{
      success: boolean;
      message?: string;
    }>,

  /**
   * 添加实时数据记录到指定小时文件
   * @param hourKey 小时键
   * @param timestamp 时间戳
   * @param data 数据数组
   */
  appendRecord: (hourKey: string, timestamp: number, data: unknown[]) =>
    ipcRenderer.invoke('historyData:appendRecord', hourKey, timestamp, data) as Promise<{
      success: boolean;
      message?: string;
    }>,

  /**
   * 压缩指定小时的数据文件
   * @param hourKey 小时键
   */
  compressHourData: (hourKey: string) =>
    ipcRenderer.invoke('historyData:compressHourData', hourKey) as Promise<{
      success: boolean;
      message?: string;
    }>,

  /**
   * 获取文件信息
   * @param hourKey 小时键
   */
  getFileInfo: (hourKey: string) =>
    ipcRenderer.invoke('historyData:getFileInfo', hourKey) as Promise<HistoryFileInfo | null>,

  /**
   * 获取存储统计信息
   */
  getStorageStats: () => ipcRenderer.invoke('historyData:getStorageStats') as Promise<StorageStats>,

  /**
   * 导出CSV文件（带文件选择对话框）
   * @param config 导出配置
   */
  exportCSV: (config: CSVExportConfig) =>
    ipcRenderer.invoke('historyData:exportCSV', config) as Promise<CSVExportResult>,

  /**
   * 删除指定小时的数据文件
   * @param hourKey 小时键
   */
  deleteHourData: (hourKey: string) =>
    ipcRenderer.invoke('historyData:deleteHourData', hourKey) as Promise<{
      success: boolean;
      message?: string;
    }>,

  /**
   * 清理过期的历史数据文件
   * @param daysToKeep 保留天数
   */
  cleanupOldData: (daysToKeep: number) =>
    ipcRenderer.invoke('historyData:cleanupOldData', daysToKeep) as Promise<{
      success: boolean;
      deletedFiles: number;
      message?: string;
    }>,

  /**
   * 批量加载多个小时的数据
   * @param hourKeys 小时键数组
   */
  loadMultipleHours: (hourKeys: string[]) =>
    ipcRenderer.invoke('historyData:loadMultipleHours', hourKeys) as Promise<{
      success: boolean;
      data: Record<string, HourlyDataFile>;
      errors?: string[];
    }>,
};
