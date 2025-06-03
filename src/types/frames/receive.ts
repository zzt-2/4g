/**
 * 接收帧处理相关类型定义
 */

import type { FieldType } from './basic';
import type { Frame } from './frames';

// 数据项接口
export interface DataItem {
  id: number; // 从1开始的计数ID
  label: string; // 显示名称
  isVisible: boolean; // 是否显示
  dataType: FieldType; // 数据类型（独立设置，与字段类型无关）
  value: unknown; // 实际数据值
  displayValue: string; // 显示值

  // 标签控制
  useLabel: boolean; // 是否使用标签显示
  labelOptions?: {
    // 标签选项（从对应帧字段生成）
    value: string; // 实际值
    label: string; // 显示标签
  }[];
}

// 数据分组结构
export interface DataGroup {
  id: number; // 分组ID（从1开始）
  label: string; // 分组显示名称
  dataItems: DataItem[]; // 数据项列表（直接修改数组进行排序）
}

// 帧字段映射接口
export interface FrameFieldMapping {
  frameId: string; // 接收帧ID
  fieldId: string; // 字段ID
  fieldName: string; // 字段名称（用于验证）
  groupId: number; // 目标分组ID
  dataItemId: number; // 目标数据项ID
}

// 接收帧统计信息
export interface ReceiveFrameStats {
  frameId: string; // 帧ID
  totalReceived: number; // 总接收数量
  lastReceiveTime: Date; // 上次接收时间
  checksumFailures: number; // 校验失败次数
  errorCount: number; // 错误计数
}

// 配置数据结构（用于文件存储）
export interface ReceiveConfig {
  groups: DataGroup[]; // 数据分组配置
  mappings: FrameFieldMapping[]; // 字段映射关系
  version: string; // 配置版本
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
}

// 帧匹配规则接口
export interface FrameMatchRule {
  frameId: string; // 帧ID
  rules: import('./frames').IdentifierRule[]; // 识别规则列表
}

// 验证结果接口
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// 统一数据接收相关类型
export interface ReceivedDataPacket {
  id: string; // 数据包唯一ID
  timestamp: number; // 接收时间戳
  source: 'serial' | 'network'; // 数据来源
  sourceId: string; // 来源标识（串口路径或网络连接ID）
  data: Uint8Array; // 原始数据
  size: number; // 数据大小
}

// 帧匹配结果
export interface FrameMatchResult {
  isMatched: boolean; // 是否匹配成功
  frameId?: string; // 匹配的帧ID
  frame?: Frame; // 匹配的帧对象
  confidence: number; // 匹配置信度（0-1）
  errors?: string[]; // 匹配错误信息
}

// 数据处理结果
export interface DataProcessResult {
  success: boolean; // 处理是否成功
  frameId?: string; // 处理的帧ID
  mappings?: FrameFieldMapping[]; // 相关映射关系
  updatedDataItems?: {
    groupId: number;
    dataItemId: number;
    value: unknown;
    displayValue: string;
  }[]; // 更新的数据项
  errors?: string[]; // 处理错误信息
}

// 数据接收统计
export interface DataReceiveStats {
  totalPackets: number; // 总接收包数
  matchedPackets: number; // 匹配成功包数
  unmatchedPackets: number; // 未匹配包数
  errorPackets: number; // 错误包数
  lastReceiveTime?: Date; // 最后接收时间
  bytesReceived: number; // 总接收字节数
}

// 内容模式类型
export type ContentMode = 'edit' | 'display';

// 统计数据类型
export type StatisticType =
  | 'frameCount' // 帧数统计
  | 'errorCount' // 错误统计
  | 'fieldSum' // 字段累加
  | 'runtime' // 运行时间
  | 'custom'; // 自定义统计
