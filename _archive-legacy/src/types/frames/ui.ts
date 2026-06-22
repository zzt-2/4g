/**
 * UI相关类型定义
 * 包含分类、过滤器等与用户界面相关的类型
 */

// 分类
export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
}

// 过滤选项
export interface FilterOptions {
  protocol: string;
  frameType: string;
  direction: string;
  dateRange?: [Date | null, Date | null] | undefined;
}

// 过滤值
export interface FilterValues {
  protocol: string[];
  frameType: string[];
  direction: string[];
}
