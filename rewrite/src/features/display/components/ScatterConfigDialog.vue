<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { ScatterDisplayPreference, ScatterSourceBinding } from '../core';

interface FieldOption {
  readonly fieldId: string;
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
const refreshIntervalMs = ref(100);

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
  }
});

const fieldOptions = computed(() =>
  props.availableFields.map((f) => ({
    value: f.fieldId,
    label: `${f.frameName} - ${f.fieldName}`,
  })),
);

function toBinding(fieldId: string): ScatterSourceBinding {
  const sep = fieldId.indexOf(':');
  if (sep === -1) return { groupId: '', dataItemId: '' };
  return { groupId: fieldId.slice(0, sep), dataItemId: fieldId.slice(sep + 1) };
}

function save(): void {
  emit('save', {
    iSource: toBinding(iSourceField.value),
    qSource: toBinding(qSourceField.value),
    bitWidth: bitWidth.value,
    sampleCount: sampleCount.value,
    refreshIntervalMs: refreshIntervalMs.value,
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
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="取消" @click="close" />
        <q-btn color="primary" label="保存" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
