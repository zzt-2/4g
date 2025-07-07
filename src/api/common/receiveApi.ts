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
} from '../../types/frames/receive';

// 导出接收数据处理API
export const receiveAPI = {
  // 统一数据接收处理
  handleReceivedData: (
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
  }> => {
    if (window.electron?.receive?.handleReceivedData) {
      return window.electron.receive.handleReceivedData(
        source,
        sourceId,
        data,
        deepClone(frames),
        deepClone(mappings),
        deepClone(groups),
      );
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
};
