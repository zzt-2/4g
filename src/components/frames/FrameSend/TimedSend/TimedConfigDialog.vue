<template>
  <q-dialog v-model="show" persistent class="timed-config-dialog">
    <q-card class="config-card bg-industrial-panel border-industrial" style="min-width: 420px">
      <q-card-section class="bg-industrial-secondary">
        <div class="flex items-center justify-between">
          <div class="text-h6 text-industrial-primary flex items-center">
            <q-icon name="schedule" class="mr-2" />
            定时发送配置
          </div>
          <q-btn icon="close" flat round dense @click="cancel" class="text-industrial-secondary" />
        </div>
      </q-card-section>

      <q-card-section>
        <TimedConfigPanel :config="localConfig" @update:config="onConfigUpdate" />
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
import type { TimedStrategyConfig } from '../../../../types/frames/sendInstances';
import { validateTimedStrategy } from '../../../../utils/frames/strategyValidation';
import { createDefaultTimedConfig } from '../../../../utils/frames/defaultConfigs';
import TimedConfigPanel from './TimedConfigPanel.vue';

const props = defineProps<{
  modelValue: boolean;
  initialConfig?: TimedStrategyConfig;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [config: TimedStrategyConfig];
  cancel: [];
}>();

const show = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const localConfig = ref<TimedStrategyConfig>(props.initialConfig || createDefaultTimedConfig());

// 验证配置
const validation = computed(() => validateTimedStrategy(localConfig.value));
const validationErrors = computed(() => validation.value.errors);
const isValid = computed(() => validation.value.valid);

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
function onConfigUpdate(config: TimedStrategyConfig) {
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
  localConfig.value = createDefaultTimedConfig();
}
</script>

<style scoped>
.config-card {
  max-width: 500px;
}

.timed-config-dialog :deep(.q-dialog__inner) {
  padding: 16px;
}
</style>
