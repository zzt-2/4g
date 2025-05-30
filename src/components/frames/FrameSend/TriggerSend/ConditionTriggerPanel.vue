<template>
  <div class="condition-trigger-panel space-y-4">
    <!-- 监听来源选择 -->
    <div>
      <q-select
        v-model="triggerStore.sourceId"
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
        v-model="triggerStore.triggerFrameId"
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
        v-model:conditions="triggerStore.conditions"
        :field-options="triggerFrameFields"
      />
    </div>

    <!-- 触发后行为配置 -->
    <div class="bg-industrial-highlight rounded p-3 border border-industrial">
      <div class="text-subtitle2 text-industrial-primary mb-3 flex items-center">
        <q-icon name="settings" class="mr-2" />
        触发后行为设置
      </div>

      <q-checkbox
        v-model="triggerStore.continueListening"
        label="触发后继续监听"
        color="primary"
        class="text-industrial-primary"
      />

      <div class="text-xs text-industrial-secondary mt-2 ml-6">
        {{
          triggerStore.continueListening
            ? '触发条件满足后，任务将继续监听并可能再次触发'
            : '触发条件满足后，任务将自动停止监听'
        }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTriggerConfigStore } from '../../../../stores/triggerConfigStore';
import TriggerConditionList from './TriggerConditionList.vue';

const props = defineProps<{
  sourceOptions?: Array<{ id: string; name: string; description?: string }>;
  frameOptions?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string }> }>;
}>();

// 使用 store
const triggerStore = useTriggerConfigStore();

// 计算触发帧的字段选项
const triggerFrameFields = computed(() => {
  if (!triggerStore.triggerFrameId) return [];

  const selectedFrame = props.frameOptions?.find(
    (frame) => frame.id === triggerStore.triggerFrameId,
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
  triggerStore.conditions = [];
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
