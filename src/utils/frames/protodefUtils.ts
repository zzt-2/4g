/**
 * ProtoDef 工具函数
 * 提供帧格式定义、转换和序列化/反序列化的纯函数工具
 */
import { ProtoBuf } from 'protodef';
import type {
  ProtocolDefinition,
  ProtoConvertOptions,
  ProtoParseResult,
  ProtoSerializeResult,
  ProtoSchema,
  ProtoField,
  ProtoDataType,
  ProtoComplexType,
} from '../../types/frames/protodef';

// 默认转换选项
const DEFAULT_CONVERT_OPTIONS: ProtoConvertOptions = {
  endianness: 'big',
  strict: true,
  initialBufferSize: 1024,
  stringEncoding: 'utf8',
  numberBase: 'hex',
};

/**
 * 创建一个新的协议模式
 * @param protocol 协议定义对象
 * @returns 协议模式对象
 */
export function createProtoSchema(protocol: ProtocolDefinition): ProtoSchema {
  try {
    const schema: ProtoSchema = {
      id: protocol.id,
      protocol,
      compiled: {
        rootType: protocol.rootType,
      },
    };

    // 编译协议定义
    const protoDef = new ProtoBuf();

    // 注册协议中定义的所有类型
    Object.entries(protocol.types).forEach(([name, type]) => {
      protoDef.addType(name, type);
    });

    // 缓存编译结果
    schema.compiled.protoDef = protoDef;

    return schema;
  } catch (error) {
    console.error('创建协议模式失败:', error);
    throw error;
  }
}

/**
 * 解析二进制数据为JavaScript对象
 * @param schema 协议模式
 * @param buffer 二进制数据
 * @param options 转换选项
 * @returns 解析结果
 */
export function parseBuffer<T>(
  schema: ProtoSchema,
  buffer: Uint8Array,
  options: Partial<ProtoConvertOptions> = {},
): ProtoParseResult<T> {
  const mergedOptions = { ...DEFAULT_CONVERT_OPTIONS, ...options };
  const result: ProtoParseResult<T> = {
    data: {} as T,
    buffer,
  };

  try {
    if (!schema.compiled.protoDef) {
      throw new Error('协议模式未正确编译');
    }

    const parser = schema.compiled.protoDef.createParser();
    const data = parser.parse(buffer, 0, schema.protocol.rootType, mergedOptions);

    result.data = data.value as T;
    result.remainingBytes = buffer.length - data.size;

    return result;
  } catch (error) {
    result.error = error as Error;
    return result;
  }
}

/**
 * 将JavaScript对象序列化为二进制数据
 * @param schema 协议模式
 * @param data 待序列化的对象
 * @param options 转换选项
 * @returns 序列化结果
 */
export function serializeObject(
  schema: ProtoSchema,
  data: unknown,
  options: Partial<ProtoConvertOptions> = {},
): ProtoSerializeResult {
  const mergedOptions = { ...DEFAULT_CONVERT_OPTIONS, ...options };
  const result: ProtoSerializeResult = {
    buffer: new Uint8Array(0),
  };

  try {
    if (!schema.compiled.protoDef) {
      throw new Error('协议模式未正确编译');
    }

    const serializer = schema.compiled.protoDef.createSerializer();
    const buffer = serializer.serialize(data, schema.protocol.rootType, mergedOptions);

    result.buffer = buffer;
    return result;
  } catch (error) {
    result.error = error as Error;
    return result;
  }
}

/**
 * 将RS485帧字段数组转换为ProtoDef类型定义
 * @param fields 帧字段数组
 * @returns ProtoDef的container类型定义
 */
export function fieldArrayToProtoContainer(fields: ProtoField[]): ProtoComplexType {
  return {
    type: 'container',
    fields,
  };
}

/**
 * 基于RS485帧定义创建协议定义
 * @param frameId 帧ID
 * @param frameName 帧名称
 * @param fields 帧字段数组
 * @returns 协议定义对象
 */
export function createFrameProtocol(
  frameId: string,
  frameName: string,
  fields: ProtoField[],
): ProtocolDefinition {
  const rootType = `${frameId}_frame`;
  const types: Record<string, ProtoDataType | ProtoComplexType> = {};

  // 添加帧根类型
  types[rootType] = fieldArrayToProtoContainer(fields);

  return {
    id: frameId,
    name: frameName,
    version: '1.0',
    description: `Auto-generated protocol for frame ${frameName}`,
    types,
    rootType,
  };
}

/**
 * 从十六进制字符串创建Uint8Array
 * @param hexString 十六进制字符串(可以包含空格)
 * @returns Uint8Array对象
 */
export function hexStringToUint8Array(hexString: string): Uint8Array {
  const cleaned = hexString.replace(/\s+/g, '');
  const bytes = new Uint8Array(cleaned.length / 2);

  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }

  return bytes;
}

/**
 * 将Uint8Array转换为十六进制字符串
 * @param bytes Uint8Array对象
 * @param pretty 是否格式化(添加空格)
 * @returns 十六进制字符串
 */
export function uint8ArrayToHexString(bytes: Uint8Array, pretty = false): string {
  const hexArray = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0'));
  return pretty ? hexArray.join(' ') : hexArray.join('');
}

/**
 * 根据帧字段类型获取适合ProtoDef的类型
 * @param fieldType RS485帧字段类型
 * @returns ProtoDef兼容的类型
 */
export function mapFieldTypeToProtoType(fieldType: string): ProtoDataType | `custom_${string}` {
  const typeMap: Record<string, ProtoDataType> = {
    uint8: 'uint8',
    uint16: 'uint16',
    uint32: 'uint32',
    uint64: 'uint64',
    int8: 'int8',
    int16: 'int16',
    int32: 'int32',
    int64: 'int64',
    float: 'float',
    double: 'double',
    string: 'string',
    hex: 'buffer',
    binary: 'buffer',
    boolean: 'bool',
    bitmap: 'bitfield',
    enum: 'mapper',
  };

  return typeMap[fieldType] || `custom_${fieldType}`;
}

/**
 * 检查协议定义是否有效
 * @param protocol 待验证的协议定义
 * @returns 是否有效
 */
export function validateProtocol(protocol: ProtocolDefinition): boolean {
  try {
    // 基本验证
    if (!protocol.id || !protocol.name || !protocol.rootType) {
      return false;
    }

    // 检查根类型是否存在
    if (!protocol.types[protocol.rootType]) {
      return false;
    }

    // 创建测试模式以验证编译
    createProtoSchema(protocol);
    return true;
  } catch (error) {
    console.error('协议验证失败:', error);
    return false;
  }
}
