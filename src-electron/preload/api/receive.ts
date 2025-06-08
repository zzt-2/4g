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
} from '../../../src/types/frames/receive';

export const receiveAPI = {
  /**
   * 统一数据接收处理
   * @param source 数据来源
   * @param sourceId 来源标识
   * @param data 接收数据
   * @param frames 帧模板列表
   * @param mappings 字段映射关系
   * @param groups 数据分组配置
   * @returns 处理结果
   */
  async handleReceivedData(
    source: 'serial' | 'network',
    sourceId: string,
    data: Uint8Array,
    frames: Frame[],
    mappings: FrameFieldMapping[],
    groups: DataGroup[],
  ): Promise<{
    success: boolean;
    updatedGroups?: DataGroup[];
    recentPacket?: ReceivedDataPacket;
    frameStats?: Partial<ReceiveFrameStats>;
    receiveStats?: Partial<DataReceiveStats>;
    errors?: string[];
  }> {
    return ipcRenderer.invoke(
      'receive:handleReceivedData',
      source,
      sourceId,
      data,
      frames,
      mappings,
      groups,
    );
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
};
