<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import type { TimeRange } from '../../types/storage/historyData';
import { useHistoryAnalysisStore } from '../../stores/historyAnalysis';

// Props
interface Props {
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  disabled: false,
});

// Emits
const emit = defineEmits<{
  'load-data': [];
}>();

const $q = useQuasar();
const historyStore = useHistoryAnalysisStore();

// 本地状态
const startDate = ref('');
const startTime = ref('');
const endDate = ref('');
const endTime = ref('');

// 预设时间范围选项
const presetRanges = [
  { label: '最近1小时', hours: 1 },
  { label: '最近6小时', hours: 6 },
  { label: '最近12小时', hours: 12 },
  { label: '最近24小时', hours: 24 },
];

// 计算属性
const currentTimeRange = computed(() => historyStore.timeRange);
const availableHours = computed(() => historyStore.availableHours);
const isLoading = computed(() => historyStore.isLoading);

// 可用的日期范围（基于可用小时键）
const availableDateRange = computed(() => {
  if (availableHours.value.length === 0) {
    return { min: '', max: '' };
  }

  const earliest = availableHours.value[0];
  const latest = availableHours.value[availableHours.value.length - 1];

  if (!earliest || !latest) {
    return { min: '', max: '' };
  }

  return {
    min: earliest.slice(0, 10), // YYYY-MM-DD
    max: latest.slice(0, 10),
  };
});

// 防止循环更新的标志
const isUpdatingFromStore = ref(false);

// 初始化时间输入框
const initTimeInputs = (): void => {
  isUpdatingFromStore.value = true;

  const range = currentTimeRange.value;
  const startDateTime = new Date(range.startTime);
  const endDateTime = new Date(range.endTime);

  // 使用本地时间格式，避免时区问题
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatLocalTime = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  startDate.value = formatLocalDate(startDateTime);
  startTime.value = formatLocalTime(startDateTime);
  endDate.value = formatLocalDate(endDateTime);
  endTime.value = formatLocalTime(endDateTime);

  // 下一个tick后重置标志
  nextTick(() => {
    isUpdatingFromStore.value = false;
  });
};

// 验证时间范围
const validateTimeRange = (): boolean => {
  if (!startDate.value || !startTime.value || !endDate.value || !endTime.value) {
    return false;
  }

  const start = new Date(`${startDate.value}T${startTime.value}`);
  const end = new Date(`${endDate.value}T${endTime.value}`);

  if (start >= end) {
    $q.notify({
      type: 'negative',
      message: '开始时间必须早于结束时间',
      position: 'top',
    });
    return false;
  }

  // 检查时间跨度（最大30天）
  const maxDays = 30;
  const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays > maxDays) {
    $q.notify({
      type: 'negative',
      message: `时间跨度不能超过${maxDays}天`,
      position: 'top',
    });
    return false;
  }

  return true;
};

// 应用时间范围
const applyTimeRange = (): void => {
  if (!validateTimeRange()) return;

  const start = new Date(`${startDate.value}T${startTime.value}`);
  const end = new Date(`${endDate.value}T${endTime.value}`);

  const newRange: TimeRange = {
    startTime: start.getTime(),
    endTime: end.getTime(),
  };

  historyStore.updateTimeRange(newRange);
};

// 设置预设时间范围
const setPresetRange = (hours: number): void => {
  const now = Date.now();
  const newRange: TimeRange = {
    startTime: now - hours * 60 * 60 * 1000,
    endTime: now,
  };

  historyStore.updateTimeRange(newRange);

  // 更新输入框
  initTimeInputs();
};

// 加载数据
const loadData = async (): Promise<void> => {
  try {
    emit('load-data');
    await historyStore.loadHistoryData();

    $q.notify({
      type: 'positive',
      message: '数据加载完成',
      position: 'top',
    });
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: `加载失败: ${error instanceof Error ? error.message : '未知错误'}`,
      position: 'top',
    });
  }
};

// 监听时间范围变化
watch(
  currentTimeRange,
  () => {
    initTimeInputs();
  },
  { immediate: true },
);

// 监听时间输入变化，自动应用
let debounceTimer: NodeJS.Timeout | null = null;

watch([startDate, startTime, endDate, endTime], () => {
  // 如果是从store更新的，不触发应用逻辑
  if (isUpdatingFromStore.value) return;

  // 防抖处理，避免频繁更新
  if (startDate.value && startTime.value && endDate.value && endTime.value) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      applyTimeRange();
    }, 1000);
  }
});

// 组件挂载时获取可用小时
historyStore.fetchAvailableHours();
</script>

<template>
  <div class="bg-industrial-panel border border-industrial rounded p-3 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-industrial-primary text-sm font-medium">时间选择</h3>
      <div class="flex gap-1">
        <button
          v-for="preset in presetRanges"
          :key="preset.hours"
          class="px-1 py-1 text-xs rounded bg-industrial-secondary border border-industrial-highlight text-industrial-accent hover:bg-industrial-highlight transition-colors"
          :disabled="disabled || isLoading"
          @click="setPresetRange(preset.hours)"
        >
          {{ preset.label.replace('最近', '') }}
        </button>
      </div>
    </div>

    <!-- 自定义时间范围 -->
    <div class="space-y-1">
      <!-- 开始时间 -->
      <div class="flex items-center gap-0.5 text-xs">
        <label class="text-industrial-tertiary w-6 flex-shrink-0">开始</label>
        <q-input
          v-model="startDate"
          type="date"
          dense
          outlined
          :min="availableDateRange.min"
          :max="availableDateRange.max"
          class="flex-1"
          input-class="text-industrial-primary bg-industrial-secondary text-xs"
          :disabled="disabled || isLoading"
        />
        <q-input
          v-model="startTime"
          type="time"
          dense
          outlined
          class="w-30"
          input-class="text-industrial-primary bg-industrial-secondary text-xs"
          :disabled="disabled || isLoading"
        />
      </div>

      <!-- 结束时间 -->
      <div class="flex items-center gap-0.5 text-xs">
        <label class="text-industrial-tertiary w-6 flex-shrink-0">结束</label>
        <q-input
          v-model="endDate"
          type="date"
          dense
          outlined
          :min="availableDateRange.min"
          :max="availableDateRange.max"
          class="flex-1"
          input-class="text-industrial-primary bg-industrial-secondary text-xs"
          :disabled="disabled || isLoading"
        />
        <q-input
          v-model="endTime"
          type="time"
          dense
          outlined
          class="w-30"
          input-class="text-industrial-primary bg-industrial-secondary text-xs"
          :disabled="disabled || isLoading"
        />
      </div>
    </div>

    <!-- 加载数据按钮 -->
    <q-btn
      flat
      label="加载历史数据"
      icon="download"
      size="sm"
      class="w-full bg-industrial-secondary border border-industrial-highlight text-industrial-accent hover:bg-industrial-highlight text-xs"
      :loading="isLoading"
      :disabled="disabled"
      @click="loadData"
    />
  </div>
</template>
