<script setup lang="ts">
import { computed, ref, shallowRef, toRaw, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  cloneFrameField,
  type FrameFieldDefinition,
  type ValidationIssue,
  type ExpressionDefinition,
  type FrameOptionDefinition,
} from '@/features/frame';
import { validateFrameField } from '@/features/frame/core';
import { createEmptyField } from '@/features/frame/composables/use-field-editor';
import FrameFieldExpressionConfig from './FrameFieldExpressionConfig.vue';
import FrameFieldOptionConfig from './FrameFieldOptionConfig.vue';
import {
  DATA_TYPE_OPTIONS,
  INPUT_TYPE_OPTIONS,
  PARTICIPATION_OPTIONS,
  CHECKSUM_METHOD_OPTIONS,
} from './field-labels';

const props = defineProps<{
  modelValue: boolean;
  field: FrameFieldDefinition | null;
  isNew: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [field: FrameFieldDefinition];
}>();

const $q = useQuasar();

const workingField = shallowRef<FrameFieldDefinition>(createEmptyField());
const fieldDirty = ref(false);
const validationIssues = shallowRef<readonly ValidationIssue[]>([]);

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.field) {
      workingField.value = cloneFrameField(props.field);
      fieldDirty.value = false;
      validationIssues.value = [];
    }
  },
);

function updateField(patch: Partial<FrameFieldDefinition>): void {
  workingField.value = { ...toRaw(workingField.value), ...patch };
  fieldDirty.value = true;
}

function updateExpression(expr: ExpressionDefinition): void {
  updateField({ expressionConfig: expr });
}

function updateOptions(options: FrameOptionDefinition[]): void {
  updateField({ options });
}

function tryClose(): void {
  if (fieldDirty.value) {
    $q
      .dialog({
        title: '未保存的修改',
        message: '字段有未保存的修改，确定关闭吗？',
        cancel: true,
        persistent: true,
      })
      .onOk(() => emit('update:modelValue', false));
  } else {
    emit('update:modelValue', false);
  }
}

function save(): void {
  const field = toRaw(workingField.value);
  const result = validateFrameField(field);
  if (!result.valid) {
    validationIssues.value = result.issues;
    return;
  }
  validationIssues.value = [];
  emit('save', field);
  emit('update:modelValue', false);
}

function onDialogHide(): void {
  fieldDirty.value = false;
  validationIssues.value = [];
}

function ensureChecksum(): void {
  if (!workingField.value.validOption) {
    updateField({
      validOption: {
        isChecksum: false,
        startFieldIndex: 0,
        endFieldIndex: 0,
        checksumMethod: 'xor8',
      },
    });
  }
}

const requiredRule = (val: string) => !!val?.trim() || '此项为必填';
const positiveIntRule = (val: number) =>
  (Number.isInteger(val) && val > 0) || '必须是正整数';

type OptionInputType = 'select' | 'radio';
const inputTypeForOptionConfig = computed<OptionInputType>(() => workingField.value.inputType as OptionInputType);

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});
</script>

