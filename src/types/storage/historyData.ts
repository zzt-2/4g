/**
 * 历史数据存储相关类型定义
 */

import type { FieldType } from '../frames/basic';

// 历史数据记录接口
export interface HistoryDataRecord {
  timestamp: number; // 时间戳
  data: unknown[]; // 所有分组的所有数据项按顺序存储
}

// 数据项元数据接口
export interface DataItemMetadata {
  id: number; // 数据项ID
  label: string; // 数据项标签
  dataType: FieldType; // 数据类型
  groupId: number; // 所属分组ID
  index: number; // 在data数组中的索引位置
}

// 分组元数据接口
export interface GroupMetadata {
  id: number; // 分组ID
  label: string; // 分组标签
  dataItems: DataItemMetadata[]; // 数据项列表
}

// 小时数据文件接口
export interface HourlyDataFile {
  metadata: {
    version: string; // 版本号
    hourKey: string; // 小时键 YYYY-MM-DD-HH
    groups: GroupMetadata[]; // 分组元数据
    totalDataItems: number; // 总数据项数量
    createdAt: number; // 创建时间戳
    updatedAt: number; // 更新时间戳
  };
  records: HistoryDataRecord[]; // 历史数据记录
}

// 时间范围接口
export interface TimeRange {
  startTime: number; // 开始时间戳
  endTime: number; // 结束时间戳
}

// Y轴配置接口
export interface YAxisConfig {
  autoScale: boolean; // 是否自动缩放
  min?: number; // 最小值
  max?: number; // 最大值
}

// 图表配置接口
export interface ChartConfig {
  id: number; // 图表ID
  title: string; // 图表标题
  selectedDataItems: Array<{
    groupId: number; // 分组ID
    dataItemId: number; // 数据项ID
    label: string; // 显示标签
    color: string; // 线条颜色
  }>;
  yAxisConfig?: YAxisConfig; // Y轴配置
}

// 多图表设置接口
export interface MultiChartSettings {
  chartCount: number; // 图表数量 (1-4)
  charts: ChartConfig[]; // 图表配置列表
}

// 数据项选择状态接口
export interface DataItemSelection {
  groupId: number; // 分组ID
  dataItemId: number; // 数据项ID
  selected: boolean; // 是否选中
  visible: boolean; // 是否可见
}

// 历史数据查询参数接口
export interface HistoryDataQuery {
  timeRange: TimeRange; // 时间范围
  selectedItems: DataItemSelection[]; // 选中的数据项
  hourKeys: string[]; // 需要加载的小时键列表
}

// 历史数据加载结果接口
export interface HistoryDataLoadResult {
  success: boolean; // 是否成功
  data: HistoryDataRecord[]; // 加载的数据
  metadata: {
    groups: GroupMetadata[]; // 分组元数据
    timeRange: TimeRange; // 实际时间范围
    totalRecords: number; // 总记录数
  };
  errors?: string[]; // 错误信息
}

// CSV导出配置接口
export interface CSVExportConfig {
  fileName: string; // 文件名（不含扩展名）
  timeRange: TimeRange; // 导出时间范围
  selectedItems: DataItemSelection[]; // 选中的数据项
  includeHeaders: boolean; // 是否包含表头
  includeTimestamp: boolean; // 是否包含时间戳
}

// CSV导出结果接口
export interface CSVExportResult {
  success: boolean; // 是否成功
  filePath?: string; // 导出文件路径
  recordCount?: number; // 导出记录数
  error?: string; // 错误信息
}

// 文件信息接口
export interface HistoryFileInfo {
  hourKey: string; // 小时键
  filePath: string; // 文件路径
  size: number; // 文件大小（字节）
  recordCount: number; // 记录数量
  compressed: boolean; // 是否压缩
  lastModified: number; // 最后修改时间
}

// 存储统计信息接口
export interface StorageStats {
  totalFiles: number; // 总文件数
  totalSize: number; // 总大小（字节）
  totalRecords: number; // 总记录数
  dateRange: {
    earliest: string; // 最早日期
    latest: string; // 最新日期
  };
  compressionRatio: number; // 压缩比
}
