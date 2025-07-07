/**
 * 帧相关工具函数
 */
import type { FrameField, Frame, FilterOptions, FieldType } from '../../types/frames/index';
import { FIELD_TYPE_CONFIGS } from '../../config/frameDefaults';
import { validateExpressionConfig } from './defaultConfigs';

/**
 * 深拷贝对象
 * @param obj 要深拷贝的对象
 * @returns 深拷贝的新对象
 */
export function deepClone<T>(obj: T): T {
  // 处理null和undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 处理日期对象
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  // 处理对象
  if (typeof obj === 'object') {
    const copy = {} as Record<string, unknown>;
    Object.keys(obj).forEach((key) => {
      copy[key] = deepClone((obj as Record<string, unknown>)[key]);
    });
    return copy as T;
  }

  // 原始类型直接返回
  return obj;
}

/**
 * 格式化日期为标准字符串
 * @param date 日期对象或时间戳
 * @param format 格式字符串
 * @returns 格式化的日期字符串
 */
export function formatDate(
  date: Date | number | undefined,
  format: string = 'YYYY-MM-DD HH:mm:ss',
): string {
  if (!date) return '';

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

  const tokens: Record<string, string> = {
    YYYY: d.getFullYear().toString(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };

  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) => tokens[match] || match);
}

/**
 * 获取字段类型配置
 * @param type 字段类型
 * @returns 字段类型配置
 */
export function getFieldTypeConfig(type: string | undefined) {
  if (!type) return FIELD_TYPE_CONFIGS.default;
  return FIELD_TYPE_CONFIGS[type as keyof typeof FIELD_TYPE_CONFIGS] || FIELD_TYPE_CONFIGS.default;
}

/**
 * 获取字段位宽
 * @param field 字段对象
 * @returns 字段位宽
 */
export function getFieldBitWidth(field: FrameField): number {
  switch (field.dataType) {
    case 'uint8':
    case 'int8':
      return 8;
    case 'uint16':
    case 'int16':
      return 16;
    case 'uint32':
    case 'int32':
    case 'float':
      return 32;
    case 'bytes':
      return field.length * 8;
    default:
      return field.length * 8;
  }
}

/**
 * 获取字段类型的简短表示
 * @param type 字段类型
 * @returns 简短类型字符串
 */
export function getFieldShortType(type: FieldType): string {
  switch (type) {
    case 'uint8':
      return 'U8';
    case 'uint16':
      return 'U16';
    case 'uint32':
      return 'U32';
    case 'int8':
      return 'I8';
    case 'int16':
      return 'I16';
    case 'int32':
      return 'I32';
    case 'float':
      return 'FLT';
    case 'bytes':
      return 'HEX';
    default:
      // 使用类型断言确保TypeScript知道这里不会是never类型
      return '未定义';
  }
}

/**
 * 获取字段位宽的文本表示
 * @param field 字段对象
 * @returns 位宽文本
 */
export function getFieldBitsText(field: FrameField): string {
  const bits = getFieldBitWidth(field);
  if (bits % 8 === 0) {
    return `${bits / 8}B`;
  }
  return `${bits}b`;
}

/**
 * 获取字段的十六进制预览
 * @param field 字段对象
 * @param value 字段值
 * @returns 十六进制预览字符串
 */
export function getFieldHexPreview(field: FrameField): string {
  const useValue = field.defaultValue;

  if (useValue === null) {
    // 返回类型对应的占位符
    switch (field.dataType) {
      case 'uint8':
      case 'int8':
        return 'XX';
      case 'uint16':
      case 'int16':
        return 'XX XX';
      case 'uint32':
      case 'int32':
      case 'float':
        return 'XX XX XX XX';
      case 'bytes':
        return Array(field.length).fill('XX').join(' ');
      default:
        return 'XX'.repeat(field.length);
    }
  }

  // 根据不同类型处理值
  try {
    switch (field.dataType) {
      case 'uint8':
      case 'int8': {
        const num = Number(useValue);
        return num.toString(16).padStart(2, '0').toUpperCase();
      }
      case 'uint16':
      case 'int16': {
        const num = Number(useValue);
        const hex = num.toString(16).padStart(4, '0').toUpperCase();
        return `${hex.substring(0, 2)} ${hex.substring(2, 4)}`;
      }
      case 'uint32':
      case 'int32':
      case 'float': {
        const num = Number(useValue);
        const hex = num.toString(16).padStart(8, '0').toUpperCase();
        return `${hex.substring(0, 2)} ${hex.substring(2, 4)} ${hex.substring(4, 6)} ${hex.substring(6, 8)}`;
      }
      case 'bytes': {
        if (typeof useValue === 'string') {
          // 假设bytes是十六进制字符串
          const hex = useValue.replace(/[^0-9A-Fa-f]/g, '');
          const bytes = [];
          for (let i = 0; i < hex.length; i += 2) {
            bytes.push(hex.substring(i, i + 2));
          }
          return bytes.join(' ').toUpperCase();
        }
        return 'XX'.repeat(field.length);
      }
      default:
        return 'XX'.repeat(field.length);
    }
  } catch {
    // 错误时返回占位符（使用不捕获异常的语法）
    return 'XX'.repeat(field.length);
  }
}

