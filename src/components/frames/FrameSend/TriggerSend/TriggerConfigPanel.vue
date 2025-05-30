<template>
  <div class="trigger-config-panel space-y-4">
    <!-- 触发类型选择 -->
    <TriggerTypeSelector v-model="triggerType" @update:model-value="onTriggerTypeChange" />

    <!-- 响应延时配置 -->
    <div>
      <q-input
        v-model.number="localConfig.responseDelay"
        type="number"
        label="响应延时(毫秒)"
        min="0"
        step="10"
        class="bg-industrial-panel text-industrial-primary"
        outlined
        dense
        @update:model-value="updateConfig"
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
        v-if="triggerType === 'condition'"
        :config="conditionConfig"
        :source-options="sourceOptions || []"
        :frame-options="frameOptions || []"
        @update:config="onConditionConfigUpdate"
      />

      <!-- 时间触发配置 -->
      <TimeTriggerPanel
        v-else-if="triggerType === 'time'"
        :config="timeConfig"
        @update:config="onTimeConfigUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type {
  TriggerStrategyConfig,
  TriggerType,
  ConditionTriggerConfig,
  TimeTriggerConfig,
} from '../../../../types/frames/sendInstances';
import TriggerTypeSelector from './TriggerTypeSelector.vue';
import ConditionTriggerPanel from './ConditionTriggerPanel.vue';
import TimeTriggerPanel from './TimeTriggerPanel.vue';
import {
  createDefaultConditionTriggerConfig,
  createDefaultTimeTriggerConfig,
} from '../../../../utils/frames/defaultConfigs';

const props = defineProps<{
  config: TriggerStrategyConfig;
  sourceOptions?: Array<{ id: string; name: string; description?: string }>;
  frameOptions?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string }> }>;
}>();

const emit = defineEmits<{
  'update:config': [config: TriggerStrategyConfig];
}>();

const triggerType = ref<TriggerType>('condition');

// 默认配置
const conditionConfig = ref<ConditionTriggerConfig>(createDefaultConditionTriggerConfig());
const timeConfig = ref<TimeTriggerConfig>(createDefaultTimeTriggerConfig());

const localConfig = computed({
  get: () => props.config,
  set: (value) => emit('update:config', value),
});

// 监听配置变化，同步触发类型和子配置
watch(
  () => props.config,
  (newConfig) => {
    if (newConfig) {
      triggerType.value = newConfig.triggerType;

      if (newConfig.triggerType === 'condition') {
        conditionConfig.value = {
          triggerType: 'condition',
          sourceId: newConfig.sourceId || '',
          triggerFrameId: newConfig.triggerFrameId || '',
          conditions: newConfig.conditions || [],
        };
      } else if (newConfig.triggerType === 'time') {
        const timeConf: TimeTriggerConfig = {
          triggerType: 'time',
          executeTime: newConfig.executeTime || new Date().toISOString(),
          isRecurring: newConfig.isRecurring || false,
        };

        // 只在有值时添加可选字段
        if (newConfig.recurringType) {
          timeConf.recurringType = newConfig.recurringType;
        }
        if (newConfig.recurringInterval !== undefined) {
          timeConf.recurringInterval = newConfig.recurringInterval;
        }
        if (newConfig.endTime) {
          timeConf.endTime = newConfig.endTime;
        }

        timeConfig.value = timeConf;
      }
    }
  },
  { immediate: true },
);

/**
 * 触发类型变化处理
 */
function onTriggerTypeChange(type: TriggerType) {
  triggerType.value = type;
  updateConfig();
}

/**
 * 条件配置更新
 */
function onConditionConfigUpdate(config: ConditionTriggerConfig) {
  conditionConfig.value = config;
  updateConfig();
}

/**
 * 时间配置更新
 */
function onTimeConfigUpdate(config: TimeTriggerConfig) {
  timeConfig.value = config;
  updateConfig();
}

/**
 * 更新整体配置
 */
function updateConfig() {
  const baseConfig: TriggerStrategyConfig = {
    type: 'triggered',
    triggerType: triggerType.value,
    responseDelay: localConfig.value.responseDelay || 0,
  };

  if (triggerType.value === 'condition') {
    const config = conditionConfig.value;
    localConfig.value = {
      ...baseConfig,
      sourceId: config.sourceId,
      triggerFrameId: config.triggerFrameId,
      conditions: config.conditions,
    };
  } else if (triggerType.value === 'time') {
    const config = timeConfig.value;
    const newConfig: TriggerStrategyConfig = {
      ...baseConfig,
      executeTime: config.executeTime,
      isRecurring: config.isRecurring,
    };

    // 只在有值时添加可选字段
    if (config.recurringType) {
      newConfig.recurringType = config.recurringType;
    }
    if (config.recurringInterval !== undefined) {
      newConfig.recurringInterval = config.recurringInterval;
    }
    if (config.endTime) {
      newConfig.endTime = config.endTime;
    }

    localConfig.value = newConfig;
  }
}
</script>

<style scoped>
.trigger-config-panel {
  min-width: 400px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
