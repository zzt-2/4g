<script setup lang="ts">
import {
  IDENTIFIER_RULE_OPERATORS,
  IDENTIFIER_LOGIC_OPERATORS,
  type IdentifierRule,
} from '@/features/frame';
import { useStableKeys } from '@/shared/composables';
import { OPERATOR_LABELS } from './field-labels';

const props = defineProps<{
  rules: IdentifierRule[];
}>();

const emit = defineEmits<{
  'update:rules': [rules: IdentifierRule[]];
}>();

const { keys: ruleKeys, syncKeys: syncRuleKeys } = useStableKeys('rule');

syncRuleKeys(props.rules);

const operatorOptions = IDENTIFIER_RULE_OPERATORS.map((op) => ({
  value: op,
  label: OPERATOR_LABELS[op],
}));

const logicOptions = IDENTIFIER_LOGIC_OPERATORS.map((op) => ({
  value: op,
  label: op.toUpperCase(),
}));

function addRule(): void {
  const next = [
    ...props.rules,
    { startIndex: 0, endIndex: 0, operator: 'eq', value: '', logicOperator: 'and' },
  ];
  syncRuleKeys(next);
  emit('update:rules', next);
}

function removeRule(index: number): void {
  const next = [...props.rules];
  next.splice(index, 1);
  syncRuleKeys(next);
  emit('update:rules', next);
}

function updateRule(index: number, patch: Partial<IdentifierRule>): void {
  const next = [...props.rules];
  next[index] = { ...next[index], ...patch };
  emit('update:rules', next);
}
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="flex items-center justify-between q-mb-md">
        <span class="rw-text-label text-body2">帧识别规则</span>
        <q-btn
          flat
          dense
          no-caps
          icon="o_add"
          label="添加规则"
          color="primary"
          @click="addRule"
        />
      </div>

      <div v-if="rules.length === 0" class="rw-text-desc text-body2 q-pa-sm">
        暂无识别规则
      </div>

      <div
        v-for="(rule, index) in rules"
        :key="ruleKeys[index]"
        class="flex items-center gap-2 q-mb-sm"
      >
        <q-input
          outlined
          dense
          :model-value="rule.startIndex"
          type="number"
          label="起始"
          class="w-[80px]"
          @update:model-value="(v: string) => updateRule(index, { startIndex: Number(v) ?? 0 })"
        />
        <q-input
          outlined
          dense
          :model-value="rule.endIndex"
          type="number"
          label="结束"
          class="w-[80px]"
          @update:model-value="(v: string) => updateRule(index, { endIndex: Number(v) ?? 0 })"
        />
        <q-select
          outlined
          dense
          :model-value="rule.operator"
          :options="operatorOptions"
          emit-value
          map-options
          label="操作"
          class="w-[100px]"
          @update:model-value="(v: string) => updateRule(index, { operator: v as IdentifierRule['operator'] })"
        />
        <q-input
          outlined
          dense
          :model-value="rule.value"
          label="值"
          class="min-w-[120px] flex-1"
          @update:model-value="(v: string) => updateRule(index, { value: v })"
        />
        <q-select
          v-if="index > 0"
          outlined
          dense
          :model-value="rule.logicOperator"
          :options="logicOptions"
          emit-value
          map-options
          label="逻辑"
          class="w-[80px]"
          @update:model-value="(v: string) => updateRule(index, { logicOperator: v as IdentifierRule['logicOperator'] })"
        />
        <q-btn
          flat
          round
          dense
          icon="o_delete"
          color="negative"
          size="sm"
          @click="removeRule(index)"
        />
      </div>
    </q-card-section>
  </q-card>
</template>
