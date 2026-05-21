<script setup lang="ts">
import { computed, inject } from 'vue';
import {
  EXPRESSION_SOURCE_TYPES,
  type ExpressionDefinition,
  type ExpressionVariableDefinition,
  type ConditionalExpressionDefinition,
} from '@/features/frame';
import {
  FRAME_EDITOR_KEY,
} from '../composables/injection-key';
import { useStableKeys } from '@/shared/composables';
import { SOURCE_TYPE_LABELS } from './field-labels';

const props = defineProps<{
  expression: ExpressionDefinition;
}>();

const emit = defineEmits<{
  'update:expression': [expression: ExpressionDefinition];
}>();

const ctx = inject(FRAME_EDITOR_KEY)!;

const { keys: varKeys, syncKeys: syncVarKeys } = useStableKeys('var');
const { keys: condKeys, syncKeys: syncCondKeys } = useStableKeys('cond');

syncVarKeys(props.expression.variables);
syncCondKeys(props.expression.expressions);

const sourceTypeOptions = EXPRESSION_SOURCE_TYPES.map((t) => ({
  value: t,
  label: SOURCE_TYPE_LABELS[t],
}));

const frameOptions = computed(() => ctx.listFrameReferences());

function getFieldOptions(frameId: string) {
  return ctx.listFieldReferences(frameId);
}

function updateExpression(patch: Partial<ExpressionDefinition>): void {
  emit('update:expression', { ...props.expression, ...patch });
}

function updateVariable(
  index: number,
  patch: Partial<ExpressionVariableDefinition>,
): void {
  const variables = props.expression.variables.map((v, i) =>
    i === index ? { ...v, ...patch } : v,
  );
  updateExpression({ variables });
}

function addVariable(): void {
  const variables = [
    ...props.expression.variables,
    { identifier: '', sourceType: 'current_field' as const },
  ];
  syncVarKeys(variables);
  updateExpression({ variables });
}

function removeVariable(index: number): void {
  const variables = props.expression.variables.filter((_, i) => i !== index);
  syncVarKeys(variables);
  updateExpression({ variables });
}

function updateConditional(
  index: number,
  patch: Partial<ConditionalExpressionDefinition>,
): void {
  const expressions = props.expression.expressions.map((e, i) =>
    i === index ? { ...e, ...patch } : e,
  );
  updateExpression({ expressions });
}

function addConditional(): void {
  const expressions = [
    ...props.expression.expressions,
    { condition: '', expression: '' },
  ];
  syncCondKeys(expressions);
  updateExpression({ expressions });
}

function removeConditional(index: number): void {
  const expressions = props.expression.expressions.filter(
    (_, i) => i !== index,
  );
  syncCondKeys(expressions);
  updateExpression({ expressions });
}
</script>

<template>
  <div>
    <!-- Variable mappings -->
    <div class="rw-text-label text-caption mb-2">变量映射</div>
    <div
      v-for="(variable, vi) in expression.variables"
      :key="varKeys[vi]"
      class="flex items-center gap-2 mb-1"
    >
      <q-input
        outlined
        dense
        :model-value="variable.identifier"
        placeholder="标识符"
        class="w-[100px]"
        @update:model-value="(v: string) => updateVariable(vi, { identifier: v })"
      />
      <q-select
        outlined
        dense
        :model-value="variable.sourceType"
        :options="sourceTypeOptions"
        emit-value
        map-options
        class="w-[120px]"
        @update:model-value="(v: string) => updateVariable(vi, { sourceType: v })"
      />
      <template v-if="variable.sourceType === 'frame_field'">
        <q-select
          outlined
          dense
          :model-value="variable.frameId"
          :options="frameOptions"
          emit-value
          map-options
          option-value="value"
          option-label="label"
          placeholder="选择帧"
          class="flex-1"
          @update:model-value="(v: string) => updateVariable(vi, { frameId: v, fieldId: undefined })"
        />
        <q-select
          v-if="variable.frameId"
          outlined
          dense
          :model-value="variable.fieldId"
          :options="getFieldOptions(variable.frameId ?? '')"
          emit-value
          map-options
          option-value="fieldId"
          option-label="fieldName"
          placeholder="选择字段"
          class="flex-1"
          @update:model-value="(v: string) => updateVariable(vi, { fieldId: v })"
        />
      </template>
      <q-btn
        flat
        round
        dense
        icon="o_delete"
        size="xs"
        color="negative"
        @click="removeVariable(vi)"
      />
    </div>
    <q-btn
      flat
      dense
      no-caps
      icon="o_add"
      label="添加变量"
      color="primary"
      size="sm"
      @click="addVariable"
    />

    <!-- Conditional expressions -->
    <div class="rw-text-label text-caption mt-3 mb-2">条件表达式</div>
    <div
      v-for="(cond, ci) in expression.expressions"
      :key="condKeys[ci]"
      class="mb-2"
    >
      <div class="flex items-center gap-2">
        <q-input
          outlined
          dense
          :model-value="cond.condition"
          placeholder="条件"
          class="flex-1"
          @update:model-value="(v: string) => updateConditional(ci, { condition: v })"
        />
        <q-input
          outlined
          dense
          :model-value="cond.expression"
          placeholder="表达式"
          class="flex-1"
          @update:model-value="(v: string) => updateConditional(ci, { expression: v })"
        />
        <q-btn
          flat
          round
          dense
          icon="o_delete"
          size="xs"
          color="negative"
          @click="removeConditional(ci)"
        />
      </div>
    </div>
    <q-btn
      flat
      dense
      no-caps
      icon="o_add"
      label="添加表达式"
      color="primary"
      size="sm"
      @click="addConditional"
    />
  </div>
</template>
