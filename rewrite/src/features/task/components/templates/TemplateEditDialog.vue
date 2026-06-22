<script setup lang="ts">
// 模板编辑弹窗：从 TemplateListPage 内联抽出的独立组件（S011）。
// 内含模板名/标签/调度类型/默认发送目标/步骤列表/高级配置/校验问题。
// editor 由 use-template-editor 实例驱动（page 持有，prop 传入），本组件只做展示 + emit save。

import { ref, type QForm } from 'quasar';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';
import SendStepEditor from '@/features/task/components/SendStepEditor.vue';
import WaitConditionStepEditor from '@/features/task/components/WaitConditionStepEditor.vue';
import DelayStepEditor from '@/features/task/components/DelayStepEditor.vue';
import AdvancedConfigPanel from '@/features/task/components/AdvancedConfigPanel.vue';
import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import type { FrameAssetService } from '@/features/frame';
import type { ConnectionService } from '@/features/connection';
import type { TaskStepDefinition } from '@/features/task/core';
import { SCHEDULE_KIND_OPTIONS } from '@/features/task/components/scheduleKindMap';
import { STEP_KIND_LABELS, ADD_STEP_OPTIONS, createBlankStepByKind } from '@/features/task/components/task-labels';
import type { useTemplateEditor } from '@/features/task/composables/use-template-editor';

interface Props {
  /** v-model 控制显隐 */
  modelValue: boolean;
  /** 编辑器实例（page 持有的 use-template-editor 返回值） */
  editor: ReturnType<typeof useTemplateEditor>;
  frameService: FrameAssetService;
  connectionService: ConnectionService;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 保存（page 调 editor.save + refresh） */
  save: [];
  /** hide 时清理（page 调 editor.close） */
  hide: [];
  /** 单字段更新（D003：子组件不 mutate prop，page 在 editor ref 上赋值） */
  'patch-field': [payload: { field: EditorField; value: unknown }];
}>();

// 编辑器可 patch 的标量字段（复杂数组/对象走 editor 的方法）
type EditorField =
  | 'templateName'
  | 'tagInput'
  | 'scheduleKind'
  | 'timerIntervalMs'
  | 'timerInfinite'
  | 'timerIterations'
  | 'eventCooldownMs'
  | 'defaultTargetId'
  | 'stopCondition'
  | 'errorPolicy';

// 单字段 patch helper：统一 emit，page 负责在 editor ref 上赋值
function patchField<T>(field: EditorField, value: T): void {
  emit('patch-field', { field, value });
}

const editorFormRef = ref<QForm | null>(null);

function onAddStep(kind: string): void {
  const step = createBlankStepByKind(kind as TaskStepDefinition['kind']);
  props.editor.addStep(step);
}

function onStepUpdate(si: number, updated: TaskStepDefinition): void {
  props.editor.updateStep(si, updated);
}

function onStepNameUpdate(si: number, name: string): void {
  const step = props.editor.steps[si];
  props.editor.updateStep(si, { ...step, name });
}

function hasPreviousSendStep(si: number): boolean {
  return si > 0 && props.editor.steps[si - 1]?.kind === 'send';
}

// q-dialog 的 hide 事件触发清理（对应原 @hide="onEditorHide"）
function onDialogHide(): void {
  emit('hide');
}
</script>

