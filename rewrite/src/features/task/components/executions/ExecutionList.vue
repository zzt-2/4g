<script setup lang="ts">
// 执行监控页主体（Tab2）的左半区：KPI bar + 二级分段控件 + 状态筛选 + 活动/历史列表。
// 右半区（TaskDetailPanel）由 page 在外层和本组件并排渲染（共用选中状态）。
// 选中状态/操作/polling 由 page 持有，本组件只接收 rows + emit 操作。
// 二级分段控件 rw-segmented--sub（视觉弱于一级），保留 tab 嵌套结构（不拍平，用户拍板）。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { formatElapsed, formatDateTime } from '@/shared/utils/format';
import { isTerminal } from '@/features/task/core';
import type { TaskTableRow } from '@/features/task/components/task-columns';
import type { HistoryTableRow } from '@/features/task/components/history-columns';
import { taskColumns } from '@/features/task/components/task-columns';
import { historyColumns } from '@/features/task/components/history-columns';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import ExecutionKpiBar from '@/features/task/components/executions/ExecutionKpiBar.vue';

type InnerTab = 'active' | 'history';

interface Props {
  /** 二级 tab（活动/历史），v-model */
  modelValue: InnerTab;
  /** 状态筛选值（active tab 专属） */
  statusFilter: string;
  activeRows: readonly TaskTableRow[];
  historyRows: readonly HistoryTableRow[];
  selectedActiveRow: readonly TaskTableRow[];
  selectedHistoryRow: readonly HistoryTableRow[];
  /** active tab 批量模式 */
  batchMode: boolean;
  batchSelectedActiveRows: readonly TaskTableRow[];
  /** targetId/templateId → label 查找表（列展示） */
  targetLabelMap: Record<string, string>;
  templateNameMap: Record<string, string>;
  /** 操作 loading 查询（按钮 loading 态） */
  isOperating: (id: string) => boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [tab: InnerTab];
  'update:statusFilter': [value: string];
  'active-row-click': [row: TaskTableRow];
  'history-row-click': [row: HistoryTableRow];
  'active-selection-change': [selected: TaskTableRow[]];
  'history-selection-change': [selected: HistoryTableRow[]];
  'update:batchSelectedActiveRows': [rows: TaskTableRow[]];
  start: [id: string];
  pause: [id: string];
  resume: [id: string];
  stop: [id: string];
  edit: [];
  remove: [id: string];
  retry: [id: string];
  'clear-history': [];
  'toggle-batch-mode': [];
  'open-batch-set-target': [];
}>();

const INNER_TABS: ReadonlyArray<{ value: InnerTab; label: string }> = [
  { value: 'active', label: '活动任务' },
  { value: 'history', label: '历史记录' },
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'created', label: '待启动' },
  { value: 'running', label: '运行中' },
  { value: 'paused', label: '已暂停' },
];
</script>

