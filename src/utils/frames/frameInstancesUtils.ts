/**
 * 帧实例工具函数
 * 包含与帧实例相关的通用辅助函数
 */
import type { SendFrameInstance, SendInstanceField } from '../../types/frames/sendInstances';
import { getFullHexString, convertToHex } from './hexCovertUtils';

/**
 * 处理异步操作的错误和加载状态
 * @param operation 要执行的异步操作
 * @param errorMessage 出错时显示的信息
 * @param setLoading 设置加载状态的函数
 * @param setError 设置错误信息的函数
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
): Promise<T | null> {
  try {
    setLoading(true);
    setError(null);
    return await operation();
  } catch (err) {
    const msg = err instanceof Error ? err.message : errorMessage;
    setError(msg);
    console.error(errorMessage, err);
    return null;
  } finally {
    setLoading(false);
  }
}

/**
 * 初始化字段选项和默认值
 * @param field 需要初始化的字段
 * @returns 初始化后的字段
 */
export function initializeFieldOptions(field: SendInstanceField): SendInstanceField {
  const updatedField = { ...field, options: field.options || [] };

  // 如果是select或radio类型但没有选项，添加默认选项
  if (
    (updatedField.inputType === 'select' || updatedField.inputType === 'radio') &&
    updatedField.options.length === 0
  ) {
    // 根据数据类型添加合适的选项
    if (['uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32'].includes(updatedField.dataType)) {
      updatedField.options.push({ value: '0', label: '0' });
      updatedField.options.push({ value: '1', label: '1' });
    } else {
      updatedField.options.push({ value: 'option1', label: '选项1' });
      updatedField.options.push({ value: 'option2', label: '选项2' });
    }

    // 如果没有值，设置默认值
    if (!updatedField.value) {
      updatedField.value = updatedField.options[0]?.value || '';
    }
  }

  return updatedField;
}

/**
 * 转义正则表达式特殊字符
 * @param string 需要转义的字符串
 * @returns 转义后的字符串
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 获取指定frameId和baseName下的下一个可用编号
 * @param frameId 帧ID
 * @param baseName 基础名称
 * @param allInstances 所有实例数组
 * @returns 下一个可用的编号
 */
