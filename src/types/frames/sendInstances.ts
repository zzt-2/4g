/**
 * 发送帧实例相关类型定义
 */

import type { FieldType } from './basic';
import type { FieldInputType, ValidationParam } from './fields';

/**
 * 发送帧实例字段值
 * 简化版的字段结构，用于发送用例
 */
export interface SendInstanceField {
  id: string;
  label: string; // 字段标签名称(对应原FrameField中的name)
  dataType: FieldType;
  inputType: FieldInputType;
  value: string; // 统一使用字符串表示值
  validOption?: ValidationParam;
  length: number;
  configurable?: boolean; // 是否可配置
  options: {
    value: string;
    label: string;
  }[];
}

/**
 * 发送帧实例
 * 用于配置发送用例
 */
export interface SendFrameInstance {
  id: string; // 唯一标识符
  label: string; // 发送实例标签名称
  frameId: string; // 关联的帧结构ID
  description: string; // 实例描述/备注
  paramCount: number; // 可配置参数数量
  createdAt: Date; // 创建时间
  updatedAt: Date; // 修改时间
  fields: SendInstanceField[]; // 字段值集合
  isFavorite: boolean; // 是否收藏
}

/**
 * 任务目标配置
 * 描述实例到发送目标的映射关系
 */
export interface InstanceTargetConfig {
  instanceId: string; // 实例ID
  targetId: string; // 发送目标ID（串口路径等）
  interval?: number; // 发送间隔（用于顺序发送）
}

/**
 * 策略配置基础接口
 */
export interface StrategyConfigBase {
  type: 'timed' | 'triggered';
}

/**
 * 定时策略配置
 */
export interface TimedStrategyConfig extends StrategyConfigBase {
  type: 'timed';
  sendInterval: number; // 发送间隔（毫秒）
  repeatCount: number; // 重复次数（0表示无限）
  isInfinite: boolean; // 是否无限循环
  startDelay?: number; // 开始延时
}

/**
 * 触发类型枚举
 */
export type TriggerType = 'condition' | 'time';

/**
 * 触发策略配置
 * 扁平化结构，直接包含所有配置字段
 */
export interface TriggerStrategyConfig extends StrategyConfigBase {
  type: 'triggered';
  triggerType: TriggerType; // 触发类型：条件触发或时间触发
  responseDelay?: number; // 响应延时

  // 条件触发相关字段
  sourceId?: string; // 监听来源ID
  triggerFrameId?: string; // 触发帧ID
  conditions?: TriggerCondition[]; // 触发条件列表
  continueListening?: boolean; // 触发后是否继续监听（默认true）

  // 时间触发相关字段
  executeTime?: string; // ISO 8601 日期时间字符串
  isRecurring?: boolean; // 是否重复
  recurringType?: 'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly'; // 重复类型
  recurringInterval?: number; // 重复间隔（如每2天、每3周）
  endTime?: string; // 重复结束时间
}

/**
 * 时间触发配置
 * 用于组件内部使用
 */
export interface TimeTriggerConfig {
  triggerType: 'time';
  executeTime: string; // ISO 8601 日期时间字符串
  isRecurring?: boolean; // 是否重复
  recurringType?: 'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly'; // 重复类型
  recurringInterval?: number; // 重复间隔（如每2天、每3周）
  endTime?: string; // 重复结束时间
}

/**
 * 条件触发配置
 * 用于组件内部使用
 */
export interface ConditionTriggerConfig {
  triggerType: 'condition';
  sourceId: string; // 监听来源ID
  triggerFrameId: string; // 触发帧ID
  conditions: TriggerCondition[]; // 触发条件列表
  continueListening?: boolean; // 触发后是否继续监听（默认true）
}

/**
 * 触发条件
 */
export interface TriggerCondition {
  id: string;
  fieldId: string;
  condition: 'equals' | 'not_equals' | 'greater' | 'less' | 'contains';
  value: string;
  logicOperator?: 'and' | 'or';
}

/**
 * 策略配置联合类型
 */
export type StrategyConfig = TimedStrategyConfig | TriggerStrategyConfig;

/**
 * 完整的任务配置
 * 包含实例、目标映射和策略配置
 */
export interface CompleteTaskConfig {
  name: string;
  description?: string;
  instances: SendFrameInstance[];
  targets: InstanceTargetConfig[];
  strategy?: StrategyConfig;
}
