/**
 * 发送帧实例相关的工厂函数
 */
import { nanoid } from 'nanoid';
import type { Frame, FrameField } from './index';
import type { SendFrameInstance, SendInstanceField } from './sendInstances';
import { DEFAULT_VALID_OPTION } from 'src/config/frameDefaults';

/**
 * 从帧字段创建发送实例字段
 * @param field 原始帧字段
 * @returns 发送实例字段
 */
export function createSendInstanceField(field: FrameField): SendInstanceField {
  // 为select和radio类型创建默认选项
  const options = field.options
    ? field.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
      }))
    : [];

  // 如果需要选项但没有，则创建默认选项
  if ((field.inputType === 'select' || field.inputType === 'radio') && options.length === 0) {
    // 为数值类型创建0和1选项
    if (
      ['uint8', 'uint16', 'uint32', 'uint64', 'int8', 'int16', 'int32', 'int64'].includes(
        field.dataType,
      )
    ) {
      options.push({ value: '0', label: '0' });
      options.push({ value: '1', label: '1' });
    } else {
      // 为其他类型创建示例选项
      options.push({ value: 'option1', label: '选项1' });
      options.push({ value: 'option2', label: '选项2' });
    }
  }

  const result: SendInstanceField = {
    id: field.id,
    label: field.name,
    dataType: field.dataType,
    inputType: field.inputType,
    description: field.description || '',
    value: field.defaultValue || '',
    validOption: field.validOption || DEFAULT_VALID_OPTION,
    factor: field.factor || 1,
    length: field.length,
    configurable: field.configurable,
    bigEndian: field.bigEndian || false,
    isASCII: field.isASCII || undefined,
    options: options,
    dataParticipationType: field.dataParticipationType || 'direct',
  };

  // 只有当expressionConfig存在时才添加
  if (field.expressionConfig) {
    result.expressionConfig = field.expressionConfig;
  }

  return result;
}

/**
 * 从帧创建发送帧实例
 * @param frame 原始帧对象
 * @param id 可选的实例ID，如果未提供则使用nanoid生成
 * @returns 发送帧实例
 */
export function createSendFrameInstance(frame: Frame, id?: string): SendFrameInstance {
  // 过滤出可配置的字段
  const configurableFields = frame.fields.filter((field) => field.configurable);

  return {
    id: id || nanoid(),
    label: frame.name,
    frameId: frame.id,
    description: frame.description || '',
    paramCount: configurableFields.length,
    createdAt: new Date(),
    updatedAt: new Date(),
    fields: frame.fields.map((field) => createSendInstanceField(field)),
    isFavorite: false,
    strategyConfig: {
      type: 'none',
      updatedAt: new Date().toISOString(),
    },
    // 初始化发送统计
    sendCount: 0,
  };
}
