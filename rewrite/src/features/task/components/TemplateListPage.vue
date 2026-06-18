<script setup lang="ts">
import { ref, shallowRef, computed } from 'vue';
import { useQuasar, type QForm } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import DataTable from '@/widgets/DataTable.vue';
import TableToolbar from '@/widgets/TableToolbar.vue';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';
import SendStepEditor from '@/features/task/components/SendStepEditor.vue';
import WaitConditionStepEditor from '@/features/task/components/WaitConditionStepEditor.vue';
import DelayStepEditor from '@/features/task/components/DelayStepEditor.vue';
import AdvancedConfigPanel from '@/features/task/components/AdvancedConfigPanel.vue';
import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import { useAsyncAction, useNotify } from '@/shared/composables';
import { formatDateTime } from '@/shared/utils/format';
import type { TaskStepDefinition, TaskTemplate } from '@/features/task/core';
import { exportTemplates, parseImportedFile } from '@/features/task/services/task-template-io';
import { SCHEDULE_KIND_MAP, SCHEDULE_KIND_OPTIONS } from '@/features/task/components/scheduleKindMap';
import { STEP_KIND_LABELS, ADD_STEP_OPTIONS, createBlankStepByKind } from '@/features/task/components/task-labels';
import { useTemplateEditor } from '@/features/task/composables/use-template-editor';
import type { TemplateTableRow } from '@/features/task/components/template-columns';
import { templateColumns } from '@/features/task/components/template-columns';

defineOptions({ name: 'TemplateListPage' });

const emit = defineEmits<{
  instantiated: [instanceId: string];
}>();

const $q = useQuasar();
const notify = useNotify();
const { execute: executeAction, isOperating } = useAsyncAction();
const runtime = useRewriteRuntime();
const taskService = runtime.features.taskService;
const frameService = runtime.features.frameService;
const connectionService = runtime.features.connectionService;

const editor = useTemplateEditor(taskService);

const searchText = ref('');
const selectedTagFilters = shallowRef<readonly string[]>([]);
const rows = shallowRef<TemplateTableRow[]>([]);
const selectedRow = shallowRef<TemplateTableRow[]>([]);
const editorFormRef = ref<QForm | null>(null);
const importInputRef = ref<HTMLInputElement | null>(null);

const allTags = computed<readonly string[]>(() => {
  const set = new Set<string>();
  for (const tpl of taskService.listTemplates()) {
    for (const t of tpl.tags) set.add(t);
  }
  return Array.from(set).sort();
});

refresh();

function toTemplateRow(tpl: TaskTemplate): TemplateTableRow {
  const kind = tpl.definition.schedule.kind;
  return {
    templateId: tpl.templateId,
    name: tpl.name,
    scheduleKind: kind,
    scheduleKindDisplay: SCHEDULE_KIND_MAP[kind] ?? { color: 'grey', label: kind },
    tags: [...tpl.tags],
    stepCount: tpl.definition.steps.length,
    updatedAt: tpl.updatedAt,
    _original: tpl,
  };
}

function refresh(): void {
  const all = taskService.listTemplates().map(toTemplateRow);
  const q = searchText.value.trim().toLowerCase();
  const filters = selectedTagFilters.value;
  rows.value = all.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (filters.length > 0 && !filters.every((f) => r.tags.includes(f))) return false;
    return true;
  });
}

function onSearchChange(value: string): void {
  searchText.value = value;
  refresh();
}

function onRowClick(row: TemplateTableRow): void {
  selectedRow.value = [row];
}

function onSelectionChange(selected: TemplateTableRow[]): void {
  selectedRow.value = selected;
}

function onNewTemplate(): void {
  editor.openNew();
}

function onEditTemplate(): void {
  if (selectedRow.value.length === 0) {
    notify.warning('请先选择一个模板');
    return;
  }
  editor.openEdit(selectedRow.value[0].templateId);
}

