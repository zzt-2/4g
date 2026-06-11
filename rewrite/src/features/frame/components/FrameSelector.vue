<script setup lang="ts">
import { computed } from 'vue';
import type { FrameDirection } from '../core';
import type { FrameAssetService } from '../services';

const props = withDefaults(defineProps<{
  readonly frameService: FrameAssetService;
  readonly modelValue: string | null;
  readonly direction?: FrameDirection;
  readonly label?: string;
  readonly disable?: boolean;
}>(), {
  direction: undefined,
  label: '帧格式',
  disable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const selectedId = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val ?? null),
});

const frameOptions = computed(() =>
  props.frameService.listFrames({ direction: props.direction }).map((f) => ({
    value: f.id,
    label: f.name,
  })),
);
</script>

<template>
  <q-select
    v-model="selectedId"
    :options="frameOptions"
    :disable="disable"
    :label="label"
    outlined
    dense
    emit-value
    map-options
    clearable
    class="w-full"
  >
    <template #prepend>
      <q-icon name="o_data_object" size="xs" />
    </template>
    <template #no-option>
      <div class="p-2 rw-text-desc">
        暂无可用帧，请先创建帧定义
      </div>
    </template>
  </q-select>
</template>
