<script setup lang="ts">
import { computed } from 'vue';
import type { FrameDirection } from '../core';
import type { FrameAssetService } from '../services';

const props = withDefaults(defineProps<{
  readonly frameService: FrameAssetService;
  // H014/S012:支持多选模式(录制选帧用)。multiple=false(默认)时 modelValue 是 string|null(单选,
  // 向后兼容现有调用方 SendStepEditor/ConditionTermEditor);multiple=true 时是 string[](多选)。
  readonly modelValue: string[] | string | null;
  readonly multiple?: boolean;
  readonly direction?: FrameDirection;
  readonly label?: string;
  readonly disable?: boolean;
}>(), {
  multiple: false,
  direction: undefined,
  label: '帧格式',
  disable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string[] | string | null];
}>();

const selected = computed({
  get: () => props.modelValue,
  set: (val) => {
    // clearable 清空时 q-select 传 null:多选回 [],单选回 null(保持原语义)。
    if (val === null) {
      emit('update:modelValue', props.multiple ? [] : null);
    } else {
      emit('update:modelValue', val);
    }
  },
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
    v-model="selected"
    :options="frameOptions"
    :disable="disable"
    :label="label"
    :multiple="multiple"
    :use-chips="multiple"
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
