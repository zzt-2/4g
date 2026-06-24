<script setup lang="ts">
// Tab2 左栏卫星列表（240px）。搜索 + 单选列表 + 添加/复制/删除/导入/导出。
// 删除走二次确认（emit 给 page 弹 $q.dialog）。选中态由 page 的 composable 管理。

import { ref, computed } from 'vue';
import DataTable from '@/widgets/DataTable.vue';
import TableToolbar from '@/widgets/TableToolbar.vue';
import { satelliteColumns, type SatelliteRow } from '@/features/command-ingress/components/satellite-columns';

interface Props {
  rows: readonly SatelliteRow[];
  selectedId: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:selected': [satelliteId: string];
  add: [];
  duplicate: [satelliteId: string];
  delete: [satelliteId: string];
  import: [];
  export: [];
}>();

// 本地搜索词（纯 UI 筛选，不污染 composable）
const searchText = ref('');

// 客户端筛选（卫星数少，前端筛够；P2 规范：派生数组 computed 可接受，数据量小）
const filteredRows = computed<readonly SatelliteRow[]>(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return props.rows;
  return props.rows.filter(r => String(r.satelliteId).toLowerCase().includes(q));
});

// QTable selected 需要数组形式
function selectedArray(): SatelliteRow[] {
  return props.selectedId ? [{ satelliteId: props.selectedId } as SatelliteRow] : [];
}

function onSelect(rows: Record<string, unknown>[]): void {
  if (rows.length > 0) {
    emit('update:selected', (rows[0] as SatelliteRow).satelliteId);
  }
}
</script>

<template>
  <div class="satellite-list flex flex-col h-full px-4 py-3">
    <!-- 工具栏：搜索 + 添加/导入/导出 -->
    <TableToolbar v-model:search-model-value="searchText" search-placeholder="搜索卫星..." class="flex-shrink-0">
      <template #actions>
        <q-btn flat dense icon="o_add" color="primary" size="sm" @click="emit('add')">
          <q-tooltip>添加卫星</q-tooltip>
        </q-btn>
        <q-btn flat dense icon="o_file_upload" color="primary" size="sm" @click="emit('import')">
          <q-tooltip>导入</q-tooltip>
        </q-btn>
        <q-btn flat dense icon="o_file_download" color="primary" size="sm" @click="emit('export')">
          <q-tooltip>导出</q-tooltip>
        </q-btn>
      </template>
    </TableToolbar>

    <!-- 列表：flex 撑满 -->
    <div class="flex-1 min-h-0 mt-2 overflow-hidden">
      <DataTable :columns="satelliteColumns" :rows="filteredRows" row-key="satelliteId" selection="single"
        :selected="selectedArray()" container-height="100%" @update:selected="onSelect"
        @row-click="(row: Record<string, unknown>) => emit('update:selected', (row as SatelliteRow).satelliteId)">
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat dense icon="o_content_copy" color="grey" size="xs"
              @click.stop="emit('duplicate', (props.row as SatelliteRow).satelliteId)">
              <q-tooltip>复制</q-tooltip>
            </q-btn>
            <q-btn flat dense icon="o_delete" color="grey" size="xs"
              @click.stop="emit('delete', (props.row as SatelliteRow).satelliteId)">
              <q-tooltip>删除</q-tooltip>
            </q-btn>
          </q-td>
        </template>
        <template #no-data>
          <div class="text-center p-4 rw-text-label">暂无卫星配置</div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
