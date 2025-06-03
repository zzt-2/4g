/**
 * 统一数据处理工具函数
 * 处理来自串口和网口的接收数据
 */

import type { Frame } from '../../types/frames/frames';
import type { FrameField } from '../../types/frames/fields';
import type {
  ReceivedDataPacket,
  FrameMatchResult,
  DataProcessResult,
  FrameFieldMapping,
  DataGroup,
} from '../../types/frames/receive';
import { createMatchRules, matchFrame } from './frameMatchers';
import { convertToHex } from '../frames/hexCovertUtils';

/**
 * 生成唯一ID
 * @returns 唯一ID字符串
 */
function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * 创建数据包对象
 * @param source 数据来源
 * @param sourceId 来源标识
 * @param data 原始数据
 * @returns 数据包对象
 */
export function createDataPacket(
  source: 'serial' | 'network',
  sourceId: string,
  data: Uint8Array,
): ReceivedDataPacket {
  return {
    id: generateId(),
    timestamp: Date.now(),
    source,
    sourceId,
    data: new Uint8Array(data), // 确保数据副本
    size: data.length,
  };
}

/**
 * 匹配接收数据到帧格式
 * @param packet 数据包
 * @param frames 帧列表
 * @returns 匹配结果
 */
export function matchDataToFrame(packet: ReceivedDataPacket, frames: Frame[]): FrameMatchResult {
  try {
    // 筛选接收帧
    const receiveFrames = frames.filter((frame) => frame.direction === 'receive');

    if (receiveFrames.length === 0) {
      return {
        isMatched: false,
        confidence: 0,
        errors: ['没有可用的接收帧定义'],
      };
    }

    // 创建匹配规则
    const matchRules = createMatchRules(receiveFrames);

    if (matchRules.length === 0) {
      return {
        isMatched: false,
        confidence: 0,
        errors: ['没有有效的匹配规则'],
      };
    }

    // 执行匹配
    const matchedFrameId = matchFrame(packet.data, matchRules);

    if (!matchedFrameId) {
      return {
        isMatched: false,
        confidence: 0,
        errors: ['数据不匹配任何已知帧格式'],
      };
    }

    // 查找匹配的帧
    const matchedFrame = receiveFrames.find((frame) => frame.id === matchedFrameId);

    if (!matchedFrame) {
      return {
        isMatched: false,
        confidence: 0,
        errors: [`找不到帧ID为 ${matchedFrameId} 的帧定义`],
      };
    }

    return {
      isMatched: true,
      frameId: matchedFrameId,
      frame: matchedFrame,
      confidence: 1.0, // 简单实现，后续可以根据匹配质量调整
    };
  } catch (error) {
    return {
      isMatched: false,
      confidence: 0,
      errors: [error instanceof Error ? error.message : '匹配过程发生未知错误'],
    };
  }
}

/**
 * 从接收数据中提取字段值
 * @param data 接收数据
 * @param field 字段定义
 * @param startOffset 起始偏移量
 * @returns 提取的值和显示值
 */
export function extractFieldValue(
  data: Uint8Array,
  field: FrameField,
  startOffset: number = 0,
): { value: unknown; displayValue: string } {
  try {
    const fieldLength = field.length || 1;
    const endOffset = startOffset + fieldLength;

    // 检查数据长度
    if (endOffset > data.length) {
      return {
        value: null,
        displayValue: '数据不足',
      };
    }

    // 提取字段数据
    const fieldData = data.slice(startOffset, endOffset);

    // 根据数据类型解析值
    let value: unknown;
    let displayValue: string;

    switch (field.dataType) {
      case 'uint8':
        value = fieldData[0] || 0;
        displayValue = (value as number).toString();
        break;

      case 'int8': {
        const byte = fieldData[0] || 0;
        value = byte > 127 ? byte - 256 : byte;
        displayValue = (value as number).toString();
        break;
      }

      case 'uint16':
        value = fieldData.length >= 2 ? (fieldData[0]! << 8) | fieldData[1]! : 0;
        displayValue = (value as number).toString();
        break;

      case 'int16': {
        const uint16Val = fieldData.length >= 2 ? (fieldData[0]! << 8) | fieldData[1]! : 0;
        value = uint16Val > 32767 ? uint16Val - 65536 : uint16Val;
        displayValue = (value as number).toString();
        break;
      }

      case 'uint32':
        value =
          fieldData.length >= 4
            ? (fieldData[0]! << 24) | (fieldData[1]! << 16) | (fieldData[2]! << 8) | fieldData[3]!
            : 0;
        displayValue = (value as number).toString();
        break;

      case 'int32': {
        const uint32Val =
          fieldData.length >= 4
            ? (fieldData[0]! << 24) | (fieldData[1]! << 16) | (fieldData[2]! << 8) | fieldData[3]!
            : 0;
        value = uint32Val > 2147483647 ? uint32Val - 4294967296 : uint32Val;
        displayValue = (value as number).toString();
        break;
      }

      case 'float':
        if (fieldData.length >= 4) {
          const buffer = new ArrayBuffer(4);
          const view = new DataView(buffer);
          view.setUint8(0, fieldData[0]!);
          view.setUint8(1, fieldData[1]!);
          view.setUint8(2, fieldData[2]!);
          view.setUint8(3, fieldData[3]!);
          value = view.getFloat32(0, false); // big-endian
          displayValue = (value as number).toFixed(2);
        } else {
          value = 0.0;
          displayValue = '0.00';
        }
        break;

      case 'bytes':
        value = fieldData;
        displayValue = Array.from(fieldData)
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(' ');
        break;

      default:
        value = fieldData;
        displayValue = Array.from(fieldData)
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(' ');
    }

    return { value, displayValue };
  } catch (error) {
    return {
      value: null,
      displayValue: error instanceof Error ? `错误: ${error.message}` : '解析错误',
    };
  }
}

