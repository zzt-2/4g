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
 * 验证数据分组的有效性
 * @param groups 数据分组列表
 * @returns 验证结果
 */
export function validateDataGroups(groups: DataGroup[]): ValidationResult {
  const errors: string[] = [];
  const groupIds = new Set<number>();
  const dataItemIds = new Set<string>();

  groups.forEach((group, groupIndex) => {
    const groupPrefix = `分组 ${groupIndex + 1}`;

    // 检查分组ID唯一性
    if (groupIds.has(group.id)) {
      errors.push(`${groupPrefix}: 分组ID ${group.id} 重复`);
    } else {
      groupIds.add(group.id);
    }

    // 检查分组标签
    if (!group.label || group.label.trim() === '') {
      errors.push(`${groupPrefix}: 分组标签不能为空`);
    }

    // 检查数据项
    group.dataItems.forEach((dataItem, itemIndex) => {
      const itemPrefix = `${groupPrefix} 数据项 ${itemIndex + 1}`;
      const itemKey = `${group.id}-${dataItem.id}`;

      // 检查数据项ID唯一性（在分组内）
      if (dataItemIds.has(itemKey)) {
        errors.push(`${itemPrefix}: 数据项ID ${dataItem.id} 在分组内重复`);
      } else {
        dataItemIds.add(itemKey);
      }

      // 检查数据项标签
      if (!dataItem.label || dataItem.label.trim() === '') {
        errors.push(`${itemPrefix}: 数据项标签不能为空`);
      }

      // 检查数据类型
      if (!dataItem.dataType) {
        errors.push(`${itemPrefix}: 数据类型不能为空`);
      }

      // 检查标签选项
      if (dataItem.useLabel && (!dataItem.labelOptions || dataItem.labelOptions.length === 0)) {
        errors.push(`${itemPrefix}: 启用标签显示但未提供标签选项`);
      }
    });
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

/**
 * 检查映射关系的循环依赖
 * @param mappings 映射关系列表
 * @returns 验证结果
 */
export function checkMappingCircularDependency(mappings: FrameFieldMapping[]): ValidationResult {
  const errors: string[] = [];

  // 构建依赖图
  const dependencyMap = new Map<string, Set<string>>();

  mappings.forEach((mapping) => {
    const key = `${mapping.frameId}-${mapping.fieldId}`;
    const target = `${mapping.groupId}-${mapping.dataItemId}`;

    if (!dependencyMap.has(key)) {
      dependencyMap.set(key, new Set());
    }
    dependencyMap.get(key)!.add(target);
  });

  // 检查循环依赖（简化版本，实际可能需要更复杂的算法）
  for (const [key, targets] of dependencyMap) {
    if (targets.has(key)) {
      errors.push(`检测到循环依赖: ${key}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
