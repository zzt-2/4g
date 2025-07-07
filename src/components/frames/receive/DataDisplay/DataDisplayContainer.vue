<script setup lang="ts">
import { ref, computed } from 'vue';
import DataTable from './DataTable.vue';
import UniversalChart from '../../../common/UniversalChart.vue';
import TableControls from './TableControls.vue';
import DisplayModeToggle from './DisplayModeToggle.vue';
import RecordingControls from './RecordingControls.vue';
import UniversalChartSettingsDialog from '../../../common/UniversalChartSettingsDialog.vue';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';
import type { YAxisConfig } from '../../../../types/storage/historyData';

// Store
const dataDisplayStore = useDataDisplayStore();
const receiveFramesStore = useReceiveFramesStore();

// 对话框状态
const table1SettingsDialog = ref(false);
const table2SettingsDialog = ref(false);

// 处理表格1设置对话框
const handleTable1Settings = () => {
  table1SettingsDialog.value = true;
};

// 处理表格2设置对话框
const handleTable2Settings = () => {
  table2SettingsDialog.value = true;
};

// 处理表格1图表设置点击
const handleTable1ChartSettings = () => {
  table1SettingsDialog.value = true;
};

// 处理表格2图表设置点击
const handleTable2ChartSettings = () => {
  table2SettingsDialog.value = true;
};

// 计算属性：表格1的图表数据和配置
const table1ChartData = computed(() => {
  const groupId = dataDisplayStore.table1Config.selectedGroupId;
  if (!groupId) return [];

  return dataDisplayStore.historyRecords
    .filter((record) => record.groupId === groupId)
    .map((record) => ({
      timestamp: record.timestamp,
      dataItems: record.dataItems.map((item) => ({
        id: item.id,
        value: item.value as string | number | boolean,
      })),
    }));
});

// 表格1可用数据项（用于 UniversalChart）
const table1AvailableItemsForChart = computed(() => {
  const groupId = dataDisplayStore.table1Config.selectedGroupId;
  if (!groupId) return [];

  const group = receiveFramesStore.groups.find((g) => g.id === groupId);
  const visibleItems = group?.dataItems.filter((item) => item.isVisible) || [];

  // 为每个数据项添加颜色信息
  return visibleItems.map((item) => ({
    ...item,
    color: generateChartColor(item.id),
  }));
});

// 表格1可用数据项（转换为统一格式，用于 UniversalChartSettingsDialog）
const table1AvailableItems = computed(() => {
  const groupId = dataDisplayStore.table1Config.selectedGroupId;
  if (!groupId) return [];

  const group = receiveFramesStore.groups.find((g) => g.id === groupId);
  const visibleItems = group?.dataItems.filter((item) => item.isVisible) || [];

  return visibleItems.map((item) => ({
    id: item.id,
    label: item.label,
    displayValue: String(item.value || '-'),
    color: generateChartColor(item.id), // 添加颜色信息
  }));
});

// 计算属性：表格2的图表数据和配置
const table2ChartData = computed(() => {
  const groupId = dataDisplayStore.table2Config.selectedGroupId;
  if (!groupId) return [];

  return dataDisplayStore.historyRecords
    .filter((record) => record.groupId === groupId)
    .map((record) => ({
      timestamp: record.timestamp,
      dataItems: record.dataItems.map((item) => ({
        id: item.id,
        value: item.value as string | number | boolean,
      })),
    }));
});

// 表格2可用数据项（用于 UniversalChart）
const table2AvailableItemsForChart = computed(() => {
  const groupId = dataDisplayStore.table2Config.selectedGroupId;
  if (!groupId) return [];

  const group = receiveFramesStore.groups.find((g) => g.id === groupId);
  const visibleItems = group?.dataItems.filter((item) => item.isVisible) || [];

  // 为每个数据项添加颜色信息
  return visibleItems.map((item) => ({
    ...item,
    color: generateChartColor(item.id),
  }));
});

