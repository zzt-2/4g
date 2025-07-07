<template>
  <div class="mb-4 p-3 bg-industrial-secondary rounded border border-industrial">
    <div class="text-subtitle2 text-industrial-primary mb-3 flex items-center">
      <q-icon name="tune" class="mr-2" />
      发送策略
    </div>

    <div class="flex items-center gap-6 mb-3">
      <q-option-group
        :model-value="props.strategy"
        :options="strategyOptions as any"
        inline
        color="primary"
        class="text-industrial-primary"
        @update:model-value="$emit('update:strategy', $event)"
      />

      <q-btn
        v-if="props.strategy !== 'immediate'"
        size="sm"
        color="accent"
        outline
        @click="$emit('open-config')"
        :disable="props.isDisabled"
        class="ml-2"
      >
        <q-icon name="settings" class="mr-1" />
        配置{{ strategyLabels[props.strategy] }}参数
      </q-btn>
    </div>

    <!-- 策略预览 -->
    <div v-if="props.strategy !== 'immediate'" class="text-xs text-industrial-secondary">
      <q-icon name="visibility" size="14px" class="mr-1" />
      当前配置: {{ props.previewText }}
    </div>
  </div>
</template>

<script setup lang="ts">
type StrategyType = 'immediate' | 'timed' | 'triggered';

const props = defineProps<{
  strategy: StrategyType;
  previewText: string;
  isDisabled?: boolean;
}>();

defineEmits<{
  'update:strategy': [value: StrategyType];
  'open-config': [];
}>();

// 策略选项
const strategyOptions = [
  { label: '立即发送', value: 'immediate' },
  { label: '定时发送', value: 'timed' },
  { label: '触发发送', value: 'triggered' },
] as const;

const strategyLabels: Record<StrategyType, string> = {
  immediate: '立即',
  timed: '定时',
  triggered: '触发',
};
</script>
