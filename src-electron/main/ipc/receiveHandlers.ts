/**
 * 接收数据处理IPC处理器
 * 将utils/receive中的函数移至主进程执行
 */

import { createHandlerRegistry } from '../../../src/utils/common/ipcUtils';
import type { Frame } from '../../../src/types/frames/frames';
import type {
  FrameFieldMapping,
  DataGroup,
  ValidationResult,
  ReceivedDataPacket,
  ReceiveFrameStats,
  DataReceiveStats,
} from '../../../src/types/frames/receive';
import type { IpcMainInvokeEvent } from 'electron';
import {
  applyDataProcessResult,
  createDataPacket,
  matchDataToFrame,
  processReceivedData,
  validateMappings,
} from 'src/utils/receive';

// ==================== IPC处理器接口 ====================

/**
 * 统一数据接收处理接口
 */
async function handleReceivedData(
  event: IpcMainInvokeEvent,
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
  try {
    // 创建数据包
    const packet = createDataPacket(source, sourceId, data);

    // 匹配帧格式
    const matchResult = matchDataToFrame(packet, frames);

    if (!matchResult.isMatched) {
      return {
        success: false,
        recentPacket: packet,
        receiveStats: {
          totalPackets: 1,
          unmatchedPackets: 1,
          bytesReceived: packet.size,
        },
        ...(matchResult.errors && { errors: matchResult.errors }),
      };
    }

    // 处理数据并更新数据项
    const processResult = processReceivedData(packet, matchResult, mappings, groups);

    if (!processResult.success) {
      return {
        success: false,
        recentPacket: packet,
        receiveStats: {
          totalPackets: 1,
          matchedPackets: 1,
          errorPackets: 1,
          bytesReceived: packet.size,
        },
        ...(processResult.errors && { errors: processResult.errors }),
      };
    }

    // 应用处理结果到分组副本
    const updatedGroups = JSON.parse(JSON.stringify(groups)); // 深拷贝
    const applied = applyDataProcessResult(processResult, updatedGroups);

    if (!applied) {
      return {
        success: false,
        recentPacket: packet,
        receiveStats: {
          totalPackets: 1,
          matchedPackets: 1,
          errorPackets: 1,
          bytesReceived: packet.size,
        },
        errors: ['应用数据处理结果失败'],
      };
    }

    // 构建帧统计信息
    const frameStats: Partial<ReceiveFrameStats> = {
      frameId: matchResult.frameId!,
      totalReceived: 1, // 增量值
      lastReceiveTime: new Date(),
      lastReceivedFrame: packet.data,
    };

    // 构建接收统计信息
    const receiveStats: Partial<DataReceiveStats> = {
      totalPackets: 1,
      matchedPackets: 1,
      bytesReceived: packet.size,
    };

    return {
      success: true,
      updatedGroups,
      recentPacket: packet,
      frameStats,
      receiveStats,
    };
  } catch (error) {
    return {
      success: false,
      receiveStats: {
        totalPackets: 1,
        errorPackets: 1,
        bytesReceived: data.length,
      },
      errors: [error instanceof Error ? error.message : '数据接收处理异常'],
    };
  }
}

/**
 * 映射验证接口
 */
async function validateMappingsHandler(
  event: IpcMainInvokeEvent,
  mappings: FrameFieldMapping[],
  frames: Frame[],
  groups: DataGroup[],
): Promise<ValidationResult> {
  try {
    return validateMappings(mappings, frames, groups);
  } catch (error) {
    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : '验证过程发生未知错误'],
    };
  }
}

// ==================== 注册处理器 ====================

const receiveRegistry = createHandlerRegistry('receive');

receiveRegistry.register('handleReceivedData', handleReceivedData);
receiveRegistry.register('validateMappings', validateMappingsHandler);

export function registerReceiveHandlers() {
  return receiveRegistry.registerAll();
}
