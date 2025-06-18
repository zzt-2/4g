/**
 * 数据显示相关类型定义
 */

import type { YAxisConfig } from '../storage/historyData';

// 数据记录点（用于历史数据和CSV存储）
export interface DataRecord {
  timestamp: number; // 记录时间戳
  groupId: number; // 分组ID
  dataItems: {
    id: number; // 数据项ID
    label: string; // 数据项标签
    value: unknown; // 实际值
    displayValue: string; // 显示值
    hexValue: string; // 十六进制值
  }[];
}

// 表格配置
export interface TableConfig {
  selectedGroupId: number | null; // 选中的分组ID
  displayMode: 'table' | 'chart'; // 显示模式
  chartSelectedItems: number[]; // 图表选中的数据项ID（为后续图表功能预留）
  yAxisConfig?: YAxisConfig; // Y轴配置
}

// 显示设置
export interface DisplaySettings {
  updateInterval: number; // 数据更新间隔（毫秒）
  csvSaveInterval: number; // 保存间隔（毫秒）
  maxHistoryHours: number; // 最大历史记录小时数
  enableAutoSave: boolean; // 是否启用自动保存
  enableRecording: boolean; // 是否启用数据记录
  enableHistoryStorage: boolean; // 是否启用历史数据存储
}

// 表格行数据（用于表格显示）
export interface TableRowData {
  index: number; // 编号（从1开始）
  label: string; // 数据名称
  displayValue: string; // 值
  hexValue: string; // 十六进制值
  dataItemId: number; // 原始数据项ID
  isVisible: boolean; // 是否可见
  isFavorite: boolean; // 是否收藏
}

// 记录状态
export interface RecordingStatus {
  isRecording: boolean; // 是否正在记录
  startTime: number | null; // 开始时间
  recordCount: number; // 记录数量
  lastRecordTime: number; // 上次记录时间
  currentHour: string; // 当前小时键
}

// CSV文件信息
export interface CSVFileInfo {
  hourKey: string; // 小时键
  fileName: string; // 文件名
  recordCount: number; // 记录数量
  fileSize: number; // 文件大小（字节）
  lastModified: number; // 最后修改时间
}
