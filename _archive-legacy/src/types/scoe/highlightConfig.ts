// 测试工具高亮配置类型定义

/**
 * 高亮配置项
 */
export interface HighlightConfig {
  /** 唯一标识 */
  id: string;
  /** 名称 */
  name: string;
  /** 偏移量（字节） */
  offset: number;
  /** 长度（字节） */
  length: number;
}

/**
 * 高亮配置集合（区分发送和接收）
 */
export interface HighlightConfigs {
  /** 发送区高亮配置 */
  sendConfigs: HighlightConfig[];
  /** 接收区高亮配置 */
  receiveConfigs: HighlightConfig[];
}

/**
 * 默认高亮配置
 */
export const defaultHighlightConfig: HighlightConfig = {
  id: '',
  name: '',
  offset: 0,
  length: 1,
};

/**
 * 默认高亮配置集合
 */
export const defaultHighlightConfigs: HighlightConfigs = {
  sendConfigs: [],
  receiveConfigs: [],
};

/**
 * 高亮颜色循环列表
 * 使用不同的背景色，便于区分相邻的高亮区域
 * 使用内联样式以确保动态应用
 * 针对深色背景 #0D1117 优化的明亮颜色
 */
export const highlightColors = [
  'rgba(59, 130, 246, 0.6)', // 亮蓝色 blue-500
  'rgba(34, 197, 94, 0.6)', // 亮绿色 green-500
  'rgba(234, 179, 8, 0.6)', // 亮黄色 yellow-500
  'rgba(168, 85, 247, 0.6)', // 亮紫色 purple-500
  'rgba(236, 72, 153, 0.6)', // 亮粉色 pink-500
  'rgba(249, 115, 22, 0.6)', // 亮橙色 orange-500
];

/**
 * 获取高亮颜色
 * @param index 索引
 * @returns 颜色值（rgba格式）
 */
export function getHighlightColor(index: number): string {
  return highlightColors[index % highlightColors.length] || '';
}
