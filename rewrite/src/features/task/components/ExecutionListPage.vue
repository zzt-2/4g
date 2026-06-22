<script lang="ts">
const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'created', label: '待启动' },
  { value: 'running', label: '运行中' },
  { value: 'paused', label: '已暂停' },
] as const;
</script>

<script setup lang="ts">
import { ref, shallowRef, computed, onUnmounted } from 'vue';
import { useQuasar, type QForm } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import DataTable from '@/widgets/DataTable.vue';
import TableToolbar from '@/widgets/TableToolbar.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import TaskExecutionDetail from '@/widgets/TaskExecutionDetail.vue';
import ConditionTermEditor from '@/widgets/ConditionTermEditor.vue';
import SendStepEditor from '@/features/task/components/SendStepEditor.vue';
import WaitConditionStepEditor from '@/features/task/components/WaitConditionStepEditor.vue';
import DelayStepEditor from '@/features/task/components/DelayStepEditor.vue';
import AdvancedConfigPanel from '@/features/task/components/AdvancedConfigPanel.vue';
import SendTargetSelector from '@/features/send/components/SendTargetSelector.vue';
import { useAsyncAction, useNotify, usePolling } from '@/shared/composables';
import { formatElapsed, formatDateTime } from '@/shared/utils/format';
import { isTerminal, calculateProgress, applyDefaultTargetOverride } from '@/features/task/core';
import type { TaskStepDefinition, ReadonlyTaskInstanceState, TaskTemplate, TaskDefinition } from '@/features/task/core';
import { taskColumns, type TaskTableRow } from '@/features/task/components/task-columns';
import { historyColumns, type HistoryTableRow } from '@/features/task/components/history-columns';
import { TASK_STATUS_MAP, resolveDisplayStatus } from '@/features/task/components/taskStatusMap';
import { SCHEDULE_KIND_MAP, SCHEDULE_KIND_OPTIONS } from '@/features/task/components/scheduleKindMap';
import { STEP_KIND_LABELS, ADD_STEP_OPTIONS, createBlankStepByKind } from '@/features/task/components/task-labels';
import { useTaskEditor } from '@/features/task/composables/use-task-editor';
import { toTaskRow, toHistoryRow } from '@/features/task/composables/use-task-list';

defineOptions({ name: 'ExecutionListPage' });

const $q = useQuasar();
const notify = useNotify();
const { execute: executeAction, isOperating } = useAsyncAction();
const runtime = useRewriteRuntime();
const taskService = runtime.features.taskService;
const frameService = runtime.features.frameService;
const connectionService = runtime.features.connectionService;

const editor = useTaskEditor(taskService);

const activeTab = ref<'active' | 'history'>('active');
const searchText = ref('');
const statusFilter = ref('');
const editorFormRef = ref<QForm | null>(null);

const activeRows = shallowRef<TaskTableRow[]>([]);
const historyRows = shallowRef<HistoryTableRow[]>([]);
const selectedActiveRow = shallowRef<TaskTableRow[]>([]);
const selectedHistoryRow = shallowRef<HistoryTableRow[]>([]);

// ===== Batch set send target mode (active tab) =====
const batchMode = ref(false);
const batchSelectedActiveRows = shallowRef<TaskTableRow[]>([]);
const isBatchTargetDialogOpen = ref(false);
const batchTargetId = ref<string | null>(null);

function onOpenBatchSetTarget(): void {
  if (batchSelectedActiveRows.value.length === 0) {
    notify.warning('请先选择至少一个任务');
    return;
  }
  // updateTask 仅允许 lifecycle === 'created' 的实例更新——非 created 的跳过
  const editable = batchSelectedActiveRows.value.filter((r) => r.lifecycle === 'created');
  if (editable.length === 0) {
    notify.warning('选中的任务都不是待启动状态，无法修改');
    return;
  }
  let sendStepCount = 0;
  for (const row of editable) {
    for (const step of row._original.definitionRef.steps) {
      if (step.kind === 'send') sendStepCount++;
    }
  }
  if (sendStepCount === 0) {
    notify.warning('选中的任务里没有 send 步骤，无需设置发送目标');
    return;
  }
  batchTargetId.value = null;
  isBatchTargetDialogOpen.value = true;
}

