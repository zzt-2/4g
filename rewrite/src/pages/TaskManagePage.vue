<script setup lang="ts">
// 任务管理页（TaskManagePage）—— UI 重做后的薄壳（S011）。
// 原 TemplateListPage(753) + ExecutionListPage(832) 两巨石单文件拆成 page 薄壳 + 子组件
// （features/task/components/{templates,executions}/ + 跨 tab 共用弹窗）。
// 本 page 职责：持 2 个 editor 实例 + tab 状态 + 列表 polling + 选中状态 + 二次确认 handler + 所有 CRUD 转发。
// 不写 UI 细节（KPI bar/表格/卡片/弹窗内部都在子组件）。

import { ref, shallowRef, computed, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useAsyncAction, useNotify, usePolling } from '@/shared/composables';
import { isTerminal, calculateProgress, applyDefaultTargetOverride } from '@/features/task/core';
import type { TaskTemplate, TaskDefinition } from '@/features/task/core';
import { exportTemplates, parseImportedFile } from '@/features/task/services/task-template-io';
import { TASK_STATUS_MAP, resolveDisplayStatus } from '@/features/task/components/taskStatusMap';
import { SCHEDULE_KIND_MAP } from '@/features/task/components/scheduleKindMap';
import { useTemplateEditor } from '@/features/task/composables/use-template-editor';
import { useTaskEditor } from '@/features/task/composables/use-task-editor';
import { toTaskRow, toHistoryRow } from '@/features/task/composables/use-task-list';
import type { TemplateTableRow } from '@/features/task/components/template-columns';
import type { TaskTableRow } from '@/features/task/components/task-columns';
import type { HistoryTableRow } from '@/features/task/components/history-columns';
import type { ReadonlyTaskInstanceState } from '@/features/task/core';

// 子组件
import TaskManageToolbar from '@/features/task/components/TaskManageToolbar.vue';
import TemplateList from '@/features/task/components/templates/TemplateList.vue';
import ExecutionList from '@/features/task/components/executions/ExecutionList.vue';
import TaskDetailPanel from '@/features/task/components/executions/TaskDetailPanel.vue';
import TemplateEditDialog from '@/features/task/components/templates/TemplateEditDialog.vue';
import TaskEditDialog from '@/features/task/components/executions/TaskEditDialog.vue';
import BatchSetTargetDialog from '@/features/task/components/BatchSetTargetDialog.vue';
import TemplatePickerDialog from '@/features/task/components/TemplatePickerDialog.vue';

defineOptions({ name: 'TaskManagePage' });

// ===== Service 引用 =====
const $q = useQuasar();
const notify = useNotify();
const { execute: executeAction, isOperating } = useAsyncAction();
const runtime = useRewriteRuntime();
const taskService = runtime.features.taskService;
const frameService = runtime.features.frameService;
const connectionService = runtime.features.connectionService;

// ===== 一级 tab 状态 =====
const activeTab = ref<'templates' | 'executions'>('templates');

// ===== 编辑器（2 个 editor 实例） =====
const templateEditor = useTemplateEditor(taskService);
const taskEditor = useTaskEditor(taskService);

// ===== 搜索（随 tab 切换作用域） =====
const templatesSearchText = ref('');
const executionsSearchText = ref('');

// ===== 模板列表数据 =====
const templateRows = shallowRef<TemplateTableRow[]>([]);
const selectedTemplateRow = shallowRef<TemplateTableRow[]>([]);
// 模板批量模式
const templatesBatchMode = ref(false);
const batchSelectedTemplateRows = shallowRef<TemplateTableRow[]>([]);

// ===== 执行列表数据 =====
const executionsInnerTab = ref<'active' | 'history'>('active');
const executionsStatusFilter = ref('');
const activeRows = shallowRef<TaskTableRow[]>([]);
const historyRows = shallowRef<HistoryTableRow[]>([]);
const selectedActiveRow = shallowRef<TaskTableRow[]>([]);
const selectedHistoryRow = shallowRef<HistoryTableRow[]>([]);
// 执行批量模式（active tab）
const executionsBatchMode = ref(false);
const batchSelectedActiveRows = shallowRef<TaskTableRow[]>([]);