function onInstantiate(tpl: TaskTemplate): void {
  const inst = taskService.instanciateTemplate(tpl.templateId);
  notify.success(`已从模板 "${tpl.name}" 创建实例`);
  emit('instantiated', inst.instanceId);
}

function onDeleteTemplate(tpl: TaskTemplate): void {
  $q.dialog({
    title: '确认删除',
    message: `确定要删除模板 "${tpl.name}" 吗？此操作不可撤销。`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    taskService.deleteTemplate(tpl.templateId);
    notify.success('模板已删除');
    selectedRow.value = [];
    refresh();
  });
}

function triggerImport(): void {
  importInputRef.value?.click();
}

async function onImportFilePicked(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  await executeAction('import-templates', async () => {
    const imported = await parseImportedFile(file);
    const existingIds = new Set(taskService.listTemplates().map((t) => t.templateId));
    let added = 0;
    let skipped = 0;
    for (const tpl of imported) {
      if (existingIds.has(tpl.templateId)) {
        skipped++;
        continue;
      }
      taskService.createTemplate(tpl.name, tpl.definition, tpl.tags);
      added++;
    }
    refresh();
    notify.success(`导入完成：新增 ${added} 个${skipped > 0 ? `，跳过 ${skipped} 个同 ID` : ''}`);
  });
  target.value = '';
}

function onExport(): void {
  const templates = taskService.listTemplates();
  if (templates.length === 0) {
    notify.warning('当前没有模板可导出');
    return;
  }
  void executeAction('export-templates', async () => {
    const blob = exportTemplates(templates);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(`已导出 ${templates.length} 个模板`);
  });
}

function onEditorHide(): void {
  editor.close();
}

function onSave(): void {
  try {
    const id = editor.save();
    if (id) {
      notify.success(editor.editingTemplateId.value ? '模板已更新' : '模板已保存');
      refresh();
    }
  } catch (err) {
    notify.error('保存失败', err instanceof Error ? err.message : '未知错误');
  }
}

function onAddStep(kind: string): void {
  const step = createBlankStepByKind(kind as TaskStepDefinition['kind']);
  editor.addStep(step);
}

function onStepUpdate(si: number, updated: TaskStepDefinition): void {
  editor.updateStep(si, updated);
}

function onStepNameUpdate(si: number, name: string): void {
  const step = editor.steps[si];
  editor.updateStep(si, { ...step, name });
}

function hasPreviousSendStep(si: number): boolean {
  return si > 0 && editor.steps[si - 1]?.kind === 'send';
}

