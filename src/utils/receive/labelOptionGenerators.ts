/**
 * 标签选项生成工具函数
 */
import type { FrameField } from '../../types/frames/fields';
import type { FieldType } from '../../types/frames/basic';

/**
 * 从字段对象生成标签选项
 * @param field 字段对象
 * @returns 标签选项数组
 */
export function generateLabelOptionsFromField(field: FrameField): {
  value: string;
  label: string;
}[] {
  const options: { value: string; label: string }[] = [];

  // 根据输入类型生成选项
  switch (field.inputType) {
    case 'select':
    case 'radio':
      // 从字段选项中生成
      if (field.options && field.options.length > 0) {
        field.options.forEach((option: { value: string; label?: string }) => {
          options.push({
            value: option.value,
            label: option.label || option.value,
          });
        });
      }
      break;

    case 'input':
      // 根据数据类型生成默认选项
      // options.push(...generateDefaultOptionsForDataType(field.dataType));
      break;

    default:
    // 未知输入类型，生成基础选项
    // options.push(...generateDefaultOptionsForDataType(field.dataType));
  }

  // 如果没有生成任何选项，添加默认选项
  // if (options.length === 0) {
  //   options.push({
  //     value: '0',
  //     label: '默认值',
  //   });
  // }

  return options;
}

/**
 * 根据数据类型生成默认选项
 * @param dataType 数据类型
 * @returns 默认选项数组
 */
function generateDefaultOptionsForDataType(dataType: FieldType): {
  value: string;
  label: string;
}[] {
  const options: { value: string; label: string }[] = [];

  switch (dataType) {
    case 'uint8':
    case 'int8':
      break;

    case 'uint16':
    case 'int16':
      break;

    case 'uint32':
    case 'int32':
      break;

    case 'float':
      break;

    case 'bytes':
      break;

    default:
      // 未知类型，生成通用选项
      options.push({ value: '0', label: '0' }, { value: '1', label: '1' });
  }

  return options;
}

/**
 * 验证标签选项的有效性
 * @param options 标签选项数组
 * @returns 验证结果
 */
export function validateLabelOptions(options: { value: string; label: string }[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const values = new Set<string>();

  options.forEach((option, index) => {
    const optionPrefix = `选项 ${index + 1}`;

    // 检查值是否为空
    if (option.value === undefined || option.value === null) {
      errors.push(`${optionPrefix}: 选项值不能为空`);
    }

    // 检查标签是否为空
    if (!option.label || option.label.trim() === '') {
      errors.push(`${optionPrefix}: 选项标签不能为空`);
    }

    // 检查值的唯一性
    if (values.has(option.value)) {
      errors.push(`${optionPrefix}: 选项值 "${option.value}" 重复`);
    } else {
      values.add(option.value);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 格式化显示值
 * @param value 原始值
 * @param field 字段对象
 * @param labelOptions 标签选项
 * @returns 格式化后的显示值
 */
export function formatDisplayValue(
  value: unknown,
  field: FrameField,
  labelOptions?: { value: string; label: string }[],
): string {
  if (value === undefined || value === null) {
    return '-';
  }

  const stringValue = String(value);

  // 如果有标签选项，尝试查找对应的标签
  if (labelOptions && labelOptions.length > 0) {
    const option = labelOptions.find((opt) => opt.value === stringValue);
    if (option) {
      return option.label;
    }
  }

  // 根据数据类型格式化
  switch (field.dataType) {
    case 'float':
      return Number(value).toFixed(2);

    case 'bytes':
      return stringValue.toUpperCase();

    default:
      return stringValue;
  }
}
