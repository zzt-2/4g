/**
 * SCOE 帧识别和处理工具函数
 */

import type {
  ScoeSatelliteConfig,
  ScoeGlobalConfig,
  ScoeReceiveCommand,
  ChecksumConfig,
  ScoeCommandParams,
} from '../../types/scoe';
import { convertToHex } from '../frames/hexCovertUtils';

/**
 * SCOE 帧识别结果
 */
export interface ScoeFrameCheckResult {
  /** 是否为 SCOE 帧 */
  isScoe: boolean;
  /** 匹配到的指令码 */
  commandCode?: ScoeReceiveCommand | undefined;
  /** 提取到的卫星ID（4字节，十六进制字符串，如 "12345678"） */
  extractedSatelliteId?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 验证功能码是否匹配
 * @param data 数据包
 * @param offset 功能码起始偏移量
 * @param scoeIdentifier SCOE标识（单字节十六进制字符串）
 * @param receiveCommands 接收指令列表
 * @returns 验证结果
 */
function validateFunctionCode(
  data: Uint8Array,
  offset: number,
  scoeIdentifier: string,
  receiveCommands: ScoeReceiveCommand[],
): { valid: boolean; commandCode?: ScoeReceiveCommand | undefined; error?: string } {
  // 检查数据包长度是否足够（功能码4字节）
  if (data.length < offset + 4) {
    return {
      valid: false,
      error: `数据包长度不足，需要至少 ${offset + 4} 字节，实际 ${data.length} 字节`,
    };
  }

  // 提取功能码的4个字节
  const byte1 = data[offset]; // SCOE标识
  const byte2 = data[offset + 1]; // 指令码
  const byte3 = data[offset + 2]; // 应为 0xAA
  const byte4 = data[offset + 3]; // 应为 0xAA

  // 转换为十六进制字符串进行比对
  const byte1Hex = convertToHex(byte1 || 0, 'uint8');
  const byte2Hex = convertToHex(byte2 || 0, 'uint8');
  const byte3Hex = convertToHex(byte3 || 0, 'uint8');
  const byte4Hex = convertToHex(byte4 || 0, 'uint8');

  // 标准化 SCOE 标识（移除0x前缀，转大写）
  const normalizedScoeId = scoeIdentifier.replace(/^0x/i, '').toUpperCase().padStart(2, '0');

  // 验证第1字节：SCOE标识
  if (byte1Hex !== normalizedScoeId) {
    return {
      valid: false,
      error: `SCOE标识不匹配，期望 ${normalizedScoeId}，实际 ${byte1Hex}`,
    };
  }

  // 验证第3、4字节：应为 AA
  if (byte3Hex !== 'AA' || byte4Hex !== 'AA') {
    return {
      valid: false,
      error: `功能码第3、4字节应为 AA，实际 ${byte3Hex} ${byte4Hex}`,
    };
  }

  // 查找匹配的指令码
  const matchedCommand = receiveCommands.find((cmd) => {
    const normalizedCmdCode = cmd.code.replace(/^0x/i, '').toUpperCase().padStart(2, '0');
    return normalizedCmdCode === byte2Hex;
  });

  if (!matchedCommand) {
    return {
      valid: true,
      commandCode: undefined,
    };
  }

  return {
    valid: true,
    commandCode: matchedCommand,
  };
}

/**
 * 验证单字节标识字段
 * @param data 数据包
 * @param offset 字段偏移量
 * @param expectedValue 期望值（十六进制字符串）
 * @returns 是否匹配
 */
function validateSingleByteField(data: Uint8Array, offset: number, expectedValue: string): boolean {
  if (data.length < offset + 1) {
    return false;
  }

  const actualByte = data[offset];
  const actualHex = convertToHex(actualByte || 0, 'uint8');
  const expectedHex = expectedValue.replace(/^0x/i, '').toUpperCase().padStart(2, '0');

  return actualHex === expectedHex;
}

/**
 * 验证多字节字段（4字节）
 * @param data 数据包
 * @param offset 字段偏移量
 * @param expectedValue 期望值（十六进制字符串）
 * @returns 是否匹配
 */
function validateMultiByteField(data: Uint8Array, offset: number, expectedValue: string): boolean {
  if (data.length < offset + 4) {
    return false;
  }

  // 提取4字节并转换为十六进制字符串
  const actualHex = Array.from(data.slice(offset, offset + 4))
    .map((byte) => convertToHex(byte, 'uint8'))
    .join('');

  const expectedHex = expectedValue.replace(/^0x/i, '').toUpperCase().padStart(8, '0');

  return actualHex === expectedHex;
}

/**
 * 提取卫星ID（4字节）
 * @param data 数据包
 * @param offset 卫星ID偏移量
 * @returns 卫星ID十六进制字符串（8位）
 */
function extractSatelliteId(data: Uint8Array, offset: number): string | undefined {
  if (data.length < offset + 4) {
    return undefined;
  }

  return Array.from(data.slice(offset, offset + 4))
    .map((byte) => convertToHex(byte, 'uint8'))
    .join('');
}

/**
 * 判断是否为 SCOE 帧
 * @param data 接收到的数据包
 * @param loadedConfig 当前加载的卫星配置（如果有）
 * @param globalConfig 全局配置
 * @param scoeFramesLoaded SCOE帧是否已加载
 * @param receiveCommands 接收指令列表
 * @returns 识别结果
 */
export function isScoeFrame(
  data: Uint8Array,
  loadedConfig: ScoeSatelliteConfig | undefined,
  globalConfig: ScoeGlobalConfig,
  scoeFramesLoaded: boolean,
  receiveCommands: ScoeReceiveCommand[],
): ScoeFrameCheckResult {
  // 1. 首先验证功能码（总是需要验证）
  const functionCodeResult = validateFunctionCode(
    data,
    globalConfig.functionCodeOffset,
    globalConfig.scoeIdentifier,
    receiveCommands,
  );

  if (!functionCodeResult.valid) {
    return {
      isScoe: false,
      error: functionCodeResult.error || '功能码验证失败',
    };
  }

  const commandCode = functionCodeResult.commandCode;

  // 2. 如果 SCOE 帧未加载，只识别指令码为 01 的加载指令
  if (!scoeFramesLoaded) {
    if (commandCode?.code === '01') {
      // 提取卫星ID用于后续加载
      const satelliteId = extractSatelliteId(data, globalConfig.satelliteIdOffset);
      if (!satelliteId) {
        return {
          isScoe: false,
          error: '无法提取卫星ID',
        };
      }
      return {
        isScoe: true,
        commandCode,
        extractedSatelliteId: satelliteId,
      };
    } else {
      return {
        isScoe: false,
        error: 'SCOE帧未加载，仅接受加载指令（指令码01）',
      };
    }
  }

  // 3. 如果 SCOE 帧已加载，需要验证配置
  if (!loadedConfig) {
    return {
      isScoe: false,
      error: 'SCOE帧已标记为加载，但未找到加载的配置',
    };
  }

  const { receiveConfig } = loadedConfig;

  // 4. 验证三个标志（根据识别开关）
  if (receiveConfig.recognitionMessageId) {
    if (
      !validateSingleByteField(
        data,
        globalConfig.messageIdentifierOffset,
        receiveConfig.messageIdentifier,
      )
    ) {
      return {
        isScoe: false,
        error: '信息标识不匹配',
      };
    }
  }

  if (receiveConfig.recognitionSourceId) {
    if (
      !validateSingleByteField(
        data,
        globalConfig.sourceIdentifierOffset,
        receiveConfig.sourceIdentifier,
      )
    ) {
      return {
        isScoe: false,
        error: '信源标识不匹配',
      };
    }
  }

  if (receiveConfig.recognitionDestinationId) {
    if (
      !validateSingleByteField(
        data,
        globalConfig.destinationIdentifierOffset,
        receiveConfig.destinationIdentifier,
      )
    ) {
      return {
        isScoe: false,
        error: '信宿标识不匹配',
      };
    }
  }

  // 5. 验证型号ID和卫星ID（4字节全匹配）
  if (!validateMultiByteField(data, globalConfig.modelIdOffset, receiveConfig.modelId)) {
    return {
      isScoe: false,
      error: '型号ID不匹配',
    };
  }

  if (!validateMultiByteField(data, globalConfig.satelliteIdOffset, receiveConfig.satelliteId)) {
    return {
      isScoe: false,
      error: '卫星ID不匹配',
    };
  }

  // 6. 所有验证通过
  return {
    isScoe: true,
    commandCode,
  };
}

/**
 * 字节数组转十六进制字符串
 * @param bytes 字节数组
 * @returns 十六进制字符串（大写，无0x前缀）
 */
export function bytesToHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => convertToHex(byte, 'uint8'))
    .join('');
}

