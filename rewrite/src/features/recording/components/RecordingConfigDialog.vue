<script setup lang="ts">
// H014/S012:录制设置弹窗。选录哪些接收帧(多选 FrameSelector,只列 receive 帧)+
// 滚动配置(可折叠高级项)。确定时一次 emit apply(D003 单次 emit 原则,不每字段一写)。
import { ref, watch } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { RecordingConfig } from '../core';
import FrameSelector from '@/features/frame/components/FrameSelector.vue';

const props = defineProps<{
  readonly modelValue: boolean;
  readonly config: RecordingConfig;
  readonly frameService: FrameAssetService;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'apply': [config: RecordingConfig];
}>();

// 本地编辑副本,确定时才 emit apply(D003 单次 emit 原则,可取消不落盘)。
const local = ref<RecordingConfig>({
  ...props.config,
  selectedFrameIds: [...props.config.selectedFrameIds],
});

watch(() => props.config, (c) => {
  local.value = { ...c, selectedFrameIds: [...c.selectedFrameIds] };
});

function onOk() {
  emit('apply', { ...local.value, selectedFrameIds: [...local.value.selectedFrameIds] });
  emit('update:modelValue', false);
}
function onCancel() {
  emit('update:modelValue', false);
}
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="rw-dialog-md">
      <q-card-section class="flex items-center justify-between">
        <span class="text-h6">录制设置</span>
      </q-card-section>
      <q-card-section class="q-pt-none column gap-3">
        <div>
          <div class="rw-text-label q-mb-xs">录制的接收帧</div>
          <FrameSelector
            v-model="local.selectedFrameIds"
            :frame-service="frameService"
            :multiple="true"
            direction="receive"
            label="选择要录制的接收帧"
          />
          <div v-if="local.selectedFrameIds.length === 0" class="rw-text-desc text-xs q-mt-xs">
            未选帧 = 不录任何帧。请至少选一个接收帧。
          </div>
        </div>
        <q-expansion-item label="滚动设置（高级）" dense-toggle default-closed>
          <div class="column gap-2 q-pa-sm">
            <div class="row items-center gap-2">
              <span class="rw-text-label" style="min-width: 120px;">单文件上限(MB)</span>
              <q-input v-model.number="local.maxFileSizeMb" type="number" dense outlined min="1" class="col" />
            </div>
            <div class="row items-center gap-2">
              <span class="rw-text-label" style="min-width: 120px;">保留文件数</span>
              <q-input v-model.number="local.rotationCount" type="number" dense outlined min="1" class="col" />
            </div>
            <q-toggle v-model="local.enableRotation" label="启用滚动（达到上限开新文件）" />
          </div>
        </q-expansion-item>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="取消" @click="onCancel" />
        <q-btn color="primary" label="确定" @click="onOk" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
