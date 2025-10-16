/**
 * 接收帧处理相关类型定义
 */

import type { FieldType } from './basic';
import type { Frame } from './frames';
import type { DataParticipationType, ExpressionConfig } from './fields';

// 数据项接口
export interface DataItem {
  id: number; // 从1开始的计数ID
  label: string; // 显示名称
  isVisible: boolean; // 是否显示
  isFavorite: boolean; // 是否收藏
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

  // 新增表达式相关字段 - 确保向后兼容性
  dataParticipationType?: DataParticipationType; // 数据参与类型，默认为'direct'
  expressionConfig?: ExpressionConfig; // 表达式配置
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
  lastReceivedFrame?: Uint8Array; // 最后接收到的帧原始数据
}

export interface ReceiveScoeFrameStats {
  isScoeFrame: boolean; // 是否为SCOE帧
  satelliteIdentifier: string; //卫星识别字
  messageIdentifier: string; //信息标识
  sourceIdentifier: string; //信源标识
  destinationIdentifier: string; //信宿标识
  orderSource: string; //指令源
  orderType: string; //指令类型
  orderNumber: string; //指令号
  orderChar: string; //指令代号
  modelId: string; //型号ID
  satelliteId: string; //卫星ID
  orderCode: string; //指令码
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

// 值颜色映射接口
export interface ValueColorMapping {
  value: string; // 值（支持单值或范围，如 "10" 或 "10-20"）
  color: string; // 对应颜色（hex格式，如 #00ff00）
}

// 状态指示灯配置接口（支持多值映射）
export interface StatusIndicatorConfig {
  id: string; // 指示灯唯一ID
  label: string; // 指示灯显示标签
  groupId: number; // 关联的数据分组ID
  dataItemId: number; // 关联的数据项ID
  valueMappings: ValueColorMapping[]; // 值-颜色映射列表
  defaultColor: string; // 默认颜色（未匹配时显示）
}

// 状态指示灯管理配置（简化版）
export interface StatusIndicatorSettings {
  indicators: StatusIndicatorConfig[]; // 指示灯配置列表
  isEnabled: boolean; // 是否启用状态指示灯功能
}
