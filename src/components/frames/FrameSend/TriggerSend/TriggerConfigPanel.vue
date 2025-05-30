<template>
  <div class="trigger-config-panel space-y-4">
    <!-- 触发类型选择 -->
    <TriggerTypeSelector v-model="triggerStore.triggerType" />

    <!-- 响应延时配置 -->
    <div>
      <q-input
        v-model.number="triggerStore.responseDelay"
        type="number"
        label="响应延时(毫秒)"
        min="0"
        step="10"
        class="bg-industrial-panel text-industrial-primary"
        outlined
        dense
      >
        <template #prepend>
          <q-icon name="schedule" class="text-industrial-accent" />
        </template>
      </q-input>
    </div>

    <!-- 根据触发类型显示不同的配置面板 -->
    <div>
      <q-separator class="mb-3" />

      <!-- 条件触发配置 -->
      <ConditionTriggerPanel
        v-if="triggerStore.triggerType === 'condition'"
        :source-options="sourceOptions || []"
        :frame-options="frameOptions || []"
      />

      <!-- 时间触发配置 -->
      <TimeTriggerPanel v-else-if="triggerStore.triggerType === 'time'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTriggerConfigStore } from '../../../../stores/triggerConfigStore';
import TriggerTypeSelector from './TriggerTypeSelector.vue';
import ConditionTriggerPanel from './ConditionTriggerPanel.vue';
import TimeTriggerPanel from './TimeTriggerPanel.vue';

defineProps<{
  sourceOptions?: Array<{ id: string; name: string; description?: string }>;
  frameOptions?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string }> }>;
}>();

// 使用 store
const triggerStore = useTriggerConfigStore();
</script>

<style scoped>
.trigger-config-panel {
  min-width: 400px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
