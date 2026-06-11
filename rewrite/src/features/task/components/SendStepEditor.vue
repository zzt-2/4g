<script setup lang="ts">
import { computed } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { ConnectionService } from '@/features/connection';
import type { SendStepConfig, ConditionTerm, StepRepeat } from '../core';
import FrameSelector from '@/features/frame/components/FrameSelector.vue';
import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import FieldEditWidget from '@/widgets/FieldEditWidget.vue';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';

const props = defineProps<{
  readonly step: SendStepConfig;
  readonly stepName: string;
  readonly stepIndex: number;
  readonly hasPreviousSendStep: boolean;
  readonly frameService: FrameAssetService;
  readonly connectionService: ConnectionService;
  readonly disable?: boolean;
}>();

const emit = defineEmits<{
  'update:step': [config: SendStepConfig];
  'update:stepName': [name: string];
  'copyPrevious': [];
}>();

const frameId = computed(() => props.step.frameId);
const frameFields = computed(() => {
  if (!frameId.value) return [];
  const frame = props.frameService.getFrame(frameId.value);
  return frame?.fields ?? [];
});

const repeat = computed(() => props.step.repeat);

function patchConfig(patch: Partial<SendStepConfig>): void {
  emit('update:step', { ...props.step, ...patch });
}

function updateFieldValues(values: Record<string, string | number | boolean>): void {
  patchConfig({ userFieldValues: values });
}

function patchRepeat(patch: Partial<StepRepeat>): void {
  const current = repeat.value ?? { intervalMs: 1000 };
  patchConfig({ repeat: { ...current, ...patch } });
}

function addRepeatUntil(): void {
  const until = [...(repeat.value?.until ?? []), { frameId: '', fieldId: '', operator: 'eq' as const, threshold: '' }];
  patchRepeat({ until });
}

function removeRepeatUntil(index: number): void {
  const until = repeat.value?.until?.filter((_, i) => i !== index) ?? [];
  patchRepeat({ until });
}

function updateRepeatUntil(index: number, term: ConditionTerm): void {
  const until = repeat.value?.until?.map((c, i) => (i === index ? term : c)) ?? [];
  patchRepeat({ until });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <q-input
      :model-value="stepName"
      :disable="disable"
      dense
      outlined
      label="步骤名称"
      @update:model-value="emit('update:stepName', $event ?? '')"
    />

    <FrameSelector
      :frame-service="frameService"
      :model-value="step.frameId || null"
      direction="send"
      :disable="disable"
      @update:model-value="patchConfig({ frameId: $event ?? '' })"
    />

    <div>
      <span class="rw-text-label text-xs">发送目标</span>
      <SendTargetSelector
        :model-value="step.targetId"
        :connection-service="connectionService"
        :disable="disable"
        class="mt-1"
        @update:model-value="patchConfig({ targetId: $event ?? '' })"
      />
    </div>

    <template v-if="frameId && frameFields.length > 0">
      <span class="rw-text-label text-xs">字段值</span>
      <FieldEditWidget
        :fields="frameFields"
        :values="step.userFieldValues ?? {}"
        direction="send"
        @update:values="updateFieldValues"
      />
    </template>

    <q-input
      :model-value="step.intervalAfterMs"
      :disable="disable"
      dense
      outlined
      type="number"
      label="发送后延时 (ms)"
      @update:model-value="patchConfig({ intervalAfterMs: Number($event) || undefined })"
    />

    <q-btn
      v-if="hasPreviousSendStep"
      flat dense no-caps
      label="复制上一步字段值"
      size="sm"
      color="primary"
      :disable="disable"
      @click="emit('copyPrevious')"
    />

    <!-- Step repeat config -->
    <q-expansion-item
      dense
      label="重复配置"
      header-class="rw-text-label text-sm"
      :disable="disable"
    >
      <div class="pl-3 flex flex-col gap-3">
        <q-input
          :model-value="repeat?.intervalMs"
          dense
          outlined
          type="number"
          label="重复间隔 (ms)"
          @update:model-value="patchRepeat({ intervalMs: Number($event) || 1000 })"
        />
        <q-input
          :model-value="repeat?.maxCount"
          dense
          outlined
          type="number"
          label="最大重复次数"
          @update:model-value="patchRepeat({ maxCount: Number($event) || undefined })"
        />

        <!-- Repeat until conditions -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="rw-text-label text-xs">终止条件</span>
            <q-btn
              flat dense no-caps icon="o_add" label="添加"
              size="sm" color="primary"
              @click="addRepeatUntil"
            />
          </div>
          <div
            v-for="(cond, ci) in (repeat?.until ?? [])"
            :key="ci"
            class="flex items-center gap-1"
          >
            <ConditionTermEditor
              :model-value="cond"
              :frame-service="frameService"
              :show-logic-operator="ci > 0"
              direction="receive"
              @update:model-value="updateRepeatUntil(ci, $event)"
            />
            <q-btn
              flat round dense icon="o_close" size="xs" color="negative"
              @click="removeRepeatUntil(ci)"
            />
          </div>
        </div>
      </div>
    </q-expansion-item>
  </div>
</template>
