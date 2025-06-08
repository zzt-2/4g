/**
 * 统一发送路由器
 * 根据连接目标类型路由到相应的发送方法
 */

import { serialAPI, networkAPI } from '../../../utils/electronApi';
import type { SendFrameInstance } from '../../../types/frames/sendInstances';

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
      // 解析目标ID
      const { type, identifier } = parseTargetId(targetId);

      // 将帧实例转换为数据
      const frameData = convertFrameInstanceToData(frameInstance);
      if (!frameData || frameData.length === 0) {
        return {
          success: false,
          error: '帧数据为空',
          targetId,
          targetType: type,
        };
      }

      // 根据连接类型路由发送
      if (type === 'serial') {
        return await sendToSerial(identifier, frameData, targetId);
      } else if (type === 'network') {
        return await sendToNetwork(identifier, frameData, targetId);
      } else {
        return {
          success: false,
          error: `不支持的连接类型: ${type}`,
          targetId,
          targetType: type,
        };
      }
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
   * 将帧实例转换为数据
   * @param frameInstance 帧实例
   * @returns 数据数组
   */
  const convertFrameInstanceToData = (frameInstance: SendFrameInstance): Uint8Array => {
    // 这里需要根据实际的帧结构转换逻辑
    // 暂时返回空数组，后续需要实现具体的转换逻辑
    const data: number[] = [];

    // 遍历字段并转换为字节数据
    frameInstance.fields.forEach((field) => {
      if (field.value) {
        // 根据字段类型转换值
        const bytes = convertFieldValueToBytes(field.value, field.dataType);
        data.push(...bytes);
      }
    });

    return new Uint8Array(data);
  };

  /**
   * 将字段值转换为字节数组
   * @param value 字段值
   * @param dataType 数据类型
   * @returns 字节数组
   */
  const convertFieldValueToBytes = (value: string, dataType: string): number[] => {
    // 简化的转换逻辑，实际应该根据具体的数据类型进行转换
    if (dataType === 'hex') {
      // 十六进制字符串转字节
      const hex = value.replace(/\s/g, '');
      const bytes: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return bytes;
    } else if (dataType === 'number') {
      // 数字转字节
      const num = parseInt(value, 10);
      return [num & 0xff];
    } else {
      // 字符串转ASCII字节
      return Array.from(value).map((char) => char.charCodeAt(0));
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
   * @returns 发送结果
   */
  const sendToNetwork = async (
    connectionId: string,
    data: Uint8Array,
    targetId: string,
  ): Promise<UnifiedSendResult> => {
    try {
      const result = await networkAPI.send(connectionId, data);

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
  const isTargetAvailable = async (targetId: string): Promise<boolean> => {
    try {
      const { type, identifier } = parseTargetId(targetId);

      if (type === 'serial') {
        const status = await serialAPI.getStatus(identifier);
        return status.isOpen;
      } else if (type === 'network') {
        const status = await networkAPI.getStatus(identifier);
        return status?.isConnected || false;
      }

      return false;
    } catch (error) {
      console.warn(`检查目标可用性失败: ${targetId}`, error);
      return false;
    }
  };

  /**
   * 获取目标连接的状态信息
   * @param targetId 目标连接ID
   * @returns 状态信息
   */
  const getTargetStatus = async (targetId: string) => {
    try {
      const { type, identifier } = parseTargetId(targetId);

      if (type === 'serial') {
        return await serialAPI.getStatus(identifier);
      } else if (type === 'network') {
        return await networkAPI.getStatus(identifier);
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
    convertFrameInstanceToData,
  };
}
