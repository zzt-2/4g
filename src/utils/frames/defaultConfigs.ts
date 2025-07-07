/**
 * 默认配置生成器
 */

import { nanoid } from 'nanoid';
import type {
  TimedStrategyConfig,
  TriggerStrategyConfig,
  TriggerCondition,
  TimeTriggerConfig,
  ConditionTriggerConfig,
} from '../../types/frames/sendInstances';
import type {
  ExpressionConfig,
  VariableMapping,
  ConditionalExpression,
} from '../../types/frames/fields';
import { DataSourceType } from '../../types/frames/fields';

/**
 * 创建默认定时策略配置
 */
export function createDefaultTimedConfig(): TimedStrategyConfig {
  return {
    type: 'timed',
    sendInterval: 1000, // 1秒
    repeatCount: 10,
    isInfinite: false,
    startDelay: 0,
  };
}

/**
 * 创建默认触发策略配置
 * 扁平化结构，默认为条件触发
 */
export function createDefaultTriggerConfig(): TriggerStrategyConfig {
  return {
    type: 'triggered',
    triggerType: 'condition',
    responseDelay: 0,
    sourceId: '',
    triggerFrameId: '',
    conditions: [createDefaultTriggerCondition()],
  };
}

/**
 * 创建默认时间触发配置
 */
export function createDefaultTimeTriggerConfig(): TimeTriggerConfig {
  return {
    triggerType: 'time',
    executeTime: new Date().toISOString(),
    isRecurring: false,
  };
}

/**
 * 创建默认条件触发配置
 */
export function createDefaultConditionTriggerConfig(): ConditionTriggerConfig {
  return {
    triggerType: 'condition',
    sourceId: '',
    triggerFrameId: '',
    conditions: [createDefaultTriggerCondition()],
    continueListening: true,
  };
}

/**
 * 创建默认触发条件
 */
export function createDefaultTriggerCondition(): TriggerCondition {
  return {
    id: nanoid(),
    fieldId: '',
    condition: 'equals',
    value: '',
    logicOperator: 'and',
  };
}

/**
 * 创建默认表达式配置
 */
export function createDefaultExpressionConfig(): ExpressionConfig {
  return {
    expressions: [createDefaultConditionalExpression()],
    variables: [],
  };
}

/**
 * 创建默认条件表达式
 */
export function createDefaultConditionalExpression(): ConditionalExpression {
  return {
    condition: 'true', // 默认总是执行
    expression: '0', // 默认返回0
  };
}

/**
 * 创建默认变量映射
 */
export function createDefaultVariableMapping(
  identifier: string = 'a',
  sourceType: DataSourceType = DataSourceType.CURRENT_FIELD,
): VariableMapping {
  return {
    identifier,
    sourceType,
    sourceId: '',
  };
}

/**
 * 克隆策略配置
 */
export function cloneStrategyConfig<T extends TimedStrategyConfig | TriggerStrategyConfig>(
  config: T,
): T {
  return JSON.parse(JSON.stringify(config));
}

/**
 * 克隆表达式配置
 */
export function cloneExpressionConfig(config: ExpressionConfig): ExpressionConfig {
  return JSON.parse(JSON.stringify(config));
}

/**
 * 获取策略类型的显示名称
 */
export function getStrategyTypeLabel(type: 'timed' | 'triggered'): string {
  const labels = {
    timed: '定时发送',
    triggered: '触发发送',
  };
  return labels[type] || '未知策略';
}

/**
 * 获取触发条件的显示名称
 */
export function getConditionTypeLabel(condition: TriggerCondition['condition']): string {
  const labels = {
    equals: '等于',
    not_equals: '不等于',
    greater: '大于',
    less: '小于',
    contains: '包含',
  };
  return labels[condition] || '未知条件';
}

/**
 * 获取数据源类型的显示标签
 * @param sourceType 数据源类型
 * @returns 显示标签
 */
export function getDataSourceTypeLabel(sourceType: DataSourceType): string {
  switch (sourceType) {
    case DataSourceType.CURRENT_FIELD:
      return '当前帧';
    case DataSourceType.FRAME_FIELD:
      return '接收帧';
    case DataSourceType.GLOBAL_STAT:
      return '全局统计';
    default:
      return '未知类型';
  }
}

/**
 * 验证表达式配置的完整性
 */
export function validateExpressionConfig(config: ExpressionConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 检查表达式是否为空
  if (!config.expressions || config.expressions.length === 0) {
    errors.push('至少需要一个表达式');
  }

  // 检查变量映射的唯一性
  const identifiers = config.variables.map((v) => v.identifier);
  const uniqueIdentifiers = new Set(identifiers);
  if (identifiers.length !== uniqueIdentifiers.size) {
    errors.push('变量标识符不能重复');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