function onConfirmBatchSetTarget(): void {
  if (!batchTargetId.value) {
    notify.warning('请选择一个发送目标');
    return;
  }
  const editable = batchSelectedActiveRows.value.filter((r) => r.lifecycle === 'created');
  const skipped = batchSelectedActiveRows.value.length - editable.length;
  let updated = 0;
  let affectedSteps = 0;
  for (const row of editable) {
    const inst = row._original;
    const nextDef = applyDefaultTargetOverride(inst.definitionRef as TaskDefinition, batchTargetId.value);
    const result = taskService.updateTask(inst.instanceId, nextDef);
    if (result) {
      updated++;
      for (const step of nextDef.steps) {
        if (step.kind === 'send') affectedSteps++;
      }
    }
  }
  isBatchTargetDialogOpen.value = false;
  batchSelectedActiveRows.value = [];
  selectedActiveRow.value = [];
  refreshLists();
  const skipNote = skipped > 0 ? `，跳过 ${skipped} 个非待启动任务` : '';
  notify.success(`已更新 ${updated} 个任务的默认发送目标（影响 ${affectedSteps} 个 send 步骤${skipNote}）`);
}

// Template picker state
const isTemplatePickerOpen = ref(false);
const templatePickerRows = shallowRef<readonly TaskTemplate[]>([]);
const pickerSearch = ref('');

const listPolling = usePolling(refreshLists, 1000);
listPolling.start();

function refreshLists(): void {
  const snapshot = taskService.getSnapshot();
  const active = snapshot.instances.filter((i) => !isTerminal(i.lifecycle));
  const filteredActive = statusFilter.value
    ? active.filter((i) => i.lifecycle === statusFilter.value)
    : active;
  activeRows.value = filteredActive.map(toTaskRow);

  const terminated = snapshot.instances.filter((i) => isTerminal(i.lifecycle));
  const historyIds = new Set(snapshot.history.map((i) => i.instanceId));
  const merged = [...snapshot.history, ...terminated.filter((i) => !historyIds.has(i.instanceId))];
  historyRows.value = merged.map(toHistoryRow);
}

onUnmounted(() => {
  listPolling.stop();
});

const selectedInstanceId = computed<string | null>(() => {
  if (activeTab.value === 'active' && selectedActiveRow.value.length > 0) {
    return selectedActiveRow.value[0].instanceId;
  }
  if (activeTab.value === 'history' && selectedHistoryRow.value.length > 0) {
    return selectedHistoryRow.value[0].instanceId;
  }
  return null;
});

const selectedInstance = computed<ReadonlyTaskInstanceState | null>(() => {
  const id = selectedInstanceId.value;
  if (!id) return null;
  // 始终从最新的 activeRows / historyRows 中按 id 解析，确保 polling 刷新后立刻反映 lifecycle/progress 变化
  const inActive = activeRows.value.find((r) => r.instanceId === id);
  if (inActive) return inActive._original;
  const inHistory = historyRows.value.find((r) => r.instanceId === id);
  if (inHistory) return inHistory._original;
  // 任务终态后可能从 active 列表消失但仍在历史里，historyRows 也会更新
  return null;
});

const selectedProgress = computed(() => {
  if (!selectedInstance.value) return null;
  return calculateProgress(selectedInstance.value);
});

const selectedDisplayStatus = computed(() => {
  if (!selectedInstance.value) return '';
  return resolveDisplayStatus(selectedInstance.value.lifecycle, selectedInstance.value.definitionRef);
});

const selectedStatusInfo = computed(() => {
  return TASK_STATUS_MAP[selectedDisplayStatus.value] ?? { label: selectedDisplayStatus.value, color: 'grey' };
});

const selectedScheduleKindDisplay = computed(() => {
  if (!selectedInstance.value) return { color: 'grey', label: '' };
  const kind = selectedInstance.value.definitionRef.schedule.kind;
  return SCHEDULE_KIND_MAP[kind] ?? { color: 'grey', label: kind };
});

