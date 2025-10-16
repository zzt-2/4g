/**
 * 接收数据处理API
 * 预加载脚本中的接收数据处理接口
 */

import { ipcRenderer } from 'electron';
import type { Frame } from '../../../src/types/frames/frames';
import type {
  FrameFieldMapping,
  DataGroup,
  ValidationResult,
  ReceivedDataPacket,
  ReceiveFrameStats,
  DataReceiveStats,
  ReceiveScoeFrameStats,
} from '../../../src/types/frames/receive';

export const receiveAPI = {
  /**
   * 统一数据接收处理（优化版 - 使用主进程缓存）
   * @param source 数据来源
   * @param sourceId 来源标识
   * @param data 接收数据
   * @returns 处理结果
   */
  async handleReceivedData(
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
  ): Promise<{
    success: boolean;
    updatedGroups?: DataGroup[];
    recentPacket?: ReceivedDataPacket;
    frameStats?: Partial<ReceiveFrameStats>;
    scoeFrameStats?: Partial<ReceiveScoeFrameStats>;
    receiveStats?: Partial<DataReceiveStats>;
    errors?: string[];
  }> {
    return ipcRenderer.invoke('receive:handleReceivedData', source, sourceId, data);
  },

  /**
   * 验证映射关系
   * @param mappings 映射关系列表
   * @param frames 帧模板列表
   * @param groups 数据分组列表
   * @returns 验证结果
   */
  async validateMappings(
    mappings: FrameFieldMapping[],
    frames: Frame[],
    groups: DataGroup[],
  ): Promise<ValidationResult> {
    return ipcRenderer.invoke('receive:validateMappings', mappings, frames, groups);
  },

  /**
   * 更新主进程的配置缓存
   * @param frames 帧模板列表
   * @param mappings 映射关系列表
   * @param groups 数据分组列表
   */
  async updateConfigCache(
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
  }> {
    return ipcRenderer.invoke('receive:updateConfigCache', frames, mappings, groups);
  },

  /**
   * 只更新帧模板缓存
   */
  async updateFramesCache(frames: Frame[]): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('receive:updateFramesCache', frames);
  },

  /**
   * 只更新映射关系缓存
   */
  async updateMappingsCache(mappings: FrameFieldMapping[]): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('receive:updateMappingsCache', mappings);
  },

  /**
   * 只更新数据分组缓存
   */
  async updateGroupsCache(groups: DataGroup[]): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('receive:updateGroupsCache', groups);
  },

  /**
   * 获取缓存状态
   */
  async getCacheStatus(): Promise<{
    hasData: boolean;
    framesCount: number;
    mappingsCount: number;
    groupsCount: number;
    directDataFramesCount: number;
    lastUpdateTime: string;
  }> {
    return ipcRenderer.invoke('receive:getCacheStatus');
  },

  /**
   * 清空配置缓存
   */
  async clearConfigCache(): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('receive:clearConfigCache');
  },
};
