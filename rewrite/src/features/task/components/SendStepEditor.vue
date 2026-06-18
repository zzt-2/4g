<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FrameAssetService } from '@/features/frame';
import type { ConnectionService } from '@/features/connection';
import type { SendStepConfig, ConditionTerm, StepRepeat, FieldValueResolver } from '../core';
import FrameSelector from '@/features/frame/components/FrameSelector.vue';
import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import FieldEditWidget from '@/widgets/FieldEditWidget.vue';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';
import { FIELD_RESOLVER_KIND_OPTIONS } from './task-labels';

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
const fieldResolvers = computed(() => props.step.fieldResolvers ?? []);

// 字段下拉选项(从帧定义查)
const fieldOptions = computed(() => {
  if (!frameId.value) return [];
  return props.frameService.listFieldReferences({ frameId: frameId.value, direction: 'send' }).map((f) => ({
    value: f.fieldId,
    label: f.fieldName,
  }));
});

// 响应式联动 flag:用户手动改过 maxCount 后,编辑 variation values 不再覆盖 maxCount。
// 只在本编辑会话有效(组件局部状态,不持久化),符合"一次性触发"语义。
const userEditedMaxCount = ref(false);

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

// 用户手动改 maxCount:标记 flag,后续编辑 variation values 不再联动覆盖
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

// --- fieldResolvers CRUD ---

function addFieldResolver(kind: 'variation' | 'accumulation'): void {
  const next: FieldValueResolver = kind === 'variation'
    ? { kind: 'variation', fieldId: '', values: [] }
    : { kind: 'accumulation', fieldId: '', initial: 0 };
  patchConfig({ fieldResolvers: [...fieldResolvers.value, next] });
}

function removeFieldResolver(index: number): void {
  patchConfig({ fieldResolvers: fieldResolvers.value.filter((_, i) => i !== index) });
}

// 切换 resolver 类型:保留 fieldId,重置其余字段为新类型的默认值
function onResolverKindChange(index: number, kind: 'variation' | 'accumulation'): void {
  const current = fieldResolvers.value[index];
  if (!current || current.kind === kind) return;
  const next: FieldValueResolver = kind === 'variation'
    ? { kind: 'variation', fieldId: current.fieldId, values: [] }
    : { kind: 'accumulation', fieldId: current.fieldId, initial: 0 };
  updateFieldResolver(index, next);
  // 切到 variation 且用户未手动改过 maxCount 时,联动 maxCount(空列表则不动)
  if (kind === 'variation' && !userEditedMaxCount.value) {
    if (next.values.length > 0) patchRepeat({ maxCount: next.values.length });
  }
}

function updateFieldResolver(index: number, resolver: FieldValueResolver): void {
  patchConfig({ fieldResolvers: fieldResolvers.value.map((r, i) => (i === index ? resolver : r)) });
}

function parseVariationValues(raw: string): (string | number)[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== '' ? n : v;
  });
}

// 编辑 variation values:同步联动 maxCount(一次性,flag 控制是否覆盖)
function onVariationValuesInput(index: number, raw: string): void {
  const values = parseVariationValues(raw);
  const current = fieldResolvers.value[index];
  if (!current || current.kind !== 'variation') return;
  updateFieldResolver(index, { ...current, values });
  // 联动:用户未手动改过 maxCount 时,同步把 maxCount 设为 values 长度
  if (!userEditedMaxCount.value && values.length > 0) {
    patchRepeat({ maxCount: values.length });
  }
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

    <!-- Field resolvers:字段级可变参数 / 连续累积(step 级二选一,共用 step 内 counter 骨架) -->
    <q-expansion-item
      dense
      label="字段可变参数 / 累积"
      header-class="rw-text-label text-sm"
      :disable="disable"
    >
      <div class="pl-3 flex flex-col gap-2">
        <div class="rw-text-desc text-caption">
          每个字段选一种策略:离散值列表(按发送次数取值,取完保留最后一个)或连续累积(公式在帧表达式配置里)。
          离散值列表的长度会自动同步到上方重复次数(手动改过则不再同步)。
        </div>
        <div class="flex items-center gap-2">
          <q-btn
            flat dense no-caps icon="o_add" label="离散值列表"
            size="sm" color="primary"
            :disable="disable || !frameId"
            @click="addFieldResolver('variation')"
          />
          <q-btn
            flat dense no-caps icon="o_add" label="连续累积"
            size="sm" color="primary"
            :disable="disable || !frameId"
            @click="addFieldResolver('accumulation')"
          />
        </div>

        <div
          v-for="(resolver, ri) in fieldResolvers"
          :key="ri"
          class="flex flex-col gap-1 rw-panel-base pa-2"
        >
          <div class="flex items-center gap-2">
            <q-select
              :model-value="resolver.fieldId"
              :options="fieldOptions"
              :disable="disable"
              outlined
              dense
              emit-value
              map-options
              clearable
              placeholder="字段"
              class="flex-1 min-w-0"
              @update:model-value="updateFieldResolver(ri, { ...resolver, fieldId: ($event as string) ?? '' })"
            />
            <q-select
              :model-value="resolver.kind"
              :options="FIELD_RESOLVER_KIND_OPTIONS"
              :disable="disable"
              outlined
              dense
              emit-value
              map-options
              class="w-36 shrink-0"
              @update:model-value="onResolverKindChange(ri, $event as 'variation' | 'accumulation')"
            />
            <q-btn
              flat round dense icon="o_close" size="xs" color="negative"
              :disable="disable"
              @click="removeFieldResolver(ri)"
            />
          </div>

          <!-- variation:值列表(逗号分隔) -->
          <q-input
            v-if="resolver.kind === 'variation'"
            :model-value="(resolver as Extract<FieldValueResolver, { kind: 'variation' }>).values.join(', ')"
            :disable="disable"
            outlined
            dense
            placeholder="值列表（逗号分隔，如 1, 2, 3）"
            @update:model-value="onVariationValuesInput(ri, ($event ?? ''))"
          />

          <!-- accumulation:initial 值 -->
          <template v-else>
            <q-input
              :model-value="String((resolver as Extract<FieldValueResolver, { kind: 'accumulation' }>).initial)"
              :disable="disable"
              outlined
              dense
              type="number"
              label="初始值"
              @update:model-value="updateFieldResolver(ri, { kind: 'accumulation', fieldId: resolver.fieldId, initial: Number($event) || 0 })"
            />
            <div class="rw-text-desc text-caption">
              递推公式在帧的表达式配置里定义(如"速度+速度步进"),累积值在单步内连续、步结束时重置。
            </div>
          </template>
        </div>
      </div>
    </q-expansion-item>
  </div>
</template>
