<script setup lang="ts">
import { provide } from 'vue';
import { useRoute } from 'vue-router';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import type { FrameFieldDefinition } from '@/features/frame';
import { useFrameEditor } from '@/features/frame/composables/use-frame-editor';
import { useFieldEditor } from '@/features/frame/composables/use-field-editor';
import { FRAME_EDITOR_KEY } from '@/features/frame/composables/injection-key';
import FrameBasicInfoForm from '@/features/frame/components/FrameBasicInfoForm.vue';
import FrameIdentifierRulesEditor from '@/features/frame/components/FrameIdentifierRulesEditor.vue';
import FrameFieldList from '@/features/frame/components/FrameFieldList.vue';
import FrameFieldEditorDialog from '@/features/frame/components/FrameFieldEditorDialog.vue';

const route = useRoute();
const runtime = useRewriteRuntime();
const frameService = runtime.features.frameService;

const routeFrameId = (route.params.frameId as string) || undefined;

const {
  fieldEditorOpen,
  editingFieldIndex,
  editingField,
  fieldDirty,
  openAdd,
  openEdit,
  closeEditor,
} = useFieldEditor();

const {
  workingFrame,
  isDirty,
  isNew,
  isSaving,
  validationIssues,
  save,
  updateFrame,
} = useFrameEditor(routeFrameId, fieldDirty);

// Provide context for FrameFieldExpressionConfig (injection avoids prop drilling)
provide(FRAME_EDITOR_KEY, {
  get frameId() {
    return workingFrame.value.id;
  },
  get allFields() {
    return workingFrame.value.fields;
  },
  listFrameReferences: () => frameService.listFrameReferences(),
  listFieldReferences: (fid: string) =>
    frameService.listFieldReferences({ frameId: fid }),
});

// ===== Field operations =====

function updateFields(updater: (fields: FrameFieldDefinition[]) => void): void {
  const fields = [...workingFrame.value.fields];
  updater(fields);
  updateFrame({ fields });
}

function onFieldAdd(): void {
  openAdd();
}

function onFieldEdit(index: number): void {
  const field = workingFrame.value.fields[index];
  if (field) openEdit(index, field);
}

function onFieldSave(field: FrameFieldDefinition): void {
  updateFields((fields) => {
    if (editingFieldIndex.value === null) fields.push(field);
    else fields[editingFieldIndex.value!] = field;
  });
  closeEditor();
}

function onFieldRemove(index: number): void {
  updateFields((fields) => fields.splice(index, 1));
}

function moveField(from: number, to: number): void {
  updateFields((fields) => {
    const [item] = fields.splice(from, 1);
    fields.splice(to, 0, item);
  });
}

function onFieldMoveUp(index: number): void {
  if (index > 0) moveField(index, index - 1);
}

function onFieldMoveDown(index: number): void {
  if (index < workingFrame.value.fields.length - 1) moveField(index, index + 1);
}

const pageTitle = isNew ? '创建帧配置' : '编辑帧配置';
</script>

<template>
  <q-page class="frame-editor-page">
    <div class="mx-auto max-w-[1120px] p-4">
      <!-- Sticky header bar -->
      <div class="flex items-center justify-between pb-4 mb-4 rw-divider-b">
        <div class="flex items-center gap-2">
          <q-btn flat round dense icon="arrow_back" color="primary" to="/frames" />
          <span class="text-h6">{{ pageTitle }}</span>
        </div>
        <div class="flex items-center gap-2">
          <q-btn flat no-caps label="取消" to="/frames" />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="保存"
            :loading="isSaving"
            :disable="!isDirty"
            @click="save"
          />
        </div>
      </div>

      <!-- Validation issues -->
      <div v-if="validationIssues.length > 0" class="q-mb-md">
        <q-banner dense rounded class="bg-negative text-white">
          <template #avatar>
            <q-icon name="error" />
          </template>
          <div v-for="(issue, i) in validationIssues" :key="issue.code + ':' + i">
            {{ issue.message }}
          </div>
        </q-banner>
      </div>

      <!-- Basic info -->
      <div class="q-mb-md">
        <FrameBasicInfoForm
          :frame="workingFrame"
          :is-new="isNew"
          @update:frame="updateFrame"
        />
      </div>

      <!-- Identifier rules (receive only) -->
      <div v-if="workingFrame.direction === 'receive'" class="q-mb-md">
        <FrameIdentifierRulesEditor
          :rules="workingFrame.identifierRules ?? []"
          @update:rules="(v) => updateFrame({ identifierRules: v })"
        />
      </div>

      <!-- Field list -->
      <div class="q-mb-md">
        <FrameFieldList
          :fields="workingFrame.fields"
          @add="onFieldAdd"
          @edit="onFieldEdit"
          @remove="onFieldRemove"
          @move-up="onFieldMoveUp"
          @move-down="onFieldMoveDown"
        />
      </div>
    </div>

    <!-- Field editor dialog -->
    <FrameFieldEditorDialog
      v-model="fieldEditorOpen"
      :field="editingField"
      :is-new="editingFieldIndex === null"
      @save="onFieldSave"
    />
  </q-page>
</template>

<style scoped lang="scss">
.frame-editor-page {
  background: var(--rw-color-surface-app);
  min-height: 100%;
}
</style>
