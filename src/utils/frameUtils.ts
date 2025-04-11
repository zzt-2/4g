/**
 * 帧解析相关工具函数
 */
import type {
  FrameDefinition,
  FieldDefinition,
  ParsedFrame,
  ParsedFieldValue,
  ByteOrder,
  ChecksumType,
  FrameTemplate,
  FrameField,
} from '../types/frames';
import { calculateChecksum } from './serialUtils';

/**
 * 根据帧定义解析字节数据
 * @param frameDefinition 帧定义
 * @param data 二进制数据
 * @returns 解析结果
 */
export const parseFrame = (frameDefinition: FrameDefinition, data: Uint8Array): ParsedFrame => {
  if (!frameDefinition || !data || data.length === 0) {
    return {
      frameId: frameDefinition?.id || '',
      fields: [],
      raw: data || new Uint8Array(0),
      isValid: false,
      errorMessage: '无效的帧定义或数据',
    };
  }

  try {
    // 验证校验和
    let isChecksumValid = true;
    let checksumErrorMessage = '';

    if (frameDefinition.checksumType !== 'none') {
      const checksumField = frameDefinition.fields.find((field) => field.isChecksumField);

      if (checksumField) {
        const checksumIndex = calculateFieldOffset(frameDefinition.fields, checksumField.id);
        const actualChecksum = extractNumber(
          data,
          checksumIndex,
          checksumField.length,
          frameDefinition.byteOrder,
        );

        // 找到所有非校验和字段
        const dataFieldsEnd = checksumIndex;

        // 计算预期的校验和
        const expectedChecksum = calculateChecksum(
          data,
          frameDefinition.checksumType as ChecksumType,
          0,
          dataFieldsEnd,
        );

        isChecksumValid = actualChecksum === expectedChecksum;

        if (!isChecksumValid) {
          checksumErrorMessage = `校验和不匹配: 预期 0x${expectedChecksum
            .toString(16)
            .toUpperCase()}, 实际 0x${actualChecksum.toString(16).toUpperCase()}`;
        }
      }
    }

    // 解析每个字段
    const parsedFields = frameDefinition.fields.map((field) => {
      return parseField(field, data, frameDefinition.fields, frameDefinition.byteOrder);
    });

    const anyFieldInvalid = parsedFields.some((field) => !field.valid);

    return {
      frameId: frameDefinition.id,
      fields: parsedFields,
      raw: data,
      isValid: isChecksumValid && !anyFieldInvalid,
      errorMessage: !isChecksumValid ? checksumErrorMessage : undefined,
    };
  } catch (error) {
    return {
      frameId: frameDefinition.id,
      fields: [],
      raw: data,
      isValid: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * 解析单个字段
 * @param fieldDefinition 字段定义
 * @param data 二进制数据
 * @param allFields 所有字段定义
 * @param byteOrder 字节顺序
 * @returns 解析的字段值
 */
const parseField = (
  fieldDefinition: FieldDefinition,
  data: Uint8Array,
  allFields: FieldDefinition[],
  byteOrder: ByteOrder,
): ParsedFieldValue => {
  const offset = calculateFieldOffset(allFields, fieldDefinition.id);

  if (offset + fieldDefinition.length > data.length) {
    return {
      fieldId: fieldDefinition.id,
      name: fieldDefinition.name,
      value: '',
      rawBytes: new Uint8Array(0),
      offset,
      length: fieldDefinition.length,
      valid: false,
      error: '字段超出数据范围',
    };
  }

  const fieldBytes = data.slice(offset, offset + fieldDefinition.length);

  try {
    let value: string | number | boolean;
    let valid = true;
    let error: string | undefined;

    switch (fieldDefinition.dataType) {
      case 'uint8':
      case 'uint16':
      case 'uint32':
      case 'uint64':
      case 'int8':
      case 'int16':
      case 'int32':
      case 'int64':
        value = extractNumber(
          data,
          offset,
          fieldDefinition.length,
          byteOrder,
          fieldDefinition.dataType.startsWith('int'),
        );

        // 应用缩放因子
        if (fieldDefinition.scale && typeof value === 'number') {
          value = value * fieldDefinition.scale;
        }

        // 验证范围
        if (fieldDefinition.min !== undefined && value < fieldDefinition.min) {
          valid = false;
          error = `值 ${value} 小于最小值 ${fieldDefinition.min}`;
        } else if (fieldDefinition.max !== undefined && value > fieldDefinition.max) {
          valid = false;
          error = `值 ${value} 大于最大值 ${fieldDefinition.max}`;
        }

        break;

      case 'float':
        value = extractFloat(data, offset, byteOrder);

        // 应用缩放因子
        if (fieldDefinition.scale && typeof value === 'number') {
          value = value * fieldDefinition.scale;
        }

        // 验证范围
        if (fieldDefinition.min !== undefined && value < fieldDefinition.min) {
          valid = false;
          error = `值 ${value} 小于最小值 ${fieldDefinition.min}`;
        } else if (fieldDefinition.max !== undefined && value > fieldDefinition.max) {
          valid = false;
          error = `值 ${value} 大于最大值 ${fieldDefinition.max}`;
        }

        break;

      case 'double':
        value = extractDouble(data, offset, byteOrder);

        // 应用缩放因子
        if (fieldDefinition.scale && typeof value === 'number') {
          value = value * fieldDefinition.scale;
        }

        // 验证范围
        if (fieldDefinition.min !== undefined && value < fieldDefinition.min) {
          valid = false;
          error = `值 ${value} 小于最小值 ${fieldDefinition.min}`;
        } else if (fieldDefinition.max !== undefined && value > fieldDefinition.max) {
          valid = false;
          error = `值 ${value} 大于最大值 ${fieldDefinition.max}`;
        }

        break;

      case 'string':
        value = extractString(data, offset, fieldDefinition.length);
        break;

      case 'hex':
        value = extractHex(data, offset, fieldDefinition.length);
        break;

      case 'boolean':
        value = extractBoolean(data, offset);
        break;

      case 'bitmap':
        value = extractHex(data, offset, fieldDefinition.length);
        break;

      case 'timestamp':
        value = extractTimestamp(data, offset, fieldDefinition.length, byteOrder);
        break;

      default:
        value = extractHex(data, offset, fieldDefinition.length);
    }

    // 检查枚举值
    if (
      fieldDefinition.enumValues &&
      fieldDefinition.enumValues.length > 0 &&
      typeof value === 'number'
    ) {
      const matchingEnum = fieldDefinition.enumValues.find((e) => e.value === value);
      if (!matchingEnum && fieldDefinition.isRequired) {
        valid = false;
        error = `值 ${value} 不是有效的枚举值`;
      }
    }

    return {
      fieldId: fieldDefinition.id,
      name: fieldDefinition.name,
      value,
      rawBytes: fieldBytes,
      offset,
      length: fieldDefinition.length,
      valid,
      error,
    };
  } catch (err) {
    return {
      fieldId: fieldDefinition.id,
      name: fieldDefinition.name,
      value: '',
      rawBytes: fieldBytes,
      offset,
      length: fieldDefinition.length,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * 计算字段偏移量
 * @param fields 所有字段定义
 * @param fieldId 需要计算偏移量的字段ID
 * @returns 字段的字节偏移量
 */
const calculateFieldOffset = (fields: FieldDefinition[], fieldId: string): number => {
  const fieldIndex = fields.findIndex((f) => f.id === fieldId);

  if (fieldIndex < 0) {
    throw new Error(`找不到字段: ${fieldId}`);
  }

  // 计算在当前字段之前的所有字段长度之和
  let offset = 0;
  for (let i = 0; i < fieldIndex; i++) {
    offset += fields[i].length;
  }

  return offset;
};

/**
 * 从数据中提取数字值
 * @param data 数据
 * @param offset 偏移量
 * @param length 长度
 * @param byteOrder 字节顺序
 * @param signed 是否有符号
 * @returns 提取的数字值
 */
const extractNumber = (
  data: Uint8Array,
  offset: number,
  length: number,
  byteOrder: ByteOrder,
  signed = false,
): number => {
  if (offset + length > data.length) {
    throw new Error('数据长度不足');
  }

  // 最多支持 8 字节的整数
  if (length > 8) {
    throw new Error(`不支持超过 8 字节的整数: ${length}`);
  }

  // 对于单字节数据，字节顺序无关紧要
  if (length === 1) {
    return signed ? (data[offset] & 0x80 ? data[offset] - 256 : data[offset]) : data[offset];
  }

  const bytes = data.slice(offset, offset + length);
  let result = 0;

  if (byteOrder === 'big-endian') {
    for (let i = 0; i < length; i++) {
      result = (result << 8) | bytes[i];
    }
  } else {
    for (let i = length - 1; i >= 0; i--) {
      result = (result << 8) | bytes[i];
    }
  }

  // 处理有符号整数
  if (signed) {
    const signBitMask = 1 << (length * 8 - 1);
    if (result & signBitMask) {
      // 负数: 计算补码
      const maxUnsignedValue = 2 ** (length * 8);
      result = result - maxUnsignedValue;
    }
  }

  return result;
};

/**
 * 从数据中提取 32 位浮点数
 * @param data 数据
 * @param offset 偏移量
 * @param byteOrder 字节顺序
 * @returns 提取的浮点数
 */
const extractFloat = (data: Uint8Array, offset: number, byteOrder: ByteOrder): number => {
  if (offset + 4 > data.length) {
    throw new Error('数据长度不足');
  }

  const bytes = new Uint8Array(4);

  if (byteOrder === 'big-endian') {
    for (let i = 0; i < 4; i++) {
      bytes[i] = data[offset + i];
    }
  } else {
    for (let i = 0; i < 4; i++) {
      bytes[i] = data[offset + 3 - i];
    }
  }

  const buffer = bytes.buffer;
  const view = new DataView(buffer);

  return view.getFloat32(0, byteOrder === 'little-endian');
};

/**
 * 从数据中提取 64 位浮点数
 * @param data 数据
 * @param offset 偏移量
 * @param byteOrder 字节顺序
 * @returns 提取的浮点数
 */
const extractDouble = (data: Uint8Array, offset: number, byteOrder: ByteOrder): number => {
  if (offset + 8 > data.length) {
    throw new Error('数据长度不足');
  }

  const bytes = new Uint8Array(8);

  if (byteOrder === 'big-endian') {
    for (let i = 0; i < 8; i++) {
      bytes[i] = data[offset + i];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = data[offset + 7 - i];
    }
  }

  const buffer = bytes.buffer;
  const view = new DataView(buffer);

  return view.getFloat64(0, byteOrder === 'little-endian');
};

/**
 * 从数据中提取字符串
 * @param data 数据
 * @param offset 偏移量
 * @param length 长度
 * @returns 提取的字符串
 */
const extractString = (data: Uint8Array, offset: number, length: number): string => {
  if (offset + length > data.length) {
    throw new Error('数据长度不足');
  }

  const bytes = data.slice(offset, offset + length);

  // 找到字符串的结束位置（null 字节）
  let nullTerminatorIndex = bytes.indexOf(0);
  if (nullTerminatorIndex === -1) {
    nullTerminatorIndex = length;
  }

  try {
    // 使用 TextDecoder 转换
    return new TextDecoder('utf-8').decode(bytes.slice(0, nullTerminatorIndex));
  } catch (e) {
    // 回退到基本 ASCII 转换
    let result = '';
    for (let i = 0; i < nullTerminatorIndex; i++) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
};

/**
 * 从数据中提取十六进制字符串
 * @param data 数据
 * @param offset 偏移量
 * @param length 长度
 * @returns 提取的十六进制字符串
 */
const extractHex = (data: Uint8Array, offset: number, length: number): string => {
  if (offset + length > data.length) {
    throw new Error('数据长度不足');
  }

  const bytes = data.slice(offset, offset + length);
  let result = '';

  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }

  return result;
};

/**
 * 从数据中提取布尔值
 * @param data 数据
 * @param offset 偏移量
 * @returns 提取的布尔值
 */
const extractBoolean = (data: Uint8Array, offset: number): boolean => {
  if (offset >= data.length) {
    throw new Error('数据长度不足');
  }

  return data[offset] !== 0;
};

/**
 * 从数据中提取时间戳
 * @param data 数据
 * @param offset 偏移量
 * @param length 长度
 * @param byteOrder 字节顺序
 * @returns 提取的时间戳（Unix 时间戳，毫秒）
 */
const extractTimestamp = (
  data: Uint8Array,
  offset: number,
  length: number,
  byteOrder: ByteOrder,
): number => {
  // 常见的时间戳格式：
  // 4 字节: Unix 时间戳（秒）
  // 8 字节: Unix 时间戳（毫秒）

  const value = extractNumber(data, offset, length, byteOrder, false);

  // 如果是 4 字节时间戳，单位是秒，转换为毫秒
  if (length <= 4) {
    return value * 1000;
  } else {
    return value;
  }
};

/**
 * 解析帧数据
 * @param frameTemplate 帧模板
 * @param hexData 十六进制字符串
 * @returns 解析结果
 */
export const parseFrameData = (
  frameTemplate: FrameTemplate,
  hexData: string,
): Record<string, any> => {
  const result: Record<string, any> = {};

  try {
    // 转换十六进制字符串为字节数组
    const bytes = hexToBytes(hexData);

    // 解析每个字段
    frameTemplate.fields.forEach((field) => {
      const fieldName = field.name;
      const fieldType = field.type;
      const offset = field.offset || 0;

      // 根据字段类型解析数据
      switch (fieldType) {
        case 'uint8':
          result[fieldName] = bytes[offset] || 0;
          break;
        case 'uint16':
          result[fieldName] = (bytes[offset] << 8) + (bytes[offset + 1] || 0);
          break;
        case 'uint32':
          result[fieldName] =
            (bytes[offset] << 24) +
            ((bytes[offset + 1] || 0) << 16) +
            ((bytes[offset + 2] || 0) << 8) +
            (bytes[offset + 3] || 0);
          break;
        case 'int8':
          result[fieldName] = bytes[offset] & 0x80 ? bytes[offset] - 256 : bytes[offset] || 0;
          break;
        case 'string':
          result[fieldName] = bytesToString(bytes.slice(offset, offset + field.length));
          break;
        case 'hex':
          result[fieldName] = bytesToHex(bytes.slice(offset, offset + field.length));
          break;
        default:
          result[fieldName] = '未支持的类型';
      }
    });

    return result;
  } catch (error) {
    console.error('解析帧数据失败:', error);
    return { error: error instanceof Error ? error.message : '解析失败' };
  }
};

/**
 * 将十六进制字符串转换为字节数组
 */
export const hexToBytes = (hexString: string): Uint8Array => {
  // 移除所有空格和其他非十六进制字符
  const cleanedHex = hexString.replace(/[^0-9A-Fa-f]/g, '');

  // 确保长度是偶数
  const paddedHex = cleanedHex.length % 2 ? '0' + cleanedHex : cleanedHex;

  const bytes = new Uint8Array(paddedHex.length / 2);

  for (let i = 0; i < paddedHex.length; i += 2) {
    bytes[i / 2] = parseInt(paddedHex.substr(i, 2), 16);
  }

  return bytes;
};

/**
 * 将字节数组转换为十六进制字符串
 */
export const bytesToHex = (bytes: Uint8Array, separator = ' '): string => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(separator);
};

/**
 * 将字节数组转换为字符串
 */
export const bytesToString = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('');
};

/**
 * 根据帧定义和字段值生成帧字节数据
 * @param frameDefinition 帧定义
 * @param fieldValues 字段值
 * @returns 生成的帧字节数据
 */
export const buildFrame = (
  frameDefinition: FrameDefinition,
  fieldValues: Record<string, string | number | boolean>,
): Uint8Array => {
  if (!frameDefinition || !frameDefinition.fields || frameDefinition.fields.length === 0) {
    throw new Error('无效的帧定义');
  }

  // 计算总长度
  const totalLength = frameDefinition.fields.reduce((sum, field) => sum + field.length, 0);
  const result = new Uint8Array(totalLength);

  // 填充字段值
  for (const field of frameDefinition.fields) {
    const offset = calculateFieldOffset(frameDefinition.fields, field.id);

    // 跳过校验和字段，稍后计算
    if (field.isChecksumField) {
      continue;
    }

    // 如果字段是长度字段，稍后计算
    if (field.isLengthField) {
      continue;
    }

    // 获取字段值，如果没有提供则使用默认值
    let value = fieldValues[field.id];
    if (value === undefined && field.defaultValue !== undefined) {
      value = field.defaultValue;
    }

    if (value === undefined && field.isRequired) {
      throw new Error(`必填字段 ${field.name} 没有提供值`);
    }

    if (value !== undefined) {
      writeFieldValue(result, offset, field, value, frameDefinition.byteOrder);
    }
  }

  // 处理长度字段
  const lengthField = frameDefinition.fields.find((f) => f.isLengthField);
  if (lengthField && frameDefinition.includesLengthField) {
    const lengthOffset = calculateFieldOffset(frameDefinition.fields, lengthField.id);

    // 计算长度值
    let lengthValue = 0;

    if (frameDefinition.lengthFieldPosition === 'start') {
      // 长度字段在开始位置，长度通常是从长度字段之后到帧结束
      lengthValue = totalLength - lengthOffset - lengthField.length;
    } else if (frameDefinition.lengthFieldPosition === 'after-header') {
      // 长度字段在头部之后，长度通常是从长度字段之后到帧结束
      lengthValue = totalLength - lengthOffset - lengthField.length;
    } else {
      // 默认情况下，长度是整个帧
      lengthValue = totalLength;
    }

    // 如果长度不包括校验和，从长度中减去校验和字段的长度
    if (!frameDefinition.lengthIncludesChecksum) {
      const checksumField = frameDefinition.fields.find((f) => f.isChecksumField);
      if (checksumField) {
        lengthValue -= checksumField.length;
      }
    }

    writeFieldValue(result, lengthOffset, lengthField, lengthValue, frameDefinition.byteOrder);
  }

  // 处理校验和字段
  const checksumField = frameDefinition.fields.find((f) => f.isChecksumField);
  if (checksumField && frameDefinition.checksumType !== 'none') {
    const checksumOffset = calculateFieldOffset(frameDefinition.fields, checksumField.id);

    // 计算校验和
    const checksum = calculateChecksum(
      result,
      frameDefinition.checksumType as ChecksumType,
      0,
      checksumOffset,
    );

    writeFieldValue(result, checksumOffset, checksumField, checksum, frameDefinition.byteOrder);
  }

  return result;
};

/**
 * 写入字段值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param field 字段定义
 * @param value 字段值
 * @param byteOrder 字节顺序
 */
const writeFieldValue = (
  buffer: Uint8Array,
  offset: number,
  field: FieldDefinition,
  value: string | number | boolean,
  byteOrder: ByteOrder,
): void => {
  if (offset + field.length > buffer.length) {
    throw new Error(`缓冲区越界: ${offset} + ${field.length} > ${buffer.length}`);
  }

  switch (field.dataType) {
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
    case 'int8':
    case 'int16':
    case 'int32':
    case 'int64':
      writeNumber(buffer, offset, field.length, Number(value), byteOrder);
      break;

    case 'float':
      writeFloat(buffer, offset, Number(value), byteOrder);
      break;

    case 'double':
      writeDouble(buffer, offset, Number(value), byteOrder);
      break;

    case 'string':
      writeString(buffer, offset, field.length, String(value));
      break;

    case 'hex':
      writeHex(buffer, offset, field.length, String(value));
      break;

    case 'boolean':
      writeBoolean(buffer, offset, Boolean(value));
      break;

    case 'bitmap':
      writeHex(buffer, offset, field.length, String(value));
      break;

    case 'timestamp':
      writeTimestamp(buffer, offset, field.length, Number(value), byteOrder);
      break;

    default:
      throw new Error(`不支持的字段类型: ${field.dataType}`);
  }
};

/**
 * 写入数字值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param length 长度
 * @param value 数字值
 * @param byteOrder 字节顺序
 */
const writeNumber = (
  buffer: Uint8Array,
  offset: number,
  length: number,
  value: number,
  byteOrder: ByteOrder,
): void => {
  if (length <= 0 || length > 8) {
    throw new Error(`不支持的数字长度: ${length}`);
  }

  // 对于单字节数据，字节顺序无关紧要
  if (length === 1) {
    buffer[offset] = value & 0xff;
    return;
  }

  const view = new DataView(new ArrayBuffer(8));

  switch (length) {
    case 2:
      view.setUint16(0, value, byteOrder === 'little-endian');
      break;
    case 4:
      view.setUint32(0, value, byteOrder === 'little-endian');
      break;
    case 8:
      // JavaScript 无法直接表示 64 位整数，这里使用 setUint32 分别设置高 32 位和低 32 位
      const highBits = Math.floor(value / 0x100000000);
      const lowBits = value % 0x100000000;

      if (byteOrder === 'little-endian') {
        view.setUint32(0, lowBits, true);
        view.setUint32(4, highBits, true);
      } else {
        view.setUint32(0, highBits, false);
        view.setUint32(4, lowBits, false);
      }
      break;
    default:
      // 对于其他长度，手动处理
      let tempValue = value;
      for (let i = 0; i < length; i++) {
        const byteOffset = byteOrder === 'little-endian' ? i : length - 1 - i;
        buffer[offset + byteOffset] = tempValue & 0xff;
        tempValue >>= 8;
      }
      return;
  }

  // 将视图的数据复制到缓冲区
  for (let i = 0; i < length; i++) {
    buffer[offset + i] = view.getUint8(i);
  }
};

/**
 * 写入浮点数值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param value 浮点数值
 * @param byteOrder 字节顺序
 */
const writeFloat = (
  buffer: Uint8Array,
  offset: number,
  value: number,
  byteOrder: ByteOrder,
): void => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, byteOrder === 'little-endian');

  for (let i = 0; i < 4; i++) {
    buffer[offset + i] = view.getUint8(i);
  }
};

/**
 * 写入双精度浮点数值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param value 双精度浮点数值
 * @param byteOrder 字节顺序
 */
const writeDouble = (
  buffer: Uint8Array,
  offset: number,
  value: number,
  byteOrder: ByteOrder,
): void => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, byteOrder === 'little-endian');

  for (let i = 0; i < 8; i++) {
    buffer[offset + i] = view.getUint8(i);
  }
};

