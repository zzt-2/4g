<script setup lang="ts">
import { computed } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { TaskStopCondition, TaskErrorPolicy, FieldVariation, ConditionTerm } from '../core';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';
import { ERROR_ACTION_OPTIONS } from './task-labels';

const props = defineProps<{
  readonly stopCondition?: TaskStopCondition;
  readonly errorPolicy: TaskErrorPolicy;
  readonly fieldVariations?: readonly FieldVariation[];
  readonly frameService: FrameAssetService;
  readonly disable?: boolean;
}>();

const emit = defineEmits<{
  'update:stopCondition': [value: TaskStopCondition | undefined];
  'update:errorPolicy': [value: TaskErrorPolicy];
  'update:fieldVariations': [value: FieldVariation[]];
}>();

const exitConditions = computed(() => props.stopCondition?.exitCondition ?? []);

function patchStopCondition(patch: Partial<TaskStopCondition>): void {
  const current = props.stopCondition ?? {};
  const next = { ...current, ...patch };
  emit('update:stopCondition', Object.keys(next).length > 0 ? next : undefined);
}

function patchErrorPolicy(patch: Partial<TaskErrorPolicy>): void {
  emit('update:errorPolicy', { ...props.errorPolicy, ...patch });
}

function addExitCondition(): void {
  const conds = [...exitConditions.value, { frameId: '', fieldId: '', operator: 'eq' as const, threshold: '' }];
  patchStopCondition({ exitCondition: conds });
}

function removeExitCondition(index: number): void {
  const conds = exitConditions.value.filter((_, i) => i !== index);
  patchStopCondition({ exitCondition: conds });
}

function updateExitCondition(index: number, term: ConditionTerm): void {
  const conds = exitConditions.value.map((c, i) => (i === index ? term : c));
  patchStopCondition({ exitCondition: conds });
}

function addFieldVariation(): void {
  const vars = [...(props.fieldVariations ?? []), { fieldId: '', values: [] }];
  emit('update:fieldVariations', vars);
}

function removeFieldVariation(index: number): void {
  const vars = (props.fieldVariations ?? []).filter((_, i) => i !== index);
  emit('update:fieldVariations', vars);
}

function updateFieldVariation(index: number, var_: FieldVariation): void {
  const vars = (props.fieldVariations ?? []).map((v, i) => (i === index ? var_ : v));
  emit('update:fieldVariations', vars);
}

function parseVariationValues(raw: string): (string | number)[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
</script>

<template>
  <q-expansion-item dense label="高级配置" header-class="rw-text-label text-sm" :disable="disable">
    <div class="pl-3 flex flex-col gap-3">
      <!-- Stop condition -->
      <q-input
        :model-value="stopCondition?.maxIterations"
        dense
        outlined
        type="number"
        label="最大迭代次数"
        :disable="disable"
        @update:model-value="patchStopCondition({ maxIterations: Number($event) || undefined })"
      />
      <q-input
        :model-value="stopCondition?.maxDurationMs"
        dense
        outlined
        type="number"
        label="最大持续时间 (ms)"
        :disable="disable"
        @update:model-value="patchStopCondition({ maxDurationMs: Number($event) || undefined })"
      />

      <!-- Exit conditions -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="rw-text-label text-xs">退出条件</span>
          <q-btn
            flat dense no-caps icon="o_add" label="添加"
            size="sm" color="primary"
            :disable="disable"
            @click="addExitCondition"
          />
        </div>
        <div
          v-for="(cond, ci) in exitConditions"
          :key="ci"
          class="flex items-center gap-1"
        >
          <ConditionTermEditor
            :model-value="cond"
            :frame-service="frameService"
            :show-logic-operator="ci > 0"
            direction="receive"
            :disable="disable"
            @update:model-value="updateExitCondition(ci, $event)"
          />
          <q-btn
            flat round dense icon="o_close" size="xs" color="negative"
            :disable="disable"
            @click="removeExitCondition(ci)"
          />
        </div>
      </div>

      <q-separator />

      <!-- Error policy -->
      <div>
        <span class="rw-text-label text-xs">失败策略</span>
        <q-select
          :model-value="errorPolicy.onFailure"
          :options="ERROR_ACTION_OPTIONS"
          :disable="disable"
          emit-value
          map-options
          outlined
          dense
          class="mt-1"
          @update:model-value="patchErrorPolicy({ onFailure: $event })"
        />
      </div>
      <q-input
        :model-value="errorPolicy.retryCount"
        dense
        outlined
        type="number"
        label="重试次数"
        :disable="disable || errorPolicy.onFailure !== 'retry'"
        @update:model-value="patchErrorPolicy({ retryCount: Number($event) || undefined })"
      />
      <q-input
        :model-value="errorPolicy.retryDelayMs"
        dense
        outlined
        type="number"
        label="重试间隔 (ms)"
        :disable="disable || errorPolicy.onFailure !== 'retry'"
        @update:model-value="patchErrorPolicy({ retryDelayMs: Number($event) || undefined })"
      />

      <q-separator />

      <!-- Field variations -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="rw-text-label text-xs">可变参数</span>
          <q-btn
            flat dense no-caps icon="o_add" label="添加"
            size="sm" color="primary"
            :disable="disable"
            @click="addFieldVariation"
          />
        </div>
        <div
          v-for="(var_, vi) in (fieldVariations ?? [])"
          :key="vi"
          class="flex items-center gap-2"
        >
          <q-input
            :model-value="var_.fieldId"
            dense
            outlined
            placeholder="字段 ID"
            class="w-40"
            @update:model-value="updateFieldVariation(vi, { ...var_, fieldId: $event ?? '' })"
          />
          <q-input
            :model-value="var_.values.join(', ')"
            dense
            outlined
            placeholder="值列表（逗号分隔）"
            class="flex-1"
            @update:model-value="updateFieldVariation(vi, { ...var_, values: parseVariationValues($event ?? '') })"
          />
          <q-btn
            flat round dense icon="o_close" size="xs" color="negative"
            :disable="disable"
            @click="removeFieldVariation(vi)"
          />
        </div>
      </div>
    </div>
  </q-expansion-item>
</template>
