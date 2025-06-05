<template>
  <div class="condition-trigger-panel space-y-4">
    <!-- 监听来源选择 -->
    <div>
      <q-select
        v-model="sendFrameInstancesStore.sourceId"
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

    <!-- 触发帧选择 - 只显示接收帧 -->
    <div>
      <q-select
        v-model="sendFrameInstancesStore.triggerFrameId"
        :options="receiveFrameOptions"
        option-value="id"
        option-label="name"
        label="触发帧（仅接收帧）"
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
            <q-item-section class="text-grey"> 无可用的接收帧 </q-item-section>
          </q-item>
        </template>
      </q-select>
    </div>

    <!-- 触发条件配置 -->
    <div>
      <TriggerConditionList :field-options="triggerFrameFields" />
    </div>

    <!-- 触发后行为配置 -->
    <div class="bg-industrial-highlight rounded p-3 border border-industrial">
      <div class="text-subtitle2 text-industrial-primary mb-3 flex items-center">
        <q-icon name="settings" class="mr-2" />
        触发后行为设置
      </div>

      <q-checkbox
        v-model="sendFrameInstancesStore.continueListening"
        label="触发后继续监听"
        color="primary"
        class="text-industrial-primary"
      />

      <div class="text-xs text-industrial-secondary mt-2 ml-6">
        {{
          sendFrameInstancesStore.continueListening
            ? '触发条件满足后，任务将继续监听并可能再次触发'
            : '触发条件满足后，任务将自动停止监听'
        }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSendFrameInstancesStore } from '../../../../stores/frames/sendFrameInstancesStore';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';
import TriggerConditionList from './TriggerConditionList.vue';

defineProps<{
  sourceOptions?: Array<{ id: string; name: string; description?: string }>;
}>();

// 使用 store
const sendFrameInstancesStore = useSendFrameInstancesStore();
const receiveFramesStore = useReceiveFramesStore();

// 接收帧选项（用于触发配置）
const receiveFrameOptions = computed(() =>
  receiveFramesStore.receiveFrames.map((frame) => ({
    id: frame.id,
    name: frame.name,
    fields:
      frame.fields?.map((field) => ({
        id: field.id,
        name: field.name,
      })) || [],
  })),
);

// 计算触发帧的字段选项
const triggerFrameFields = computed(() => {
  if (!sendFrameInstancesStore.triggerFrameId) return [];

  const selectedFrame = receiveFrameOptions.value.find(
    (frame) => frame.id === sendFrameInstancesStore.triggerFrameId,
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
  sendFrameInstancesStore.conditions = [];
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
