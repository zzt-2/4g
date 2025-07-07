/**
 * 策略配置验证工具函数
 */

import type { TimedStrategyConfig, StrategyConfig } from '../../types/frames/sendInstances';

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
 * 验证策略配置
 * 简化版本，只验证定时策略，触发策略不进行验证
 */
export function validateStrategyConfig(config: StrategyConfig): ValidationResult {
  switch (config.type) {
    case 'timed':
      return validateTimedStrategy(config);
    case 'triggered':
      // 触发策略不进行验证，直接返回有效
      return { valid: true, errors: [] };
    default:
      return { valid: false, errors: ['未知的策略类型'] };
  }
}