/**
 * 验证字段
 * @param field 要验证的字段
 * @returns 验证结果
 */
export function validateField(field: Partial<FrameField>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 必填项验证
  if (!field.name?.trim()) {
    errors.push('字段名称不能为空');
  }

  // 类型验证
  if (!field.dataType) {
    errors.push('字段类型不能为空');
  }

  // 长度验证
  const typeConfig = getFieldTypeConfig(field.dataType);
  if (typeConfig.needsLength) {
    if (!field.length || field.length <= 0) {
      errors.push('字段长度必须大于0');
    }
  }

  // 表达式字段特殊验证
  if (field.inputType === 'expression') {
    // 表达式配置验证
    if (!field.expressionConfig) {
      errors.push('表达式字段必须配置表达式');
    } else {
      const expressionValidation = validateExpressionConfig(field.expressionConfig);
      if (!expressionValidation.isValid) {
        errors.push(...expressionValidation.errors.map((error) => `表达式配置: ${error}`));
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证字段数组
 * @param fields 要验证的字段数组
 * @returns 验证结果
 */
export function validateFields(fields: FrameField[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查是否为空
  if (fields.length === 0) {
    errors.push('帧至少需要一个字段');
    return { valid: false, errors };
  }

  // 检查每个字段
  fields.forEach((field, index) => {
    const result = validateField(field);
    if (!result.valid) {
      result.errors.forEach((error) => {
        errors.push(`字段${index + 1} "${field.name}": ${error}`);
      });
    }
  });

  // 检查字段名称唯一性
  const fieldNames = fields.map((f) => f.name);
  const uniqueNames = new Set(fieldNames);
  if (uniqueNames.size !== fieldNames.length) {
    errors.push('字段名称必须唯一');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证整个帧
 * @param frame 要验证的帧
 * @returns 验证结果
 */
export function validateFrame(frame: Frame): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 基本信息验证
  if (!frame.name?.trim()) {
    errors.push('帧名称不能为空');
  }

  if (!frame.protocol) {
    errors.push('协议类型不能为空');
  }

  if (!frame.frameType) {
    errors.push('帧类型不能为空');
  }

  // 字段验证
  const fieldsResult = validateFields(frame.fields);
  if (!fieldsResult.valid) {
    errors.push(...fieldsResult.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 应用所有过滤器
 * @param frames 原始帧数组
 * @param filters 过滤条件
 * @param searchQuery 搜索关键词
 * @param sortOrder 排序方式
 * @returns 过滤后的帧数组
 */
export function applyAllFilters(
  frames: Frame[],
  filters: FilterOptions,
  searchQuery: string = '',
  sortOrder: string = 'name',
): Frame[] {
  // 应用过滤选项
  let result = applyFilters(frames, filters);

  // 按关键词搜索
  if (searchQuery) {
    result = filterFramesBySearchQuery(result, searchQuery);
  }

  // 排序
  result = sortFrames(result, sortOrder);

  return result;
}

/**
 * 按关键词搜索过滤帧
 * @param frames 帧数组
 * @param query 搜索关键词
 * @returns 过滤后的帧数组
 */
function filterFramesBySearchQuery(frames: Frame[], query: string): Frame[] {
  const lowercaseQuery = query.toLowerCase();
  return frames.filter((frame) => {
    return (
      frame.name.toLowerCase().includes(lowercaseQuery) ||
      frame.description.toLowerCase().includes(lowercaseQuery) ||
      frame.fields.some((field) => field.name.toLowerCase().includes(lowercaseQuery))
    );
  });
}

/**
 * 应用过滤选项
 * @param frames 帧数组
 * @param filters 过滤条件
 * @returns 过滤后的帧数组
 */
function applyFilters(frames: Frame[], filters: FilterOptions): Frame[] {
  return frames.filter((frame) => {
    // 协议过滤
    if (filters.protocol && frame.protocol !== filters.protocol) {
      return false;
    }

    // 帧类型过滤
    if (filters.frameType && frame.frameType !== filters.frameType) {
      return false;
    }

    // 方向过滤
    if (filters.direction && frame.direction !== filters.direction) {
      return false;
    }

    // 日期范围过滤
    if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
      const frameDate = frame.createdAt ? new Date(frame.createdAt) : null;
      if (!frameDate) return false;

      const startDate = new Date(filters.dateRange[0]);
      const endDate = new Date(filters.dateRange[1]);

      // 设置结束日期到当天的最后一毫秒
      endDate.setHours(23, 59, 59, 999);

      if (frameDate < startDate || frameDate > endDate) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 排序帧数组
 * @param frames 帧数组
 * @param sortOrder 排序方式
 * @returns 排序后的帧数组
 */
function sortFrames(frames: Frame[], sortOrder: string): Frame[] {
  return [...frames].sort((a, b) => {
    // 先声明变量，避免在case语句中声明导致linter警告
    let aDate: Date | null = null;
    let bDate: Date | null = null;

    switch (sortOrder) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'date':
        aDate = a.createdAt ? new Date(a.createdAt) : null;
        bDate = b.createdAt ? new Date(b.createdAt) : null;

        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;

        return bDate.getTime() - aDate.getTime();
      case 'usage':
        return (b.usageCount || 0) - (a.usageCount || 0);
      default:
        return 0;
    }
  });
}
