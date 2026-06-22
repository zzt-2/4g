/**
 * 帧验证工具函数
 */

import type { Frame } from '../../types/frames/frames';
import type { FrameFieldMapping, DataGroup, ValidationResult } from '../../types/frames/receive';

/**
 * 验证映射关系的有效性
 * @param mappings 映射关系列表
 * @param frames 帧列表
 * @param groups 数据分组列表
 * @returns 验证结果
 */
export function validateMappings(
  mappings: FrameFieldMapping[],
  frames: Frame[],
  groups: DataGroup[],
): ValidationResult {
  const errors: string[] = [];

  // 筛选接收帧
  const receiveFrames = frames.filter((frame) => frame.direction === 'receive');

  mappings.forEach((mapping, index) => {
    const mappingPrefix = `映射 ${index + 1}`;

    // 检查帧是否存在
    const frame = receiveFrames.find((f) => f.id === mapping.frameId);
    if (!frame) {
      errors.push(`${mappingPrefix}: 帧ID ${mapping.frameId} 不存在或不是接收帧`);
      return;
    }

    // 检查字段是否存在
    const field = frame.fields.find((f) => f.id === mapping.fieldId);
    if (!field) {
      errors.push(`${mappingPrefix}: 帧 ${frame.name} 中字段ID ${mapping.fieldId} 不存在`);
      return;
    }

    // 检查字段名称是否匹配
    if (field.name !== mapping.fieldName) {
      errors.push(
        `${mappingPrefix}: 帧 ${frame.name} 中字段名称不匹配，期望 ${mapping.fieldName}，实际 ${field.name}`,
      );
    }

    // 检查分组是否存在
    const group = groups.find((g) => g.id === mapping.groupId);
    if (!group) {
      errors.push(`${mappingPrefix}: 分组ID ${mapping.groupId} 不存在`);
      return;
    }

    // 检查数据项是否存在
    const dataItem = group.dataItems.find((item) => item.id === mapping.dataItemId);
    if (!dataItem) {
      errors.push(`${mappingPrefix}: 分组 ${group.label} 中数据项ID ${mapping.dataItemId} 不存在`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 验证帧字段的完整性
 * @param frame 帧对象
 * @returns 验证结果
 */
export function validateFrameFields(frame: Frame): ValidationResult {
  const errors: string[] = [];

  if (!frame.fields || frame.fields.length === 0) {
    errors.push(`帧 ${frame.name} 没有定义字段`);
    return { isValid: false, errors };
  }

  const fieldIds = new Set<string>();

  frame.fields.forEach((field, index) => {
    const fieldPrefix = `帧 ${frame.name} 字段 ${index + 1}`;

    // 检查字段ID唯一性
    if (fieldIds.has(field.id)) {
      errors.push(`${fieldPrefix}: 字段ID ${field.id} 重复`);
    } else {
      fieldIds.add(field.id);
    }

    // 检查字段名称
    if (!field.name || field.name.trim() === '') {
      errors.push(`${fieldPrefix}: 字段名称不能为空`);
    }

    // 检查数据类型
    if (!field.dataType) {
      errors.push(`${fieldPrefix}: 数据类型不能为空`);
    }

    // 检查长度
    if (typeof field.length !== 'number' || field.length <= 0) {
      errors.push(`${fieldPrefix}: 字段长度必须为正数`);
    }

    // 检查输入类型
    if (!field.inputType || !['input', 'select', 'radio'].includes(field.inputType)) {
      errors.push(`${fieldPrefix}: 输入类型无效`);
    }

    // 检查选项配置
    if (['select', 'radio'].includes(field.inputType)) {
      if (!field.options || field.options.length === 0) {
        errors.push(`${fieldPrefix}: ${field.inputType} 类型字段必须提供选项`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
