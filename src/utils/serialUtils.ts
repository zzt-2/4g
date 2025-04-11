/**
 * 串口通信相关工具函数
 */

/**
 * 将十六进制字符串转换为 Uint8Array
 * @param hexString 十六进制字符串，如 "01 02 03" 或 "010203"
 * @returns Uint8Array 字节数组
 */
export const hexToBytes = (hexString: string): Uint8Array => {
  // 移除所有空格、换行和制表符
  const cleanedHexString = hexString.replace(/[\s\n\t]/g, '');

  // 确保十六进制字符串长度为偶数
  if (cleanedHexString.length % 2 !== 0) {
    throw new Error('十六进制字符串长度必须为偶数');
  }

  // 验证是否只包含有效的十六进制字符
  if (!/^[0-9A-Fa-f]*$/.test(cleanedHexString)) {
    throw new Error('十六进制字符串包含无效字符');
  }

  const bytes = new Uint8Array(cleanedHexString.length / 2);

  for (let i = 0; i < cleanedHexString.length; i += 2) {
    bytes[i / 2] = parseInt(cleanedHexString.substring(i, i + 2), 16);
  }

  return bytes;
};

/**
 * 将 Uint8Array 转换为格式化的十六进制字符串
 * @param bytes 字节数组
 * @param separator 分隔符，默认为空格
 * @param bytesPerGroup 每组字节数，默认为1
 * @param upperCase 是否大写，默认为true
 * @returns 格式化的十六进制字符串
 */
export const bytesToHex = (
  bytes: Uint8Array,
  separator = ' ',
  bytesPerGroup = 1,
  upperCase = true,
): string => {
  if (!bytes || bytes.length === 0) {
    return '';
  }

  const hexChars = [];
  const format = upperCase ? 'X' : 'x';

  for (let i = 0; i < bytes.length; i++) {
    // 确保每个字节都是两位十六进制数
    hexChars.push(bytes[i].toString(16).padStart(2, '0'));

    // 每 bytesPerGroup 个字节后添加分隔符，但不在最后添加
    if (separator && bytesPerGroup > 0 && (i + 1) % bytesPerGroup === 0 && i < bytes.length - 1) {
      hexChars.push(separator);
    }
  }

  let result = hexChars.join('');

  // 如果需要大写，则转换为大写
  if (upperCase) {
    result = result.toUpperCase();
  }

  return result;
};

/**
 * 将 ASCII 字符串转换为 Uint8Array
 * @param asciiString ASCII 字符串
 * @returns Uint8Array 字节数组
 */
export const asciiToBytes = (asciiString: string): Uint8Array => {
  const bytes = new Uint8Array(asciiString.length);

  for (let i = 0; i < asciiString.length; i++) {
    bytes[i] = asciiString.charCodeAt(i);
  }

  return bytes;
};

/**
 * 将 Uint8Array 转换为 ASCII 字符串
 * @param bytes 字节数组
 * @param replaceNonPrintable 是否替换不可打印字符，默认为 true
 * @returns ASCII 字符串
 */
export const bytesToAscii = (bytes: Uint8Array, replaceNonPrintable = true): string => {
  if (!bytes || bytes.length === 0) {
    return '';
  }

  let result = '';

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];

    // 检查是否为可打印 ASCII 字符 (32-126)
    if (byte >= 32 && byte <= 126) {
      result += String.fromCharCode(byte);
    } else if (replaceNonPrintable) {
      // 替换不可打印字符为点
      result += '.';
    } else {
      // 保留不可打印字符
      result += String.fromCharCode(byte);
    }
  }

  return result;
};

/**
 * 计算校验和
 * @param bytes 字节数组
 * @param type 校验和类型
 * @param startIndex 起始索引，默认为0
 * @param endIndex 结束索引，默认为数组末尾
 * @returns 校验和值
 */
