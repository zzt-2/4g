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
 * 克隆策略配置
 */
export function cloneStrategyConfig<T extends TimedStrategyConfig | TriggerStrategyConfig>(
  config: T,
): T {
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
