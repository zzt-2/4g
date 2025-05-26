<template>
  <div class="trigger-config-panel space-y-4">
    <!-- 基础配置 -->
    <div class="space-y-3">
      <!-- 监听来源选择 -->
      <div>
        <q-select
          v-model="localConfig.sourceId"
          :options="sourceOptions"
          option-value="id"
          option-label="name"
          label="监听来源"
          emit-value
          map-options
          clearable
          class="bg-industrial-panel text-industrial-primary"
          outlined
          dense
        >
          <template #prepend>
            <q-icon name="sensors" class="text-industrial-accent" />
          </template>
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey"> 无可用的监听来源 </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>

      <!-- 触发帧选择 -->
      <div>
        <q-select
          v-model="localConfig.triggerFrameId"
          :options="frameOptions"
          option-value="id"
          option-label="name"
          label="触发帧"
          emit-value
          map-options
          clearable
          class="bg-industrial-panel text-industrial-primary"
          outlined
          dense
          @update:model-value="onTriggerFrameChange"
        >
          <template #prepend>
            <q-icon name="frame_source" class="text-industrial-accent" />
          </template>
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey"> 无可用的触发帧 </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>

      <!-- 响应延时 -->
      <div>
        <q-input
          v-model.number="localConfig.responseDelay"
          type="number"
          label="响应延时(毫秒)"
          min="0"
          step="10"
          :rules="[(val) => val >= 0 || '延时不能为负数']"
          class="bg-industrial-panel text-industrial-primary"
          outlined
          dense
        >
          <template #prepend>
            <q-icon name="schedule" class="text-industrial-accent" />
          </template>
        </q-input>
      </div>
    </div>

    <!-- 触发条件配置 -->
    <div>
      <q-separator class="mb-3" />
      <TriggerConditionList
        v-model:conditions="localConfig.conditions"
        :field-options="triggerFrameFields"
      />
    </div>

    <!-- 配置预览 -->
    <div class="bg-industrial-highlight p-3 rounded border border-industrial">
      <div class="text-industrial-accent mb-2 font-medium">配置预览：</div>
      <div class="text-industrial-secondary text-sm space-y-1">
        <div>
          <q-icon name="sensors" size="16px" class="mr-1" />
          监听来源: {{ getSourceName(localConfig.sourceId) }}
        </div>
        <div>
          <q-icon name="frame_source" size="16px" class="mr-1" />
          触发帧: {{ getFrameName(localConfig.triggerFrameId) }}
        </div>
        <div v-if="(localConfig.responseDelay || 0) > 0">
          <q-icon name="schedule" size="16px" class="mr-1" />
          响应延时: {{ localConfig.responseDelay }}毫秒
        </div>
        <div>
          <q-icon name="rule" size="16px" class="mr-1" />
          触发条件: {{ localConfig.conditions.length }}个条件
        </div>
      </div>
    </div>

    <!-- 快捷配置按钮 -->
    <div class="flex gap-2 flex-wrap">
      <q-btn
        size="sm"
        color="grey-7"
        outline
        @click="addQuickCondition('equals')"
        class="text-xs"
        :disable="!canAddQuickCondition"
      >
        快速添加"等于"条件
      </q-btn>
      <q-btn
        size="sm"
        color="grey-7"
        outline
        @click="clearAllConditions"
        class="text-xs"
        :disable="localConfig.conditions.length === 0"
      >
        清空所有条件
      </q-btn>
    </div>

    <!-- 验证提示 -->
    <div v-if="validationErrors.length > 0" class="bg-red-900/20 border border-red-500 rounded p-3">
      <div class="text-red-400 text-sm">
        <q-icon name="warning" size="16px" class="mr-1" />
        配置错误：
      </div>
      <ul class="text-red-300 text-xs mt-1 ml-4">
        <li v-for="error in validationErrors" :key="error">{{ error }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { nanoid } from 'nanoid';
import type { TriggerStrategyConfig, TriggerCondition } from '../../../types/frames/sendInstances';
import { validateTriggerStrategy } from '../../../utils/frames/strategyValidation';
import { createDefaultTriggerCondition } from '../../../utils/frames/defaultConfigs';
import TriggerConditionList from './TriggerConditionList.vue';

const props = defineProps<{
  config: TriggerStrategyConfig;
  sourceOptions?: Array<{ id: string; name: string; description?: string }> | undefined;
  frameOptions?:
    | Array<{ id: string; name: string; fields?: Array<{ id: string; name: string }> }>
    | undefined;
}>();

const emit = defineEmits<{
  'update:config': [config: TriggerStrategyConfig];
}>();

const localConfig = computed({
  get: () => props.config,
  set: (value) => emit('update:config', value),
});

// 计算触发帧的字段选项
const triggerFrameFields = computed(() => {
  if (!localConfig.value.triggerFrameId) return [];

  const selectedFrame = props.frameOptions?.find(
    (frame) => frame.id === localConfig.value.triggerFrameId,
  );

  return (
    selectedFrame?.fields?.map((field) => ({
      id: field.id,
      label: field.name,
    })) || []
  );
});

// 验证错误
const validationErrors = computed(() => {
  const validation = validateTriggerStrategy(localConfig.value);
  return validation.errors;
});

// 是否可以添加快捷条件
const canAddQuickCondition = computed(() => {
  return localConfig.value.triggerFrameId && triggerFrameFields.value.length > 0;
});

/**
 * 获取监听来源名称
 */
function getSourceName(sourceId: string): string {
  if (!sourceId) return '未选择';
  const source = props.sourceOptions?.find((s) => s.id === sourceId);
  return source?.name || sourceId;
}

/**
 * 获取触发帧名称
 */
function getFrameName(frameId: string): string {
  if (!frameId) return '未选择';
  const frame = props.frameOptions?.find((f) => f.id === frameId);
  return frame?.name || frameId;
}

/**
 * 触发帧变化时的处理
 */
function onTriggerFrameChange() {
  // 清空现有条件，因为字段可能已经不匹配
  localConfig.value = {
    ...localConfig.value,
    conditions: [],
  };
}

/**
 * 添加快捷条件
 */
function addQuickCondition(conditionType: TriggerCondition['condition']) {
  if (!canAddQuickCondition.value) return;

  const firstField = triggerFrameFields.value[0];
  if (!firstField) return;

  const newCondition = createDefaultTriggerCondition();
  newCondition.fieldId = firstField.id;
  newCondition.condition = conditionType;

  localConfig.value = {
    ...localConfig.value,
    conditions: [...localConfig.value.conditions, newCondition],
  };
}

/**
 * 清空所有条件
 */
function clearAllConditions() {
  localConfig.value = {
    ...localConfig.value,
    conditions: [],
  };
}
</script>

<style scoped>
.trigger-config-panel {
  min-width: 400px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-y-3 > * + * {
  margin-top: 0.75rem;
}

.space-y-1 > * + * {
  margin-top: 0.25rem;
}
</style>