function onToggleTagFilter(tag: string): void {
  const current = selectedTagFilters.value;
  selectedTagFilters.value = current.includes(tag)
    ? current.filter((t) => t !== tag)
    : [...current, tag];
  refresh();
}
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <!-- Toolbar -->
    <TableToolbar
      :search-model-value="searchText"
      search-placeholder="搜索模板名称..."
      @update:search-model-value="onSearchChange"
    >
      <template #filters>
        <q-chip
          v-for="tag in allTags"
          :key="tag"
          dense
          clickable
          :color="selectedTagFilters.includes(tag) ? 'primary' : 'grey-4'"
          :text-color="selectedTagFilters.includes(tag) ? 'white' : 'grey-7'"
          @click="onToggleTagFilter(tag)"
        >
          {{ tag }}
        </q-chip>
      </template>

      <template #actions>
        <q-btn unelevated no-caps color="primary" icon="o_add" label="新建模板" @click="onNewTemplate" />
        <q-btn flat no-caps icon="o_edit" label="编辑" :disable="selectedRow.length === 0" @click="onEditTemplate" />
        <q-btn flat no-caps icon="o_file_upload" label="导入" :loading="isOperating('import-templates')" @click="triggerImport" />
        <q-btn flat no-caps icon="o_file_download" label="导出" :loading="isOperating('export-templates')" @click="onExport" />
        <input
          ref="importInputRef"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="onImportFilePicked"
        />
      </template>
    </TableToolbar>

    <!-- Template list -->
    <DataTable
      :columns="templateColumns"
      :rows="rows"
      row-key="templateId"
      selection="single"
      :selected="selectedRow"
      container-height="calc(100vh - 200px)"
      @row-click="(_row: TemplateTableRow) => onRowClick(_row)"
      @update:selected="onSelectionChange"
    >
      <template #no-data>
        <div class="text-center w-full p-4 rw-text-label">暂无模板，点击"新建模板"开始</div>
      </template>

      <template #body-cell-scheduleKind="props">
        <q-td :props="props">
          <q-chip
            dense
            outline
            :color="props.row.scheduleKindDisplay.color"
            :label="props.row.scheduleKindDisplay.label"
            class="m-0"
          />
        </q-td>
      </template>

      <template #body-cell-tags="props">
        <q-td :props="props">
          <div class="flex items-center gap-1 flex-wrap">
            <q-chip
              v-for="tag in props.row.tags"
              :key="tag"
              dense
              color="grey-3"
              text-color="grey-8"
              class="m-0"
              :label="tag"
            />
            <span v-if="props.row.tags.length === 0" class="rw-text-desc text-xs">--</span>
          </div>
        </q-td>
      </template>

      <template #body-cell-updatedAt="props">
        <q-td :props="props">
          <span class="rw-text-value text-xs">{{ formatDateTime(props.row.updatedAt) }}</span>
        </q-td>
      </template>

      <template #body-cell-_actions="props">
        <q-td :props="props">
          <div class="flex items-center justify-center gap-1">
            <q-btn
              flat round dense icon="o_play_arrow" size="sm" color="positive"
              @click.stop="onInstantiate(props.row._original)"
            >
              <q-tooltip>实例化</q-tooltip>
            </q-btn>
            <q-btn
              flat round dense icon="o_edit" size="sm" color="primary"
              @click.stop="editor.openEdit(props.row.templateId)"
            >
              <q-tooltip>编辑</q-tooltip>
            </q-btn>
            <q-btn
              flat round dense icon="o_delete" size="sm" color="negative"
              @click.stop="onDeleteTemplate(props.row._original)"
            >
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </DataTable>

    <!-- Template editor dialog -->
    <q-dialog v-model="editor.isEditing.value" @hide="onEditorHide">
      <q-card class="rw-dialog-xl">
        <q-card-section>
          <div class="text-h6">{{ editor.editingTemplateId.value ? '编辑模板' : '新建模板' }}</div>
        </q-card-section>

        <q-card-section class="pt-0 rw-dialog-scroll-body">
          <q-form ref="editorFormRef" @submit.prevent>
            <div class="flex flex-col gap-4">
              <q-input
                v-model="editor.templateName.value"
                dense outlined
                label="模板名称"
                :rules="[(val: string) => !!val || '请输入模板名称']"
              />

              <div class="flex flex-col gap-1">
                <span class="rw-text-label text-xs">标签</span>
                <div class="flex items-center gap-2">
                  <q-input
                    v-model="editor.tagInput.value"
                    dense outlined
                    placeholder="输入标签后回车添加"
                    class="flex-1"
                    @keyup.enter="editor.addTag()"
                  />
                  <q-btn flat no-caps icon="o_add" label="添加" size="sm" color="primary" @click="editor.addTag()" />
                </div>
                <div v-if="editor.templateTags.value.length > 0" class="flex items-center gap-1 flex-wrap">
                  <q-chip
                    v-for="tag in editor.templateTags.value"
                    :key="tag"
                    dense
                    color="primary"
                    text-color="white"
                    class="m-0"
                    :label="tag"
                    removable
                    @remove="editor.removeTag(tag)"
                  />
                </div>
              </div>

              <div>
                <span class="rw-text-label text-xs">调度类型</span>
                <q-select
                  v-model="editor.scheduleKind.value"
                  :options="SCHEDULE_KIND_OPTIONS"
                  emit-value
                  map-options
                  outlined dense
                  class="mt-1"
                />
              </div>

              <template v-if="editor.scheduleKind.value === 'timer'">
                <q-input
                  v-model.number="editor.timerIntervalMs.value"
                  dense outlined
                  type="number"
                  label="间隔 (ms)"
                  :rules="[(val: number) => val > 0 || '间隔必须大于0']"
                />
                <div class="flex items-center gap-3">
                  <q-toggle v-model="editor.timerInfinite.value" label="无限循环" />
                  <q-input
                    v-if="!editor.timerInfinite.value"
                    v-model.number="editor.timerIterations.value"
                    dense outlined
                    type="number"
                    label="执行次数"
                    :rules="[(val: number) => val > 0 || '次数必须大于0']"
                    class="w-40"
                  />
                </div>
              </template>

              <template v-if="editor.scheduleKind.value === 'event'">
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="rw-text-label text-xs">触发条件</span>
                    <q-btn flat dense no-caps icon="o_add" label="添加条件" size="sm" color="primary" @click="editor.addEventCondition()" />
                  </div>
                  <div
                    v-for="(cond, ci) in editor.eventConditions.value"
                    :key="ci"
                    class="flex items-center gap-1"
                  >
                    <ConditionTermEditor
                      :model-value="cond"
                      :frame-service="frameService"
                      :show-logic-operator="ci > 0"
                      direction="receive"
                      @update:model-value="editor.updateEventCondition(ci, $event)"
                    />
                    <q-btn flat round dense icon="o_close" size="xs" color="negative" @click="editor.removeEventCondition(ci)" />
                  </div>
                  <div v-if="editor.eventConditions.value.length === 0" class="rw-text-desc text-xs">至少添加一条触发条件</div>
                  <q-input
                    :model-value="editor.eventCooldownMs.value"
                    dense outlined
                    type="number"
                    label="冷却时间 (ms)"
                    @update:model-value="editor.eventCooldownMs.value = Number($event) || 0"
                  />
                </div>
              </template>

              <div>
                <span class="rw-text-label text-xs">默认发送目标</span>
                <SendTargetSelector
                  :model-value="editor.defaultTargetId.value"
                  :connection-service="connectionService"
                  class="mt-1"
                  @update:model-value="editor.defaultTargetId.value = $event"
                />
                <div class="rw-text-desc text-caption mt-1">未在步骤内单独覆盖时，所有 send 步骤使用此目标</div>
                <q-btn
                  flat dense no-caps
                  label="清空所有步骤的发送目标覆盖"
                  size="sm"
                  color="primary"
                  @click="editor.clearAllStepTargetOverrides()"
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
                  v-for="(step, si) in editor.steps.value"
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
                      @copy-previous="editor.duplicateStepValuesFromPrevious(si)"
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
                      @click="editor.removeStep(si)"
                    />
                  </div>
                </q-expansion-item>

                <div v-if="editor.steps.value.length === 0" class="rw-text-desc text-xs text-center p-2">
                  点击上方按钮添加步骤
                </div>
              </div>

              <q-separator />

              <AdvancedConfigPanel
                :stop-condition="editor.stopCondition.value"
                :error-policy="editor.errorPolicy.value"
                :frame-service="frameService"
                @update:stop-condition="editor.stopCondition.value = $event ?? {}"
                @update:error-policy="editor.errorPolicy.value = $event"
              />

              <template v-if="editor.validationIssues.value.length > 0">
                <q-separator />
                <div class="flex flex-col gap-1">
                  <div
                    v-for="(issue, ii) in editor.validationIssues.value"
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
          <q-btn flat no-caps label="取消" @click="editor.isEditing.value = false" />
          <q-btn
            unelevated no-caps color="primary"
            label="保存"
            :loading="editor.isSaving.value"
            :disable="editor.hasErrors.value"
            @click="onSave"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>
