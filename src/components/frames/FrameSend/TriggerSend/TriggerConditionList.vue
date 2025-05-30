<template>
  <div class="trigger-condition-list space-y-3">
    <div class="flex items-center justify-between mb-3">
      <div class="text-subtitle2 text-industrial-primary">触发条件</div>
      <q-btn
        size="sm"
        color="primary"
        icon="add"
        label="添加条件"
        @click="addCondition"
        class="text-xs"
      />
    </div>

    <div v-if="localConditions.length === 0" class="text-center p-4 text-industrial-secondary">
      <q-icon name="info" size="24px" class="mb-2" />
      <div>暂无触发条件，请点击"添加条件"按钮添加</div>
    </div>

    <div v-for="(condition, index) in localConditions" :key="condition.id" class="condition-item">
      <q-card class="bg-industrial-panel border border-industrial">
        <q-card-section class="p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium text-industrial-accent">条件 {{ index + 1 }}</div>
            <div class="flex items-center space-x-1">
              <!-- 逻辑运算符 -->
              <q-select
                v-if="index > 0"
                v-model="condition.logicOperator"
                :options="[
                  { label: '并且', value: 'and' },
                  { label: '或者', value: 'or' },
                ]"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                dense
                class="w-20 text-xs"
                @update:model-value="updateCondition(index, condition)"
              />
              <q-btn
                size="xs"
                color="negative"
                icon="delete"
                flat
                round
                @click="removeCondition(index)"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <!-- 字段选择 -->
            <q-select
              v-model="condition.fieldId"
              :options="fieldOptions"
              option-value="id"
              option-label="label"
              label="字段"
              emit-value
              map-options
              dense
              class="bg-industrial-highlight"
              @update:model-value="updateCondition(index, condition)"
            >
              <template #no-option>
                <q-item>
                  <q-item-section class="text-grey"> 请先选择触发帧 </q-item-section>
                </q-item>
              </template>
            </q-select>

            <!-- 条件选择 -->
            <q-select
              v-model="condition.condition"
              :options="[
                { label: '等于', value: 'equals' },
                { label: '不等于', value: 'not_equals' },
                { label: '大于', value: 'greater' },
                { label: '小于', value: 'less' },
                { label: '包含', value: 'contains' },
              ]"
              option-value="value"
              option-label="label"
              label="条件"
              emit-value
              map-options
              dense
              class="bg-industrial-highlight"
              @update:model-value="updateCondition(index, condition)"
            />

            <!-- 值输入 -->
            <q-input
              v-model="condition.value"
              label="值"
              dense
              class="bg-industrial-highlight"
              @update:model-value="updateCondition(index, condition)"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { nanoid } from 'nanoid';
import type { TriggerCondition } from '../../../../types/frames/sendInstances';

const props = defineProps<{
  conditions: TriggerCondition[];
  fieldOptions?: Array<{ id: string; label: string }>;
}>();

const emit = defineEmits<{
  'update:conditions': [conditions: TriggerCondition[]];
}>();

const localConditions = computed({
  get: () => props.conditions,
  set: (value) => emit('update:conditions', value),
});

/**
 * 添加新条件
 */
function addCondition() {
  const newCondition: TriggerCondition = {
    id: nanoid(),
    fieldId: '',
    condition: 'equals',
    value: '',
    logicOperator: 'and',
  };

  localConditions.value = [...localConditions.value, newCondition];
}

/**
 * 删除条件
 */
function removeCondition(index: number) {
  const newConditions = [...localConditions.value];
  newConditions.splice(index, 1);
  localConditions.value = newConditions;
}

/**
 * 更新条件
 */
function updateCondition(index: number, condition: TriggerCondition) {
  const newConditions = [...localConditions.value];
  newConditions[index] = { ...condition };
  localConditions.value = newConditions;
}
</script>

<style scoped>
.trigger-condition-list {
  min-width: 400px;
}

.condition-item {
  position: relative;
}

.space-y-3 > * + * {
  margin-top: 0.75rem;
}

.space-x-1 > * + * {
  margin-left: 0.25rem;
}

.grid {
  display: grid;
}

.grid-cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.gap-2 {
  gap: 0.5rem;
}

.w-20 {
  width: 5rem;
}
</style>