// 表格2可用数据项（转换为统一格式，用于 UniversalChartSettingsDialog）
const table2AvailableItems = computed(() => {
  const groupId = dataDisplayStore.table2Config.selectedGroupId;
  if (!groupId) return [];

  const group = receiveFramesStore.groups.find((g) => g.id === groupId);
  const visibleItems = group?.dataItems.filter((item) => item.isVisible) || [];

  return visibleItems.map((item) => ({
    id: item.id,
    label: item.label,
    displayValue: String(item.value || '-'),
    color: generateChartColor(item.id), // 添加颜色信息
  }));
});

// 处理表格1选中项更新
const handleTable1SelectedItemsUpdate = (items: number[]) => {
  dataDisplayStore.updateTable1Config({ chartSelectedItems: items });
};

// 处理表格2选中项更新
const handleTable2SelectedItemsUpdate = (items: number[]) => {
  dataDisplayStore.updateTable2Config({ chartSelectedItems: items });
};

// 处理表格1图表配置更新
const handleTable1ChartConfigUpdate = (config: YAxisConfig) => {
  dataDisplayStore.updateTable1Config({ yAxisConfig: config });
};

// 处理表格2图表配置更新
const handleTable2ChartConfigUpdate = (config: YAxisConfig) => {
  dataDisplayStore.updateTable2Config({ yAxisConfig: config });
};