<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" @hide="onDialogHide">
    <q-card class="rw-dialog-xl">
      <q-card-section>
        <div class="text-h6">{{ props.editor.editingTemplateId.value ? '编辑模板' : '新建模板' }}</div>
      </q-card-section>

      <q-card-section class="pt-0 rw-dialog-scroll-body">
        <q-form ref="editorFormRef" @submit.prevent>
          <div class="flex flex-col gap-4">
            <q-input
              :model-value="props.editor.templateName.value"
              dense outlined
              label="模板名称"
              :rules="[(val: string) => !!val || '请输入模板名称']"
              @update:model-value="(v: string | number | null) => patchField('templateName', String(v ?? ''))"
            />

            <div class="flex flex-col gap-1">
              <span class="rw-text-label text-xs">标签</span>
              <div class="flex items-center gap-2">
                <q-input
                  :model-value="props.editor.tagInput.value"
                  dense outlined
                  placeholder="输入标签后回车添加"
                  class="flex-1"
                  @keyup.enter="props.editor.addTag()"
                  @update:model-value="(v: string | number | null) => patchField('tagInput', String(v ?? ''))"
                />
                <q-btn flat no-caps icon="o_add" label="添加" size="sm" color="primary" @click="props.editor.addTag()" />
              </div>
              <div v-if="props.editor.templateTags.value.length > 0" class="flex items-center gap-1 flex-wrap">
                <q-chip
                  v-for="tag in props.editor.templateTags.value"
                  :key="tag"
                  dense
                  color="primary"
                  text-color="white"
                  class="m-0"
                  :label="tag"
                  removable
                  @remove="props.editor.removeTag(tag)"
                />
              </div>
            </div>

            <div>
              <span class="rw-text-label text-xs">调度类型</span>
              <q-select
                :model-value="props.editor.scheduleKind.value"
                :options="SCHEDULE_KIND_OPTIONS"
                emit-value
                map-options
                outlined dense
                class="mt-1"
                @update:model-value="(v: string) => patchField('scheduleKind', v)"
              />
            </div>

            <template v-if="props.editor.scheduleKind.value === 'timer'">
              <q-input
                :model-value="props.editor.timerIntervalMs.value"
                dense outlined
                type="number"
                label="间隔 (ms)"
                :rules="[(val: number) => val > 0 || '间隔必须大于0']"
                @update:model-value="(v: string | number | null) => patchField('timerIntervalMs', Number(v) || 0)"
              />
              <div class="flex items-center gap-3">
                <q-toggle
                  :model-value="props.editor.timerInfinite.value"
                  label="无限循环"
                  @update:model-value="(v: boolean) => patchField('timerInfinite', v)"
                />
                <q-input
                  v-if="!props.editor.timerInfinite.value"
                  :model-value="props.editor.timerIterations.value"
                  dense outlined
                  type="number"
                  label="执行次数"
                  :rules="[(val: number) => val > 0 || '次数必须大于0']"
                  class="w-40"
                  @update:model-value="(v: string | number | null) => patchField('timerIterations', Number(v) || 0)"
                />
              </div>
            </template>

            <template v-if="props.editor.scheduleKind.value === 'event'">
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="rw-text-label text-xs">触发条件</span>
                  <q-btn flat dense no-caps icon="o_add" label="添加条件" size="sm" color="primary" @click="props.editor.addEventCondition()" />
                </div>
                <div
                  v-for="(cond, ci) in props.editor.eventConditions.value"
                  :key="ci"
                  class="flex items-center gap-1"
                >
                  <ConditionTermEditor
                    :model-value="cond"
                    :frame-service="frameService"
                    :show-logic-operator="ci > 0"
                    direction="receive"
                    @update:model-value="props.editor.updateEventCondition(ci, $event)"
                  />
                  <q-btn flat round dense icon="o_close" size="xs" color="negative" @click="props.editor.removeEventCondition(ci)" />
                </div>
                <div v-if="props.editor.eventConditions.value.length === 0" class="rw-text-desc text-xs">至少添加一条触发条件</div>
                <q-input
                  :model-value="props.editor.eventCooldownMs.value"
                  dense outlined
                  type="number"
                  label="冷却时间 (ms)"
                  @update:model-value="(v: string | number | null) => patchField('eventCooldownMs', Number(v) || 0)"
                />
              </div>
            </template>

            <div>
              <span class="rw-text-label text-xs">默认发送目标</span>
              <SendTargetSelector
                :model-value="props.editor.defaultTargetId.value"
                :connection-service="connectionService"
                class="mt-1"
                @update:model-value="(v: string | null) => patchField('defaultTargetId', v)"
              />
              <div class="rw-text-desc text-caption mt-1">未在步骤内单独覆盖时，所有 send 步骤使用此目标</div>
              <q-btn
                flat dense no-caps
                label="清空所有步骤的发送目标覆盖"
                size="sm"
                color="primary"
                @click="props.editor.clearAllStepTargetOverrides()"
              />
            </div>

            <q-separator />

            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="rw-text-label text-xs">步骤列表</span>
                <q-btn-dropdown flat dense no-caps label="添加步骤" size="sm" color="primary">
                  <q-list>
                    <q-item
                      v-for="opt in ADD_STEP_OPTIONS"
                      :key="opt.value"
                      clickable
                      dense
                      v-close-popup
                      @click="onAddStep(opt.value)"
                    >
                      <q-item-section>{{ opt.label }}</q-item-section>
                    </q-item>
                  </q-list>
                </q-btn-dropdown>
              </div>

              <q-expansion-item
                v-for="(step, si) in props.editor.steps.value"
                :key="step.id"
                dense
                switch-toggle-side
                :label="step.name ?? STEP_KIND_LABELS[step.kind].label"
                :caption="STEP_KIND_LABELS[step.kind].label"
                header-class="rw-text-value text-sm"
              >
                <div class="pl-3 flex flex-col gap-3">
                  <SendStepEditor
                    v-if="step.kind === 'send'"
                    :step="step.config"
                    :step-name="step.name ?? ''"
                    :step-index="si"
                    :has-previous-send-step="hasPreviousSendStep(si)"
                    :frame-service="frameService"
                    :connection-service="connectionService"
                    @update:step="onStepUpdate(si, { ...step, config: $event })"
                    @update:step-name="onStepNameUpdate(si, $event)"
                    @copy-previous="props.editor.duplicateStepValuesFromPrevious(si)"
                  />

                  <WaitConditionStepEditor
                    v-if="step.kind === 'wait-condition'"
                    :step="step.config"
                    :step-name="step.name ?? ''"
                    :frame-service="frameService"
                    @update:step="onStepUpdate(si, { ...step, config: $event })"
                    @update:step-name="onStepNameUpdate(si, $event)"
                  />

                  <DelayStepEditor
                    v-if="step.kind === 'delay'"
                    :step="step.config"
                    :step-name="step.name ?? ''"
                    @update:step="onStepUpdate(si, { ...step, config: $event })"
                    @update:step-name="onStepNameUpdate(si, $event)"
                  />

                  <q-btn
                    flat dense no-caps
                    label="删除步骤"
                    icon="o_delete"
                    size="sm"
                    color="negative"
                    @click="props.editor.removeStep(si)"
                  />
                </div>
              </q-expansion-item>

              <div v-if="props.editor.steps.value.length === 0" class="rw-text-desc text-xs text-center p-2">
                点击上方按钮添加步骤
              </div>
            </div>

            <q-separator />

            <AdvancedConfigPanel
              :stop-condition="props.editor.stopCondition.value"
              :error-policy="props.editor.errorPolicy.value"
              :frame-service="frameService"
              @update:stop-condition="(v) => patchField('stopCondition', v ?? {})"
              @update:error-policy="(v) => patchField('errorPolicy', v)"
            />

            <q-separator />

            <template v-if="props.editor.validationIssues.value.length > 0">
              <q-separator />
              <div class="flex flex-col gap-1">
                <div
                  v-for="(issue, ii) in props.editor.validationIssues.value"
                  :key="ii"
                  class="text-xs"
                  :class="issue.severity === 'error' ? 'text-negative' : 'text-warning'"
                >
                  {{ issue.message }}
                </div>
              </div>
            </template>
          </div>
        </q-form>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat no-caps label="取消" @click="emit('update:modelValue', false)" />
        <q-btn
          unelevated no-caps color="primary"
          label="保存"
          :loading="props.editor.isSaving.value"
          @click="emit('save')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
