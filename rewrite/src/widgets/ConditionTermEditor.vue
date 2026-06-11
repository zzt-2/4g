<script setup lang="ts">
import { computed, watch } from 'vue';
import type { FrameDirection } from '@/features/frame';
import type { FrameAssetService } from '@/features/frame';
import type { ConditionTerm, ComparisonOperator } from '@/features/task/core';
import { COMPARISON_OPERATORS } from '@/features/task/core';
import FrameSelector from '@/features/frame/components/FrameSelector.vue';
import { COMPARISON_OPERATOR_LABELS, LOGIC_OPERATOR_OPTIONS } from '@/features/task/components/task-labels';

const props = withDefaults(defineProps<{
  readonly modelValue: ConditionTerm;
  readonly frameService: FrameAssetService;
  readonly showLogicOperator?: boolean;
  readonly direction?: FrameDirection;
  readonly disable?: boolean;
}>(), {
  showLogicOperator: false,
  direction: undefined,
  disable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: ConditionTerm];
}>();

const frameId = computed(() => props.modelValue.frameId);

const fieldOptions = computed(() => {
  if (!frameId.value) return [];
  return props.frameService.listFieldReferences({ frameId: frameId.value, direction: props.direction }).map((f) => ({
    value: f.fieldId,
    label: f.fieldName,
  }));
});

const operatorOptions = computed(() =>
  COMPARISON_OPERATORS.map((op) => ({
    value: op,
    label: COMPARISON_OPERATOR_LABELS[op],
  })),
);

function patch(patch: Partial<ConditionTerm>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

watch(frameId, () => {
  if (!fieldOptions.value.some((f) => f.value === props.modelValue.fieldId)) {
    patch({ fieldId: '', threshold: '' });
  }
});
</script>

<template>
  <div class="flex items-center gap-2">
    <QBtnToggle
      v-if="showLogicOperator"
      :model-value="modelValue.logicOperator ?? 'and'"
      :options="LOGIC_OPERATOR_OPTIONS"
      dense
      flat
      no-caps
      size="sm"
      class="shrink-0"
      @update:model-value="patch({ logicOperator: $event as 'and' | 'or' })"
    />
    <FrameSelector
      :frame-service="frameService"
      :model-value="modelValue.frameId || null"
      :direction="direction"
      label="帧"
      :disable="disable"
      class="w-32 shrink-0"
      @update:model-value="patch({ frameId: $event ?? '' })"
    />
    <q-select
      :model-value="modelValue.fieldId"
      :options="fieldOptions"
      :disable="disable || !frameId"
      outlined
      dense
      emit-value
      map-options
      clearable
      placeholder="字段"
      class="w-32 shrink-0"
      @update:model-value="patch({ fieldId: $event ?? '', threshold: '' })"
    />
    <q-select
      :model-value="modelValue.operator"
      :options="operatorOptions"
      :disable="disable"
      outlined
      dense
      emit-value
      map-options
      class="w-28 shrink-0"
      @update:model-value="patch({ operator: $event as ComparisonOperator })"
    />
    <q-input
      :model-value="String(modelValue.threshold)"
      :disable="disable"
      outlined
      dense
      placeholder="阈值"
      class="flex-1 min-w-0"
      @update:model-value="patch({ threshold: $event ?? '' })"
    />
  </div>
</template>
