<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { ChartInstancePreference, ChartInstancePatch, ChartSelectedItem, YAxisPreference } from '../core';

interface FieldOption {
  readonly groupId: string;
  readonly frameId: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly frameName: string;
}

interface FrameGroup {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly FieldOption[];
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

const selectedItems = ref<ChartSelectedItem[]>([]);
const activeFrame = ref('');
const autoScale = ref(true);
const yMin = ref<number | undefined>(undefined);
const yMax = ref<number | undefined>(undefined);
const maxPoints = ref(500);
const refreshIntervalMs = ref(200);

const frames = computed<FrameGroup[]>(() => {
  const map = new Map<string, { id: string; name: string; fields: FieldOption[] }>();
  for (const f of props.availableFields) {
    let group = map.get(f.frameId);
    if (!group) {
      group = { id: f.frameId, name: f.frameName, fields: [] };
      map.set(f.frameId, group);
    }
    group.fields.push(f);
  }
  return [...map.values()];
});

function isSelected(field: FieldOption): boolean {
  return selectedItems.value.some(
    (s) => s.groupId === field.groupId && s.frameId === field.frameId && s.fieldId === field.fieldId,
  );
}

watch(() => props.modelValue, (open) => {
  if (open && props.chartPreference) {
    selectedItems.value = props.chartPreference.selectedItems.map((s) => ({ ...s }));
    autoScale.value = props.chartPreference.yAxis.autoScale;
    yMin.value = props.chartPreference.yAxis.min;
    yMax.value = props.chartPreference.yAxis.max;
    maxPoints.value = props.chartPreference.performance.maxPoints;
    refreshIntervalMs.value = props.chartPreference.performance.refreshIntervalMs;
    if (frames.value.length > 0 && !frames.value.some((f) => f.id === activeFrame.value)) {
      activeFrame.value = frames.value[0]!.id;
    }
  }
});

function toggleField(field: FieldOption): void {
  const idx = selectedItems.value.findIndex(
    (s) => s.groupId === field.groupId && s.frameId === field.frameId && s.fieldId === field.fieldId,
  );
  if (idx === -1) {
    selectedItems.value = [
      ...selectedItems.value,
      { groupId: field.groupId, frameId: field.frameId, fieldId: field.fieldId },
    ];
  } else {
    selectedItems.value = selectedItems.value.filter((_, i) => i !== idx);
  }
}

function save(): void {
  const yAxis: Partial<YAxisPreference> = {
    autoScale: autoScale.value,
    ...(autoScale.value ? {} : { min: yMin.value, max: yMax.value }),
  };
  emit('save', {
    selectedItems: selectedItems.value.map((s) => ({ ...s })),
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
</script>

<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="close">
    <q-card class="rw-dialog-lg">
      <q-card-section>
        <div class="text-h6">图表配置</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <!-- Field selection -->
        <div class="q-mb-md">
          <div class="rw-text-label q-mb-sm">显示字段</div>
          <template v-if="frames.length > 0">
            <q-tabs
              v-model="activeFrame"
              dense
              inline-labels
              no-caps
              class="text-primary"
            >
              <q-tab
                v-for="frame in frames"
                :key="frame.id"
                :name="frame.id"
                :label="frame.name"
              />
            </q-tabs>
            <q-separator />
            <q-tab-panels v-model="activeFrame" animated class="q-mt-sm">
              <q-tab-panel
                v-for="frame in frames"
                :key="frame.id"
                :name="frame.id"
                class="p-0"
              >
                <div v-if="frame.fields.length > 0" class="flex flex-wrap gap-2">
                  <q-chip
                    v-for="field in frame.fields"
                    :key="`${field.groupId}:${field.frameId}:${field.fieldId}`"
                    :outline="!isSelected(field)"
                    :color="isSelected(field) ? 'primary' : 'grey'"
                    text-color="white"
                    dense
                    clickable
                    @click="toggleField(field)"
                  >
                    {{ field.fieldName }}
                  </q-chip>
                </div>
                <div v-else class="rw-text-desc">该帧无可用字段</div>
              </q-tab-panel>
            </q-tab-panels>
          </template>
          <div v-else class="rw-text-desc">暂无帧定义，请先添加帧</div>
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
