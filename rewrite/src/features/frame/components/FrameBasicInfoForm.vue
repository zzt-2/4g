<script lang="ts">
const REQUIRED_RULE = [(val: string) => !!val?.trim() || '此项为必填'];
</script>

<script setup lang="ts">
import type { FrameAsset, FrameDirection } from '@/features/frame';
import { DIRECTION_OPTIONS } from './field-labels';

defineProps<{
  frame: FrameAsset;
  isNew: boolean;
}>();

const emit = defineEmits<{
  'update:frame': [patch: Partial<FrameAsset>];
}>();

function update(patch: Partial<FrameAsset>): void {
  emit('update:frame', patch);
}
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="rw-text-label text-body2 mb-3">基本信息</div>
      <q-form>
        <div class="flex flex-wrap gap-4">
          <q-input
            outlined
            dense
            :model-value="frame.name"
            label="帧名称 *"
            :rules="REQUIRED_RULE"
            class="min-w-[200px] flex-1"
            @update:model-value="(v: string) => update({ name: v })"
          />
          <q-input
            outlined
            dense
            :model-value="frame.id"
            label="帧ID *"
            :rules="REQUIRED_RULE"
            :disable="!isNew"
            class="min-w-[200px] flex-1"
            @update:model-value="(v: string) => update({ id: v })"
          />
          <q-select
            outlined
            dense
            :model-value="frame.direction"
            :options="DIRECTION_OPTIONS"
            emit-value
            map-options
            label="帧方向 *"
            class="min-w-[160px]"
            @update:model-value="(v: string) => update({ direction: v as FrameDirection })"
          />
        </div>
        <div class="flex flex-wrap gap-4 mt-3">
          <q-input
            outlined
            dense
            :model-value="frame.frameType"
            label="帧类型"
            class="min-w-[200px] flex-1"
            @update:model-value="(v: string) => update({ frameType: v || undefined })"
          />
          <q-input
            outlined
            dense
            :model-value="frame.protocol"
            label="协议"
            class="min-w-[200px] flex-1"
            @update:model-value="(v: string) => update({ protocol: v || undefined })"
          />
        </div>
        <q-input
          outlined
          dense
          autogrow
          :model-value="frame.description"
          label="描述"
          class="mt-3"
          @update:model-value="(v: string) => update({ description: v || undefined })"
        />
      </q-form>
    </q-card-section>
  </q-card>
</template>
