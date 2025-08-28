/**
 * 帧字段相关类型定义
 */

import type { FieldType } from './basic';

// 字段输入类型 - 扩展添加表达式类型
export type FieldInputType = 'input' | 'select' | 'radio' | 'expression';

// 数据参与类型枚举
export type DataParticipationType = 'direct' | 'indirect';

// 数据源类型枚举
export enum DataSourceType {
  CURRENT_FIELD = 'current_field', // 当前帧字段（包括自引用）
  FRAME_FIELD = 'frame_field', // 其他帧字段
  GLOBAL_STAT = 'global_stat', // 全局统计数据
}

// 变量映射接口
export interface VariableMapping {
  identifier: string; // 简写标识符 (如 "a", "ab")
  sourceType: DataSourceType; // 数据源类型
  sourceId: string; // 数据源ID
  frameId?: string; // 帧ID（如果是帧相关）
  fieldId?: string; // 字段ID
}

// 条件表达式接口
export interface ConditionalExpression {
  condition: string; // 执行条件
  expression: string; // 表达式字符串
}

// 表达式配置接口
export interface ExpressionConfig {
  expressions: ConditionalExpression[]; // 多条件表达式
  variables: VariableMapping[]; // 变量映射
  cache?: {
    lastVariableValues: Record<string, unknown>;
    lastResult: unknown;
    timestamp: number;
  };
}

// 帧字段基础接口 - 扩展添加表达式相关字段
export interface FrameField {
  id: string;
  name: string;
  dataType: FieldType;
  length: number;
  factor?: number;
  bits?: number;
  description?: string;
  validOption?: ValidationParam;
  defaultValue?: string;
  inputType: FieldInputType; // 控制字段输入类型
  configurable: boolean; // 是否可在发送用例中配置
  // 可选配置参数，用于下拉框或单选框
  options?: {
    value: string; // 实际值
    label: string; // 显示标签
    isDefault?: boolean; // 是否为默认选中项
  }[];
  // 新增表达式相关字段 - 确保向后兼容性
  dataParticipationType?: DataParticipationType; // 数据参与类型，默认为'direct'
  expressionConfig?: ExpressionConfig; // 表达式配置
}

// 帧参数
export interface FrameParam {
  id: string;
  name: string;
  dataType: string;
  value: string | number | boolean;
}

// 校验参数
export interface ValidationParam {
  isChecksum: boolean;
  startFieldIndex: string;
  endFieldIndex: string;
  checksumMethod?: string; // 校验和计算方法：'crc16', 'crc32', 'xor8', 'sum8', 'custom'
}