// ===== 弹窗显隐 =====
const isTemplateEditOpen = ref(false);
const isTaskEditOpen = ref(false);
const isTemplatePickerOpen = ref(false);
const templatePickerRows = shallowRef<readonly TaskTemplate[]>([]);
const templatePickerSearch = ref('');
// 批量设置发送目标（两页共用，scope 区分文案）
const isBatchTargetOpen = ref(false);
const batchTargetId = ref<string | null>(null);
const batchTargetScope = ref<'template' | 'task'>('template');

// ===== 派生：label 查找表 =====
// targetId → label（两页列展示「默认发送目标」用）
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

// templateId → 模板名称（执行列表「来源模板」列展示名称而非 id）
const templateNameMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const tpl of taskService.listTemplates()) {
    map[tpl.templateId] = tpl.name;
  }
  return map;
});

// ===== 选中实例派生（执行监控右栏详情用——沿用原 ExecutionListPage 逻辑，monitor 统一本次不做） =====
const selectedInstanceId = computed<string | null>(() => {
  if (executionsInnerTab.value === 'active' && selectedActiveRow.value.length > 0) {
    return selectedActiveRow.value[0].instanceId;
  }
  if (executionsInnerTab.value === 'history' && selectedHistoryRow.value.length > 0) {
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

const selectedTemplateLabel = computed(() => {
  if (!selectedInstance.value?.templateId) return '--';
  const tpl = taskService.getTemplate(selectedInstance.value.templateId);
  return tpl?.name ?? selectedInstance.value.templateId;
});

// ===== 列表刷新 =====
function refreshTemplateRows(): void {
  const all = taskService.listTemplates().map((tpl) => {
    const kind = tpl.definition.schedule.kind;
    return {
      templateId: tpl.templateId,
      name: tpl.name,
      scheduleKind: kind,
      scheduleKindDisplay: SCHEDULE_KIND_MAP[kind] ?? { color: 'grey', label: kind },
      tags: [...tpl.tags],
      ...(tpl.definition.defaultTargetId ? { defaultTargetId: tpl.definition.defaultTargetId } : {}),
      stepCount: tpl.definition.steps.length,
      updatedAt: tpl.updatedAt,
      _original: tpl,
    } satisfies TemplateTableRow;
  });
  const q = templatesSearchText.value.trim().toLowerCase();
  templateRows.value = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
}

function refreshExecutionLists(): void {
  const snapshot = taskService.getSnapshot();
  const active = snapshot.instances.filter((i) => !isTerminal(i.lifecycle));
  // 搜索 + 状态筛选（active tab）
  const q = executionsSearchText.value.trim().toLowerCase();
  let filteredActive = active;
  if (executionsStatusFilter.value) {
    filteredActive = filteredActive.filter((i) => i.lifecycle === executionsStatusFilter.value);
  }
  if (q) {
    filteredActive = filteredActive.filter((i) => i.definitionRef.name.toLowerCase().includes(q));
  }
  activeRows.value = filteredActive.map(toTaskRow);

  const terminated = snapshot.instances.filter((i) => isTerminal(i.lifecycle));
  const historyIds = new Set(snapshot.history.map((i) => i.instanceId));
  const merged = [...snapshot.history, ...terminated.filter((i) => !historyIds.has(i.instanceId))];
  const filteredHistory = q ? merged.filter((i) => i.definitionRef.name.toLowerCase().includes(q)) : merged;
  historyRows.value = filteredHistory.map(toHistoryRow);
}

const listPolling = usePolling(refreshExecutionLists, 1000);

function refreshAll(): void {
  refreshTemplateRows();
  refreshExecutionLists();
}

onUnmounted(() => {
  listPolling.stop();
});

// 初始加载
refreshAll();
listPolling.start();

// tab 切换时不重启 polling（polling 一直在跑，切 tab 只换展示）

// 搜索框输入（作用域随 tab 切换：模板/任务）—— 列表立即按新搜索词刷新
function onSearchInput(text: string): void {
  if (activeTab.value === 'templates') {
    templatesSearchText.value = text;
    refreshTemplateRows();
  } else {
    executionsSearchText.value = text;
    refreshExecutionLists();
  }
}

// active tab 状态筛选变化 —— 列表立即按新筛选刷新
function onStatusFilterChange(value: string): void {
  executionsStatusFilter.value = value;
  refreshExecutionLists();
}

// ===== 模板 tab actions =====
function onNewTemplate(): void {
  templateEditor.openNew();
  isTemplateEditOpen.value = true;
}

function onEditTemplate(): void {
  if (selectedTemplateRow.value.length === 0) {
    notify.warning('请先选择一个模板');
    return;
  }
  templateEditor.openEdit(selectedTemplateRow.value[0].templateId);
  isTemplateEditOpen.value = true;
}

// 从列表行操作触发编辑（行内编辑按钮，非顶部 toolbar）
function onEditTemplateRow(tpl: TaskTemplate): void {
  templateEditor.openEdit(tpl.templateId);
  isTemplateEditOpen.value = true;
}

function onInstantiateTemplate(tpl: TaskTemplate): void {
  const inst = taskService.instanciateTemplate(tpl.templateId);
  notify.success(`已从模板 "${tpl.name}" 创建实例`);
  // 实例化后切到执行 tab（保留原行为）
  activeTab.value = 'executions';
  refreshExecutionLists();
  // 选中新创建的实例
  const newRow = toTaskRow(inst);
  selectedActiveRow.value = [newRow];
  executionsInnerTab.value = 'active';
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
    selectedTemplateRow.value = [];
    refreshTemplateRows();
  });
}

async function onImportTemplates(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
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
      refreshTemplateRows();
      notify.success(`导入完成：新增 ${added} 个${skipped > 0 ? `，跳过 ${skipped} 个同 ID` : ''}`);
    });
  };
  input.click();
}

