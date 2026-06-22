<script setup lang="ts">
// 中心对接「上报记录」弹窗。三个统计卡片（总数/通过/失败）+ 记录表格。
// v-model 控制开关，只读展示，无确认操作。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { formatDateTime } from '@/shared/utils/format';
import { reportRecordColumns } from '@/features/command-ingress/components/report-record-columns';
import { VERDICT_STATUS_MAP } from '@/features/command-ingress/components/docking-labels';
import type { ReportRecord } from '@/features/command-ingress/composables/use-central-docking';

interface Props {
  modelValue: boolean;
  rows: readonly ReportRecord[];
}

defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
}>();
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <q-card class="rw-dialog-lg">
      <q-card-section>
        <div class="text-h6">上报记录</div>
      </q-card-section>
      <q-card-section class="rw-dialog-scroll-body">
        <!-- 统计卡片 -->
        <div class="flex gap-4 mb-4">
          <div class="rw-panel-base rounded p-3 flex-1 text-center">
            <div class="rw-text-label text-xs mb-1">已上报</div>
            <div class="rw-text-value text-lg">{{ rows.length }}</div>
          </div>
          <div class="rw-panel-base rounded p-3 flex-1 text-center">
            <div class="rw-text-label text-xs mb-1">通过</div>
            <div class="rw-text-value text-lg text-positive">
              {{ rows.filter(r => r.verdict === 'passed').length }}
            </div>
          </div>
          <div class="rw-panel-base rounded p-3 flex-1 text-center">
            <div class="rw-text-label text-xs mb-1">失败</div>
            <div class="rw-text-value text-lg text-negative">
              {{ rows.filter(r => r.verdict === 'failed').length }}
            </div>
          </div>
        </div>
        <DataTable
          :columns="reportRecordColumns"
          :rows="rows"
          row-key="reportedAt"
        >
          <template #body-cell-verdict="props">
            <q-td :props="props">
              <StatusBadge :status="props.value" :status-map="VERDICT_STATUS_MAP" />
            </q-td>
          </template>
          <template #body-cell-reportedAt="props">
            <q-td :props="props">
              <span class="rw-text-value">{{ formatDateTime(props.value) }}</span>
            </q-td>
          </template>
          <template #no-data>
            <div class="text-center p-4 rw-text-label">暂无上报记录</div>
          </template>
        </DataTable>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="关闭" @click="emit('update:modelValue', false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