const selectedTemplateLabel = computed(() => {
  if (!selectedInstance.value?.templateId) return '--';
  const tpl = taskService.getTemplate(selectedInstance.value.templateId);
  return tpl?.name ?? selectedInstance.value.templateId;
});

// targetId(connectionId) → 可读 label 的查找表。列表展示默认发送目标用。
const targetLabelMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  try {
    for (const t of connectionService.listTransportTargets()) {
      map[t.targetId] = `${t.label} (${t.kind})`;
    }
  } catch {
    // 无可用目标时返回空 map，列表显示原 id 截断
  }
  return map;
});

// templateId → 模板名称查找表。"来源模板"列展示名称而非 id。
const templateNameMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const tpl of taskService.listTemplates()) {
    map[tpl.templateId] = tpl.name;
  }
  return map;
});

function onActiveRowClick(row: TaskTableRow): void {
  selectedActiveRow.value = [row];
}

function onActiveSelectionChange(selected: TaskTableRow[]): void {
  selectedActiveRow.value = selected;
}

function onHistoryRowClick(row: HistoryTableRow): void {
  selectedHistoryRow.value = [row];
}

function onHistorySelectionChange(selected: HistoryTableRow[]): void {
  selectedHistoryRow.value = selected;
}

async function onStart(id: string): Promise<void> {
  await executeAction(`start-${id}`, async () => {
    taskService.startTask(id);
    notify.success('任务已启动');
    refreshLists();
  });
}

async function onPause(id: string): Promise<void> {
  await executeAction(`pause-${id}`, async () => {
    taskService.pauseTask(id);
    notify.info('任务已暂停');
    refreshLists();
  });
}

async function onResume(id: string): Promise<void> {
  await executeAction(`resume-${id}`, async () => {
    taskService.resumeTask(id);
    notify.success('任务已恢复');
    refreshLists();
  });
}

function onStop(id: string): void {
  $q.dialog({
    title: '确认停止',
    message: '确定要停止该任务吗？',
    cancel: true,
    persistent: false,
  }).onOk(async () => {
    await executeAction(`stop-${id}`, async () => {
      taskService.stopTask(id);
      notify.info('任务已停止');
      refreshLists();
    });
  });
}

async function onRemove(id: string): Promise<void> {
  $q.dialog({
    title: '确认删除',
    message: '确定要删除该任务吗？此操作不可撤销。',
    cancel: true,
    persistent: false,
  }).onOk(async () => {
    await executeAction(`remove-${id}`, async () => {
      taskService.removeTask(id);
      notify.success('任务已删除');
      selectedActiveRow.value = [];
      selectedHistoryRow.value = [];
      refreshLists();
    });
  });
}

async function onRetry(id: string): Promise<void> {
  await executeAction(`retry-${id}`, async () => {
    const result = taskService.retryTask(id);
    if (result) {
      notify.success('任务已重新执行');
      refreshLists();
    } else {
      notify.error('重新执行失败');
    }
  });
}

async function onStopAll(): Promise<void> {
  $q.dialog({
    title: '确认全部停止',
    message: '确定要停止所有运行中的任务吗？',
    cancel: true,
    persistent: false,
  }).onOk(async () => {
    await executeAction('stopAll', async () => {
      const count = taskService.stopAll();
      notify.info(`已停止 ${count} 个任务`);
      refreshLists();
    });
  });
}

function onCreateFromTemplate(): void {
  templatePickerRows.value = taskService.listTemplates();
  pickerSearch.value = '';
  if (templatePickerRows.value.length === 0) {
    notify.warning('当前没有可用模板，请先创建模板');
    return;
  }
  isTemplatePickerOpen.value = true;
}

function onPickTemplate(tpl: TaskTemplate): void {
  const inst = taskService.instanciateTemplate(tpl.templateId);
  notify.success(`已从模板 "${tpl.name}" 创建实例`);
  isTemplatePickerOpen.value = false;
  activeTab.value = 'active';
  refreshLists();
  // 选中新创建的实例
  const newRow = toTaskRow(inst);
  selectedActiveRow.value = [newRow];
}

