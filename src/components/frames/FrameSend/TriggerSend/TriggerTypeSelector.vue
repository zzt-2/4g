<template>
  <div class="trigger-type-selector">
    <div class="text-subtitle2 text-industrial-primary mb-3">触发类型</div>
    <q-option-group
      v-model="selectedType"
      :options="triggerTypeOptions"
      color="primary"
      inline
      class="trigger-type-options"
      @update:model-value="onTypeChange"
    />
    <div class="text-xs text-industrial-secondary mt-2">
      {{ getTypeDescription(selectedType) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TriggerType } from '../../../../types/frames/sendInstances';

const props = defineProps<{
  modelValue: TriggerType;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TriggerType];
}>();

const selectedType = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

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

/**
 * 类型变化处理
 */
function onTypeChange(type: TriggerType) {
  selectedType.value = type;
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
