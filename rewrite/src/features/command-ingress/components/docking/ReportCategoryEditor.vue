<script setup lang="ts">
// 报告配置某一类(checkPoints/statisticsItems/attachItems)的编辑器(D008)。
// 渲染该类下的所有项:每项一行 = 名称输入 + 帧字段选择 + 说明(可选) + 上下移/删除。
// emit add/update-item/remove/move 给上层 ReportConfigEditor 聚合成新 ReportConfig。

import { reactive, watch } from 'vue';
import { nanoid } from 'nanoid';
import type { ReportItem } from '../../core/report-config';
import type { FrameAssetService } from '@/features/frame';
import FrameFieldPicker from './FrameFieldPicker.vue';

const props = defineProps<{
  readonly label: string;
  readonly items: readonly ReportItem[];
  readonly frameService: FrameAssetService;
}>();

const emit = defineEmits<{
  add: [item: ReportItem];
  'update-item': [item: ReportItem];
  remove: [id: string];
  move: [payload: { id: string; direction: 'up' | 'down' }];
}>();

// 名称/说明的本地输入缓存(按 item id)。显示读缓存(保留输入中间态),输入时既更新缓存
// 又立即把值写回 item——不依赖 @blur,点保存即持久化(同 SendStepEditor variationInputs 思路)。
const localName = reactive<Record<string, string>>({});
const localMsg = reactive<Record<string, string>>({});

watch(
  () => props.items,
  (items) => {
    for (const i of items) {
      localName[i.id] = i.name;
      localMsg[i.id] = i.msg ?? '';
    }
  },
  { immediate: true, deep: true },
);

function onAdd(): void {
  emit('add', { id: nanoid(), name: '', frameId: '', fieldId: '' });
}

function findItem(id: string): ReportItem | undefined {
  return props.items.find((i) => i.id === id);
}

function emitName(id: string): void {
  const item = findItem(id);
  if (item) emit('update-item', { ...item, name: localName[id] ?? '' });
}

function emitMsg(id: string): void {
  const item = findItem(id);
  if (!item) return;
  const msg = localMsg[id] || undefined; // 空串存 undefined(省 JSON 体积,守卫 msg 可选)
  emit('update-item', { ...item, msg });
}

// FrameFieldPicker 单次 emit (frameId, fieldId) 元组,一次性更新避免双 emit 闭包覆盖。
function emitFrameField(item: ReportItem, frameId: string, fieldId: string): void {
  emit('update-item', { ...item, frameId, fieldId });
}
</script>

<template>
  <div class="mb-3">
    <div class="rw-text-label text-xs mb-1">{{ label }}</div>

    <div v-if="items.length > 0" class="flex flex-col gap-1">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-2 flex-wrap"
      >
        <q-input
          v-model="localName[item.id]"
          dense outlined
          placeholder="名称"
          style="width: 120px"
          @update:model-value="emitName(item.id)"
        />
        <FrameFieldPicker
          :frame-service="frameService"
          :frame-id="item.frameId"
          :field-id="item.fieldId"
          @update="(f: string, fid: string) => emitFrameField(item, f, fid)"
        />
        <q-input
          v-model="localMsg[item.id]"
          dense outlined
          placeholder="说明(可选)"
          style="width: 100px"
          @update:model-value="emitMsg(item.id)"
        />
        <div class="flex items-center">
          <q-btn
            flat dense icon="o_arrow_upward" size="xs"
            :disable="items.indexOf(item) === 0"
            @click="emit('move', { id: item.id, direction: 'up' })"
          >
            <q-tooltip>上移</q-tooltip>
          </q-btn>
          <q-btn
            flat dense icon="o_arrow_downward" size="xs"
            :disable="items.indexOf(item) === items.length - 1"
            @click="emit('move', { id: item.id, direction: 'down' })"
          >
            <q-tooltip>下移</q-tooltip>
          </q-btn>
          <q-btn flat dense icon="o_close" color="negative" size="xs" @click="emit('remove', item.id)">
            <q-tooltip>删除</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>
    <div v-else class="rw-text-label text-xs mb-1">(空)</div>

    <q-btn flat dense no-caps icon="o_add" size="sm" color="primary" label="添加" class="mt-1" @click="onAdd" />
  </div>
</template>
