/**
 * 高速存储API封装
 * 提供高速数据存储的统一接口
 */

import { deepClone } from '../../utils/frames/frameUtils';
import type {
  StorageConfig,
  StorageStats,
  StorageOperationResult,
  FrameHeaderRule,
  RuleValidationResult,
} from '../../types/serial/highSpeedStorage';

// 导出高速存储API
export const highSpeedStorageAPI = {
  // 更新存储配置
  updateConfig: (config: StorageConfig): Promise<StorageOperationResult> => {
    if (window.electron?.highSpeedStorage?.updateConfig) {
      return window.electron.highSpeedStorage.updateConfig(deepClone(config));
    }
    return Promise.resolve({
      success: false,
      error: 'Electron highSpeedStorage API(updateConfig) 不可用',
    });
  },

  // 获取存储配置
  getConfig: (): Promise<StorageConfig> => {
    if (window.electron?.highSpeedStorage?.getConfig) {
      return window.electron.highSpeedStorage.getConfig();
    }
    return Promise.resolve({
      enabled: false,
      rule: null,
      maxFileSize: 100,
      enableRotation: true,
      rotationCount: 5,
    });
  },

  // 获取存储统计信息
  getStats: (): Promise<StorageStats> => {
    if (window.electron?.highSpeedStorage?.getStats) {
      return window.electron.highSpeedStorage.getStats();
    }
    return Promise.resolve({
      totalFramesStored: 0,
      totalBytesStored: 0,
      currentFileSize: 0,
      storageStartTime: null,
      lastStorageTime: null,
      frameTypeStats: {},
      currentFilePath: '',
      isStorageActive: false,
    });
  },

  // 验证规则
  validateRule: (rule: FrameHeaderRule): Promise<RuleValidationResult> => {
    if (window.electron?.highSpeedStorage?.validateRule) {
      return window.electron.highSpeedStorage.validateRule(deepClone(rule));
    }
    return Promise.resolve({
      isValid: false,
      errors: ['Electron highSpeedStorage API(validateRule) 不可用'],
    });
  },

  // 重置统计信息
  resetStats: (): Promise<StorageOperationResult> => {
    if (window.electron?.highSpeedStorage?.resetStats) {
      return window.electron.highSpeedStorage.resetStats();
    }
    return Promise.resolve({
      success: false,
      error: 'Electron highSpeedStorage API(resetStats) 不可用',
    });
  },
};
