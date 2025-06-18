/**
 * 发送帧实例Store
 *
 * 负责管理所有发送实例的CRUD操作、过滤和收藏功能
 */
import { defineStore } from 'pinia';
import {
  useInstancesState,
  useInstancesCrud,
  useInstanceEditing,
  useInstancesImportExport,
  useInstanceFrameUpdates,
} from '../../composables/frames/sendFrame/sendFrameInsComposable';
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import type {
  StrategyConfig,
  TriggerStrategyConfig,
  TriggerType,
  TriggerCondition,
  ConditionTriggerConfig,
  TimeTriggerConfig,
} from '../../types/frames/sendInstances';

export const useSendFrameInstancesStore = defineStore('sendFrameInstances', () => {
  // 使用组合式函数组织状态和方法
  const state = useInstancesState();
  const crud = useInstancesCrud(state);
  const editing = useInstanceEditing(state);
  const importExport = useInstancesImportExport(state);
  const frameUpdates = useInstanceFrameUpdates(state, crud);

  const showEditorDialog = ref(false);
  const isCreatingNewInstance = ref(false);

  // 新增：多帧全局策略配置
  const multiFrameStrategyConfig = useStorage<StrategyConfig>('multi-frame-strategy-config', {
    type: 'triggered',
    triggerType: 'condition',
    responseDelay: 0,
  });

  // 新增：触发配置状态（从triggerConfigStore迁移过来）
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
  function resetTriggerConfig() {
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

  // 新增：更新发送统计
  function updateSendStats(instanceId: string, incrementCount: boolean = true) {
    const instance = state.instances.value.find((i) => i.id === instanceId);
    if (!instance) {
      console.warn(`实例 ${instanceId} 不存在，无法更新发送统计`);
      return;
    }

    // 确保统计字段存在
    if (typeof instance.sendCount !== 'number') {
      instance.sendCount = 0;
    }

    // 更新统计
    if (incrementCount) {
      instance.sendCount++;
    }
    instance.lastSentAt = new Date();
    instance.updatedAt = new Date();

    // 保存到存储
    crud.updateInstance(instance);
  }

  // 新增：重置发送统计
  function resetSendStats(instanceId?: string) {
    if (instanceId) {
      const instance = state.instances.value.find((i) => i.id === instanceId);
      if (instance) {
        instance.sendCount = 0;
        delete instance.lastSentAt;
        instance.updatedAt = new Date();
        crud.updateInstance(instance);
      }
    } else {
      // 重置所有实例的发送统计
      state.instances.value.forEach((instance) => {
        instance.sendCount = 0;
        delete instance.lastSentAt;
        instance.updatedAt = new Date();
      });
      // 批量保存
      Promise.all(state.instances.value.map((instance) => crud.updateInstance(instance)));
    }
  }

  // 返回所有需要暴露的状态和方法
  return {
    // 状态
    instances: state.instances,
    currentInstanceId: state.currentInstanceId,
    currentInstance: state.currentInstance,
    instancesByFrameId: state.instancesByFrameId,
    favoriteInstances: state.favoriteInstances,
    isLoading: state.isLoading,
    error: state.error,
    localInstance: editing.localInstance,
    editedId: editing.editedId,
    editedDescription: editing.editedDescription,
    hexValues: editing.hexValues,
    showEditorDialog,
    isCreatingNewInstance,

    // 新增：多帧策略配置
    multiFrameStrategyConfig,

    // 新增：触发配置状态
    triggerType,
    responseDelay,
    sourceId,
    triggerFrameId,
    conditions,
    continueListening,
    executeTime,
    isRecurring,
    recurringType,
    recurringInterval,
    endTime,

    // 新增：计算属性
    conditionConfig,
    timeConfig,
    triggerStrategyConfig,

    // CRUD方法
    fetchInstances: crud.fetchInstances,
    createInstance: crud.createInstance,
    updateInstance: crud.updateInstance,
    deleteInstance: crud.deleteInstance,
    copyInstance: crud.copyInstance,
    toggleFavorite: crud.toggleFavorite,
    moveInstance: crud.moveInstance,

    // 编辑方法
    setCurrentInstance: editing.setCurrentInstance,
    updateFieldValue: editing.updateFieldValue,
    prepareForSave: editing.prepareForSave,
    saveEditedInstance: editing.saveEditedInstance,

    // 导入导出方法
    importFromJSON: importExport.importFromJSON,

    // 帧更新方法
    updateInstancesByFrameId: frameUpdates.updateInstancesByFrameId,

    // 新增：触发配置方法
    setTriggerType,
    setConditionConfig,
    setTimeConfig,
    loadFromStrategyConfig,
    resetTriggerConfig,

    // 新增：更新发送统计
    updateSendStats,

    // 新增：重置发送统计
    resetSendStats,
  };
});
