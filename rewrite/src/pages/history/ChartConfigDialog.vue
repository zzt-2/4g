<script setup lang="ts">
import { ref, computed } from 'vue';
import type { DisplayService, YAxisPreference } from '@/features/display';
import type { DataItemGroup } from './useHistoryData';

interface Props {
  modelValue: string | null;
  displayService: DisplayService;
  availableItems: Set<string>;
  hierarchy: readonly DataItemGroup[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const show = computed({
  get: () => props.modelValue !== null,
  set: (v) => { if (!v) emit('update:modelValue', null); },
});

const chartId = computed(() => props.modelValue);

const chartConfig = computed(() => {
  if (!chartId.value) return null;
  const prefs = props.displayService.getPreferences();
  return prefs.charts.find((c) => c.id === chartId.value) ?? null;
});

const selectedItems = ref<string[]>([]);
const autoScale = ref(true);
const yMin = ref<number | undefined>(undefined);
const yMax = ref<number | undefined>(undefined);

function initFromConfig(): void {
  if (!chartConfig.value) return;
  selectedItems.value = [...chartConfig.value.selectedItems];
  autoScale.value = chartConfig.value.yAxis.autoScale;
  yMin.value = chartConfig.value.yAxis.min;
  yMax.value = chartConfig.value.yAxis.max;
}

const availableItemsList = computed(() => {
  const items: { fieldId: string; label: string; groupLabel: string }[] = [];
  for (const group of props.hierarchy) {
    for (const item of group.items) {
      if (props.availableItems.has(item.fieldId)) {
        items.push({ fieldId: item.fieldId, label: item.key, groupLabel: group.label });
      }
    }
  }
  return items;
});

function save(): void {
  if (!chartId.value) return;
  const yAxis: YAxisPreference = {
    autoScale: autoScale.value,
    min: autoScale.value ? undefined : yMin.value,
    max: autoScale.value ? undefined : yMax.value,
  };
  props.displayService.updateChartConfig(chartId.value, {
    selectedItems: selectedItems.value,
    yAxis,
  });
  show.value = false;
}

// Initialize when dialog opens
import { watch as vueWatch } from 'vue';
vueWatch(show, (v) => { if (v) initFromConfig(); });
</script>

<template>
  <q-dialog v-model="show">
    <q-card class="rw-dialog-md">
      <q-card-section class="rw-divider-b">
        <div class="rw-text-value">图表配置 — {{ chartConfig?.title ?? chartId }}</div>
      </q-card-section>
      <q-card-section class="q-gutter-md">
        <div>
          <div class="rw-text-label mb-1">数据项选择</div>
          <q-select
            v-model="selectedItems"
            :options="availableItemsList"
            multiple
            dense outlined
            emit-value map-options
            option-value="fieldId"
            option-label="label"
            option-group="groupLabel"
          />
        </div>
        <div>
          <div class="rw-text-label mb-1">Y 轴</div>
          <q-toggle v-model="autoScale" label="自动缩放" dense />
          <div v-if="!autoScale" class="flex gap-4 mt-2">
            <q-input v-model.number="yMin" dense outlined label="最小值" type="number" class="flex-1" />
            <q-input v-model.number="yMax" dense outlined label="最大值" type="number" class="flex-1" />
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="right" class="rw-divider-t">
        <q-btn flat no-caps label="取消" @click="show = false" />
        <q-btn color="primary" no-caps label="保存" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
