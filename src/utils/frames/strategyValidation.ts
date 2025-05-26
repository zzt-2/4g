/**
 * 策略配置验证工具函数
 */

import type {
  TimedStrategyConfig,
  TriggerStrategyConfig,
  StrategyConfig,
} from '../../types/frames/sendInstances';

// 验证结果接口
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证定时策略配置
 */
export function validateTimedStrategy(config: TimedStrategyConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.sendInterval || config.sendInterval <= 0) {
    errors.push('发送间隔必须大于0');
  }

  if (config.sendInterval < 100) {
    errors.push('发送间隔不能小于100毫秒');
  }

  if (!config.isInfinite && (!config.repeatCount || config.repeatCount <= 0)) {
    errors.push('非无限循环时重复次数必须大于0');
  }

  if (config.startDelay && config.startDelay < 0) {
    errors.push('开始延时不能为负数');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证触发策略配置
 */
export function validateTriggerStrategy(config: TriggerStrategyConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.sourceId) {
    errors.push('必须选择监听来源');
  }

  if (!config.triggerFrameId) {
    errors.push('必须选择触发帧');
  }

  if (!config.conditions || config.conditions.length === 0) {
    errors.push('至少需要一个触发条件');
  }

  if (config.conditions) {
    config.conditions.forEach((condition, index) => {
      if (!condition.fieldId) {
        errors.push(`条件${index + 1}：必须选择字段`);
      }
      if (!condition.value) {
        errors.push(`条件${index + 1}：必须设置值`);
      }
    });
  }

  if (config.responseDelay && config.responseDelay < 0) {
    errors.push('响应延时不能为负数');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证策略配置
 */
export function validateStrategyConfig(config: StrategyConfig): ValidationResult {
  switch (config.type) {
    case 'timed':
      return validateTimedStrategy(config);
    case 'triggered':
      return validateTriggerStrategy(config);
    default:
      return { valid: false, errors: ['未知的策略类型'] };
  }
}
