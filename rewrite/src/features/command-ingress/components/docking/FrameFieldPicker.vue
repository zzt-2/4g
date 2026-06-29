<script setup lang="ts">
// 报告配置项的「帧 + 字段」选择器(D008)。
// 复用 frameService.listFieldReferences({ frameId, direction: 'receive' }) 枚举接收帧字段。
// 关键:必须带 direction:'receive',否则会混入 send 帧字段——用户选了取不到 displayValue
// (displayValue 只在 receive 阶段算好,见 field-parser.ts)。对照 SendStepEditor.vue:40 用 'send'。
//
// 单一 update 事件传 (frameId, fieldId) 元组:切帧时一次性 emit (新帧, ''),
// 避免双 emit(分别 update:frameId + update:fieldId)在父侧用旧 item 闭包互相覆盖的 bug。

import { computed } from 'vue';
import type { FrameAssetService } from '@/features/frame';

const props = defineProps<{
  readonly frameService: FrameAssetService;
  readonly frameId: string;
  readonly fieldId: string;
}>();

const emit = defineEmits<{
  // 单次 emit (frameId, fieldId, fieldName)。切帧时 (新帧, '', '')。
  // fieldName 是所选字段的显示名,父用它作为 ReportItem.name 的默认值(D008:解法 Y)。
  update: [frameId: string, fieldId: string, fieldName: string];
}>();

// 接收方向帧列表(只列 receive,排除 send 帧——报告取的是接收帧字段的 displayValue)。
const frameOptions = computed(() =>
  props.frameService.listFrames({ direction: 'receive' }).map((f) => ({
    value: f.id,
    label: f.name,
  })),
);

// 选中帧的字段列表(direction:'receive' 兜底,确保只列接收帧字段)。
const fieldOptions = computed(() => {
  if (!props.frameId) return [];
  return props.frameService
    .listFieldReferences({ frameId: props.frameId, direction: 'receive' })
    .map((f) => ({ value: f.fieldId, label: f.fieldName }));
});

function onFrameChange(id: string | null): void {
  // 切帧时清空字段(旧字段不属于新帧)。单次 emit,父一次性更新。
  emit('update', id ?? '', '', '');
}

function onFieldChange(id: string | null): void {
  // 选字段:连 fieldName 一起 emit,父用它作 name 默认值。
  const ref = id ? fieldOptions.value.find((o) => o.value === id) : undefined;
  emit('update', props.frameId, id ?? '', ref?.label ?? '');
}
</script>

<template>
  <div class="flex items-center gap-1">
    <q-select
      :model-value="frameId"
      :options="frameOptions"
      outlined dense emit-value map-options clearable
      label="帧" style="width: 130px"
      @update:model-value="onFrameChange"
    >
      <template #no-option>
        <div class="p-2 rw-text-desc text-xs">暂无接收帧</div>
      </template>
    </q-select>
    <q-select
      :model-value="fieldId"
      :options="fieldOptions"
      :disable="!frameId"
      outlined dense emit-value map-options clearable
      label="字段" style="width: 120px"
      @update:model-value="onFieldChange"
    >
      <template #no-option>
        <div class="p-2 rw-text-desc text-xs">{{ frameId ? '该帧无字段' : '先选帧' }}</div>
      </template>
    </q-select>
  </div>
</template>
