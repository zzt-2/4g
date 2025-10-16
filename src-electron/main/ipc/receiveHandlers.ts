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
  ReceiveScoeFrameStats,
} from '../../../src/types/frames/receive';
import type { IpcMainInvokeEvent } from 'electron';
import {
  applyDataProcessResult,
  createDataPacket,
  matchDataToFrame,
  processReceivedData,
  validateMappings,
} from 'src/utils/receive';
import { receiveConfigCache } from './receiveConfigCache';

// ==================== IPC处理器接口 ====================

/**
 * 统一数据接收处理接口（优化版 - 使用缓存配置）
 */
async function handleReceivedData(
  event: IpcMainInvokeEvent,
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
  try {
    // 从缓存获取配置
    const frames = receiveConfigCache.getDirectDataFrames();
    const mappings = receiveConfigCache.getMappings();
    const groups = receiveConfigCache.getGroups();

    // 检查缓存是否有效
    if (frames.length === 0 && mappings.length === 0 && groups.length === 0) {
      return {
        success: false,
        receiveStats: {
          totalPackets: 1,
          errorPackets: 1,
          bytesReceived: data.length,
        },
        errors: ['接收配置缓存为空，请先同步配置'],
      };
    }

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

/**
 * 更新配置缓存接口
 */
async function updateConfigCache(
  event: IpcMainInvokeEvent,
  frames: Frame[],
  mappings: FrameFieldMapping[],
  groups: DataGroup[],
): Promise<{ success: boolean; status?: ReturnType<typeof receiveConfigCache.getStatus> }> {
  try {
    receiveConfigCache.updateConfig(frames, mappings, groups);
    return {
      success: true,
      status: receiveConfigCache.getStatus(),
    };
  } catch (error) {
    console.error('更新配置缓存失败:', error);
    return {
      success: false,
    };
  }
}

/**
 * 只更新帧模板缓存
 */
async function updateFramesCache(
  event: IpcMainInvokeEvent,
  frames: Frame[],
): Promise<{ success: boolean }> {
  try {
    receiveConfigCache.updateFrames(frames);
    return { success: true };
  } catch (error) {
    console.error('更新帧模板缓存失败:', error);
    return { success: false };
  }
}

/**
 * 只更新映射关系缓存
 */
async function updateMappingsCache(
  event: IpcMainInvokeEvent,
  mappings: FrameFieldMapping[],
): Promise<{ success: boolean }> {
  try {
    receiveConfigCache.updateMappings(mappings);
    return { success: true };
  } catch (error) {
    console.error('更新映射关系缓存失败:', error);
    return { success: false };
  }
}

/**
 * 只更新数据分组缓存
 */
async function updateGroupsCache(
  event: IpcMainInvokeEvent,
  groups: DataGroup[],
): Promise<{ success: boolean }> {
  try {
    receiveConfigCache.updateGroups(groups);
    return { success: true };
  } catch (error) {
    console.error('更新数据分组缓存失败:', error);
    return { success: false };
  }
}

/**
 * 获取缓存状态
 */
async function getCacheStatus(): Promise<ReturnType<typeof receiveConfigCache.getStatus>> {
  return receiveConfigCache.getStatus();
}

/**
 * 清空配置缓存
 */
async function clearConfigCache(): Promise<{ success: boolean }> {
  try {
    receiveConfigCache.clear();
    return { success: true };
  } catch (error) {
    console.error('清空配置缓存失败:', error);
    return { success: false };
  }
}

// ==================== 注册处理器 ====================

const receiveRegistry = createHandlerRegistry('receive');

receiveRegistry.register('handleReceivedData', handleReceivedData);
receiveRegistry.register('validateMappings', validateMappingsHandler);
receiveRegistry.register('updateConfigCache', updateConfigCache);
receiveRegistry.register('updateFramesCache', updateFramesCache);
receiveRegistry.register('updateMappingsCache', updateMappingsCache);
receiveRegistry.register('updateGroupsCache', updateGroupsCache);
receiveRegistry.register('getCacheStatus', getCacheStatus);
receiveRegistry.register('clearConfigCache', clearConfigCache);

export function registerReceiveHandlers() {
  return receiveRegistry.registerAll();
}