<template>
  <div class="exec-list flex flex-col h-full min-h-0 gap-3 p-3">
    <!-- KPI bar（活动/历史计数总览，治「缺总览/全是表格」） -->
    <ExecutionKpiBar :active-rows="activeRows" :history-rows="historyRows" />

    <!-- 二级分段控件（活动/历史） + 状态筛选 chip 行（active tab 专属） -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div class="rw-segmented rw-segmented--sub" role="tablist">
        <button
          v-for="tab in INNER_TABS"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="modelValue === tab.value"
          :class="['rw-segmented__btn', { 'rw-segmented__btn--active': modelValue === tab.value }]"
          @click="emit('update:modelValue', tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 状态筛选 chip 行（仅 active tab；保留独立行——不并入二级分段，语义是"筛"不是"切"） -->
      <div v-if="modelValue === 'active'" class="flex items-center gap-1">
        <q-chip v-for="opt in STATUS_FILTER_OPTIONS" :key="opt.value" dense clickable
          :color="statusFilter === opt.value ? 'primary' : 'grey-4'"
          :text-color="statusFilter === opt.value ? 'white' : 'grey-8'"
          @click="emit('update:statusFilter', opt.value)">
          {{ opt.label }}
        </q-chip>
      </div>

      <!-- 历史 tab：清空历史按钮 -->
      <q-btn v-else-if="modelValue === 'history' && historyRows.length > 0" flat no-caps dense
        icon="o_delete_sweep" label="清空历史" size="sm" color="negative" @click="emit('clear-history')" />
    </div>

    <!-- 批量模式工具条（仅 active tab + 批量模式开） -->
    <div v-if="modelValue === 'active' && batchMode" class="flex items-center gap-2 px-3 py-2 rw-divider-b flex-shrink-0">
      <q-btn flat dense no-caps icon="o_send" label="设置发送目标" color="primary" size="sm"
        :disable="batchSelectedActiveRows.length === 0" @click="emit('open-batch-set-target')" />
      <span class="rw-text-desc text-xs">{{ batchSelectedActiveRows.length }} 项已选中（仅待启动状态可修改）</span>
      <div class="flex-1" />
      <q-btn flat dense no-caps label="退出批量模式" size="sm" @click="emit('toggle-batch-mode')" />
    </div>

    <!-- 列表（活动/历史切换） -->
    <div class="flex-1 min-h-0">
      <!-- 活动任务表 -->
      <DataTable v-if="modelValue === 'active'" :columns="taskColumns" :rows="activeRows" row-key="instanceId"
        :selection="batchMode ? 'multiple' : 'single'"
        :selected="batchMode ? batchSelectedActiveRows : selectedActiveRow" container-height="100%"
        class="h-full"
        @row-click="(row: TaskTableRow) => { if (!batchMode) emit('active-row-click', row) }"
        @update:selected="batchMode ? emit('update:batchSelectedActiveRows', $event as TaskTableRow[]) : emit('active-selection-change', $event as TaskTableRow[])">
        <template #no-data>
          <div class="text-center w-full p-4 rw-text-label">暂无活动任务</div>
        </template>

        <template #body-cell-templateId="props">
          <q-td :props="props">
            <span v-if="props.row.templateId" class="rw-text-value text-xs">
              {{ templateNameMap[props.row.templateId] ?? props.row.templateId.slice(0, 8) + '…' }}
            </span>
            <span v-else class="rw-text-desc text-xs">--</span>
          </q-td>
        </template>

        <template #body-cell-scheduleKind="props">
          <q-td :props="props">
            <q-chip dense outline :color="props.row.scheduleKindDisplay.color"
              :label="props.row.scheduleKindDisplay.label" class="m-0" />
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
              <q-linear-progress :value="props.row.progressPercent / 100" color="primary" size="4px" class="flex-1"
                rounded />
              <span class="rw-text-desc text-xs min-w-[32px] text-right">{{ props.row.progressLabel }}</span>
            </div>
          </q-td>
        </template>

        <template #body-cell-_actions="props">
          <q-td :props="props">
            <div v-if="!batchMode" class="flex items-center justify-center gap-1">
              <q-btn v-if="props.row.lifecycle === 'created'" flat round dense icon="o_play_arrow" size="sm"
                color="positive" :loading="isOperating(`start-${props.row.instanceId}`)"
                @click.stop="emit('start', props.row.instanceId)" />
              <q-btn v-if="props.row.lifecycle === 'running'" flat round dense icon="o_pause" size="sm"
                color="warning" :loading="isOperating(`pause-${props.row.instanceId}`)"
                @click.stop="emit('pause', props.row.instanceId)" />
              <q-btn v-if="props.row.lifecycle === 'paused'" flat round dense icon="o_play_arrow" size="sm"
                color="primary" :loading="isOperating(`resume-${props.row.instanceId}`)"
                @click.stop="emit('resume', props.row.instanceId)" />
              <q-btn v-if="props.row.lifecycle === 'running' || props.row.lifecycle === 'paused'" flat round dense
                icon="o_stop" size="sm" color="negative" @click.stop="emit('stop', props.row.instanceId)" />
              <q-btn v-if="props.row.lifecycle === 'created'" flat round dense icon="o_edit" size="sm"
                color="primary" @click.stop="emit('edit')" />
              <q-btn v-if="isTerminal(props.row.lifecycle)" flat round dense icon="o_delete" size="sm"
                color="negative" @click.stop="emit('remove', props.row.instanceId)" />
            </div>
          </q-td>
        </template>
      </DataTable>

      <!-- 历史记录表 -->
      <DataTable v-else :columns="historyColumns" :rows="historyRows" row-key="instanceId" selection="single"
        :selected="selectedHistoryRow" container-height="100%" class="h-full"
        @row-click="(row: HistoryTableRow) => emit('history-row-click', row)"
        @update:selected="(selected: HistoryTableRow[]) => emit('history-selection-change', selected)">
        <template #no-data>
          <div class="text-center w-full p-4 rw-text-label">暂无历史记录</div>
        </template>

        <template #body-cell-scheduleKind="props">
          <q-td :props="props">
            <q-chip dense outline :color="props.row.scheduleKindDisplay.color"
              :label="props.row.scheduleKindDisplay.label" class="m-0" />
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
              <q-btn flat round dense icon="o_replay" size="sm" color="primary"
                :loading="isOperating(`retry-${props.row.instanceId}`)"
                @click.stop="emit('retry', props.row.instanceId)" />
              <q-btn flat round dense icon="o_delete" size="sm" color="negative"
                @click.stop="emit('remove', props.row.instanceId)" />
            </div>
          </q-td>
        </template>
      </DataTable>
    </div>
  </div>
</template>
