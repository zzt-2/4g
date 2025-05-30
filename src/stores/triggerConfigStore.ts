/**
 * 触发配置状态管理 Store
 * 统一管理条件触发和时间触发的配置
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  TriggerStrategyConfig,
  TriggerType,
  ConditionTriggerConfig,
  TimeTriggerConfig,
  TriggerCondition,
} from '../types/frames/sendInstances';

export const useTriggerConfigStore = defineStore('triggerConfig', () => {
  // 基础状态
  const triggerType = ref<TriggerType>('condition');
  const responseDelay = ref<number>(0);

  // 条件触发配置
  const sourceId = ref<string>('');
  const triggerFrameId = ref<string>('');
  const conditions = ref<TriggerCondition[]>([]);
  const continueListening = ref<boolean>(true);

  // 时间触发配置
  const executeTime = ref<string>(new Date().toISOString());
  const isRecurring = ref<boolean>(false);
  const recurringType = ref<'second' | 'minute' | 'hour' | 'daily' | 'weekly' | 'monthly'>('daily');
  const recurringInterval = ref<number>(1);
  const endTime = ref<string>('');

  // 计算属性：条件触发配置
  const conditionConfig = computed<ConditionTriggerConfig>(() => ({
    triggerType: 'condition',
    sourceId: sourceId.value,
    triggerFrameId: triggerFrameId.value,
    conditions: conditions.value,
    continueListening: continueListening.value,
  }));

  // 计算属性：时间触发配置
  const timeConfig = computed<TimeTriggerConfig>(() => {
    const config: TimeTriggerConfig = {
      triggerType: 'time',
      executeTime: executeTime.value,
      isRecurring: isRecurring.value,
    };

    if (isRecurring.value) {
      config.recurringType = recurringType.value;
      config.recurringInterval = recurringInterval.value;
      if (endTime.value) {
        config.endTime = endTime.value;
      }
    }

    return config;
  });

  // 计算属性：完整的触发策略配置
  const triggerStrategyConfig = computed<TriggerStrategyConfig>(() => {
    const baseConfig = {
      type: 'triggered' as const,
      triggerType: triggerType.value,
      responseDelay: responseDelay.value || 0,
    };

    if (triggerType.value === 'condition') {
      return {
        ...baseConfig,
        sourceId: sourceId.value,
        triggerFrameId: triggerFrameId.value,
        conditions: conditions.value,
        continueListening: continueListening.value,
      };
    } else {
      const config: TriggerStrategyConfig = {
        ...baseConfig,
        executeTime: executeTime.value,
        isRecurring: isRecurring.value,
      };

      if (isRecurring.value) {
        config.recurringType = recurringType.value;
        config.recurringInterval = recurringInterval.value;
        if (endTime.value) {
          config.endTime = endTime.value;
        }
      }

      return config;
    }
  });

  // 方法：设置触发类型
  function setTriggerType(type: TriggerType) {
    triggerType.value = type;
  }

  // 方法：设置条件触发配置
  function setConditionConfig(config: Partial<ConditionTriggerConfig>) {
    if (config.sourceId !== undefined) sourceId.value = config.sourceId;
    if (config.triggerFrameId !== undefined) triggerFrameId.value = config.triggerFrameId;
    if (config.conditions !== undefined) conditions.value = config.conditions;
    if (config.continueListening !== undefined) continueListening.value = config.continueListening;
  }

  // 方法：设置时间触发配置
  function setTimeConfig(config: Partial<TimeTriggerConfig>) {
    if (config.executeTime !== undefined) executeTime.value = config.executeTime;
    if (config.isRecurring !== undefined) isRecurring.value = config.isRecurring;
    if (config.recurringType !== undefined) recurringType.value = config.recurringType;
    if (config.recurringInterval !== undefined) recurringInterval.value = config.recurringInterval;
    if (config.endTime !== undefined) endTime.value = config.endTime;
  }

  // 方法：从外部配置加载
  function loadFromStrategyConfig(config: TriggerStrategyConfig) {
    triggerType.value = config.triggerType;
    responseDelay.value = config.responseDelay || 0;

    if (config.triggerType === 'condition') {
      sourceId.value = config.sourceId || '';
      triggerFrameId.value = config.triggerFrameId || '';
      conditions.value = config.conditions || [];
      continueListening.value = config.continueListening ?? true;
    } else if (config.triggerType === 'time') {
      executeTime.value = config.executeTime || new Date().toISOString();
      isRecurring.value = config.isRecurring || false;
      recurringType.value = config.recurringType || 'daily';
      recurringInterval.value = config.recurringInterval || 1;
      endTime.value = config.endTime || '';
    }
  }

  // 方法：重置配置
  function resetConfig() {
    triggerType.value = 'condition';
    responseDelay.value = 0;

    // 重置条件触发配置
    sourceId.value = '';
    triggerFrameId.value = '';
    conditions.value = [];
    continueListening.value = true;

    // 重置时间触发配置
    executeTime.value = new Date().toISOString();
    isRecurring.value = false;
    recurringType.value = 'daily';
    recurringInterval.value = 1;
    endTime.value = '';
  }

  return {
    // 状态
    triggerType,
    responseDelay,

    // 条件触发状态
    sourceId,
    triggerFrameId,
    conditions,
    continueListening,

    // 时间触发状态
    executeTime,
    isRecurring,
    recurringType,
    recurringInterval,
    endTime,

    // 计算属性
    conditionConfig,
    timeConfig,
    triggerStrategyConfig,

    // 方法
    setTriggerType,
    setConditionConfig,
    setTimeConfig,
    loadFromStrategyConfig,
    resetConfig,
  };
});