function onExportTemplates(): void {
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

function onTemplateEditorHide(): void {
  templateEditor.close();
  isTemplateEditOpen.value = false;
}

// 子组件 patch-field emit → 在 editor ref 上赋值（D003：子组件不 mutate prop，page 持锁赋值）
function onTemplateEditorPatch(payload: { field: string; value: unknown }): void {
  const field = payload.field as keyof typeof templateEditor;
  const target = templateEditor[field];
  if (target && typeof target === 'object' && 'value' in target) {
    (target as { value: unknown }).value = payload.value;
  }
}

function onTemplateEditorSave(): void {
  try {
    const id = templateEditor.save();
    if (id) {
      notify.success(templateEditor.editingTemplateId.value ? '模板已更新' : '模板已保存');
      refreshTemplateRows();
      isTemplateEditOpen.value = false;
    }
  } catch (err) {
    notify.error('保存失败', err instanceof Error ? err.message : '未知错误');
  }
}

// ===== 模板批量模式 =====
function onToggleTemplatesBatch(): void {
  templatesBatchMode.value = !templatesBatchMode.value;
  batchSelectedTemplateRows.value = [];
  selectedTemplateRow.value = [];
}

function onBatchDeleteTemplates(): void {
  if (batchSelectedTemplateRows.value.length === 0) return;
  const count = batchSelectedTemplateRows.value.length;
  $q.dialog({
    title: '确认批量删除',
    message: `确定要删除选中的 ${count} 个模板吗？此操作不可撤销。`,
    cancel: true,
    persistent: false,
  }).onOk(() => {
    let removed = 0;
    for (const row of batchSelectedTemplateRows.value) {
      const result = taskService.deleteTemplate(row.templateId);
      if (result) removed++;
    }
    batchSelectedTemplateRows.value = [];
    selectedTemplateRow.value = [];
    refreshTemplateRows();
    notify.success(`已删除 ${removed} 个模板`);
  });
}

function onOpenBatchSetTargetTemplates(): void {
  if (batchSelectedTemplateRows.value.length === 0) {
    notify.warning('请先选择至少一个模板');
    return;
  }
  let sendStepCount = 0;
  for (const row of batchSelectedTemplateRows.value) {
    for (const step of row._original.definition.steps) {
      if (step.kind === 'send') sendStepCount++;
    }
  }
  if (sendStepCount === 0) {
    notify.warning('选中的模板里没有 send 步骤，无需设置发送目标');
    return;
  }
  batchTargetId.value = null;
  batchTargetScope.value = 'template';
  isBatchTargetOpen.value = true;
}

// ===== 执行 tab actions =====
function onCreateFromTemplate(): void {
  templatePickerRows.value = taskService.listTemplates();
  templatePickerSearch.value = '';
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
  executionsInnerTab.value = 'active';
  refreshExecutionLists();
  // 选中新创建的实例
  const newRow = toTaskRow(inst);
  selectedActiveRow.value = [newRow];
}

function onNewBlankTask(): void {
  taskEditor.openNew();
  isTaskEditOpen.value = true;
}

function onEditTask(): void {
  if (!selectedInstance.value) return;
  if (selectedInstance.value.lifecycle !== 'created') {
    notify.warning('只能编辑待启动状态的任务');
    return;
  }
  taskEditor.openEdit(selectedInstance.value.instanceId);
  isTaskEditOpen.value = true;
}

async function onStart(id: string): Promise<void> {
  await executeAction(`start-${id}`, async () => {
    taskService.startTask(id);
    notify.success('任务已启动');
    refreshExecutionLists();
  });
}

async function onPause(id: string): Promise<void> {
  await executeAction(`pause-${id}`, async () => {
    taskService.pauseTask(id);
    notify.info('任务已暂停');
    refreshExecutionLists();
  });
}

async function onResume(id: string): Promise<void> {
  await executeAction(`resume-${id}`, async () => {
    taskService.resumeTask(id);
    notify.success('任务已恢复');
    refreshExecutionLists();
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
      refreshExecutionLists();
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
      refreshExecutionLists();
    });
  });
}

