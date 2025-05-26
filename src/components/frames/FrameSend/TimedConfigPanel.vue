<template>
  <div class="timed-config-panel space-y-4">
    <!-- 发送间隔配置 -->
    <div>
      <q-input
        v-model.number="localConfig.sendInterval"
        type="number"
        label="发送间隔(毫秒)"
        min="100"
        step="100"
        :rules="[
          (val) => val >= 100 || '发送间隔不能小于100毫秒',
          (val) => val <= 3600000 || '发送间隔不能超过1小时',
        ]"
        class="bg-industrial-panel text-industrial-primary"
        outlined
        dense
      >
        <template #append>
          <q-icon name="schedule" class="text-industrial-accent" />
        </template>
      </q-input>
    </div>

    <!-- 重复设置 -->
    <div class="space-y-2">
      <q-checkbox
        v-model="localConfig.isInfinite"
        label="无限循环"
        color="primary"
        class="text-industrial-primary"
      />

      <q-input
        v-if="!localConfig.isInfinite"
        v-model.number="localConfig.repeatCount"
        type="number"
        label="重复次数"
        min="1"
        step="1"
        :rules="[(val) => val >= 1 || '重复次数必须大于0']"
        class="bg-industrial-panel text-industrial-primary"
        outlined
        dense
      >
        <template #append>
          <q-icon name="repeat" class="text-industrial-accent" />
        </template>
      </q-input>
    </div>

    <!-- 开始延时配置 -->
    <div>
      <q-input
        v-model.number="localConfig.startDelay"
        type="number"
        label="开始延时(毫秒)"
        min="0"
        step="100"
        :rules="[(val) => val >= 0 || '延时不能为负数']"
        class="bg-industrial-panel text-industrial-primary"
        outlined
        dense
      >
        <template #append>
          <q-icon name="timer" class="text-industrial-accent" />
        </template>
      </q-input>
    </div>

    <!-- 配置预览 -->
    <div class="bg-industrial-highlight p-3 rounded border border-industrial">
      <div class="text-industrial-accent mb-2 font-medium">配置预览：</div>
      <div class="text-industrial-secondary text-sm space-y-1">
        <div>
          <q-icon name="schedule" size="16px" class="mr-1" />
          每 {{ formatInterval(localConfig.sendInterval) }} 发送一次
        </div>
        <div>
          <q-icon name="repeat" size="16px" class="mr-1" />
          {{ localConfig.isInfinite ? '无限循环' : `重复 ${localConfig.repeatCount} 次` }}
        </div>
        <div v-if="(localConfig.startDelay || 0) > 0">
          <q-icon name="timer" size="16px" class="mr-1" />
          延时 {{ formatInterval(localConfig.startDelay || 0) }} 后开始
        </div>
        <div class="text-industrial-id">
          <q-icon name="info" size="16px" class="mr-1" />
          总耗时约: {{ formatTotalTime() }}
        </div>
      </div>
    </div>

    <!-- 快捷配置按钮 -->
    <div class="flex gap-2 flex-wrap">
      <q-btn size="sm" color="grey-7" outline @click="applyPreset(1000, 10)" class="text-xs">
        1秒间隔 × 10次
      </q-btn>
      <q-btn size="sm" color="grey-7" outline @click="applyPreset(5000, 5)" class="text-xs">
        5秒间隔 × 5次
      </q-btn>
      <q-btn size="sm" color="grey-7" outline @click="applyPreset(1000, 0, true)" class="text-xs">
        1秒间隔无限循环
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TimedStrategyConfig } from '../../../types/frames/sendInstances';

const props = defineProps<{
  config: TimedStrategyConfig;
}>();

const emit = defineEmits<{
  'update:config': [config: TimedStrategyConfig];
}>();

const localConfig = computed({
  get: () => props.config,
  set: (value) => emit('update:config', value),
});

/**
 * 格式化时间间隔显示
 */
function formatInterval(ms: number): string {
  if (ms < 1000) {
    return `${ms}毫秒`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}秒`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
  }
}

/**
 * 计算总耗时
 */
function formatTotalTime(): string {
  const { sendInterval, repeatCount, isInfinite, startDelay } = localConfig.value;

  if (isInfinite) {
    return '无限';
  }

  const totalTime = (startDelay || 0) + sendInterval * repeatCount;
  return formatInterval(totalTime);
}

/**
 * 应用预设配置
 */
function applyPreset(interval: number, count: number, infinite = false) {
  emit('update:config', {
    ...localConfig.value,
    sendInterval: interval,
    repeatCount: count,
    isInfinite: infinite,
  });
}
</script>

<style scoped>
.timed-config-panel {
  min-width: 320px;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-y-2 > * + * {
  margin-top: 0.5rem;
}

.space-y-1 > * + * {
  margin-top: 0.25rem;
}
</style>
