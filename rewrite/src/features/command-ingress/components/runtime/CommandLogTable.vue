<script setup lang="ts">
// Tab1 左栏命令日志表。表头收纳「最后功能码」「错误原因」(原 KPI bar 的偶发值),
// 格式「最后码: 0x1A  错误: 无」。清空日志走二次确认(emit 给 page 弹 $q.dialog)。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { formatDateTime } from '@/shared/utils/format';
import { commandLogColumns } from '@/features/command-ingress/components/command-log-columns';
import { commandResultMap } from '@/features/command-ingress/components/scoeStatusMap';
import type { CommandLogEntry } from '@/features/command-ingress/core';

interface Props {
  rows: readonly CommandLogEntry[];
  /** 最后功能码（来自 runtimeStatus.lastCommandCode，原 KPI bar 偶发值） */
  lastCommandCode: string;
  /** 错误原因（来自 statistics.lastErrorReason，原 KPI bar 偶发值） */
  lastErrorReason: string;
}

defineProps<Props>();

const emit = defineEmits<{
  'clear-log': [];
}>();

// 功能码格式化：数字 → 0x 大写 hex
function formatCommandCode(code: string | number): string {
  if (!code && code !== 0) return '—';
  const n = typeof code === 'number' ? code : Number(code);
  if (Number.isNaN(n)) return String(code);
  return `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return '—';
  return `${ms} ms`;
}
</script>

<template>
  <div class="command-log-table flex flex-col h-full min-h-0 py-3">
    <!-- 标题栏：标题 + 偶发状态值 + 清空按钮 -->
    <div class="flex items-center justify-between px-6 pb-2 flex-shrink-0">
      <div class="flex items-baseline gap-4">
        <span class="rw-text-label text-sm">命令执行日志</span>
        <span class="rw-text-label text-xs">最后码: <strong class="rw-text-value font-mono">{{ formatCommandCode(lastCommandCode) }}</strong></span>
        <span class="rw-text-label text-xs">错误: <strong class="rw-text-value">{{ lastErrorReason || '无' }}</strong></span>
      </div>
      <q-btn
        flat dense
        icon="o_delete_sweep"
        color="grey"
        size="sm"
        @click="emit('clear-log')"
      >
        <q-tooltip>清空日志</q-tooltip>
      </q-btn>
    </div>

    <!-- 表格：flex 撑满剩余高度，containerHeight 走 100% (D007 flex 撑开陷阱解法) -->
    <div class="flex-1 min-h-0 px-6 overflow-hidden">
      <DataTable
        :columns="commandLogColumns"
        :rows="rows"
        row-key="id"
        virtual-scroll
        :virtual-scroll-item-size="48"
        container-height="100%"
      >
        <template #body-cell-commandCode="props">
          <q-td :props="props">
            <span class="font-mono">{{ formatCommandCode(props.value) }}</span>
          </q-td>
        </template>
        <template #body-cell-result="props">
          <q-td :props="props">
            <StatusBadge :status="props.value" :status-map="commandResultMap" />
          </q-td>
        </template>
        <template #body-cell-durationMs="props">
          <q-td :props="props">
            <span class="rw-text-value">{{ formatDuration(props.value) }}</span>
          </q-td>
        </template>
        <template #body-cell-timestamp="props">
          <q-td :props="props">
            <span class="rw-text-desc">{{ formatDateTime(props.value) }}</span>
          </q-td>
        </template>
        <template #no-data>
          <div class="text-center p-4 rw-text-label">暂无命令记录</div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