async function onRetry(id: string): Promise<void> {
  await executeAction(`retry-${id}`, async () => {
    const result = taskService.retryTask(id);
    if (result) {
      notify.success('任务已重新执行');
      refreshExecutionLists();
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
      refreshExecutionLists();
    });
  });
}

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
    refreshExecutionLists();
  });
}

function onTaskEditorHide(): void {
  taskEditor.close();
  isTaskEditOpen.value = false;
}

// 子组件 patch-field emit → 在 editor ref 上赋值（D003：子组件不 mutate prop，page 持锁赋值）
function onTaskEditorPatch(payload: { field: string; value: unknown }): void {
  const field = payload.field as keyof typeof taskEditor;
  const target = taskEditor[field];
  if (target && typeof target === 'object' && 'value' in target) {
    (target as { value: unknown }).value = payload.value;
  }
}

function onTaskEditorSave(): void {
  try {
    const id = taskEditor.save();
    if (id) {
      notify.success('任务已保存');
      refreshExecutionLists();
      isTaskEditOpen.value = false;
    }
  } catch (err) {
    notify.error('保存失败', err instanceof Error ? err.message : '未知错误');
  }
}

function onTaskEditorSaveAndStart(): void {
  try {
    const id = taskEditor.saveAndStart();
    if (id) {
      notify.success('任务已保存并启动');
      refreshExecutionLists();
      isTaskEditOpen.value = false;
    }
  } catch (err) {
    notify.error('保存并启动失败', err instanceof Error ? err.message : '未知错误');
  }
}

// ===== 执行批量模式 =====
function onToggleExecutionsBatch(): void {
  executionsBatchMode.value = !executionsBatchMode.value;
  batchSelectedActiveRows.value = [];
  selectedActiveRow.value = [];
}

