/**
 * 统一发送路由器
 * 根据连接目标类型路由到相应的发送方法
 */

import { serialAPI, networkAPI } from '../../../api/common';
import { frameToBuffer } from '../../../utils/frames/frameInstancesUtils';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';
import { useConnectionTargetsStore } from '../../../stores/connectionTargetsStore';
import { useSendFrameInstancesStore } from '../../../stores/frames/sendFrameInstancesStore';
import { useGlobalStatsStore } from '../../../stores/globalStatsStore';
import { useFrameExpressionManager } from '../useFrameExpressionManager';

/**
 * 统一发送结果
 */
export interface UnifiedSendResult {
  success: boolean;
  message?: string;
  error?: string;
  targetId: string;
  targetType: 'serial' | 'network';
}

/**
 * 解析连接目标ID
 * @param targetId 连接目标ID，格式为 "serial:COM1" 或 "network:tcp-192.168.1.100:8080"
 * @returns 解析结果
 */
function parseTargetId(targetId: string): {
  type: 'serial' | 'network';
  identifier: string;
} {
  const parts = targetId.split(':', 2);
  const type = parts[0];
  const identifier = parts[1];

  if (!identifier) {
    throw new Error(`无效的目标ID格式: ${targetId}`);
  }

  if (type === 'serial') {
    return { type: 'serial', identifier };
  } else if (type === 'network') {
    return { type: 'network', identifier };
  } else {
    throw new Error(`不支持的连接类型: ${type}`);
  }
}

/**
 * 统一发送路由器组合式函数
 */
