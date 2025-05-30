<template>
  <div class="condition-trigger-panel space-y-4">
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
        @update:model-value="updateConfig"
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

    <!-- 触发条件配置 -->
    <div>
      <TriggerConditionList
        v-model:conditions="localConfig.conditions"
        :field-options="triggerFrameFields"
        @update:conditions="updateConfig"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ConditionTriggerConfig } from '../../../../types/frames/sendInstances';
import TriggerConditionList from './TriggerConditionList.vue';

const props = defineProps<{
  config: ConditionTriggerConfig;
  sourceOptions?: Array<{ id: string; name: string; description?: string }>;
  frameOptions?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string }> }>;
}>();

const emit = defineEmits<{
  'update:config': [config: ConditionTriggerConfig];
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

/**
 * 触发帧变化处理
 */
function onTriggerFrameChange() {
  // 当触发帧变化时，清空已有的条件
  localConfig.value = {
    ...localConfig.value,
    conditions: [],
  };
  updateConfig();
}

/**
 * 更新配置
 */
function updateConfig() {
  emit('update:config', { ...localConfig.value });
}
</script>

<style scoped>
.condition-trigger-panel {
  min-width: 400px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
