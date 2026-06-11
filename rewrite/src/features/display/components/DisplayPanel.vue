<script setup lang="ts">
import { computed } from 'vue';
import DataTable from '@/widgets/DataTable.vue';
import WaveformChart from '@/widgets/WaveformChart.vue';
import ScatterChart from '@/widgets/ScatterChart.vue';
import { panelTableColumns } from './display-columns';
import type {
  DisplayMode,
  ChartInstanceProjection,
  GroupOption,
  ScatterProjection,
  TableRowProjection,
} from '../core';

interface Props {
  panelId: '1' | '2';
  mode: DisplayMode;
  selectedGroupId: string;
  groups: readonly GroupOption[];
  rows: readonly TableRowProjection[];
  chartInstance: ChartInstanceProjection | null;
  scatter: ScatterProjection;
  canUseConstellation: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:mode': [mode: DisplayMode];
  'update:selectedGroupId': [groupId: string];
  'openChartSettings': [];
  'openScatterSettings': [];
  'openGroupConfig': [];
}>();

const groupOptions = computed(() => [
  { value: '', label: '全部分组' },
  ...props.groups,
]);

const modeOptions = computed(() => [
  { value: 'table' as DisplayMode, label: '表格', icon: 'table_chart' },
  { value: 'chart' as DisplayMode, label: '波形', icon: 'show_chart' },
  {
    value: 'special' as DisplayMode,
    label: '星座',
    icon: 'scatter_plot',
    disable: !props.canUseConstellation,
  },
]);

function formatTime(iso?: string): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}
</script>

<template>
  <div class="rw-panel-base rounded overflow-hidden flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 rw-divider-b">
      <q-btn-toggle
        :model-value="mode"
        no-caps
        dense
        flat
        toggle-color="primary"
        :options="modeOptions"
        @update:model-value="emit('update:mode', $event as DisplayMode)"
      />

      <q-space />

      <q-select
        :model-value="selectedGroupId"
        :options="groupOptions"
        emit-value
        map-options
        dense
        outlined
        class="panel-group-select"
        @update:model-value="emit('update:selectedGroupId', $event ?? '')"
      />

      <q-btn
        flat
        round
        dense
        icon="folder_open"
        size="sm"
        @click="emit('openGroupConfig')"
      >
        <q-tooltip>分组管理</q-tooltip>
      </q-btn>

      <q-btn
        v-if="mode === 'chart'"
        flat
        round
        dense
        icon="settings"
        size="sm"
        @click="emit('openChartSettings')"
      >
        <q-tooltip>图表配置</q-tooltip>
      </q-btn>
      <q-btn
        v-if="mode === 'special'"
        flat
        round
        dense
        icon="settings"
        size="sm"
        @click="emit('openScatterSettings')"
      >
        <q-tooltip>星座配置</q-tooltip>
      </q-btn>
    </div>

    <!-- Content: relative/absolute to break percentage-height chain -->
    <div class="flex-1 min-h-0 relative">
      <div class="absolute inset-0">
        <DataTable
          v-if="mode === 'table'"
          :columns="panelTableColumns"
          :rows="rows"
          row-key="dataItemId"
          container-height="100%"
        >
          <template #no-data>
            <div class="text-center w-full p-4 rw-text-label">暂无字段数据</div>
          </template>
          <template #body-cell-updatedAt="slotProps">
            <q-td :props="slotProps">
              <span class="rw-text-desc text-xs">{{ formatTime(slotProps.row.updatedAt) }}</span>
            </q-td>
          </template>
        </DataTable>

        <div v-else-if="mode === 'chart'" class="h-full p-2">
          <WaveformChart
            :series="chartInstance?.series ?? []"
            height="100%"
          />
        </div>

        <div v-else-if="mode === 'special'" class="h-full p-2">
          <ScatterChart
            :data="scatter"
            height="100%"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel-group-select {
  min-width: 120px;
  max-width: 200px;
}
</style>
