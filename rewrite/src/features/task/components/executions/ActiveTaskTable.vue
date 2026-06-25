<script setup lang="ts">
// 执行监控 active tab：活动任务表格 + 行内生命周期操作（启动/暂停/恢复/停止/编辑/删除）。
// 对齐 S010 TaskListPanel 范式：纯表格 + emit 操作给 page。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { isTerminal } from '@/features/task/core';
import { taskColumns } from '@/features/task/components/task-columns';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import type { TaskTableRow } from '@/features/task/components/task-columns';

interface Props {
  rows: readonly TaskTableRow[];
  selected: readonly TaskTableRow[];
  targetLabelMap: Record<string, string>;
  templateNameMap: Record<string, string>;
  isOperating: (id: string) => boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  'row-click': [row: TaskTableRow];
  'selection-change': [selected: TaskTableRow[]];
  start: [id: string];
  pause: [id: string];
  resume: [id: string];
  stop: [id: string];
  edit: [];
  remove: [id: string];
}>();
</script>

<template>
  <div class="active-task-table h-full min-h-0 overflow-hidden">
    <DataTable
      :columns="taskColumns"
      :rows="rows"
      row-key="instanceId"
      selection="none"
      :selected="selected"
      container-height="100%"
      @row-click="(row: TaskTableRow) => emit('row-click', row)"
      @update:selected="(s: TaskTableRow[]) => emit('selection-change', s)"
    >
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
            <q-linear-progress :value="props.row.progressPercent / 100" color="primary" size="4px" class="flex-1" rounded />
            <span class="rw-text-desc text-xs min-w-[32px] text-right">{{ props.row.progressLabel }}</span>
          </div>
        </q-td>
      </template>

      <template #body-cell-_actions="props">
        <q-td :props="props">
          <div class="flex items-center justify-center gap-1">
            <q-btn v-if="props.row.lifecycle === 'created'" flat round dense icon="o_play_arrow" size="sm"
              color="positive" :loading="isOperating(`start-${props.row.instanceId}`)"
              @click.stop="emit('start', props.row.instanceId)">
              <q-tooltip>启动</q-tooltip>
            </q-btn>
            <q-btn v-if="props.row.lifecycle === 'running'" flat round dense icon="o_pause" size="sm"
              color="warning" :loading="isOperating(`pause-${props.row.instanceId}`)"
              @click.stop="emit('pause', props.row.instanceId)">
              <q-tooltip>暂停</q-tooltip>
            </q-btn>
            <q-btn v-if="props.row.lifecycle === 'paused'" flat round dense icon="o_play_arrow" size="sm"
              color="primary" :loading="isOperating(`resume-${props.row.instanceId}`)"
              @click.stop="emit('resume', props.row.instanceId)">
              <q-tooltip>恢复</q-tooltip>
            </q-btn>
            <q-btn v-if="props.row.lifecycle === 'running' || props.row.lifecycle === 'paused'" flat round dense
              icon="o_stop" size="sm" color="negative" @click.stop="emit('stop', props.row.instanceId)">
              <q-tooltip>停止</q-tooltip>
            </q-btn>
            <q-btn v-if="props.row.lifecycle === 'created'" flat round dense icon="o_edit" size="sm"
              color="primary" @click.stop="emit('edit')">
              <q-tooltip>编辑</q-tooltip>
            </q-btn>
            <q-btn v-if="isTerminal(props.row.lifecycle)" flat round dense icon="o_delete" size="sm"
              color="negative" @click.stop="emit('remove', props.row.instanceId)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
    </DataTable>
  </div>
</template>