function onOpenBatchSetTargetTasks(): void {
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
  batchTargetScope.value = 'task';
  isBatchTargetOpen.value = true;
}

function onConfirmBatchSetTarget(): void {
  if (!batchTargetId.value) {
    notify.warning('请选择一个发送目标');
    return;
  }
  if (batchTargetScope.value === 'template') {
    let updated = 0;
    let affectedSteps = 0;
    for (const row of batchSelectedTemplateRows.value) {
      const original = row._original;
      const nextDef = applyDefaultTargetOverride(original.definition, batchTargetId.value);
      const result = taskService.updateTemplate(original.templateId, { definition: nextDef });
      if (result) {
        updated++;
        for (const step of nextDef.steps) {
          if (step.kind === 'send') affectedSteps++;
        }
      }
    }
    isBatchTargetOpen.value = false;
    batchSelectedTemplateRows.value = [];
    selectedTemplateRow.value = [];
    refreshTemplateRows();
    notify.success(`已更新 ${updated} 个模板的默认发送目标（影响 ${affectedSteps} 个 send 步骤）`);
  } else {
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
    isBatchTargetOpen.value = false;
    batchSelectedActiveRows.value = [];
    selectedActiveRow.value = [];
    refreshExecutionLists();
    const skipNote = skipped > 0 ? `，跳过 ${skipped} 个非待启动任务` : '';
    notify.success(`已更新 ${updated} 个任务的默认发送目标（影响 ${affectedSteps} 个 send 步骤${skipNote}）`);
  }
}

// ===== 行选中（列表 → 选中状态） =====
function onTemplateRowClick(row: TemplateTableRow): void {
  selectedTemplateRow.value = [row];
}

function onActiveRowClick(row: TaskTableRow): void {
  selectedActiveRow.value = [row];
}

function onHistoryRowClick(row: HistoryTableRow): void {
  selectedHistoryRow.value = [row];
}
</script>