// 生成图表颜色的简单函数
const generateChartColor = (id: number): string => {
  const colors = [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#ec4899',
    '#6366f1',
    '#14b8a6',
    '#eab308',
  ];
  return colors[id % colors.length] || '#3b82f6';
};
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-primary">
    <!-- 主内容区域：双表格布局 -->
    <div class="flex-1 flex min-h-0">
      <!-- 表格1 -->
      <div
        class="flex-1 flex flex-col bg-industrial-panel rounded-lg border border-industrial overflow-hidden"
      >
        <div class="flex-shrink-0 bg-industrial-table-header border-b border-industrial p-3">
          <div class="flex items-center justify-between">
            <DisplayModeToggle
              :display-mode="dataDisplayStore.table1Config.displayMode"
              @update:display-mode="dataDisplayStore.updateTable1Config({ displayMode: $event })"
              @open-settings="handleTable1Settings"
            />
            <q-btn
              v-if="dataDisplayStore.table1Config.displayMode === 'chart'"
              flat
              dense
              round
              icon="clear_all"
              size="sm"
              class="btn-industrial-secondary ml-2"
              @click="dataDisplayStore.clearTable1History()"
              :disable="!dataDisplayStore.table1Config.selectedGroupId"
            >
              <q-tooltip class="bg-industrial-secondary text-industrial-primary text-xs">
                清空图表1历史数据
              </q-tooltip>
            </q-btn>
            <q-space />
            <TableControls
              :selected-group-id="dataDisplayStore.table1Config.selectedGroupId"
              :available-groups="dataDisplayStore.availableGroups"
              @update:selected-group-id="
                dataDisplayStore.updateTable1Config({ selectedGroupId: $event })
              "
            />
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <DataTable
            v-if="dataDisplayStore.table1Config.displayMode === 'table'"
            table-id="table1"
          />
          <UniversalChart
            v-else
            :chart-data="table1ChartData"
            :available-items="table1AvailableItemsForChart"
            :selected-items="dataDisplayStore.table1Config.chartSelectedItems"
            :y-axis-config="dataDisplayStore.table1Config.yAxisConfig || undefined"
            :chart-title="'图表1'"
            mode="realtime"
            @settings-click="handleTable1ChartSettings"
          />
        </div>
      </div>

      <div class="w-4"></div>

      <!-- 表格2 -->
      <div
        class="flex-1 flex flex-col bg-industrial-panel rounded-lg border border-industrial overflow-hidden"
      >
        <div class="flex-shrink-0 bg-industrial-table-header border-b border-industrial p-3">
          <div class="flex items-center justify-between">
            <DisplayModeToggle
              :display-mode="dataDisplayStore.table2Config.displayMode"
              @update:display-mode="dataDisplayStore.updateTable2Config({ displayMode: $event })"
              @open-settings="handleTable2Settings"
            />
            <q-btn
              v-if="dataDisplayStore.table2Config.displayMode === 'chart'"
              flat
              dense
              round
              icon="clear_all"
              size="sm"
              class="btn-industrial-secondary ml-2"
              @click="dataDisplayStore.clearTable2History()"
              :disable="!dataDisplayStore.table2Config.selectedGroupId"
            >
              <q-tooltip class="bg-industrial-secondary text-industrial-primary text-xs">
                清空图表2历史数据
              </q-tooltip>
            </q-btn>
            <q-space />
            <TableControls
              :selected-group-id="dataDisplayStore.table2Config.selectedGroupId"
              :available-groups="dataDisplayStore.availableGroups"
              @update:selected-group-id="
                dataDisplayStore.updateTable2Config({ selectedGroupId: $event })
              "
            />
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <DataTable
            v-if="dataDisplayStore.table2Config.displayMode === 'table'"
            table-id="table2"
          />
          <UniversalChart
            v-else
            :chart-data="table2ChartData"
            :available-items="table2AvailableItemsForChart"
            :selected-items="dataDisplayStore.table2Config.chartSelectedItems"
            :y-axis-config="dataDisplayStore.table2Config.yAxisConfig"
            :chart-title="'图表2'"
            mode="realtime"
            @settings-click="handleTable2ChartSettings"
          />
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="flex-shrink-0 p-3 border-t border-industrial bg-industrial-secondary">
      <div class="flex items-center justify-between">
        <!-- 左侧：面板状态信息 -->
        <div class="flex items-center space-x-6 text-xs text-industrial-secondary">
          <span>
            面板1:
            {{ dataDisplayStore.table1Config.displayMode === 'table' ? '表格' : '图表' }}
            -
            {{
              dataDisplayStore.table1Config.selectedGroupId
                ? dataDisplayStore.availableGroups.find(
                    (g) => g.id === dataDisplayStore.table1Config.selectedGroupId,
                  )?.label || '未知分组'
                : '未选择分组'
            }}
          </span>
          <span>
            面板2:
            {{ dataDisplayStore.table2Config.displayMode === 'table' ? '表格' : '图表' }}
            -
            {{
              dataDisplayStore.table2Config.selectedGroupId
                ? dataDisplayStore.availableGroups.find(
                    (g) => g.id === dataDisplayStore.table2Config.selectedGroupId,
                  )?.label || '未知分组'
                : '未选择分组'
            }}
          </span>
          <span>更新间隔: {{ dataDisplayStore.displaySettings.updateInterval / 1000 }}s</span>
        </div>

        <!-- 右侧：记录控制 -->
        <RecordingControls />
      </div>
    </div>

    <!-- 图表设置对话框 -->
    <UniversalChartSettingsDialog
      v-model="table1SettingsDialog"
      :available-items="table1AvailableItems"
      :selected-items="dataDisplayStore.table1Config.chartSelectedItems"
      :chart-config="dataDisplayStore.table1Config.yAxisConfig"
      title="图表1数据项设置"
      mode="realtime"
      @update:selected-items="handleTable1SelectedItemsUpdate"
      @update:chart-config="handleTable1ChartConfigUpdate"
    />

    <UniversalChartSettingsDialog
      v-model="table2SettingsDialog"
      :available-items="table2AvailableItems"
      :selected-items="dataDisplayStore.table2Config.chartSelectedItems"
      :chart-config="dataDisplayStore.table2Config.yAxisConfig"
      title="图表2数据项设置"
      mode="realtime"
      @update:selected-items="handleTable2SelectedItemsUpdate"
      @update:chart-config="handleTable2ChartConfigUpdate"
    />
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