/**
 * 处理接收数据并更新数据项
 * @param packet 数据包
 * @param matchResult 匹配结果
 * @param mappings 映射关系列表
 * @param groups 数据分组列表
 * @returns 处理结果
 */
export function processReceivedData(
  packet: ReceivedDataPacket,
  matchResult: FrameMatchResult,
  mappings: FrameFieldMapping[],
  groups: DataGroup[],
): DataProcessResult {
  try {
    if (!matchResult.isMatched || !matchResult.frame || !matchResult.frameId) {
      return {
        success: false,
        errors: ['数据匹配失败，无法处理'],
      };
    }

    const frame = matchResult.frame;
    const frameId = matchResult.frameId;

    // 筛选相关映射关系
    const frameMappings = mappings.filter((mapping) => mapping.frameId === frameId);

    if (frameMappings.length === 0) {
      return {
        success: false,
        frameId,
        errors: [`帧 ${frame.name} 没有配置映射关系`],
      };
    }

    const updatedDataItems: {
      groupId: number;
      dataItemId: number;
      value: unknown;
      displayValue: string;
    }[] = [];

    const errors: string[] = [];

    // 计算字段偏移量
    let currentOffset = 0;
    const fieldOffsets = new Map<string, number>();

    for (const field of frame.fields) {
      fieldOffsets.set(field.id, currentOffset);
      currentOffset += field.length || 1;
    }

    // 处理每个映射关系
    for (const mapping of frameMappings) {
      try {
        // 查找对应的字段
        const field = frame.fields.find((f) => f.id === mapping.fieldId);
        if (!field) {
          errors.push(`找不到字段ID为 ${mapping.fieldId} 的字段定义`);
          continue;
        }

        // 查找对应的分组和数据项
        const group = groups.find((g) => g.id === mapping.groupId);
        if (!group) {
          errors.push(`找不到分组ID为 ${mapping.groupId} 的分组`);
          continue;
        }

        const dataItem = group.dataItems.find((item) => item.id === mapping.dataItemId);
        if (!dataItem) {
          errors.push(`在分组 ${group.label} 中找不到数据项ID为 ${mapping.dataItemId} 的数据项`);
          continue;
        }

        // 获取字段偏移量
        const fieldOffset = fieldOffsets.get(field.id) || 0;

        // 提取字段值
        const { value, displayValue } = extractFieldValue(packet.data, field, fieldOffset);

        // 处理标签显示逻辑
        let finalDisplayValue = displayValue;
        if (dataItem.useLabel && dataItem.labelOptions && dataItem.labelOptions.length > 0) {
          // 将displayValue和labelOptions的value都转换为十六进制格式进行匹配
          const normalizedDisplayValue = convertToHex(displayValue, field.dataType, field.length);
          const matchedOption = dataItem.labelOptions.find((option) => {
            const normalizedOptionValue = convertToHex(option.value, field.dataType, field.length);
            return normalizedDisplayValue === normalizedOptionValue;
          });
          if (matchedOption) {
            finalDisplayValue = matchedOption.label;
          }
        }

        // 记录更新的数据项
        updatedDataItems.push({
          groupId: mapping.groupId,
          dataItemId: mapping.dataItemId,
          value,
          displayValue: finalDisplayValue,
        });
      } catch (error) {
        errors.push(
          `处理映射关系失败 (字段: ${mapping.fieldId}): ${
            error instanceof Error ? error.message : '未知错误'
          }`,
        );
      }
    }

    return {
      success: updatedDataItems.length > 0,
      frameId,
      mappings: frameMappings,
      updatedDataItems,
      ...(errors.length > 0 && { errors }),
    };
  } catch (error) {
    return {
      success: false,
      frameId: matchResult.frameId || '',
      errors: [error instanceof Error ? error.message : '数据处理过程发生未知错误'],
    };
  }
}

/**
 * 应用数据处理结果到数据分组
 * @param processResult 处理结果
 * @param groups 数据分组列表（会被修改）
 * @returns 是否成功应用
 */
export function applyDataProcessResult(
  processResult: DataProcessResult,
  groups: DataGroup[],
): boolean {
  if (!processResult.success || !processResult.updatedDataItems) {
    return false;
  }

  try {
    for (const update of processResult.updatedDataItems) {
      const group = groups.find((g) => g.id === update.groupId);
      if (!group) continue;

      const dataItem = group.dataItems.find((item) => item.id === update.dataItemId);
      if (!dataItem) continue;

      // 更新数据项的值和显示值
      dataItem.value = update.value;
      dataItem.displayValue = update.displayValue;
    }

    return true;
  } catch (error) {
    console.error('应用数据处理结果失败:', error);
    return false;
  }
}