/**
 * 验证多处校验和
 * @param data 数据包
 * @param checksums 校验配置数组
 * @returns 校验结果
 */
export function validateChecksums(
  data: Uint8Array,
  checksums: ChecksumConfig[],
): { valid: boolean; error?: string } {
  if (!checksums || checksums.length === 0) {
    return { valid: true };
  }

  for (const config of checksums) {
    if (!config.enabled) {
      continue;
    }

    // 检查数据长度
    if (data.length < config.offset + config.length) {
      return {
        valid: false,
        error: `数据包长度不足，需要至少 ${config.offset + config.length} 字节`,
      };
    }

    if (data.length <= config.checksumOffset) {
      return {
        valid: false,
        error: `校验位偏移 ${config.checksumOffset} 超出数据包范围`,
      };
    }

    // 计算校验和：累加指定范围的字节，然后取模256
    let sum = 0;
    for (let i = config.offset; i < config.offset + config.length; i++) {
      sum += data[i] || 0;
    }
    const calculatedChecksum = sum % 256;

    // 读取校验位
    const expectedChecksum = data[config.checksumOffset] || 0;

    // 比对
    if (calculatedChecksum !== expectedChecksum) {
      return {
        valid: false,
        error: `校验和不匹配，计算值: 0x${calculatedChecksum.toString(16).toUpperCase().padStart(2, '0')}, 期望值: 0x${expectedChecksum.toString(16).toUpperCase().padStart(2, '0')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * 从数据包中提取并解析参数
 * @param data 数据包
 * @param params 参数配置数组
 * @returns 解析后的参数映射 { paramId: resolvedValue }
 */
export function extractAndResolveParams(
  data: Uint8Array,
  params: ScoeCommandParams[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const param of params) {
    // 检查数据长度
    if (data.length < param.offset + param.length) {
      console.warn(
        `[SCOE] 参数 ${param.id} 提取失败：数据包长度不足，需要 ${param.offset + param.length} 字节`,
      );
      continue;
    }

    // 提取字节
    const bytes = data.slice(param.offset, param.offset + param.length);

    // 转为十六进制字符串
    const hexString = bytesToHexString(bytes);

    // 标准化为大写
    const normalizedHex = hexString.toUpperCase();

    // 在选项中查找匹配的 receiveCode
    let resolvedValue = normalizedHex; // 默认返回原始十六进制

    if (param.options && param.options.length > 0) {
      const matchedOption = param.options.find((opt) => {
        const normalizedReceiveCode = opt.receiveCode
          .replace(/^0x/i, '')
          .toUpperCase()
          .padStart(param.length * 2, '0');
        return normalizedReceiveCode === normalizedHex;
      });

      if (matchedOption) {
        resolvedValue = matchedOption.value;
      }
    }

    result[param.id] = resolvedValue;
  }

  return result;
}