/**
 * 写入字符串值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param length 长度
 * @param value 字符串值
 */
const writeString = (buffer: Uint8Array, offset: number, length: number, value: string): void => {
  // 转换为 UTF-8 字节
  let bytes;
  try {
    bytes = new TextEncoder().encode(value);
  } catch (e) {
    // 回退到基本 ASCII 转换
    bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
      bytes[i] = value.charCodeAt(i) & 0xff;
    }
  }

  // 复制到缓冲区，最多复制 length 个字节
  const copyLength = Math.min(bytes.length, length);
  for (let i = 0; i < copyLength; i++) {
    buffer[offset + i] = bytes[i];
  }

  // 如果字符串短于指定长度，填充零
  for (let i = copyLength; i < length; i++) {
    buffer[offset + i] = 0;
  }
};

/**
 * 写入十六进制字符串值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param length 长度
 * @param value 十六进制字符串值
 */
const writeHex = (buffer: Uint8Array, offset: number, length: number, value: string): void => {
  // 移除所有空格和其他非十六进制字符
  const cleanedHex = value.replace(/[^0-9A-Fa-f]/g, '');

  // 确保输入的十六进制字符串长度不超过字段长度的两倍 (每个字节需要两个十六进制字符)
  const maxHexChars = length * 2;
  const hexString = cleanedHex.substring(0, maxHexChars).padEnd(maxHexChars, '0');

  for (let i = 0; i < length; i++) {
    const hexByte = hexString.substring(i * 2, i * 2 + 2);
    buffer[offset + i] = parseInt(hexByte, 16);
  }
};

/**
 * 写入布尔值
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param value 布尔值
 */
const writeBoolean = (buffer: Uint8Array, offset: number, value: boolean): void => {
  buffer[offset] = value ? 1 : 0;
};

/**
 * 写入时间戳
 * @param buffer 目标缓冲区
 * @param offset 偏移量
 * @param length 长度
 * @param value 时间戳值 (毫秒)
 * @param byteOrder 字节顺序
 */
const writeTimestamp = (
  buffer: Uint8Array,
  offset: number,
  length: number,
  value: number,
  byteOrder: ByteOrder,
): void => {
  // 常见的时间戳格式：
  // 4 字节: Unix 时间戳（秒）
  // 8 字节: Unix 时间戳（毫秒）

  // 如果字段长度为 4 或更小，转换为秒
  let timestamp = value;
  if (length <= 4) {
    timestamp = Math.floor(timestamp / 1000);
  }

  writeNumber(buffer, offset, length, timestamp, byteOrder);
};
