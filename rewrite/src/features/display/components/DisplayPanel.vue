<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
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

interface FieldMeta {
  readonly description?: string;
}

interface Props {
  panelId: '1' | '2';
  mode: DisplayMode;
  selectedGroupId: string;
  groups: readonly GroupOption[];
  rows: readonly TableRowProjection[];
  chartInstance: ChartInstanceProjection | null;
  scatter: ScatterProjection;
  canUseConstellation: boolean;
  reorderMode: boolean;
  visibleColumns: readonly string[];
  fieldMeta?: ReadonlyMap<string, FieldMeta>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:mode': [mode: DisplayMode];
  'update:selectedGroupId': [groupId: string];
  'update:reorderMode': [value: boolean];
  'update:visibleColumns': [columns: readonly string[]];
  'openChartSettings': [];
  'openScatterSettings': [];
  'openGroupConfig': [];
  'reorderField': [dataItemId: string, direction: 'up' | 'down'];
  'clearChartData': [];
}>();

const $q = useQuasar();

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

const activeColumns = computed(() => {
  const visible = props.visibleColumns.length === 0
    ? panelTableColumns
    : panelTableColumns.filter((col) => new Set(props.visibleColumns).has(col.name));
  if (!props.reorderMode) return visible.filter((col) => col.name !== '_reorder');
  return visible;
});

function hexDisplay(row: TableRowProjection): string {
  return row.rawHex ?? '-';
}

function copyToClipboard(text: string): void {
  if (!text || text === '-') return;
  navigator.clipboard.writeText(text).then(
    () => { $q.notify({ message: '已复制', timeout: 800, type: 'positive' }); },
    () => { $q.notify({ message: '复制失败', timeout: 800, type: 'negative' }); },
  );
}

function moveField(row: TableRowProjection, direction: 'up' | 'down'): void {
  emit('reorderField', row.dataItemId, direction);
}

function toggleColumn(colName: string): void {
  const current = [...props.visibleColumns];
  if (current.length === 0) {
    // If empty, start from all columns visible
    const allNames = panelTableColumns.map((c) => c.name);
    const next = allNames.filter((n) => n !== colName);
    emit('update:visibleColumns', next);
  } else {
    const idx = current.indexOf(colName);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(colName);
    }
    emit('update:visibleColumns', current);
  }
}

const allColumnNames = panelTableColumns
  .filter((c) => c.name !== '_reorder')
  .map((c) => c.name);
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
        v-if="mode === 'table'"
        flat
        round
        dense
        :icon="reorderMode ? 'check' : 'swap_vert'"
        :color="reorderMode ? 'primary' : undefined"
        size="sm"
        @click="emit('update:reorderMode', !reorderMode)"
      >
        <q-tooltip>{{ reorderMode ? '完成排序' : '排序模式' }}</q-tooltip>
      </q-btn>

      <q-btn
        v-if="mode === 'table'"
        flat
        round
        dense
        icon="view_column"
        size="sm"
      >
        <q-tooltip>列设置</q-tooltip>
        <q-menu>
          <q-list dense>
            <q-item
              v-for="colName in allColumnNames"
              :key="colName"
              clickable
              @click="toggleColumn(colName)"
            >
              <q-item-section side>
                <q-checkbox
                  :model-value="visibleColumns.length === 0 || visibleColumns.includes(colName)"
                  dense
                />
              </q-item-section>
              <q-item-section>{{ panelTableColumns.find(c => c.name === colName)?.label || colName }}</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
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
        v-if="mode === 'chart'"
        flat
        round
        dense
        icon="restart_alt"
        size="sm"
        @click="emit('clearChartData')"
      >
        <q-tooltip>清空折线图数据</q-tooltip>
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
          :columns="activeColumns"
          :rows="rows"
          row-key="dataItemId"
          container-height="100%"
        >
          <template #no-data>
            <div class="text-center w-full p-4 rw-text-label">暂无字段数据</div>
          </template>
          <template #body-cell-displayValue="slotProps">
            <q-td :props="slotProps">
              <span
                class="rw-text-value cursor-pointer"
                @click="copyToClipboard(String(slotProps.row.displayValue ?? ''))"
              >
                {{ slotProps.row.displayValue ?? '-' }}
              </span>
              <q-tooltip v-if="fieldMeta?.get(slotProps.row.dataItemId)?.description" :delay="400">
                {{ fieldMeta.get(slotProps.row.dataItemId)!.description }}
              </q-tooltip>
            </q-td>
          </template>
          <template #body-cell-rawHex="slotProps">
            <q-td :props="slotProps">
              <span
                class="rw-text-value font-mono text-xs cursor-pointer"
                @click="copyToClipboard(hexDisplay(slotProps.row))"
              >
                {{ hexDisplay(slotProps.row) }}
              </span>
            </q-td>
          </template>
          <template #body-cell-_reorder="slotProps">
            <q-td v-if="reorderMode" :props="slotProps">
              <q-btn
                flat
                round
                dense
                icon="keyboard_arrow_up"
                size="xs"
                :disable="slotProps.rowIndex === 0"
                @click="moveField(slotProps.row, 'up')"
              />
              <q-btn
                flat
                round
                dense
                icon="keyboard_arrow_down"
                size="xs"
                :disable="slotProps.rowIndex === (rows.length - 1)"
                @click="moveField(slotProps.row, 'down')"
              />
            </q-td>
            <q-td v-else :props="slotProps" />
          </template>
        </DataTable>

        <div v-else-if="mode === 'chart'" class="h-full p-2">
          <WaveformChart
            :series="chartInstance?.series ?? []"
            :empty-variant="(chartInstance?.series.length ?? 0) > 0 ? 'no-data' : 'no-selection'"
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
