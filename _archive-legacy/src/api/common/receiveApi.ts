/**
 * 数据接收处理API封装
 * 提供统一的数据接收处理接口
 */

import { deepClone } from '../../utils/frames/frameUtils';
import type { Frame } from '../../types/frames/frames';
import type {
  FrameFieldMapping,
  DataGroup,
  ValidationResult,
  ReceivedDataPacket,
  ReceiveFrameStats,
  DataReceiveStats,
  ReceiveScoeFrameStats,
} from '../../types/frames/receive';

// 导出接收数据处理API
export const receiveAPI = {
  // 统一数据接收处理（优化版 - 使用主进程缓存）
  handleReceivedData: (
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
  ): Promise<{
    success: boolean;
    updatedGroups?: DataGroup[];
    updatedDataItems?: {
      groupId: number;
      dataItemId: number;
      fieldId: string;
      value: unknown;
      displayValue: string;
    }[];
    recentPacket?: ReceivedDataPacket;
    frameStats?: Partial<ReceiveFrameStats>;
    scoeFrameStats?: Partial<ReceiveScoeFrameStats>;
    receiveStats?: Partial<DataReceiveStats>;
    errors?: string[];
  }> => {
    if (window.electron?.receive?.handleReceivedData) {
      return window.electron.receive.handleReceivedData(source, sourceId, data);
    }
    return Promise.resolve({
      success: false,
      errors: ['Electron receive API(handleReceivedData) 不可用'],
    });
  },

  // 验证映射关系
  validateMappings: (
    mappings: FrameFieldMapping[],
    frames: Frame[],
    groups: DataGroup[],
  ): Promise<ValidationResult> => {
    if (window.electron?.receive?.validateMappings) {
      return window.electron.receive.validateMappings(
        deepClone(mappings),
        deepClone(frames),
        deepClone(groups),
      );
    }
    return Promise.resolve({
      isValid: false,
      errors: ['Electron receive API(validateMappings) 不可用'],
    });
  },

  // 更新配置缓存
  updateConfigCache: (
    frames: Frame[],
    mappings: FrameFieldMapping[],
    groups: DataGroup[],
  ): Promise<{
    success: boolean;
    status?: {
      hasData: boolean;
      framesCount: number;
      mappingsCount: number;
      groupsCount: number;
      directDataFramesCount: number;
      lastUpdateTime: string;
    };
  }> => {
    if (window.electron?.receive?.updateConfigCache) {
      return window.electron.receive.updateConfigCache(
        deepClone(frames),
        deepClone(mappings),
        deepClone(groups),
      );
    }
    return Promise.resolve({
      success: false,
    });
  },

  // 只更新帧模板缓存
  updateFramesCache: (frames: Frame[]): Promise<{ success: boolean }> => {
    if (window.electron?.receive?.updateFramesCache) {
      return window.electron.receive.updateFramesCache(deepClone(frames));
    }
    return Promise.resolve({ success: false });
  },

  // 只更新映射关系缓存
  updateMappingsCache: (mappings: FrameFieldMapping[]): Promise<{ success: boolean }> => {
    if (window.electron?.receive?.updateMappingsCache) {
      return window.electron.receive.updateMappingsCache(deepClone(mappings));
    }
    return Promise.resolve({ success: false });
  },

  // 只更新数据分组缓存
  updateGroupsCache: (groups: DataGroup[]): Promise<{ success: boolean }> => {
    if (window.electron?.receive?.updateGroupsCache) {
      return window.electron.receive.updateGroupsCache(deepClone(groups));
    }
    return Promise.resolve({ success: false });
  },

  // 获取缓存状态
  getCacheStatus: (): Promise<{
    hasData: boolean;
    framesCount: number;
    mappingsCount: number;
    groupsCount: number;
    directDataFramesCount: number;
    lastUpdateTime: string;
  }> => {
    if (window.electron?.receive?.getCacheStatus) {
      return window.electron.receive.getCacheStatus();
    }
    return Promise.resolve({
      hasData: false,
      framesCount: 0,
      mappingsCount: 0,
      groupsCount: 0,
      directDataFramesCount: 0,
      lastUpdateTime: 'Never',
    });
  },

  // 清空配置缓存
  clearConfigCache: (): Promise<{ success: boolean }> => {
    if (window.electron?.receive?.clearConfigCache) {
      return window.electron.receive.clearConfigCache();
    }
    return Promise.resolve({ success: false });
  },
};
