<template>
  <div
    class="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium min-w-[60px]"
    :class="statusClass"
  >
    {{ statusText }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FrameStatus } from '../../../types/frames/index';

// 颜色常量
const STATUS_COLORS = {
  processing: 'bg-[#1976d2] text-white',
  completed: 'bg-[#43a047] text-white',
  error: 'bg-[#d32f2f] text-white',
  pending: 'bg-[#ff9800] text-white',
};

// 显示文本常量
const STATUS_TEXT = {
  processing: '处理中',
  completed: '完成',
  error: '错误',
  pending: '待处理',
};

const props = defineProps<{
  status: FrameStatus;
}>();

const statusClass = computed(() => {
  return STATUS_COLORS[props.status] || '';
});

const statusText = computed(() => {
  return STATUS_TEXT[props.status] || props.status;
});
</script>
