<script setup lang="ts">
// Tab3 二级 tab「任务列表」。活跃任务表格 + 停止操作。
// 停止走二次确认（emit 给 page）。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { formatDateTime } from '@/shared/utils/format';
import { dockingTaskColumns } from '@/features/command-ingress/components/docking-task-columns';
import { TASK_STATUS_MAP } from '@/features/task/components/taskStatusMap';
import type { DockingTaskRow } from '@/features/command-ingress/composables/use-central-docking';

interface Props {
  rows: readonly DockingTaskRow[];
}

defineProps<Props>();

const emit = defineEmits<{
  'stop-task': [instanceId: string];
}>();

// 可停止的生命周期
const STOPPABLE_LIFECYCLES = new Set(['running', 'created', 'paused']);
</script>

<template>
  <div class="task-list-panel h-full min-h-0 px-6 py-3 overflow-hidden flex flex-col">
    <div class="flex-1 min-h-0 overflow-hidden">
      <DataTable
        :columns="dockingTaskColumns"
        :rows="rows"
        row-key="instanceId"
        container-height="100%"
      >
        <template #body-cell-lifecycle="props">
          <q-td :props="props">
            <StatusBadge :status="props.value" :status-map="TASK_STATUS_MAP" />
          </q-td>
        </template>
        <template #body-cell-startedAt="props">
          <q-td :props="props">
            <span class="rw-text-value">{{ props.value ? formatDateTime(props.value) : '—' }}</span>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat dense icon="o_stop" color="negative" size="xs"
              :disable="!STOPPABLE_LIFECYCLES.has(props.row.lifecycle)"
              @click="emit('stop-task', props.row.instanceId)"
            >
              <q-tooltip>停止任务</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #no-data>
          <div class="text-center p-4 rw-text-label">暂无活跃任务</div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
