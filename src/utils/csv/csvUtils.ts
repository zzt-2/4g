/**
 * CSV 读写工具函数
 */

import type { DataRecord } from '../../types/frames/dataDisplay';
import { formatDateTime } from '../common/dateUtils';

/**
 * 生成CSV文件头
 * @param sampleRecord 示例记录，用于确定列结构
 * @returns CSV文件头字符串
 */
export const generateCSVHeader = (sampleRecord: DataRecord): string => {
  const headers = ['时间戳', '时间', '分组ID', '分组标签'];

  // 动态生成数据项列头
  sampleRecord.dataItems.forEach((item) => {
    headers.push(`${item.label}_值`);
    headers.push(`${item.label}_十六进制`);
  });

  return headers.join(',');
};

/**
 * 将数据记录转换为CSV行
 * @param record 数据记录
 * @param groupLabel 分组标签
 * @returns CSV行字符串
 */
export const formatDataRecordToCSV = (record: DataRecord, groupLabel: string): string => {
  const row = [
    record.timestamp.toString(),
    `"${formatDateTime(record.timestamp)}"`,
    record.groupId.toString(),
    `"${groupLabel}"`,
  ];

  // 添加每个数据项的值和十六进制值
  record.dataItems.forEach((item) => {
    row.push(`"${item.displayValue}"`);
    row.push(`"${item.hexValue}"`);
  });

  return row.join(',');
};

/**
 * 根据小时键生成CSV文件名
 * @param hourKey 小时键，格式：YYYY-MM-DD-HH
 * @returns CSV文件名
 */
export const getCSVFileName = (hourKey: string): string => {
  return `data_${hourKey}.csv`;
};

/**
 * 验证CSV数据的有效性
 * @param records 数据记录数组
 * @returns 是否有效
 */
export const validateCSVData = (records: DataRecord[]): boolean => {
  if (!Array.isArray(records) || records.length === 0) {
    return false;
  }

  // 检查每条记录的基本结构
  return records.every((record) => {
    return (
      typeof record.timestamp === 'number' &&
      typeof record.groupId === 'number' &&
      Array.isArray(record.dataItems) &&
      record.dataItems.length > 0
    );
  });
};

/**
 * 解析CSV行为数据对象
 * @param csvLine CSV行字符串
 * @param headers 列头数组
 * @returns 解析后的数据对象
 */
export const parseCSVLine = (csvLine: string, headers: string[]): Record<string, string> => {
  // 简单的CSV解析，处理引号包围的字段
  const values: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < csvLine.length; i++) {
    const char = csvLine[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  // 添加最后一个值
  if (currentValue) {
    values.push(currentValue.trim());
  }

  // 组合成对象
  const result: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (header) {
      result[header] = values[index] ?? '';
    }
  });

  return result;
};

/**
 * 读取CSV文件内容并解析
 * @param csvContent CSV文件内容
 * @returns 解析后的数据数组
 */
export const parseCSVContent = (csvContent: string): Array<Record<string, string>> => {
  const lines = csvContent.split('\n').filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0]?.split(',').map((header) => header.trim().replace(/"/g, ''));
  const dataLines = lines.slice(1);

  return dataLines.map((line) => parseCSVLine(line, headers as string[]));
};

/**
 * 生成完整的CSV内容
 * @param records 数据记录数组
 * @param groupLabels 分组标签映射
 * @returns 完整的CSV内容字符串
 */
export const generateCSVContent = (
  records: DataRecord[],
  groupLabels: Map<number, string>,
): string => {
  if (!validateCSVData(records)) {
    throw new Error('无效的CSV数据');
  }

  const lines: string[] = [];

  // 生成文件头（使用第一条记录作为模板）
  const firstRecord = records[0];
  if (firstRecord) {
    lines.push(generateCSVHeader(firstRecord));
  }

  // 生成数据行
  records.forEach((record) => {
    const groupLabel = groupLabels.get(record.groupId) || `分组${record.groupId}`;
    lines.push(formatDataRecordToCSV(record, groupLabel));
  });

  return lines.join('\n') + '\n';
};
