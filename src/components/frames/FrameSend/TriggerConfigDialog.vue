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
          :source-options="sourceOptions"
          :frame-options="frameOptions"
          @update:config="onConfigUpdate"
        />
      </q-card-section>

      <!-- 配置验证信息 -->
      <q-card-section v-if="validationErrors.length > 0" class="pt-0">
        <q-banner class="bg-red-900/20 text-red-300 border border-red-500">
          <template #avatar>
            <q-icon name="warning" color="red" />
          </template>
          <div class="text-sm">
            <div class="font-medium mb-1">配置存在以下问题：</div>
            <ul class="text-xs">
              <li v-for="error in validationErrors" :key="error" class="mb-1">• {{ error }}</li>
            </ul>
          </div>
        </q-banner>
      </q-card-section>

      <!-- 配置完整性提示 -->
      <q-card-section v-if="isValid && hasCompleteConfig" class="pt-0">
        <q-banner class="bg-green-900/20 text-green-300 border border-green-500">
          <template #avatar>
            <q-icon name="check_circle" color="green" />
          </template>
          <div class="text-sm">配置完整，可以开始触发发送</div>
        </q-banner>
      </q-card-section>

      <q-card-actions align="right" class="bg-industrial-secondary">
        <q-btn label="取消" @click="cancel" class="text-industrial-secondary" flat />
        <q-btn label="重置" @click="reset" color="warning" flat />
        <q-btn label="确定" @click="confirm" color="primary" :disable="!isValid" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { TriggerStrategyConfig } from '../../../types/frames/sendInstances';
import { validateTriggerStrategy } from '../../../utils/frames/strategyValidation';
import { createDefaultTriggerConfig } from '../../../utils/frames/defaultConfigs';
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

// 验证配置
const validation = computed(() => validateTriggerStrategy(localConfig.value));
const validationErrors = computed(() => validation.value.errors);
const isValid = computed(() => validation.value.valid);

// 检查配置完整性
const hasCompleteConfig = computed(() => {
  return (
    localConfig.value.sourceId &&
    localConfig.value.triggerFrameId &&
    localConfig.value.conditions.length > 0 &&
    localConfig.value.conditions.every((c) => c.fieldId && c.value)
  );
});

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
  if (!isValid.value) return;

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