export function useUnifiedSender() {
  // 获取发送实例store用于更新统计
  const sendFrameInstancesStore = useSendFrameInstancesStore();
  const connectionTargetsStore = useConnectionTargetsStore();
  const globalStatsStore = useGlobalStatsStore();
  const frameExpressionManager = useFrameExpressionManager();

  /**
   * 发送帧实例到指定目标
   * @param targetId 目标连接ID
   * @param frameInstance 帧实例
   * @returns 发送结果
   */
  const sendFrameInstance = async (
    targetId: string,
    frameInstance: SendFrameInstance,
  ): Promise<UnifiedSendResult> => {
    try {
      // 发送前计算表达式字段
      if (frameExpressionManager.hasExpressionFields(frameInstance.frameId, 'send')) {
        const updateFieldValue = (fieldId: string, value: string) => {
          const field = frameInstance.fields.find((f) => f.id === fieldId);
          if (field) {
            field.value = value;
          }
        };

        frameExpressionManager.calculateAndApplySendFrame(frameInstance, updateFieldValue);
      }

      const frameInstanceTemp: SendFrameInstance = {
        ...frameInstance,
        fields: frameInstance.fields.map((field) => {
          if (field.dataType !== 'bytes' && field.factor && field.factor !== 1) {
            return {
              ...field,
              value: (Number(field.value) * field.factor).toString(),
            };
          } else {
            return field;
          }
        }),
      };

      const data = frameToBuffer(frameInstanceTemp);
      const { type, identifier } = parseTargetId(targetId);

      let result: UnifiedSendResult;

      if (type === 'serial') {
        result = await sendToSerial(identifier, data, targetId);
      } else if (type === 'network') {
        // 获取验证后的目标路径
        const targetPath = connectionTargetsStore.getValidatedTargetPath(targetId);

        if (!targetPath) {
          result = {
            success: false,
            error: '无效的网络目标路径',
            targetId,
            targetType: 'network',
          };
        } else if (targetPath.includes(':') && targetPath.split(':').length === 3) {
          // UDP远程主机目标格式：connectionId:targetHost
          const parts = targetPath.split(':');
          const connectionId = parts[0];
          const targetHost = parts[1] + ':' + parts[2];
          if (connectionId && targetHost) {
            result = await sendToNetwork(connectionId, data, targetId, targetHost);
          } else {
            result = {
              success: false,
              error: '无效的UDP远程主机目标格式',
              targetId,
              targetType: 'network',
            };
          }
        } else {
          // TCP主连接目标：connectionId
          result = await sendToNetwork(targetPath, data, targetId);
        }
      } else {
        result = {
          success: false,
          error: `不支持的连接类型: ${type}`,
          targetId,
          targetType: type,
        };
      }

      // 如果发送成功，异步更新发送统计（不阻塞发送流程）
      if (result.success) {
        // 使用 setTimeout 异步执行，避免阻塞发送响应
        setTimeout(() => {
          sendFrameInstancesStore.updateSendStatsCache(frameInstance);
          // 更新全局统计
          globalStatsStore.incrementSentPackets();
          globalStatsStore.addSentBytes(data.length);
        }, 0);
      } else {
        // 发送失败时更新错误统计
        setTimeout(() => {
          globalStatsStore.incrementCommunicationErrors();
        }, 0);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送失败',
        targetId,
        targetType: 'serial', // 默认类型
      };
    }
  };

  /**
   * 发送数据到串口
   * @param portPath 串口路径
   * @param data 数据
   * @param targetId 目标ID
   * @returns 发送结果
   */
  const sendToSerial = async (
    portPath: string,
    data: Uint8Array,
    targetId: string,
  ): Promise<UnifiedSendResult> => {
    try {
      const result = await serialAPI.sendData(portPath, data);

      const sendResult: UnifiedSendResult = {
        success: result.success,
        targetId,
        targetType: 'serial',
      };

      if (result.message) {
        sendResult.message = result.message;
      }

      if (result.message && !result.success) {
        sendResult.error = result.message;
      }

      return sendResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '串口发送失败',
        targetId,
        targetType: 'serial',
      };
    }
  };

  /**
   * 发送数据到网络连接
   * @param connectionId 网络连接ID
   * @param data 数据
   * @param targetId 目标ID
   * @param targetHost 远程主机地址（可选）
   * @returns 发送结果
   */
  const sendToNetwork = async (
    connectionId: string,
    data: Uint8Array,
    targetId: string,
    targetHost?: string,
  ): Promise<UnifiedSendResult> => {
    try {
      const result = await networkAPI.send(connectionId, data, targetHost);

      const sendResult: UnifiedSendResult = {
        success: result.success,
        targetId,
        targetType: 'network',
      };

      if (result.message) {
        sendResult.message = result.message;
      }

      if (result.error) {
        sendResult.error = result.error;
      }

      return sendResult;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '网络发送失败',
        targetId,
        targetType: 'network',
      };
    }
  };

  /**
   * 检查目标连接是否可用
   * @param targetId 目标连接ID
   * @returns 是否可用
   */
  const isTargetAvailable = (targetId: string): boolean => {
    // 直接从 connectionTargetsStore 获取可用性状态，避免 API 调用
    return connectionTargetsStore.isTargetAvailable(targetId);
  };

  /**
   * 获取目标连接的状态信息
   * @param targetId 目标连接ID
   * @returns 状态信息
   */
  const getTargetStatus = async (targetId: string) => {
    try {
      const { type } = parseTargetId(targetId);

      if (type === 'serial') {
        const { identifier } = parseTargetId(targetId);
        return await serialAPI.getStatus(identifier);
      } else if (type === 'network') {
        // 获取验证后的目标路径
        const targetPath = connectionTargetsStore.getValidatedTargetPath(targetId);
        if (!targetPath) {
          return null;
        }

        // 提取连接ID（无论是TCP主连接还是UDP远程主机目标，都返回基础连接状态）
        const connectionId = targetPath.includes(':') ? targetPath.split(':')[0] : targetPath;
        if (connectionId) {
          return await networkAPI.getStatus(connectionId);
        }
      }

      return null;
    } catch (error) {
      console.warn(`获取目标状态失败: ${targetId}`, error);
      return null;
    }
  };

  return {
    sendFrameInstance,
    isTargetAvailable,
    getTargetStatus,
    parseTargetId,
  };
}
