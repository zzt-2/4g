/**
 * ProtoDef 相关类型定义
 * 用于帧格式定义、转换和序列化/反序列化
 */
import type { ProtoBuf } from 'protodef';

// 使用更精确的类型替代any
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

// 基础数据类型
export type ProtoDataType =
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'float'
  | 'double'
  | 'string'
  | 'buffer'
  | 'bool'
  | 'void'
  | 'array'
  | 'container'
  | 'switch'
  | 'option'
  | 'bitfield'
  | 'mapper';

// 数字进制选项
export type NumberBase = 'dec' | 'hex' | 'bin' | 'oct';

// 字段定义接口
export interface ProtoField {
  name: string;
  // 使用类型别名避免string覆盖特定类型
  type: ProtoDataType | `custom_${string}`;
  description: string;
  default?: JSONValue | undefined;
  options?: Record<string, JSONValue>;
  isOptional?: boolean;
}

// 数组类型定义
export interface ProtoArrayType {
  type: 'array';
  countType: ProtoDataType | `custom_${string}`;
  elementType: ProtoDataType | `custom_${string}`;
}

// 容器类型定义
export interface ProtoContainerType {
  type: 'container';
  fields: ProtoField[];
}

// 位域类型定义
export interface ProtoBitfieldType {
  type: 'bitfield';
  bits: {
    name: string;
    size: number;
  }[];
}

// 开关类型定义
export interface ProtoSwitchType {
  type: 'switch';
  compareTo: string;
  fields: Record<string, ProtoDataType | ProtoComplexType>;
  default?: ProtoDataType | ProtoComplexType;
}

// 映射类型定义
export interface ProtoMapperType {
  type: 'mapper';
  mappings: Record<string, JSONValue>;
  valueType: ProtoDataType;
}

// 复杂类型联合
export type ProtoComplexType =
  | ProtoArrayType
  | ProtoContainerType
  | ProtoBitfieldType
  | ProtoSwitchType
  | ProtoMapperType;

// 协议定义
export interface ProtocolDefinition {
  id: string;
  name: string;
  version: string;
  description?: string;
  types: Record<string, ProtoDataType | ProtoComplexType>;
  // 根类型，表示协议入口点
  rootType: string;
}

// 转换选项
export interface ProtoConvertOptions {
  // 字节序，默认为大端
  endianness?: 'big' | 'little';
  // 支持严格模式
  strict?: boolean;
  // 缓冲区初始大小
  initialBufferSize?: number;
  // 字符串编码
  stringEncoding?: 'utf8' | 'ascii' | 'utf16le';
  // 数值显示基数
  numberBase?: NumberBase;
}

// ProtoDef解析结果
export interface ProtoParseResult<T = unknown> {
  data: T;
  buffer: Uint8Array;
  error?: Error;
  // 解析后剩余的字节数
  remainingBytes?: number;
}

// ProtoDef序列化结果
export interface ProtoSerializeResult {
  buffer: Uint8Array;
  error?: Error;
}

// 从协议定义生成的类型定义
export interface ProtoSchema {
  id: string;
  protocol: ProtocolDefinition;
  // 缓存已编译的类型
  compiled: {
    protoDef?: ProtoBuf;
    rootType: string;
    [key: string]: unknown;
  };
}
