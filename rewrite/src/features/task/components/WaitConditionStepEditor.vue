<script setup lang="ts">
import { computed } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { WaitConditionConfig, ConditionTerm } from '../core';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';
import { ON_TIMEOUT_OPTIONS } from './task-labels';

const props = defineProps<{
  readonly step: WaitConditionConfig;
  readonly stepName: string;
  readonly frameService: FrameAssetService;
  readonly disable?: boolean;
}>();

const emit = defineEmits<{
  'update:step': [config: WaitConditionConfig];
  'update:stepName': [name: string];
}>();

const conditions = computed(() => props.step.conditions);

function patchConfig(patch: Partial<WaitConditionConfig>): void {
  emit('update:step', { ...props.step, ...patch });
}

function addCondition(): void {
  const term: ConditionTerm = { frameId: '', fieldId: '', operator: 'eq', threshold: '' };
  patchConfig({ conditions: [...conditions.value, term] });
}

function removeCondition(index: number): void {
  patchConfig({ conditions: conditions.value.filter((_, i) => i !== index) });
}

function updateCondition(index: number, term: ConditionTerm): void {
  patchConfig({ conditions: conditions.value.map((c, i) => (i === index ? term : c)) });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <q-input
      :model-value="stepName"
      :disable="disable"
      dense
      outlined
      label="步骤名称"
      @update:model-value="emit('update:stepName', $event ?? '')"
    />

    <!-- Condition list -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="rw-text-label text-xs">等待条件</span>
        <q-btn
          flat dense no-caps icon="o_add" label="添加"
          size="sm" color="primary"
          :disable="disable"
          @click="addCondition"
        />
      </div>

      <div class="flex flex-col gap-2 pl-2">
        <div
          v-for="(cond, ci) in conditions"
          :key="ci"
          class="flex items-center gap-1"
        >
          <ConditionTermEditor
            :model-value="cond"
            :frame-service="frameService"
            :show-logic-operator="ci > 0"
            direction="receive"
            :disable="disable"
            @update:model-value="updateCondition(ci, $event)"
          />
          <q-btn
            flat round dense icon="o_close" size="xs" color="negative"
            :disable="disable"
            @click="removeCondition(ci)"
          />
        </div>
      </div>

      <div v-if="conditions.length === 0" class="rw-text-desc text-xs pl-2">
        至少添加一条条件
      </div>
    </div>

    <q-input
      :model-value="step.timeoutMs"
      :disable="disable"
      dense
      outlined
      type="number"
      label="超时时间 (ms)"
      :rules="[(val: number) => !val || val > 0 || '超时时间必须大于0']"
      @update:model-value="patchConfig({ timeoutMs: Number($event) || undefined })"
    />

    <div>
      <span class="rw-text-label text-xs">超时策略</span>
      <q-select
        :model-value="step.onTimeout"
        :options="ON_TIMEOUT_OPTIONS"
        :disable="disable"
        emit-value
        map-options
        outlined
        dense
        class="mt-1"
        @update:model-value="patchConfig({ onTimeout: $event as WaitConditionConfig['onTimeout'] })"
      />
    </div>
  </div>
</template>