<template>
  <q-page class="task-page flex flex-col h-full">
    <!-- 顶部 toolbar：一级分段控件 + 搜索 + 按 tab 切按钮 -->
    <TaskManageToolbar
      v-model="activeTab"
      :search-text="activeTab === 'templates' ? templatesSearchText : executionsSearchText"
      :search-placeholder="activeTab === 'templates' ? '搜索模板名称...' : '搜索任务名称...'"
      :has-selected-row="selectedTemplateRow.length > 0"
      :is-importing="isOperating('import-templates')"
      :is-exporting="isOperating('export-templates')"
      :templates-batch-mode="templatesBatchMode"
      :active-task-count="activeRows.length"
      :executions-batch-mode="executionsBatchMode"
      @update:search-text="onSearchInput"
      @new-template="onNewTemplate"
      @edit-template="onEditTemplate"
      @import-templates="onImportTemplates"
      @export-templates="onExportTemplates"
      @toggle-templates-batch="onToggleTemplatesBatch"
      @create-from-template="onCreateFromTemplate"
      @new-blank-task="onNewBlankTask"
      @stop-all="onStopAll"
      @toggle-executions-batch="onToggleExecutionsBatch"
    />

    <!-- tab 内容区（flex 撑满剩余高度） -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <!-- Tab1: 模板管理 -->
      <div v-show="activeTab === 'templates'" class="h-full">
        <TemplateList
          :rows="templateRows"
          :selected-row="selectedTemplateRow"
          :batch-mode="templatesBatchMode"
          :batch-selected-rows="batchSelectedTemplateRows"
          :target-label-map="targetLabelMap"
          @row-click="onTemplateRowClick"
          @selection-change="selectedTemplateRow = $event"
          @update:batch-selected-rows="batchSelectedTemplateRows = $event"
          @instantiate="onInstantiateTemplate"
          @edit="onEditTemplateRow"
          @delete="onDeleteTemplate"
          @batch-delete="onBatchDeleteTemplates"
          @open-batch-set-target="onOpenBatchSetTargetTemplates"
          @toggle-batch-mode="onToggleTemplatesBatch"
        />
      </div>

      <!-- Tab2: 执行监控（KPI + 左列表 + 右详情，gap-6 不贴死） -->
      <div v-show="activeTab === 'executions'" class="flex h-full gap-6 p-3">
        <!-- 左：KPI bar + 二级分段 + 列表 -->
        <ExecutionList
          v-model="executionsInnerTab"
          :status-filter="executionsStatusFilter"
          :active-rows="activeRows"
          :history-rows="historyRows"
          :selected-active-row="selectedActiveRow"
          :selected-history-row="selectedHistoryRow"
          :batch-mode="executionsBatchMode"
          :batch-selected-active-rows="batchSelectedActiveRows"
          :target-label-map="targetLabelMap"
          :template-name-map="templateNameMap"
          :is-operating="isOperating"
          class="flex-1 min-w-0"
          @update:status-filter="onStatusFilterChange"
          @active-row-click="onActiveRowClick"
          @history-row-click="onHistoryRowClick"
          @active-selection-change="selectedActiveRow = $event"
          @history-selection-change="selectedHistoryRow = $event"
          @update:batch-selected-active-rows="batchSelectedActiveRows = $event"
          @start="onStart"
          @pause="onPause"
          @resume="onResume"
          @stop="onStop"
          @edit="onEditTask"
          @remove="onRemove"
          @retry="onRetry"
          @clear-history="onClearHistory"
          @toggle-batch-mode="onToggleExecutionsBatch"
          @open-batch-set-target="onOpenBatchSetTargetTasks"
        />

        <!-- 右：任务详情卡片（~400px，拓宽 + 卡片化） -->
        <TaskDetailPanel
          :instance="selectedInstance"
          :progress="selectedProgress"
          :display-status="selectedDisplayStatus"
          :status-info="selectedStatusInfo"
          :template-label="selectedTemplateLabel"
          :is-operating="isOperating"
          class="w-[400px] flex-shrink-0"
          @edit="onEditTask"
          @start="onStart"
          @pause="onPause"
          @resume="onResume"
          @stop="onStop"
          @retry="onRetry"
          @remove="onRemove"
        />
      </div>
    </div>

    <!-- 模板编辑弹窗 -->
    <TemplateEditDialog
      v-model="isTemplateEditOpen"
      :editor="templateEditor"
      :frame-service="frameService"
      :connection-service="connectionService"
      @save="onTemplateEditorSave"
      @hide="onTemplateEditorHide"
      @patch-field="onTemplateEditorPatch"
    />

    <!-- 任务编辑弹窗 -->
    <TaskEditDialog
      v-model="isTaskEditOpen"
      :editor="taskEditor"
      :frame-service="frameService"
      :connection-service="connectionService"
      @save="onTaskEditorSave"
      @save-and-start="onTaskEditorSaveAndStart"
      @hide="onTaskEditorHide"
      @patch-field="onTaskEditorPatch"
    />

    <!-- 从模板创建任务弹窗 -->
    <TemplatePickerDialog
      v-model="isTemplatePickerOpen"
      :rows="templatePickerRows"
      :search="templatePickerSearch"
      @update:search="templatePickerSearch = $event"
      @pick="onPickTemplate"
    />

    <!-- 批量设置发送目标弹窗（两页共用，scope 区分文案） -->
    <BatchSetTargetDialog
      v-model="isBatchTargetOpen"
      :target-id="batchTargetId"
      :connection-service="connectionService"
      :selected-count="batchTargetScope === 'template' ? batchSelectedTemplateRows.length : batchSelectedActiveRows.length"
      :scope="batchTargetScope"
      @update:target-id="batchTargetId = $event"
      @confirm="onConfirmBatchSetTarget"
    />
  </q-page>
</template>

<style scoped lang="scss">
.task-page {
  background: var(--rw-color-surface-app);
  display: flex;
  flex-direction: column;
}
</style>
