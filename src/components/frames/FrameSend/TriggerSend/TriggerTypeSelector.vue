<template>
  <div class="trigger-type-selector">
    <div class="text-subtitle2 text-industrial-primary mb-3">触发类型</div>
    <q-option-group
      v-model="triggerStore.triggerType"
      :options="triggerTypeOptions"
      inline
      class="trigger-type-options text-industrial-primary"
    />
    <div class="text-xs text-industrial-secondary mt-2">
      {{ getTypeDescription(triggerStore.triggerType) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTriggerConfigStore } from '../../../../stores/triggerConfigStore';
import type { TriggerType } from '../../../../types/frames/sendInstances';

// 使用 store
const triggerStore = useTriggerConfigStore();

const triggerTypeOptions = [
  { label: '条件触发', value: 'condition' },
  { label: '时间触发', value: 'time' },
];

/**
 * 获取类型描述
 */
function getTypeDescription(type: TriggerType): string {
  const descriptions = {
    condition: '监听数据帧，当满足指定条件时触发发送',
    time: '在指定的日期时间触发发送，支持一次性和重复执行',
  };
  return descriptions[type] || '';
}
</script>

<style scoped>
.trigger-type-selector {
  min-width: 300px;
}

.trigger-type-options {
  padding: 8px;
  background: rgba(15, 39, 68, 0.5);
  border-radius: 6px;
  border: 1px solid var(--industrial-border);
}

.trigger-type-options :deep(.q-radio) {
  margin-right: 16px;
}

.trigger-type-options :deep(.q-radio__label) {
  color: var(--industrial-text-primary);
  font-size: 14px;
}
</style>