export function getNextAvailableNumber(
  frameId: string,
  baseName: string,
  allInstances: SendFrameInstance[],
): number {
  // 收集相同frameId和baseName的所有编号
  const existingNumbers: number[] = [];

  // 遍历所有实例，查找相同帧ID且名称格式为"baseLabel #数字"的实例
  for (const inst of allInstances) {
    if (inst.frameId === frameId) {
      // 尝试提取名称中的数字部分
      const match = inst.label.match(/#(\d+)$/);
      if (match && match[1]) {
        // 检查前缀是否匹配
        const prefix = inst.label.substring(0, inst.label.length - match[0].length).trim();
        if (prefix === baseName) {
          const num = parseInt(match[1], 10);
          existingNumbers.push(num);
        }
      }
    }
  }

  // 排序编号数组
  existingNumbers.sort((a, b) => a - b);

  // 找到第一个可用的编号（从1开始）
  for (let i = 1; i <= existingNumbers.length + 1; i++) {
    if (!existingNumbers.includes(i)) {
      return i;
    }
  }

  // 如果没有找到，返回1（理论上不会到这里）
  return 1;
}

/**
 * 生成下一个可用的数字ID
 * @param existingInstances 现有实例数组
 * @returns 下一个可用的ID
 */
export function generateNextAvailableId(existingInstances: SendFrameInstance[]): string {
  // 获取所有数字ID并排序
  const existingIds = existingInstances
    .map((instance) => instance.id)
    .filter((id) => /^\d+$/.test(id)) // 只考虑数字ID
    .map((id) => parseInt(id, 10))
    .sort((a, b) => a - b);

  // 从1开始找第一个空缺的ID
  for (let i = 1; i <= existingIds.length + 1; i++) {
    if (!existingIds.includes(i)) {
      return i.toString();
    }
  }

  // 如果没有空缺，返回最大值+1（理论上不会到这里）
  return '1';
}

/**
 * 计算帧校验值
 * @param instance 发送帧实例
 * @returns 包含0x前缀的校验值十六进制字符串数组
 */
export function calculateChecksum(instance: SendFrameInstance): string[] {
  // 检查实例和字段是否存在
  if (!instance || !instance.fields || !instance.fields.length) {
    return [];
  }

  // 查找所有校验字段
  const checksumFields = instance.fields.filter(
    (field) => field && field.validOption && field.validOption.isChecksum === true,
  );

  if (!checksumFields.length) {
    return [];
  }

  // 存储计算结果
  const checksumResults: string[] = [];

  // 为每个校验字段计算校验值
  for (const checksumField of checksumFields) {
    if (!checksumField.validOption) continue;

    // 安全地获取校验参数
    const validOption = checksumField.validOption;
    const startFieldIndex = parseInt(validOption.startFieldIndex, 10);
    const endFieldIndex = parseInt(validOption.endFieldIndex, 10);
    const checksumMethod = validOption.checksumMethod;

    // 如果没有指定校验方法或开始结束索引，跳过此字段
    if (!checksumMethod || startFieldIndex === -1 || endFieldIndex === -1) {
      checksumResults.push('0x00');
      continue;
    }

    console.log('startFieldIndex', startFieldIndex);
    console.log('endFieldIndex', endFieldIndex);

    if (
      startFieldIndex < 0 ||
      endFieldIndex > instance.fields.length ||
      startFieldIndex > endFieldIndex
    ) {
      console.error('校验范围无效');
      checksumResults.push('0x00');
      continue;
    }

    // 获取指定范围字段的十六进制值
    const fieldsToCheck = instance.fields.slice(startFieldIndex, endFieldIndex + 1);
    const hexString = getFullHexString(fieldsToCheck);

    if (!hexString) {
      checksumResults.push('0x00');
      continue;
    }

    // 将十六进制字符串转换为字节数组
    const hexParts = hexString.match(/.{2}/g);
    if (!hexParts) {
      checksumResults.push('0x00');
      continue;
    }

    const bytes = new Uint8Array(hexParts.map((byte) => parseInt(byte, 16)));

    // 根据校验方法计算校验值
    let checksumValue: number;

    switch (checksumMethod) {
      case 'xor8':
        checksumValue = calculateXor8(bytes);
        break;
      case 'sum8':
        checksumValue = calculateSum8(bytes);
        break;
      case 'crc16':
        checksumValue = calculateCrc16(bytes);
        break;
      case 'crc32':
        checksumValue = calculateCrc32(bytes);
        break;
      default:
        console.error('不支持的校验方法:', checksumMethod);
        checksumResults.push('0x00');
        continue;
    }

    // 根据校验字段类型和长度格式化结果
    const hexValue = convertToHex(
      checksumValue,
      checksumField.dataType || 'uint8',
      typeof checksumField.length === 'number' ? checksumField.length : 1,
    );

    // 添加0x前缀
    checksumResults.push(`0x${hexValue}`);
  }

  return checksumResults;
}

/**
 * 计算8位异或校验
 * @param bytes 需要校验的字节数组
 * @returns 8位异或校验值
 */
function calculateXor8(bytes: Uint8Array): number {
  let result = 0;
  for (let i = 0; i < bytes.length; i++) {
    // 类型安全访问
    const value = bytes[i];
    if (value !== undefined) {
      result ^= value;
    }
  }
  return result;
}

/**
 * 计算8位和校验
 * @param bytes 需要校验的字节数组
 * @returns 8位和校验值
 */
function calculateSum8(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    // 类型安全访问
    const value = bytes[i];
    if (value !== undefined) {
      sum += value;
    }
  }
  return sum & 0xff; // 只保留低8位
}

/**
 * 计算CRC16校验（Modbus版本）
 * @param bytes 需要校验的字节数组
 * @returns CRC16校验值
 */
function calculateCrc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    // 类型安全访问
    const value = bytes[i];
    if (value !== undefined) {
      crc ^= value;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x0001) !== 0) {
          crc >>= 1;
          crc ^= 0xa001;
        } else {
          crc >>= 1;
        }
      }
    }
  }
  return crc;
}

/**
 * 计算CRC32校验
 * @param bytes 需要校验的字节数组
 * @returns CRC32校验值
 */
function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  const polynomial = 0xedb88320;

  for (let i = 0; i < bytes.length; i++) {
    // 类型安全访问
    const value = bytes[i];
    if (value !== undefined) {
      crc ^= value;
      for (let j = 0; j < 8; j++) {
        if ((crc & 1) !== 0) {
          crc = (crc >>> 1) ^ polynomial;
        } else {
          crc >>>= 1;
        }
      }
    }
  }

  return ~crc >>> 0;
}

/**
 * 将发送帧实例转换为可发送的二进制数据
 * @param instance 发送帧实例
 * @returns 可发送的二进制数据
 */
