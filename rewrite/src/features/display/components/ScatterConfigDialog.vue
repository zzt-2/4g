<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { ScatterDisplayPreference, ScatterSourceBinding } from '../core';

interface FieldOption {
  readonly fieldId: string;
  readonly binding: ScatterSourceBinding;
  readonly fieldName: string;
  readonly frameName: string;
  readonly frameId: string;
}

interface Props {
  modelValue: boolean;
  scatterPreference: ScatterDisplayPreference | null;
  availableFields: readonly FieldOption[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'save': [patch: Partial<ScatterDisplayPreference>];
}>();

const iSourceField = ref('');
const qSourceField = ref('');
const bitWidth = ref(8);
const sampleCount = ref(256);
// S010: 星座图独立刷新节奏，默认 ≥2000ms；pointSize 散点直径默认 4。
const refreshIntervalMs = ref(2000);
const pointSize = ref(4);

watch(() => props.modelValue, (open) => {
  if (open && props.scatterPreference) {
    const p = props.scatterPreference;
    iSourceField.value = p.iSource.groupId && p.iSource.dataItemId
      ? `${p.iSource.groupId}:${p.iSource.dataItemId}`
      : '';
    qSourceField.value = p.qSource.groupId && p.qSource.dataItemId
      ? `${p.qSource.groupId}:${p.qSource.dataItemId}`
      : '';
    bitWidth.value = p.bitWidth;
    sampleCount.value = p.sampleCount;
    refreshIntervalMs.value = p.refreshIntervalMs;
    pointSize.value = p.pointSize;
  }
});

const fieldOptions = computed(() =>
  props.availableFields.map((f) => ({
    value: f.fieldId,
    label: `${f.frameName} - ${f.fieldName}`,
  })),
);

function toBinding(fieldKey: string): ScatterSourceBinding {
  // R19: structured lookup, no string split.
  const match = props.availableFields.find((f) => f.fieldId === fieldKey);
  return match ? { ...match.binding } : { groupId: '', dataItemId: '' };
}

function save(): void {
  emit('save', {
    iSource: toBinding(iSourceField.value),
    qSource: toBinding(qSourceField.value),
    bitWidth: bitWidth.value,
    sampleCount: sampleCount.value,
    refreshIntervalMs: refreshIntervalMs.value,
    pointSize: pointSize.value,
  });
}

function close(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="close">
    <q-card class="rw-dialog-md">
      <q-card-section>
        <div class="text-h6">星座图配置</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <!-- I source -->
        <div class="q-mb-md">
          <div class="rw-text-label q-mb-sm">I 数据源</div>
          <q-select
            v-model="iSourceField"
            :options="fieldOptions"
            emit-value
            map-options
            outlined
            dense
          />
        </div>

        <!-- Q source -->
        <div class="q-mb-md">
          <div class="rw-text-label q-mb-sm">Q 数据源</div>
          <q-select
            v-model="qSourceField"
            :options="fieldOptions"
            emit-value
            map-options
            outlined
            dense
          />
        </div>

        <!-- Parameters -->
        <div class="flex gap-4">
          <q-input
            v-model.number="bitWidth"
            type="number"
            label="位宽"
            outlined
            dense
            class="flex-1"
          />
          <q-input
            v-model.number="sampleCount"
            type="number"
            label="采样数"
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

        <!-- 点大小（S010）：散点直径，echarts symbolSize。 -->
        <div class="q-mt-md">
          <div class="rw-text-label q-mb-sm">点大小：{{ pointSize }}px</div>
          <q-slider
            v-model.number="pointSize"
            :min="1"
            :max="12"
            :step="1"
            markers
            snap
            label
            label-always
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
