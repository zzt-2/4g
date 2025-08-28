/**
 * 发送帧实例相关类型定义
 */

import { FieldVariation } from 'src/stores/frames/sendTasksStore';
import type { FieldType } from './basic';
import type {
  FieldInputType,
  ValidationParam,
  DataParticipationType,
  ExpressionConfig,
} from './fields';

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
  factor?: number;
  length: number;
  configurable?: boolean; // 是否可配置
  description?: string; // 字段说明/描述
  options: {
    value: string;
    label: string;
  }[];
  // 新增表达式相关字段 - 确保向后兼容性
  dataParticipationType?: DataParticipationType; // 数据参与类型，默认为'direct'
  expressionConfig?: ExpressionConfig; // 表达式配置
}

/**
 * 单实例策略配置
 * 直接嵌入到SendFrameInstance中
 */
export interface InstanceStrategyConfig {
  type: 'none' | 'timed' | 'triggered';

  // 复用现有接口
  timedConfig?: TimedStrategyConfig;
  triggeredConfig?: TriggerStrategyConfig;

  // 目标配置
  targetId?: string;

  updatedAt?: string;
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
  // 新增：实例级策略配置
  strategyConfig?: InstanceStrategyConfig;
  // 新增：发送统计
  sendCount?: number; // 发送次数
  lastSentAt?: Date; // 上次发送时间
}

/**
 * 任务目标配置
 * 描述实例到发送目标的映射关系
 */
export interface InstanceTargetConfig {
  instanceId: string; // 实例ID
  targetId: string; // 发送目标ID（串口路径等）
  interval?: number; // 发送间隔（用于顺序发送）
  enableVariation?: boolean;
  // 新增：字段变化配置
  fieldVariations?: FieldVariation[];
}

/**
 * 策略配置基础接口
 */
export interface StrategyConfigBase {
  type: 'immediate' | 'timed' | 'triggered' | 'variable';
}

/**
 * 触发类型
 */
export type TriggerType = 'condition' | 'time';

/**
 * 条件操作符
 */
export type ConditionOperator = 'equals' | 'not_equals' | 'greater' | 'less' | 'contains';

/**
 * 逻辑操作符
 */
export type LogicOperator = 'and' | 'or';

/**
 * 触发条件
 */
export interface TriggerCondition {
  id: string;
  fieldId: string;
  condition: ConditionOperator;
  value: string;
  logicOperator?: LogicOperator;
}

/**
 * 周期类型
 */
export type RecurringType = 'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly';

/**
 * 定时策略配置
 */
export interface TimedStrategyConfig extends StrategyConfigBase {
  type: 'timed';
  sendInterval: number; // 发送间隔(ms)
  repeatCount: number; // 重复次数
  isInfinite: boolean; // 是否无限循环
  startDelay?: number; // 开始延时(ms)
}

/**
 * 触发策略配置
 */
export interface TriggerStrategyConfig extends StrategyConfigBase {
  type: 'triggered';
  triggerType: TriggerType; // 触发类型：条件 | 时间
  responseDelay: number; // 响应延时(ms)

  // 条件触发相关
  sourceId?: string; // 监听来源ID
  triggerFrameId?: string; // 触发帧ID
  conditions?: TriggerCondition[]; // 触发条件
  continueListening?: boolean; // 触发后是否继续监听

  // 时间触发相关
  executeTime?: string; // 执行时间 (ISO字符串)
  isRecurring?: boolean; // 是否重复执行
  recurringType?: RecurringType; // 重复类型
  recurringInterval?: number; // 重复间隔
  endTime?: string; // 结束时间 (ISO字符串)
}

/**
 * 变量策略配置
 */
export interface VariableStrategyConfig extends StrategyConfigBase {
  type: 'variable';
  interval: number;
}

/**
 * 条件触发配置（单独类型，用于组件）
 */
export interface ConditionTriggerConfig {
  triggerType: 'condition';
  sourceId: string; // 监听来源ID
  triggerFrameId: string; // 触发帧ID
  conditions: TriggerCondition[]; // 触发条件
  continueListening: boolean; // 触发后是否继续监听
}

/**
 * 时间触发配置（单独类型，用于组件）
 */
export interface TimeTriggerConfig {
  triggerType: 'time';
  executeTime: string; // 执行时间 (ISO字符串)
  isRecurring: boolean; // 是否重复执行
  recurringType?: RecurringType; // 重复类型
  recurringInterval?: number; // 重复间隔
  endTime?: string; // 结束时间 (ISO字符串)
}

/**
 * 策略配置联合类型
 */
export type StrategyConfig = TimedStrategyConfig | TriggerStrategyConfig | VariableStrategyConfig;

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