export const calculateChecksum = (
  bytes: Uint8Array,
  type: 'none' | 'crc16' | 'crc32' | 'lrc' | 'bcc' | 'xor' | 'sum',
  startIndex = 0,
  endIndex?: number,
): number => {
  if (!bytes || bytes.length === 0) {
    throw new Error('字节数组不能为空');
  }

  if (type === 'none') {
    return 0; // 无校验和时返回0
  }

  const end = endIndex === undefined ? bytes.length : endIndex;

  if (startIndex < 0 || end > bytes.length || startIndex >= end) {
    throw new Error('无效的索引范围');
  }

  switch (type) {
    case 'crc16':
      return calculateCRC16(bytes, startIndex, end);
    case 'crc32':
      return calculateCRC32(bytes, startIndex, end);
    case 'lrc':
      return calculateLRC(bytes, startIndex, end);
    case 'bcc':
      return calculateBCC(bytes, startIndex, end);
    case 'xor':
      return calculateXOR(bytes, startIndex, end);
    case 'sum':
      return calculateSUM(bytes, startIndex, end);
    default:
      throw new Error(`不支持的校验和类型: ${type}`);
  }
};

/**
 * 计算 CRC16-MODBUS
 * @param bytes 字节数组
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @returns CRC16 值
 */
const calculateCRC16 = (bytes: Uint8Array, startIndex: number, endIndex: number): number => {
  let crc = 0xffff;

  for (let i = startIndex; i < endIndex; i++) {
    crc ^= bytes[i];

    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc >>= 1;
        crc ^= 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }

  return crc;
};

/**
 * 计算 CRC32
 * @param bytes 字节数组
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @returns CRC32 值
 */
const calculateCRC32 = (bytes: Uint8Array, startIndex: number, endIndex: number): number => {
  let crc = 0xffffffff;

  for (let i = startIndex; i < endIndex; i++) {
    crc ^= bytes[i];

    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }

  return ~crc >>> 0;
};

/**
 * 计算 LRC (Longitudinal Redundancy Check)
 * @param bytes 字节数组
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @returns LRC 值
 */
const calculateLRC = (bytes: Uint8Array, startIndex: number, endIndex: number): number => {
  let lrc = 0;

  for (let i = startIndex; i < endIndex; i++) {
    lrc = (lrc + bytes[i]) & 0xff;
  }

  return ((lrc ^ 0xff) + 1) & 0xff;
};

/**
 * 计算 BCC (Block Check Character)
 * @param bytes 字节数组
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @returns BCC 值
 */
const calculateBCC = (bytes: Uint8Array, startIndex: number, endIndex: number): number => {
  let bcc = 0;

  for (let i = startIndex; i < endIndex; i++) {
    bcc ^= bytes[i];
  }

  return bcc;
};

/**
 * 计算 XOR 校验和
 * @param bytes 字节数组
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @returns XOR 值
 */
const calculateXOR = (bytes: Uint8Array, startIndex: number, endIndex: number): number => {
  // XOR 与 BCC 校验算法相同
  return calculateBCC(bytes, startIndex, endIndex);
};

/**
 * 计算 SUM 校验和
 * @param bytes 字节数组
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @returns SUM 值
 */
const calculateSUM = (bytes: Uint8Array, startIndex: number, endIndex: number): number => {
  let sum = 0;

  for (let i = startIndex; i < endIndex; i++) {
    sum = (sum + bytes[i]) & 0xff;
  }

  return sum;
};

/**
 * 格式化串口消息为可读字符串
 * @param data 消息数据
 * @param format 消息格式
 * @returns 格式化后的字符串
 */
export const formatSerialMessage = (
  data: Uint8Array,
  format: 'hex' | 'ascii' | 'utf8' | 'binary' = 'hex',
): string => {
  if (!data || data.length === 0) {
    return '';
  }

  switch (format) {
    case 'hex':
      return bytesToHex(data);
    case 'ascii':
      return bytesToAscii(data);
    case 'utf8':
      try {
        return new TextDecoder('utf-8').decode(data);
      } catch (e) {
        return bytesToAscii(data);
      }
    case 'binary':
      return Array.from(data)
        .map((byte) => byte.toString(2).padStart(8, '0'))
        .join(' ');
    default:
      return bytesToHex(data);
  }
};

/**
 * 格式化时间戳
 * @param timestamp 时间戳
 * @param format 时间戳格式
 * @returns 格式化后的时间戳字符串
 */
export const formatTimestamp = (
  timestamp: number,
  format: 'none' | 'time' | 'date' | 'datetime' = 'time',
): string => {
  if (format === 'none') {
    return '';
  }

  const date = new Date(timestamp);

  switch (format) {
    case 'time':
      return date.toLocaleTimeString();
    case 'date':
      return date.toLocaleDateString();
    case 'datetime':
      return date.toLocaleString();
    default:
      return date.toLocaleTimeString();
  }
};
