<script setup lang="ts">
// Tab3 二级 tab「设备列表」。设备信息表（甲方调 getDeviceList 时返回此表）+ 添加/编辑/删除。
// 编辑走 DeviceEditDialog（page 管理 dialog 开关 + 表单）。
// 删除走二次确认（emit 给 page）。

import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { DOCKING_DEVICE_STATUS_MAP } from '@/features/command-ingress/components/docking-labels';
import { deviceColumns } from '@/features/command-ingress/components/device-columns';
import type { DeviceInfoItem } from '@/features/northbound/core/types';

interface Props {
  rows: readonly DeviceInfoItem[];
}

defineProps<Props>();

const emit = defineEmits<{
  add: [];
  edit: [row: DeviceInfoItem];
  delete: [deviceId: string];
}>();
</script>

<template>
  <div class="device-list-panel h-full min-h-0 px-6 py-3 overflow-hidden flex flex-col">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <span class="rw-text-label text-sm">设备信息（甲方调 getDeviceList 时返回此表数据）</span>
      <q-btn flat dense icon="o_add" color="primary" size="sm" @click="emit('add')">
        <q-tooltip>添加设备</q-tooltip>
      </q-btn>
    </div>
    <div class="flex-1 min-h-0 overflow-hidden">
      <DataTable
        :columns="deviceColumns"
        :rows="rows"
        row-key="deviceId"
        container-height="100%"
      >
        <template #body-cell-status="props">
          <q-td :props="props">
            <StatusBadge :status="props.value" :status-map="DOCKING_DEVICE_STATUS_MAP" />
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense icon="o_edit" color="grey" size="xs" @click="emit('edit', props.row as DeviceInfoItem)">
              <q-tooltip>编辑</q-tooltip>
            </q-btn>
            <q-btn flat dense icon="o_delete" color="grey" size="xs" @click="emit('delete', (props.row as DeviceInfoItem).deviceId)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #no-data>
          <div class="text-center p-4 rw-text-label">暂无设备，点击右上角添加</div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
