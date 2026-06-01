<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TimeRange } from './useHistoryData';

interface Props {
  range: TimeRange;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), { loading: false });
const emit = defineEmits<{
  'update:range': [value: TimeRange];
  load: [];
}>();

const PRESETS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
] as const;

const startDate = ref(formatDate(props.range.start));
const startTime = ref(formatTime(props.range.start));
const endDate = ref(formatDate(props.range.end));
const endTime = ref(formatTime(props.range.end));
const error = ref('');

watch(() => props.range, (r) => {
  startDate.value = formatDate(r.start);
  startTime.value = formatTime(r.start);
  endDate.value = formatDate(r.end);
  endTime.value = formatTime(r.end);
});

function applyPreset(hours: number): void {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  error.value = '';
  emit('update:range', { start, end });
}

function applyCustom(): void {
  const start = parseDateTime(startDate.value, startTime.value);
  const end = parseDateTime(endDate.value, endTime.value);

  if (!start || !end) {
    error.value = '日期时间格式不正确';
    return;
  }
  if (start >= end) {
    error.value = '开始时间必须早于结束时间';
    return;
  }
  if (end.getTime() - start.getTime() > 30 * 86400_000) {
    error.value = '时间跨度不能超过 30 天';
    return;
  }
  error.value = '';
  emit('update:range', { start, end });
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTime(date: string, time: string): Date | null {
  const match = date.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;
  return new Date(
    +match[1], +match[2] - 1, +match[3],
    +timeMatch[1], +timeMatch[2],
  );
}
</script>

<template>
  <div class="p-4">
    <div class="rw-text-label mb-2">时间范围</div>
    <div class="flex gap-1 mb-3">
      <q-btn
        v-for="p in PRESETS" :key="p.hours"
        flat dense no-caps size="sm"
        :label="p.label"
        color="primary"
        @click="applyPreset(p.hours)"
      />
    </div>
    <div class="flex items-center gap-2 mb-1">
      <q-input v-model="startDate" dense outlined placeholder="YYYY/MM/DD" class="flex-1" @change="applyCustom" />
      <q-input v-model="startTime" dense outlined placeholder="HH:mm" class="w-16" @change="applyCustom" />
    </div>
    <div class="flex items-center gap-2 mb-2">
      <q-input v-model="endDate" dense outlined placeholder="YYYY/MM/DD" class="flex-1" @change="applyCustom" />
      <q-input v-model="endTime" dense outlined placeholder="HH:mm" class="w-16" @change="applyCustom" />
    </div>
    <div v-if="error" class="rw-text-error text-xs mb-2">{{ error }}</div>
    <q-btn
      color="primary" no-caps
      label="加载数据"
      :loading="loading"
      class="full-width"
      @click="emit('load')"
    />
  </div>
</template>
