/**
 * 策略配置组合式函数
 * 提供统一的策略配置状态管理
 */

import { ref, computed } from 'vue';
import type {
  TimedStrategyConfig,
  TriggerStrategyConfig,
  StrategyConfig,
  VariableStrategyConfig,
} from '../../types/frames/sendInstances';
import { validateStrategyConfig } from '../../utils/frames/strategyValidation';
import {
  createDefaultTimedConfig,
  createDefaultTriggerConfig,
} from '../../utils/frames/defaultConfigs';

export function useStrategyConfig() {
  const timedConfig = ref<TimedStrategyConfig>(createDefaultTimedConfig());
  const triggerConfig = ref<TriggerStrategyConfig>(createDefaultTriggerConfig());
  const variableConfig = ref<VariableStrategyConfig>({
    type: 'variable',
    interval: 1000,
  });
  const currentStrategyType = ref<'immediate' | 'timed' | 'triggered' | 'variable'>('immediate');

  // 计算当前策略配置
  const currentStrategyConfig = computed<StrategyConfig | undefined>(() => {
    switch (currentStrategyType.value) {
      case 'timed':
        return timedConfig.value;
      case 'triggered':
        return triggerConfig.value;
      default:
        return undefined;
    }
  });

  // 简化的验证，只对定时策略进行验证
  const validation = computed(() => {
    if (!currentStrategyConfig.value) {
      return { valid: true, errors: [] };
    }
    return validateStrategyConfig(currentStrategyConfig.value);
  });

  /**
   * 设置策略类型
   */
  function setStrategyType(type: 'immediate' | 'timed' | 'triggered') {
    currentStrategyType.value = type;
  }

  /**
   * 更新定时配置
   */
  function updateTimedConfig(config: Partial<TimedStrategyConfig> | TimedStrategyConfig) {
    timedConfig.value = { ...timedConfig.value, ...config };
  }

  /**
   * 更新触发配置
   */
  function updateTriggerConfig(config: Partial<TriggerStrategyConfig> | TriggerStrategyConfig) {
    triggerConfig.value = { ...triggerConfig.value, ...config };
  }

  /**
   * 重置配置
   */
  function resetConfigs() {
    timedConfig.value = createDefaultTimedConfig();
    triggerConfig.value = createDefaultTriggerConfig();
    currentStrategyType.value = 'immediate';
  }

  /**
   * 应用外部配置
   */
  function applyExternalConfig(strategy?: StrategyConfig) {
    if (!strategy) {
      currentStrategyType.value = 'immediate';
      return;
    }

    currentStrategyType.value = strategy.type;

    if (strategy.type === 'timed') {
      // 确保所有定时配置属性都被正确应用
      timedConfig.value = {
        type: 'timed',
        sendInterval: strategy.sendInterval,
        repeatCount: strategy.repeatCount,
        isInfinite: strategy.isInfinite,
        ...(strategy.startDelay !== undefined ? { startDelay: strategy.startDelay } : {}),
      };
    } else if (strategy.type === 'triggered') {
      // 适配新的扁平化结构
      const newConfig: TriggerStrategyConfig = {
        type: 'triggered',
        triggerType: strategy.triggerType || 'condition',
        responseDelay: strategy.responseDelay || 0,
        // 条件触发相关字段
        sourceId: strategy.sourceId || '',
        triggerFrameId: strategy.triggerFrameId || '',
        conditions: strategy.conditions ? [...strategy.conditions] : [],
      };

      // 只在有值时添加时间触发相关字段
      if (strategy.executeTime) {
        newConfig.executeTime = strategy.executeTime;
      }
      if (strategy.isRecurring !== undefined) {
        newConfig.isRecurring = strategy.isRecurring;
      }
      if (strategy.recurringType) {
        newConfig.recurringType = strategy.recurringType;
      }
      if (strategy.recurringInterval !== undefined) {
        newConfig.recurringInterval = strategy.recurringInterval;
      }
      if (strategy.endTime) {
        newConfig.endTime = strategy.endTime;
      }

      triggerConfig.value = newConfig;
    }
  }

  /**
   * 获取完整的配置数据（用于保存）
   */
  function getConfigForSave() {
    return {
      strategyType: currentStrategyType.value,
      timedConfig: timedConfig.value,
      triggerConfig: triggerConfig.value,
      currentStrategyConfig: currentStrategyConfig.value,
    };
  }

  /**
   * 从保存的数据恢复配置
   */
  function restoreFromSaved(savedConfig: {
    strategyType: 'immediate' | 'timed' | 'triggered';
    timedConfig: TimedStrategyConfig;
    triggerConfig: TriggerStrategyConfig;
  }) {
    currentStrategyType.value = savedConfig.strategyType;
    timedConfig.value = savedConfig.timedConfig;
    triggerConfig.value = savedConfig.triggerConfig;
  }

  return {
    // 状态
    timedConfig,
    triggerConfig,
    variableConfig,
    currentStrategyType,
    currentStrategyConfig,
    validation,

    // 方法
    setStrategyType,
    updateTimedConfig,
    updateTriggerConfig,
    resetConfigs,
    applyExternalConfig,
    getConfigForSave,
    restoreFromSaved,
  };
}
