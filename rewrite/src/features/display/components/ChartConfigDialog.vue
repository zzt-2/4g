<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ChartInstancePreference, ChartInstancePatch, YAxisPreference } from '../core';

interface FieldOption {
  readonly fieldId: string;
  readonly fieldName: string;
}

interface Props {
  modelValue: boolean;
  chartPreference: ChartInstancePreference | null;
  availableFields: readonly FieldOption[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'save': [patch: ChartInstancePatch];
}>();

const selectedItems = ref<string[]>([]);
const autoScale = ref(true);
const yMin = ref<number | undefined>(undefined);
const yMax = ref<number | undefined>(undefined);
const maxPoints = ref(500);
const refreshIntervalMs = ref(200);

watch(() => props.modelValue, (open) => {
  if (open && props.chartPreference) {
    selectedItems.value = [...props.chartPreference.selectedItems];
    autoScale.value = props.chartPreference.yAxis.autoScale;
    yMin.value = props.chartPreference.yAxis.min;
    yMax.value = props.chartPreference.yAxis.max;
    maxPoints.value = props.chartPreference.performance.maxPoints;
    refreshIntervalMs.value = props.chartPreference.performance.refreshIntervalMs;
  }
});

function save(): void {
  const yAxis: Partial<YAxisPreference> = {
    autoScale: autoScale.value,
    ...(autoScale.value ? {} : { min: yMin.value, max: yMax.value }),
  };
  emit('save', {
    selectedItems: selectedItems.value,
    yAxis,
    performance: {
      maxPoints: maxPoints.value,
      refreshIntervalMs: refreshIntervalMs.value,
    },
  });
}

function close(): void {
  emit('update:modelValue', false);
}

const fieldOptions = (() => {
  const opts: { value: string; label: string }[] = [];
  for (const f of props.availableFields) {
    opts.push({ value: f.fieldId, label: `${f.fieldName} (${f.fieldId})` });
  }
  return opts;
})();
</script>

<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="close">
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6">图表配置</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <!-- Field selection -->
        <div class="q-mb-md">
          <div class="rw-text-label q-mb-sm">显示字段</div>
          <q-select
            v-model="selectedItems"
            :options="fieldOptions"
            multiple
            emit-value
            map-options
            outlined
            dense
            options-dense
          />
        </div>

        <!-- Y Axis -->
        <div class="q-mb-md">
          <q-toggle v-model="autoScale" label="自动缩放 Y 轴" />
          <div v-if="!autoScale" class="flex gap-4 mt-2">
            <q-input
              v-model.number="yMin"
              type="number"
              label="最小值"
              outlined
              dense
              class="flex-1"
            />
            <q-input
              v-model.number="yMax"
              type="number"
              label="最大值"
              outlined
              dense
              class="flex-1"
            />
          </div>
        </div>

        <!-- Performance -->
        <div class="flex gap-4">
          <q-input
            v-model.number="maxPoints"
            type="number"
            label="最大点数"
            outlined
            dense
            class="flex-1"
          />
          <q-input
            v-model.number="refreshIntervalMs"
            type="number"
            label="刷新间隔(ms)"
            outlined
            dense
            class="flex-1"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="取消" @click="close" />
        <q-btn color="primary" label="保存" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
