/**
 * 高速存储预加载API
 */

import { ipcRenderer } from 'electron';
import type {
  StorageConfig,
  StorageStats,
  StorageOperationResult,
  FrameHeaderRule,
  RuleValidationResult,
} from '../../../src/types/serial/highSpeedStorage';

export const highSpeedStorageAPI = {
  /**
   * 更新存储配置
   */
  updateConfig: (config: StorageConfig): Promise<StorageOperationResult> =>
    ipcRenderer.invoke('highSpeedStorage:updateConfig', config),

  /**
   * 获取存储配置
   */
  getConfig: (): Promise<StorageConfig> => ipcRenderer.invoke('highSpeedStorage:getConfig'),

  /**
   * 获取存储统计信息
   */
  getStats: (): Promise<StorageStats> => ipcRenderer.invoke('highSpeedStorage:getStats'),

  /**
   * 验证规则
   */
  validateRule: (rule: FrameHeaderRule): Promise<RuleValidationResult> =>
    ipcRenderer.invoke('highSpeedStorage:validateRule', rule),

  /**
   * 重置统计信息
   */
  resetStats: (): Promise<StorageOperationResult> =>
    ipcRenderer.invoke('highSpeedStorage:resetStats'),
};