const filteredPickerRows = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase();
  if (!q) return templatePickerRows.value;
  return templatePickerRows.value.filter((t) => t.name.toLowerCase().includes(q));
});

function onClearHistory(): void {
  $q.dialog({
    title: '确认清空',
    message: '确定要清空所有历史记录吗？此操作不可撤销。',
    cancel: true,
    persistent: false,
  }).onOk(() => {
    taskService.clearHistory();
    selectedHistoryRow.value = [];
    notify.success('历史记录已清空');
    refreshLists();
  });
}

function onNewBlankTask(): void {
  editor.openNew();
}

function onEditTask(): void {
  if (!selectedInstance.value) return;
  if (selectedInstance.value.lifecycle !== 'created') {
    notify.warning('只能编辑待启动状态的任务');
    return;
  }
  editor.openEdit(selectedInstance.value.instanceId);
}

function onEditorHide(): void {
  editor.close();
}

function onSave(): void {
  try {
    const id = editor.save();
    if (id) {
      notify.success('任务已保存');
      refreshLists();
    }
  } catch (err) {
    notify.error('保存失败', err instanceof Error ? err.message : '未知错误');
  }
}

function onSaveAndStart(): void {
  try {
    const id = editor.saveAndStart();
    if (id) {
      notify.success('任务已保存并启动');
      refreshLists();
    }
  } catch (err) {
    notify.error('保存并启动失败', err instanceof Error ? err.message : '未知错误');
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
</script>

<template>
  <div class="flex flex-1 min-h-0 overflow-hidden">
    <!-- Left: instance list with tabs -->
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <TableToolbar
        v-model:search-model-value="searchText"
        search-placeholder="搜索任务名称..."
      >
        <template #actions>
          <q-btn unelevated no-caps color="primary" icon="o_library_add" label="从模板创建" @click="onCreateFromTemplate" />
          <q-btn flat no-caps icon="o_add" label="空白任务" @click="onNewBlankTask" />
          <q-btn flat no-caps icon="o_stop_circle" label="全部停止" :disable="activeRows.length === 0" @click="onStopAll" />
          <q-btn
            v-if="activeTab === 'active'"
            flat no-caps
            :icon="batchMode ? 'o_close' : 'o_checklist'"
            :label="batchMode ? '退出批量' : '批量管理'"
            :color="batchMode ? 'negative' : 'grey'"
            @click="batchMode = !batchMode; batchSelectedActiveRows = []; selectedActiveRow = []"
          />
        </template>
      </TableToolbar>

      <q-tabs v-model="activeTab" dense inline-label class="px-4">
        <q-tab name="active" label="活动任务" no-caps />
        <q-tab name="history" label="历史记录" no-caps />
      </q-tabs>

      <div v-if="activeTab === 'active'" class="flex items-center gap-1 px-4 py-1">
        <q-chip
          v-for="opt in STATUS_FILTER_OPTIONS"
          :key="opt.value"
          dense
          clickable
          :color="statusFilter === opt.value ? 'primary' : 'grey-4'"
          :text-color="statusFilter === opt.value ? 'white' : 'grey-7'"
          @click="statusFilter = opt.value"
        >
          {{ opt.label }}
        </q-chip>
      </div>

      <!-- Batch mode toolbar (active tab only) -->
      <div v-if="activeTab === 'active' && batchMode" class="flex items-center gap-2 px-4 py-2 rw-divider-b flex-shrink-0">
        <q-btn
          flat dense no-caps
          icon="o_send"
          label="设置发送目标"
          color="primary"
          size="sm"
          :disable="batchSelectedActiveRows.length === 0"
          @click="onOpenBatchSetTarget"
        />
        <span class="rw-text-desc text-xs">{{ batchSelectedActiveRows.length }} 项已选中（仅待启动状态可修改）</span>
        <div class="flex-1" />
        <q-btn
          flat dense no-caps
          label="退出批量模式"
          size="sm"
          @click="batchMode = false; batchSelectedActiveRows = []"
        />
      </div>

      <q-tab-panels v-model="activeTab" animated keep-alive class="flex-1">
        <q-tab-panel name="active" class="p-0 pt-0">
          <DataTable
            :columns="taskColumns"
            :rows="activeRows"
            row-key="instanceId"
            :selection="batchMode ? 'multiple' : 'single'"
            :selected="batchMode ? batchSelectedActiveRows : selectedActiveRow"
            container-height="calc(100vh - 280px)"
            @row-click="(_row: TaskTableRow) => { if (!batchMode) onActiveRowClick(_row) }"
            @update:selected="batchMode ? (batchSelectedActiveRows = $event as TaskTableRow[]) : onActiveSelectionChange($event as TaskTableRow[])"
          >
            <template #no-data>
              <div class="text-center w-full p-4 rw-text-label">暂无活动任务</div>
            </template>

            <template #body-cell-templateId="props">
              <q-td :props="props">
                <span v-if="props.row.templateId" class="rw-text-value text-xs">{{ templateNameMap[props.row.templateId] ?? props.row.templateId.slice(0, 8) + '…' }}</span>
                <span v-else class="rw-text-desc text-xs">--</span>
              </q-td>
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

            <template #body-cell-defaultTargetId="props">
              <q-td :props="props">
                <span v-if="props.row.defaultTargetId" class="rw-text-value text-xs">
                  {{ targetLabelMap[props.row.defaultTargetId] ?? props.row.defaultTargetId.slice(0, 8) + '…' }}
                </span>
                <span v-else class="rw-text-desc text-xs">未设置</span>
              </q-td>
            </template>

            <template #body-cell-status="props">
              <q-td :props="props">
                <StatusBadge :status="props.row.displayStatus" :status-map="TASK_STATUS_MAP" />
              </q-td>
            </template>

            <template #body-cell-progress="props">
              <q-td :props="props">
                <div class="flex items-center gap-2">
                  <q-linear-progress
                    :value="props.row.progressPercent / 100"
                    color="primary"
                    size="4px"
                    class="flex-1"
                    rounded
                  />
                  <span class="rw-text-desc text-xs min-w-[32px] text-right">{{ props.row.progressLabel }}</span>
                </div>
              </q-td>
            </template>

            <template #body-cell-_actions="props">
              <q-td :props="props">
                <div v-if="!batchMode" class="flex items-center justify-center gap-1">
                  <q-btn
                    v-if="props.row.lifecycle === 'created'"
                    flat round dense icon="o_play_arrow" size="sm" color="positive"
                    :loading="isOperating(`start-${props.row.instanceId}`)"
                    @click.stop="onStart(props.row.instanceId)"
                  />
                  <q-btn
                    v-if="props.row.lifecycle === 'running'"
                    flat round dense icon="o_pause" size="sm" color="warning"
                    :loading="isOperating(`pause-${props.row.instanceId}`)"
                    @click.stop="onPause(props.row.instanceId)"
                  />
                  <q-btn
                    v-if="props.row.lifecycle === 'paused'"
                    flat round dense icon="o_play_arrow" size="sm" color="primary"
                    :loading="isOperating(`resume-${props.row.instanceId}`)"
                    @click.stop="onResume(props.row.instanceId)"
                  />
                  <q-btn
                    v-if="props.row.lifecycle === 'running' || props.row.lifecycle === 'paused'"
                    flat round dense icon="o_stop" size="sm" color="negative"
                    @click.stop="onStop(props.row.instanceId)"
                  />
                  <q-btn
                    v-if="props.row.lifecycle === 'created'"
                    flat round dense icon="o_edit" size="sm" color="primary"
                    @click.stop="onEditTask()"
                  />
                  <q-btn
                    v-if="isTerminal(props.row.lifecycle)"
                    flat round dense icon="o_delete" size="sm" color="negative"
                    @click.stop="onRemove(props.row.instanceId)"
                  />
                </div>
              </q-td>
            </template>
          </DataTable>
        </q-tab-panel>

        <q-tab-panel name="history" class="p-0 pt-0">
          <div v-if="historyRows.length > 0" class="flex justify-end px-4 py-1">
            <q-btn flat no-caps dense icon="o_delete_sweep" label="清空历史" size="sm" color="negative" @click="onClearHistory" />
          </div>
          <DataTable
            :columns="historyColumns"
            :rows="historyRows"
            row-key="instanceId"
            selection="single"
            :selected="selectedHistoryRow"
            container-height="calc(100vh - 280px)"
            @row-click="(_row: HistoryTableRow) => onHistoryRowClick(_row)"
            @update:selected="onHistorySelectionChange"
          >
            <template #no-data>
              <div class="text-center w-full p-4 rw-text-label">暂无历史记录</div>
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

            <template #body-cell-result="props">
              <q-td :props="props">
                <StatusBadge :status="props.row.lifecycle" :status-map="TASK_STATUS_MAP" />
              </q-td>
            </template>

            <template #body-cell-elapsed="props">
              <q-td :props="props">
                <span class="rw-text-value text-xs">{{ formatElapsed(props.row.elapsedMs) }}</span>
              </q-td>
            </template>

            <template #body-cell-finishedAt="props">
              <q-td :props="props">
                <span class="rw-text-value text-xs">{{ formatDateTime(props.row.finishedAt) }}</span>
              </q-td>
            </template>

            <template #body-cell-_actions="props">
              <q-td :props="props">
                <div class="flex items-center justify-center gap-1">
                  <q-btn
                    flat round dense icon="o_replay" size="sm" color="primary"
                    :loading="isOperating(`retry-${props.row.instanceId}`)"
                    @click.stop="onRetry(props.row.instanceId)"
                  />
                  <q-btn
                    flat round dense icon="o_delete" size="sm" color="negative"
                    @click.stop="onRemove(props.row.instanceId)"
                  />
                </div>
              </q-td>
            </template>
          </DataTable>
        </q-tab-panel>
      </q-tab-panels>
    </div>

    <!-- Right panel: 360px -->
    <div class="w-[360px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden rw-divider-l">
      <template v-if="selectedInstance">
        <template v-if="selectedInstance.lifecycle === 'created'">
          <div class="flex-1 min-h-0 overflow-y-auto">
            <div class="p-4 rw-divider-b">
              <div class="mb-3">
                <span class="rw-text-label text-xs">任务名称</span>
                <div class="rw-text-value">{{ selectedInstance.definitionRef.name }}</div>
              </div>
              <div class="mb-3">
                <span class="rw-text-label text-xs">来源模板</span>
                <div class="rw-text-value">{{ selectedTemplateLabel }}</div>
              </div>
              <div class="mb-3">
                <span class="rw-text-label text-xs">调度类型</span>
                <div class="mt-1">
                  <q-chip
                    dense
                    outline
                    :color="selectedScheduleKindDisplay.color"
                    :label="selectedScheduleKindDisplay.label"
                  />
                </div>
              </div>
              <div>
                <span class="rw-text-label text-xs">步骤数</span>
                <div class="rw-text-value">{{ selectedInstance.definitionRef.steps.length }}</div>
              </div>
            </div>

            <div class="p-4">
              <div class="flex items-center gap-2">
                <q-btn
                  unelevated no-caps color="primary"
                  icon="o_edit" label="编辑"
                  @click="onEditTask"
                />
                <q-btn
                  unelevated no-caps color="positive"
                  icon="o_play_arrow" label="启动"
                  :loading="isOperating(`start-${selectedInstance.instanceId}`)"
                  @click="onStart(selectedInstance.instanceId)"
                />
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="flex-1 min-h-0 p-4 flex flex-col">
            <TaskExecutionDetail
              :instance="selectedInstance"
              :progress="selectedProgress"
              :display-status="selectedDisplayStatus"
              :status-info="selectedStatusInfo"
              @pause="selectedInstance && onPause(selectedInstance.instanceId)"
              @resume="selectedInstance && onResume(selectedInstance.instanceId)"
              @stop="selectedInstance && onStop(selectedInstance.instanceId)"
            />
          </div>
          <div v-if="isTerminal(selectedInstance.lifecycle)" class="flex-shrink-0 p-4 rw-divider-t">
            <div class="flex items-center gap-2">
              <q-btn
                flat no-caps icon="o_replay" label="重新执行" color="primary"
                :loading="isOperating(`retry-${selectedInstance.instanceId}`)"
                @click="onRetry(selectedInstance.instanceId)"
              />
              <q-btn
                flat no-caps icon="o_delete" label="删除" color="negative"
                @click="onRemove(selectedInstance.instanceId)"
              />
            </div>
          </div>
        </template>
      </template>

      <div v-else class="flex flex-col items-center justify-center flex-1 rw-text-desc">
        <q-icon name="o_assignment" size="48px" color="grey" class="mb-2" />
        <p>请选择一个任务</p>
      </div>
    </div>

    <!-- Template picker dialog -->
    <q-dialog v-model="isTemplatePickerOpen">
      <q-card class="rw-dialog-md">
        <q-card-section>
          <div class="text-h6">从模板创建任务</div>
        </q-card-section>
        <q-card-section class="pt-0">
          <q-input
            v-model="pickerSearch"
            dense outlined
            placeholder="搜索模板名称..."
            class="mb-2"
          >
            <template #prepend>
              <q-icon name="o_search" size="xs" />
            </template>
          </q-input>
          <q-list bordered separator class="rounded">
            <q-item
              v-for="tpl in filteredPickerRows"
              :key="tpl.templateId"
              clickable
              @click="onPickTemplate(tpl)"
            >
              <q-item-section>
                <q-item-label class="rw-text-value">{{ tpl.name }}</q-item-label>
                <q-item-label caption>
                  {{ SCHEDULE_KIND_MAP[tpl.definition.schedule.kind]?.label ?? tpl.definition.schedule.kind }}
                  · {{ tpl.definition.steps.length }} 步
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-icon name="o_chevron_right" color="grey" />
              </q-item-section>
            </q-item>
            <q-item v-if="filteredPickerRows.length === 0">
              <q-item-section class="text-center rw-text-desc">没有匹配的模板</q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="取消" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Task editor dialog -->
    <q-dialog v-model="editor.isEditing.value" @hide="onEditorHide">
      <q-card class="rw-dialog-xl">
        <q-card-section>
          <div class="text-h6">{{ editor.editingInstanceId.value ? '编辑任务' : '新建任务' }}</div>
        </q-card-section>

        <q-card-section class="pt-0 rw-dialog-scroll-body">
          <q-form ref="editorFormRef" @submit.prevent>
            <div class="flex flex-col gap-4">
              <q-input
                v-model="editor.taskName.value"
                dense outlined
                label="任务名称"
                :rules="[(val: string) => !!val || '请输入任务名称']"
              />

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
            @click="onSave"
          />
          <q-btn
            unelevated no-caps color="positive"
            label="保存并启动"
            :loading="editor.isSaving.value"
            @click="onSaveAndStart"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Batch set send target dialog (active tab only) -->
    <q-dialog v-model="isBatchTargetDialogOpen">
      <q-card class="rw-dialog-md">
        <q-card-section>
          <div class="text-h6">批量设置发送目标</div>
          <div class="rw-text-desc text-caption mt-1">
            将应用到选中任务的<strong>默认发送目标</strong>，同时清空每个 send 步骤的单独覆盖，让所有 send 步骤统一回退到任务级。<br />
            <span class="text-warning">仅"待启动"状态的任务会被修改，其它状态自动跳过。</span>
          </div>
        </q-card-section>
        <q-card-section class="pt-0">
          <span class="rw-text-label text-xs">发送目标</span>
          <SendTargetSelector
            :model-value="batchTargetId"
            :connection-service="connectionService"
            class="mt-1"
            @update:model-value="batchTargetId = $event"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="取消" v-close-popup />
          <q-btn
            unelevated no-caps color="primary"
            label="应用"
            :disable="!batchTargetId"
            @click="onConfirmBatchSetTarget"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>
