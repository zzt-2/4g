<template>
  <q-dialog v-model="show" persistent class="trigger-config-dialog">
    <q-card class="config-card bg-industrial-panel border-industrial" style="min-width: 500px">
      <q-card-section class="bg-industrial-secondary">
        <div class="flex items-center justify-between">
          <div class="text-h6 text-industrial-primary flex items-center">
            <q-icon name="sensors" class="mr-2" />
            触发发送配置
          </div>
          <q-btn icon="close" flat round dense @click="cancel" class="text-industrial-secondary" />
        </div>
      </q-card-section>

      <q-card-section>
        <TriggerConfigPanel
          :config="localConfig"
          :source-options="sourceOptions || []"
          :frame-options="frameOptions || []"
          @update:config="onConfigUpdate"
        />
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn label="取消" @click="cancel" class="text-industrial-secondary" flat />
        <q-btn label="重置" @click="reset" color="warning" flat />
        <q-btn label="确定" @click="confirm" color="primary" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { TriggerStrategyConfig } from '../../../../types/frames/sendInstances';
import { createDefaultTriggerConfig } from '../../../../utils/frames/defaultConfigs';
import TriggerConfigPanel from './TriggerConfigPanel.vue';

const props = defineProps<{
  modelValue: boolean;
  initialConfig?: TriggerStrategyConfig;
  sourceOptions?: Array<{ id: string; name: string; description?: string }>;
  frameOptions?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string }> }>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [config: TriggerStrategyConfig];
  cancel: [];
}>();

const show = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const localConfig = ref<TriggerStrategyConfig>(props.initialConfig || createDefaultTriggerConfig());

// 监听初始配置变化
watch(
  () => props.initialConfig,
  (newConfig) => {
    if (newConfig) {
      localConfig.value = { ...newConfig };
    }
  },
  { immediate: true },
);

// 监听对话框打开，重置配置
watch(show, (isOpen) => {
  if (isOpen && props.initialConfig) {
    localConfig.value = { ...props.initialConfig };
  }
});

/**
 * 更新配置
 */
function onConfigUpdate(config: TriggerStrategyConfig) {
  localConfig.value = config;
}

/**
 * 确认配置
 */
function confirm() {
  emit('confirm', { ...localConfig.value });
  show.value = false;
}

/**
 * 取消配置
 */
function cancel() {
  emit('cancel');
  show.value = false;
}

/**
 * 重置配置
 */
function reset() {
  localConfig.value = createDefaultTriggerConfig();
}
</script>

<style scoped>
.config-card {
  max-width: 600px;
}

.trigger-config-dialog :deep(.q-dialog__inner) {
  padding: 16px;
}
</style>