export function frameToBuffer(instance: SendFrameInstance): Uint8Array {
  if (!instance || !instance.fields || !instance.fields.length) {
    return new Uint8Array(0);
  }

  // 过滤出参与组帧的字段（只有直接数据参与类型的字段）
  const frameFields = instance.fields.filter(
    (field) => (field.dataParticipationType || 'direct') === 'direct',
  );

  // 首先检查是否需要更新校验和（只考虑参与组帧的字段）
  const checksumFields = frameFields.filter(
    (field) => field && field.validOption && field.validOption.isChecksum === true,
  );

  // 如果有校验字段，首先计算校验值（基于参与组帧的字段）
  if (checksumFields.length > 0) {
    // 创建一个临时实例，只包含参与组帧的字段用于校验计算
    const tempInstance = { ...instance, fields: frameFields };
    const checksumResults = calculateChecksum(tempInstance);

    // 为每个校验字段设置计算出的校验值
    checksumFields.forEach((field, index) => {
      if (checksumResults[index]) {
        field.value = checksumResults[index];
      }
    });
  }

  // 计算总字节数（只计算参与组帧的字段）
  let totalBytes = 0;
  for (const field of frameFields) {
    // 根据字段类型和长度计算字节数
    if (['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'float'].includes(field.dataType)) {
      // 数值类型根据类型确定长度
      switch (field.dataType) {
        case 'uint8':
        case 'int8':
          totalBytes += 1;
          break;
        case 'uint16':
        case 'int16':
          totalBytes += 2;
          break;
        case 'uint32':
        case 'int32':
        case 'float':
          totalBytes += 4;
          break;
      }
    } else if (field.dataType === 'bytes') {
      // 字节数组使用指定长度
      totalBytes += typeof field.length === 'number' ? field.length : 0;
    } else {
      // 其他类型（如自定义类型）也使用指定长度
      totalBytes += typeof field.length === 'number' ? field.length : 0;
    }
  }

  // 创建足够大的缓冲区
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;

  // 填充数据（只填充参与组帧的字段）
  for (const field of frameFields) {
    // 将字段值转换为字节并写入缓冲区
    offset = writeFieldToBuffer(buffer, field, offset);
  }

  // 如果实际写入的字节数少于预计的总字节数，则截断缓冲区
  return offset < totalBytes ? buffer.slice(0, offset) : buffer;
}

/**
 * 将字段值写入缓冲区
 * @param buffer 目标缓冲区
 * @param field 字段
 * @param offset 当前偏移量
 * @returns 新的偏移量
 */
function writeFieldToBuffer(buffer: Uint8Array, field: SendInstanceField, offset: number): number {
  let newOffset = offset;

  // 获取需要写入的值
  let value = field.value || '';

  // 检查是否为十六进制值
  const isHexValue = value.startsWith('0x') || /[a-fA-F]/.test(value);

  // 移除可能的0x前缀
  if (value.startsWith('0x')) {
    value = value.substring(2);
  }

  // 根据字段类型处理数据
  switch (field.dataType) {
    case 'uint8':
    case 'int8':
      buffer[newOffset++] = parseInt(value, isHexValue ? 16 : 10) & 0xff;
      break;

    case 'uint16':
    case 'int16': {
      const num = parseInt(value, isHexValue ? 16 : 10);
      buffer[newOffset++] = (num >> 8) & 0xff; // 高字节
      buffer[newOffset++] = num & 0xff; // 低字节
      break;
    }

    case 'uint32':
    case 'int32': {
      const num = parseInt(value, isHexValue ? 16 : 10);
      buffer[newOffset++] = (num >> 24) & 0xff; // 最高字节
      buffer[newOffset++] = (num >> 16) & 0xff;
      buffer[newOffset++] = (num >> 8) & 0xff;
      buffer[newOffset++] = num & 0xff; // 最低字节
      break;
    }

    case 'float': {
      // 将字符串转换为浮点数
      const num = parseFloat(value);
      // 创建一个浮点数的视图
      const view = new DataView(new ArrayBuffer(4));
      view.setFloat32(0, num, false); // false表示大端字节序

      // 复制四个字节到buffer
      buffer[newOffset++] = view.getUint8(0);
      buffer[newOffset++] = view.getUint8(1);
      buffer[newOffset++] = view.getUint8(2);
      buffer[newOffset++] = view.getUint8(3);
      break;
    }

    case 'bytes': {
      // 对于字节数组，假设值是十六进制字符串表示的字节
      const hexValue = value.replace(/\s+/g, ''); // 移除所有空白
      if (hexValue.length > 0) {
        // 确保十六进制字符串长度为偶数
        const paddedHex = hexValue.length % 2 ? '0' + hexValue : hexValue;

        // 计算要写入的字节数
        const bytesCount = paddedHex.length / 2;
        const fieldLength = typeof field.length === 'number' ? field.length : bytesCount;
        const bytesToWrite = Math.min(bytesCount, fieldLength);

        // 将十六进制字符串转换为字节并写入
        for (let i = 0; i < bytesToWrite; i++) {
          const byteValue = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
          buffer[newOffset++] = byteValue;
        }

        // 填充剩余空间
        for (let i = bytesToWrite; i < fieldLength; i++) {
          buffer[newOffset++] = 0;
        }
      } else if (typeof field.length === 'number') {
        // 如果没有值但有长度，用0填充
        for (let i = 0; i < field.length; i++) {
          buffer[newOffset++] = 0;
        }
      }
      break;
    }

    default:
      console.error(`不支持的数据类型: ${String(field.dataType)}`);
  }

  return newOffset;
}
