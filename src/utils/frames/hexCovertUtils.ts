/**
 * 十六进制转换工具
 * 提供各类数据类型与十六进制字符串之间的转换功能
 */
import type { SendInstanceField } from '../../types/frames/sendInstances';

/**
 * 将值转换为十六进制字符串
 * @param value 要转换的值
 * @param dataType 数据类型
 * @param length 长度（字节数，主要用于bytes类型）
 * @returns 十六进制字符串（不含0x前缀）
 */
export const convertToHex = (value: string | number, dataType: string, length?: number): string => {
  // 统一处理输入值
  const strValue = String(value || '');
  if (!strValue) return '00';

  try {
    // 检查是否为十六进制输入
    // 以0x开头，或者字符串中包含a-f或A-F时视为十六进制
    const isHexInput = strValue.startsWith('0x') || /[a-fA-F]/.test(strValue);
    const inputString = strValue.replace(/ /g, '').replace(/^0x/g, '');

    // 特殊处理bytes类型
    if (dataType === 'bytes') {
      // 十进制输入转为十六进制再处理
      const numValue = isHexInput ? parseInt(inputString, 16) : Math.floor(parseFloat(inputString));
      // 确保长度为偶数
      return numValue
        .toString(16)
        .toUpperCase()
        .padStart((length as number) * 2, '0')
        .slice(-((length as number) * 2));
    }

    if (isHexInput) {
      const hexString = inputString.toUpperCase();
      const hexLength = getHexLengthByDataType(dataType);
      return hexString.padStart(hexLength, '0').slice(-hexLength);
    }

    // 如果不是十六进制输入，按照十进制处理
    const numValue = parseFloat(inputString);

    // 根据不同数据类型进行处理
    switch (dataType) {
      case 'uint8':
        return Math.min(255, Math.max(0, Math.floor(numValue)))
          .toString(16)
          .toUpperCase()
          .padStart(2, '0');
      case 'int8': {
        const buffer = new Int8Array(1);
        buffer[0] = Math.floor(numValue);
        return (buffer[0] & 0xff).toString(16).toUpperCase().padStart(2, '0');
      }
      case 'uint16':
        return Math.min(65535, Math.max(0, Math.floor(numValue)))
          .toString(16)
          .toUpperCase()
          .padStart(4, '0');
      case 'int16': {
        const buffer = new Int16Array(1);
        buffer[0] = Math.floor(numValue);
        return (buffer[0] & 0xffff).toString(16).toUpperCase().padStart(4, '0');
      }
      case 'uint32':
        return Math.min(4294967295, Math.max(0, Math.abs(numValue)))
          .toString(16)
          .toUpperCase()
          .padStart(8, '0');
      case 'int32': {
        const buffer = new Int32Array(1);
        buffer[0] = Math.floor(numValue);
        return (buffer[0] >>> 0).toString(16).toUpperCase().padStart(8, '0');
      }
      default:
        return '00'; // 默认返回
    }
  } catch (e) {
    console.error('转换十六进制出错:', e);
    return '00';
  }
};

/**
 * 根据数据类型获取十六进制长度
 * @param dataType 数据类型
 * @returns 十六进制字符串长度
 */
export const getHexLengthByDataType = (dataType: string): number => {
  switch (dataType) {
    case 'uint8':
    case 'int8':
      return 2; // 1 字节 = 2 位十六进制
    case 'uint16':
    case 'int16':
      return 4; // 2 字节 = 4 位十六进制
    case 'uint32':
    case 'int32':
      return 8; // 4 字节 = 8 位十六进制
    case 'bytes':
      return 2; // bytes类型特殊处理，最小长度为2
    default:
      return 2; // 默认 1 字节
  }
};

/**
 * 格式化十六进制字符串，每两个字符插入一个空格
 * @param hexString 十六进制字符串
 * @returns 格式化后的字符串
 */
export const formatHexWithSpaces = (hexString: string): string => {
  if (!hexString) return '';
  // 每两个字符添加一个空格
  return hexString.match(/.{2}/g)?.join(' ') || hexString;
};

/**
 * 获取字段的十六进制表示（带0x前缀）
 * @param field 字段
 * @returns 十六进制字符串（带0x前缀）
 */
export const getFieldHexValue = (field: SendInstanceField): string => {
  if (!field || !field.value) return '0x00';

  if (
    field.dataType &&
    ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'bytes'].includes(field.dataType)
  ) {
    return `0x${convertToHex(field.value, field.dataType, field.length)}`;
  }

  return '0x00';
};

/**
 * 获取完整的帧十六进制字符串
 * @param fields 字段数组
 * @returns 所有字段连接的十六进制字符串
 */
export const getFullHexString = (fields: SendInstanceField[]): string => {
  if (!fields || fields.length === 0) return '';

  // 使用map生成所有字段的十六进制值，然后连接
  return fields
    .map((field) => {
      if (
        field &&
        field.dataType &&
        field.value &&
        ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'bytes'].includes(field.dataType)
      ) {
        return convertToHex(field.value, field.dataType, field.length);
      }
      return '';
    })
    .filter(Boolean)
    .join('');
};

/**
 * 初始化字段的十六进制值映射
 * @param instance 帧实例
 * @returns 十六进制值映射对象
 */
export const initializeHexValues = (instance: {
  fields: SendInstanceField[];
}): Record<string, string> => {
  const hexValues: Record<string, string> = {};

  instance.fields.forEach((field) => {
    if (
      ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'bytes'].includes(field.dataType) &&
      field.value
    ) {
      hexValues[field.id] = `0x${convertToHex(field.value, field.dataType, field.length)}`;
    }
  });

  return hexValues;
};
