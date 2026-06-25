<script setup lang="ts">
// 执行监控 history tab：历史记录表格 + 重试/删除行操作。
// 对齐 S010 TaskListPanel 范式：纯表格 + emit 操作给 page。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { formatElapsed, formatDateTime } from '@/shared/utils/format';
import { historyColumns } from '@/features/task/components/history-columns';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import type { HistoryTableRow } from '@/features/task/components/history-columns';

interface Props {
  rows: readonly HistoryTableRow[];
  selected: readonly HistoryTableRow[];
  isOperating: (id: string) => boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'row-click': [row: HistoryTableRow];
  'selection-change': [selected: HistoryTableRow[]];
  retry: [id: string];
  remove: [id: string];
}>();
</script>

<template>
  <div class="history-task-table h-full min-h-0 overflow-hidden">
    <DataTable
      :columns="historyColumns"
      :rows="rows"
      row-key="instanceId"
      selection="none"
      :selected="selected"
      container-height="100%"
      @row-click="(row: HistoryTableRow) => emit('row-click', row)"
      @update:selected="(s: HistoryTableRow[]) => emit('selection-change', s)"
    >
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
              @click.stop="emit('retry', props.row.instanceId)">
              <q-tooltip>重新执行</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="o_delete" size="sm" color="negative"
              @click.stop="emit('remove', props.row.instanceId)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </DataTable>
  </div>
</template>