<template>
  <q-dialog
    v-model="dialogVisible"
    persistent
    @hide="onDialogHide"
  >
    <q-card class="rw-dialog-lg">
      <!-- Header -->
      <q-card-section class="flex items-center justify-between rw-divider-b">
        <span class="text-h6">{{ isNew ? '添加字段' : '编辑字段' }}</span>
        <q-btn flat round dense icon="o_close" @click="tryClose" />
      </q-card-section>

      <!-- Body -->
      <q-card-section
        class="flex gap-6 py-3 rw-dialog-scroll-body"
      >
        <!-- Left: basic properties -->
        <div class="flex-1">
          <q-form>
            <q-input
              outlined
              dense
              :model-value="workingField.name"
              label="名称 *"
              :rules="[requiredRule]"
              @update:model-value="(v: string) => updateField({ name: v })"
            />
            <q-input
              outlined
              dense
              :model-value="workingField.id"
              label="字段ID"
              :disable="!isNew"
              class="mt-2"
              @update:model-value="(v: string) => updateField({ id: v })"
            />
            <q-select
              outlined
              dense
              :model-value="workingField.dataType"
              :options="DATA_TYPE_OPTIONS"
              emit-value
              map-options
              label="数据类型 *"
              class="mt-2"
              @update:model-value="(v: string) => updateField({ dataType: v })"
            />
            <div class="flex gap-2 mt-2">
              <q-input
                outlined
                dense
                :model-value="workingField.length"
                type="number"
                label="长度 *"
                class="flex-1"
                :rules="[(v: number) => positiveIntRule(Number(v))]"
                @update:model-value="(v: string) => updateField({ length: Number(v) ?? 1 })"
              />
              <q-input
                outlined
                dense
                :model-value="workingField.factor"
                type="number"
                label="倍率"
                class="w-[100px]"
                @update:model-value="(v: string) => updateField({ factor: v ? Number(v) : undefined })"
              />
            </div>
            <q-select
              outlined
              dense
              :model-value="workingField.inputType"
              :options="INPUT_TYPE_OPTIONS"
              emit-value
              map-options
              label="输入类型 *"
              class="mt-2"
              @update:model-value="(v: string) => updateField({ inputType: v })"
            />
            <q-input
              outlined
              dense
              :model-value="workingField.defaultValue"
              label="默认值"
              class="mt-2"
              @update:model-value="(v: string) => updateField({ defaultValue: v || undefined })"
            />
            <q-select
              outlined
              dense
              :model-value="workingField.dataParticipationType"
              :options="PARTICIPATION_OPTIONS"
              emit-value
              map-options
              label="参与类型 *"
              class="mt-2"
              @update:model-value="(v: string) => updateField({ dataParticipationType: v })"
            />
            <div class="flex gap-4 mt-2">
              <q-toggle
                :model-value="workingField.configurable"
                label="可配置"
                @update:model-value="(v: boolean) => updateField({ configurable: v })"
              />
              <q-toggle
                :model-value="!workingField.bigEndian"
                label="小端"
                @update:model-value="(v: boolean) => updateField({ bigEndian: !v })"
              />
            </div>
            <q-toggle
              v-if="workingField.dataType === 'bytes'"
              :model-value="workingField.isASCII ?? false"
              label="ASCII"
              class="mt-2"
              @update:model-value="(v: boolean) => updateField({ isASCII: v })"
            />
            <q-input
              outlined
              dense
              autogrow
              :model-value="workingField.description"
              label="描述"
              class="mt-2"
              @update:model-value="(v: string) => updateField({ description: v || undefined })"
            />

            <!-- Checksum (collapsible) -->
            <q-expansion-item
              dense
              label="校验和配置"
              class="mt-2"
              @show="ensureChecksum"
            >
              <template v-if="workingField.validOption">
                <q-toggle
                  :model-value="workingField.validOption.isChecksum"
                  label="启用校验和"
                  @update:model-value="(v: boolean) => updateField({
                    validOption: { ...workingField.validOption!, isChecksum: v }
                  })"
                />
                <template v-if="workingField.validOption.isChecksum">
                  <q-select
                    outlined
                    dense
                    :model-value="workingField.validOption.checksumMethod"
                    :options="CHECKSUM_METHOD_OPTIONS"
                    emit-value
                    map-options
                    label="校验方法"
                    class="mt-2"
                    @update:model-value="(v: string) => updateField({
                      validOption: { ...workingField.validOption!, checksumMethod: v }
                    })"
                  />
                  <div class="flex gap-2 mt-2">
                    <q-input
                      outlined
                      dense
                      :model-value="workingField.validOption.startFieldIndex"
                      type="number"
                      label="起始字段"
                      class="flex-1"
                      @update:model-value="(v: string) => updateField({
                        validOption: { ...workingField.validOption!, startFieldIndex: Number(v) ?? 0 }
                      })"
                    />
                    <q-input
                      outlined
                      dense
                      :model-value="workingField.validOption.endFieldIndex"
                      type="number"
                      label="结束字段"
                      class="flex-1"
                      @update:model-value="(v: string) => updateField({
                        validOption: { ...workingField.validOption!, endFieldIndex: Number(v) ?? 0 }
                      })"
                    />
                  </div>
                </template>
              </template>
            </q-expansion-item>
          </q-form>
        </div>

        <!-- Right: type-specific config -->
        <div class="w-[45%]">
          <FrameFieldExpressionConfig
            v-if="workingField.inputType === 'expression'"
            :expression="workingField.expressionConfig ?? { expressions: [], variables: [] }"
            @update:expression="updateExpression"
          />
          <FrameFieldOptionConfig
            v-else-if="workingField.inputType === 'select' || workingField.inputType === 'radio'"
            :options="workingField.options"
            :input-type="inputTypeForOptionConfig"
            @update:options="updateOptions"
          />
          <div
            v-else
            class="rw-text-desc text-body2 flex items-center justify-center h-full"
          >
            当前输入类型无需额外配置
          </div>
        </div>
      </q-card-section>

      <!-- Validation issues -->
      <q-card-section v-if="validationIssues.length > 0" class="rw-divider-t">
        <div class="rw-text-error text-caption">
          <div v-for="(issue, i) in validationIssues" :key="issue.code + ':' + i">
            {{ issue.message }}
          </div>
        </div>
      </q-card-section>

      <!-- Actions -->
      <q-card-actions align="right" class="rw-divider-t">
        <q-btn flat no-caps label="取消" @click="tryClose" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          label="确认保存"
          @click="save"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
