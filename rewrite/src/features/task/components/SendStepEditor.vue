<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { ConnectionService } from '@/features/connection';
import type { SendStepConfig, ConditionTerm, StepRepeat, FieldVariation } from '../core';
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
const fieldVariations = computed(() => props.step.fieldVariations ?? []);

// 字段下拉选项(从帧定义查)
const fieldOptions = computed(() => {
  if (!frameId.value) return [];
  return props.frameService.listFieldReferences({ frameId: frameId.value, direction: 'send' }).map((f) => ({
    value: f.fieldId,
    label: f.fieldName,
  }));
});

// 响应式联动 flag:用户手动改过 maxCount 后,编辑可变参数值列表不再覆盖 maxCount。
// 只在本编辑会话有效(组件局部状态,不持久化),符合"一次性触发"语义。
const userEditedMaxCount = ref(false);

// 可变参数值列表的本地输入缓存(按 variation 索引存原始文本)。
// 显示优先取缓存(保留末尾逗号/空格,光标不跳),不直接绑派生 :model-value(values.join)。
// 输入时既更新缓存又立即把 parsed 值写回 step——这样不依赖 @blur,
// 用户输入后直接点"保存"也能持久化(blur 在某些情况下不会先于 click 触发)。
// 缓存是显示源,step 是持久化源,两者并行,显示永远读缓存不被 parse 重算干扰。
const variationInputs = ref<Record<number, string>>({});

function getVariationInput(index: number): string {
  if (index in variationInputs.value) return variationInputs.value[index]!;
  const v = fieldVariations.value[index];
  return v ? v.values.join(', ') : '';
}

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

// 用户手动改 maxCount:标记 flag,后续编辑可变参数值列表不再联动覆盖
function patchRepeatMaxCountManual(value: number | undefined): void {
  userEditedMaxCount.value = true;
  patchRepeat({ maxCount: value });
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

// --- fieldVariations CRUD ---

function addFieldVariation(): void {
  patchConfig({ fieldVariations: [...fieldVariations.value, { fieldId: '', values: [] }] });
}

function removeFieldVariation(index: number): void {
  patchConfig({ fieldVariations: fieldVariations.value.filter((_, i) => i !== index) });
}

function updateFieldVariation(index: number, variation: FieldVariation): void {
  patchConfig({ fieldVariations: fieldVariations.value.map((v, i) => (i === index ? variation : v)) });
}

function parseVariationValues(raw: string): (string | number)[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== '' ? n : v;
  });
}

// 编辑可变参数值列表:每次输入都 (1) 更新本地缓存(显示源,保留末尾逗号/空格)
// (2) parse 后写回 step(持久化源)。不依赖 @blur——用户输入后直接点保存,
// blur 可能不先于 click 触发,导致 step 仍是旧值、保存成空。
// 关键:fieldVariations + repeat 联动必须在**同一次 emit** 里完成——否则
// 第二次 patchConfig 读 props.step 时,props 还没回流第一次的 fv,会把 fv 又写成 []。
// (Vue props 异步回流:两次同步 emit 之间 props.step 是 stale 的旧快照)
function onVariationValuesInput(index: number, raw: string): void {
  // 1) 本地缓存:显示源,不被 parse 重算干扰(保留末尾逗号/空格,光标不跳)
  variationInputs.value = { ...variationInputs.value, [index]: raw };
  // 2) parse 写回 + repeat 联动:合并到同一次 patchConfig,避免两次 emit 之间 props.stale 覆盖
  const values = parseVariationValues(raw);
  const current = fieldVariations.value[index];
  if (!current) return;
  const nextFieldVariations = fieldVariations.value.map((v, i) => (i === index ? { ...current, values } : v));
  const patch: Partial<SendStepConfig> = { fieldVariations: nextFieldVariations };
  if (!userEditedMaxCount.value && values.length > 0) {
    const cur = repeat.value ?? { intervalMs: 1000 };
    patch.repeat = { ...cur, maxCount: values.length };
  }
  patchConfig(patch);
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
      <span class="rw-text-label text-xs">发送目标（覆盖）</span>
      <SendTargetSelector
        :model-value="step.targetId ?? null"
        :connection-service="connectionService"
        :disable="disable"
        class="mt-1"
        @update:model-value="patchConfig({ targetId: $event ?? undefined })"
      />
      <div class="rw-text-desc text-caption mt-1">留空则使用任务级默认发送目标</div>
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
          hint="编辑下方离散值列表会自动同步此值（手动改过则不再同步）"
          @update:model-value="patchRepeatMaxCountManual(Number($event) || undefined)"
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

    <!-- 字段可变参数:离散值列表(按发送次数取值,取完保留最后一个)。
         连续累积不需要在此配置——只要帧有自引用表达式(如"速度+速度步进"),
         重复发送时自动累积(步内连续、步结束重置)。-->
    <q-expansion-item
      dense
      label="字段可变参数"
      header-class="rw-text-label text-sm"
      :disable="disable"
    >
      <div class="pl-3 flex flex-col gap-2">
        <div class="rw-text-desc text-caption">
          每个字段填一组离散值,按发送次数取下一个,取完保留最后一个。
          值列表长度会自动同步到上方重复次数(手动改过则不再同步)。
        </div>
        <q-btn
          flat dense no-caps icon="o_add" label="添加字段可变参数"
          size="sm" color="primary"
          :disable="disable || !frameId"
          @click="addFieldVariation"
        />

        <div
          v-for="(variation, vi) in fieldVariations"
          :key="vi"
          class="flex flex-col gap-1 rw-panel-base pa-2"
        >
          <div class="flex items-center gap-2">
            <q-select
              :model-value="variation.fieldId"
              :options="fieldOptions"
              :disable="disable"
              outlined
              dense
              emit-value
              map-options
              clearable
              placeholder="字段"
              class="flex-1 min-w-0"
              @update:model-value="updateFieldVariation(vi, { ...variation, fieldId: ($event as string) ?? '' })"
            />
            <q-btn
              flat round dense icon="o_close" size="xs" color="negative"
              :disable="disable"
              @click="removeFieldVariation(vi)"
            />
          </div>

          <q-input
            :model-value="getVariationInput(vi)"
            :disable="disable"
            outlined
            dense
            placeholder="值列表（逗号分隔，如 1, 2, 3）"
            @update:model-value="onVariationValuesInput(vi, ($event ?? ''))"
          />
        </div>
      </div>
    </q-expansion-item>
  </div>
</template>
