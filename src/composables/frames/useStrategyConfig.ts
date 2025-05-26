/**
 * 策略配置组合式函数
 * 提供统一的策略配置状态管理和验证
 */

import { ref, computed } from 'vue';
import type {
  TimedStrategyConfig,
  TriggerStrategyConfig,
  StrategyConfig,
} from '../../types/frames/sendInstances';
import { validateStrategyConfig } from '../../utils/frames/strategyValidation';
import {
  createDefaultTimedConfig,
  createDefaultTriggerConfig,
} from '../../utils/frames/defaultConfigs';

export function useStrategyConfig() {
  const timedConfig = ref<TimedStrategyConfig>(createDefaultTimedConfig());
  const triggerConfig = ref<TriggerStrategyConfig>(createDefaultTriggerConfig());
  const currentStrategyType = ref<'immediate' | 'timed' | 'triggered'>('immediate');

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

  // 验证当前配置
  const validation = computed(() => {
    if (!currentStrategyConfig.value) {
      return { valid: true, errors: [] };
    }
    return validateStrategyConfig(currentStrategyConfig.value);
  });

  // 计算是否有配置错误
  const hasErrors = computed(() => !validation.value.valid);

  // 计算错误消息
  const errorMessage = computed(() =>
    validation.value.errors.length > 0 ? validation.value.errors[0] : '',
  );

  /**
   * 设置策略类型
   */
  function setStrategyType(type: 'immediate' | 'timed' | 'triggered') {
    currentStrategyType.value = type;
  }

  /**
   * 更新定时配置
   */
  function updateTimedConfig(config: Partial<TimedStrategyConfig>) {
    timedConfig.value = { ...timedConfig.value, ...config };
  }

  /**
   * 更新触发配置
   */
  function updateTriggerConfig(config: Partial<TriggerStrategyConfig>) {
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
      timedConfig.value = { ...strategy };
    } else if (strategy.type === 'triggered') {
      triggerConfig.value = { ...strategy };
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
    currentStrategyType,
    currentStrategyConfig,
    validation,
    hasErrors,
    errorMessage,

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
