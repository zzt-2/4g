<script setup lang="ts">
import { ref, computed } from 'vue';
import DataTable from './DataTable.vue';
import UniversalChart from '../../../common/UniversalChart.vue';
import SpecialConstellationChart from './SpecialConstellationChart.vue';
import ScatterPlotConfigDialog from './ScatterPlotConfigDialog.vue';
import TableControls from './TableControls.vue';
import DisplayModeToggle from './DisplayModeToggle.vue';
import RecordingControls from './RecordingControls.vue';
import UniversalChartSettingsDialog from '../../../common/UniversalChartSettingsDialog.vue';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';
import { useLocalStorage } from '@vueuse/core';
import type { YAxisConfig, PerformanceConfig } from '../../../../types/storage/historyData';

// Store
const dataDisplayStore = useDataDisplayStore();
const receiveFramesStore = useReceiveFramesStore();

// 对话框状态
const table1SettingsDialog = ref(false);
const table2SettingsDialog = ref(false);

// 性能配置持久化存储 - 优化默认值提高实时图表性能
const performanceConfig = useLocalStorage<PerformanceConfig>('chart-performance-config', {
  maxDataPoints: 500, // 减少数据点提高性能
  updateInterval: 1000, // 保持1秒更新间隔
  enableIncrementalUpdate: true, // 启用增量更新
  enableSampling: true, // 启用抽样减少数据量
  samplingInterval: 2, // 每2个点取1个
});

// 普通图表设置对话框触发

// 处理表格1图表设置点击
const handleTable1ChartSettings = () => {
  table1SettingsDialog.value = true;
};

// 处理表格2图表设置点击
const handleTable2ChartSettings = () => {
  table2SettingsDialog.value = true;
};

// UI显示用的数据项接口
interface UIDataItem {
  id: number;
  label: string;
  displayValue?: string;
  isVisible?: boolean;
  color?: string;
}
const panels = [0, 1] as const;

const getGroupId = (idx: number) =>
  idx === 0
    ? dataDisplayStore.table1Config.selectedGroupId
    : dataDisplayStore.table2Config.selectedGroupId;

interface GroupItem {
  id: number;
  label: string;
  displayValue: string;
  isVisible: boolean;
}

const availableItemsForChartList = panels.map((idx) =>
  computed<UIDataItem[]>(() => {
    const groupId = getGroupId(idx);
    if (!groupId) return [];
    const group = receiveFramesStore.groups.find((g) => g.id === groupId);
    const visibleItems = (group && Array.isArray(group.dataItems))
      ? (group.dataItems as GroupItem[]).filter((item) => item.isVisible)
      : [];
    return visibleItems.map((item: GroupItem) => ({
      id: item.id,
      label: item.label,
      displayValue: item.displayValue,
      isVisible: item.isVisible,
      color: generateChartColor(item.id),
    }));
  }),
);

const availableItemsList = panels.map((idx) =>
  computed<UIDataItem[]>(() => {
    const groupId = getGroupId(idx);
    if (!groupId) return [];
    const group = receiveFramesStore.groups.find((g) => g.id === groupId);
    const visibleItems = (group && Array.isArray(group.dataItems))
      ? (group.dataItems as GroupItem[]).filter((item) => item.isVisible)
      : [];
    return visibleItems.map((item: GroupItem) => ({
      id: item.id,
      label: item.label,
      displayValue: item.displayValue ?? '-',
      color: generateChartColor(item.id),
      isVisible: item.isVisible,
    }));
  }),
);

type TableConfigShape = { chartSelectedItems: number[]; yAxisConfig?: YAxisConfig } & Record<string, unknown>;
const updatePanelConfig = (idx: number, partial: Partial<TableConfigShape>) => {
  if (idx === 0) dataDisplayStore.updateTable1Config(partial);
  else dataDisplayStore.updateTable2Config(partial);
};

const updateSelectedItems = (idx: number, items: number[]) => {
  updatePanelConfig(idx, { chartSelectedItems: items });
};

const updateChartConfig = (idx: number, config: YAxisConfig) => {
  updatePanelConfig(idx, { yAxisConfig: config });
};

// 更新性能配置
const updatePerformanceConfig = (config: PerformanceConfig) => {
  performanceConfig.value = { ...performanceConfig.value, ...config };
};

// 模板中取值的帮助函数，避免将 ComputedRef 直接传给子组件导致类型告警
const getAvailableItemsForChart = (idx: 0 | 1): UIDataItem[] => availableItemsForChartList[idx]!.value;
const getAvailableItems = (idx: 0 | 1): UIDataItem[] => availableItemsList[idx]!.value;

// 打开设置按钮分发
const handleOpenSettings = (idx: 0 | 1) => {
  if (idx === 0) {
    if (dataDisplayStore.table1Config.displayMode === 'special') openTable1ScatterSettings();
    else handleTable1ChartSettings();
  } else {
    if (dataDisplayStore.table2Config.displayMode === 'special') openTable2ScatterSettings();
    else handleTable2ChartSettings();
  }
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

// 特殊图配置对话框
const table1ScatterDialog = ref(false);
const table2ScatterDialog = ref(false);

function openTable1ScatterSettings() {
  table1ScatterDialog.value = true;
}

function openTable2ScatterSettings() {
  table2ScatterDialog.value = true;
}

// 显示模式标签
const getModeLabel = (mode: 'table' | 'special' | 'chart') =>
  mode === 'table' ? '表格' : mode === 'special' ? '特殊图' : '图表';
</script>

<template>
  <div class="h-full flex flex-col bg-industrial-primary">
    <!-- 主内容区域：双表格布局 -->
    <div class="flex-1 flex min-h-0">
      <!-- 表格1 -->
      <div class="flex-1 flex flex-col bg-industrial-panel rounded-lg border border-industrial overflow-hidden">
        <div class="flex-shrink-0 bg-industrial-table-header border-b border-industrial p-3">
          <div class="flex items-center justify-between">
            <DisplayModeToggle :display-mode="dataDisplayStore.table1Config.displayMode"
              @update:display-mode="dataDisplayStore.updateTable1Config({ displayMode: $event })"
              @open-settings="handleOpenSettings(0)" />
            <q-btn v-if="dataDisplayStore.table1Config.displayMode === 'chart'" flat dense round icon="clear_all"
              size="sm" class="btn-industrial-secondary ml-2" @click="dataDisplayStore.clearTable1History"
              :disable="!dataDisplayStore.table1Config.selectedGroupId">
              <q-tooltip class="bg-industrial-secondary text-industrial-primary text-xs">
                清空图表1历史数据
              </q-tooltip>
            </q-btn>
            <q-space />
            <TableControls :selected-group-id="dataDisplayStore.table1Config.selectedGroupId"
              :available-groups="dataDisplayStore.availableGroups" @update:selected-group-id="
                dataDisplayStore.updateTable1Config({ selectedGroupId: $event })
                " />
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <DataTable v-if="dataDisplayStore.table1Config.displayMode === 'table'" table-id="table1" />
          <SpecialConstellationChart v-else-if="dataDisplayStore.table1Config.displayMode === 'special'"
            :constellation-data="dataDisplayStore.constellationDisplayData.table1"
            :config="dataDisplayStore.table1ScatterConfig" :title="'星座图1'" />
          <UniversalChart v-else v-bind="{
            ...(dataDisplayStore.table1Config.selectedGroupId && { groupId: dataDisplayStore.table1Config.selectedGroupId }),
            availableItems: getAvailableItemsForChart(0),
            selectedItems: dataDisplayStore.table1Config.chartSelectedItems,
            yAxisConfig: dataDisplayStore.table1Config.yAxisConfig,
            performanceConfig: performanceConfig,
            chartTitle: '图表1',
            mode: 'realtime'
          }" @settings-click="handleTable1ChartSettings" />
        </div>
      </div>

      <div class="w-4"></div>

      <!-- 表格2 -->
      <div class="flex-1 flex flex-col bg-industrial-panel rounded-lg border border-industrial overflow-hidden">
        <div class="flex-shrink-0 bg-industrial-table-header border-b border-industrial p-3">
          <div class="flex items-center justify-between">
            <DisplayModeToggle :display-mode="dataDisplayStore.table2Config.displayMode"
              @update:display-mode="dataDisplayStore.updateTable2Config({ displayMode: $event })"
              @open-settings="handleOpenSettings(1)" />
            <q-btn v-if="dataDisplayStore.table2Config.displayMode === 'chart'" flat dense round icon="clear_all"
              size="sm" class="btn-industrial-secondary ml-2" @click="dataDisplayStore.clearTable2History"
              :disable="!dataDisplayStore.table2Config.selectedGroupId">
              <q-tooltip class="bg-industrial-secondary text-industrial-primary text-xs">
                清空图表2历史数据
              </q-tooltip>
            </q-btn>
            <q-space />
            <TableControls :selected-group-id="dataDisplayStore.table2Config.selectedGroupId"
              :available-groups="dataDisplayStore.availableGroups" @update:selected-group-id="
                dataDisplayStore.updateTable2Config({ selectedGroupId: $event })
                " />
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <DataTable v-if="dataDisplayStore.table2Config.displayMode === 'table'" table-id="table2" />
          <SpecialConstellationChart v-else-if="dataDisplayStore.table2Config.displayMode === 'special'"
            :constellation-data="dataDisplayStore.constellationDisplayData.table2"
            :config="dataDisplayStore.table2ScatterConfig" :title="'星座图2'" />
          <UniversalChart v-else v-bind="{
            ...(dataDisplayStore.table2Config.selectedGroupId && { groupId: dataDisplayStore.table2Config.selectedGroupId }),
            availableItems: getAvailableItemsForChart(1),
            selectedItems: dataDisplayStore.table2Config.chartSelectedItems,
            yAxisConfig: dataDisplayStore.table2Config.yAxisConfig,
            performanceConfig: performanceConfig,
            chartTitle: '图表2',
            mode: 'realtime'
          }" @settings-click="handleTable2ChartSettings" />
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
            {{ getModeLabel(dataDisplayStore.table1Config.displayMode) }}
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
            {{ getModeLabel(dataDisplayStore.table2Config.displayMode) }}
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
    <UniversalChartSettingsDialog v-model="table1SettingsDialog" :available-items="getAvailableItems(0)"
      :selected-items="dataDisplayStore.table1Config.chartSelectedItems"
      :chart-config="dataDisplayStore.table1Config.yAxisConfig" :performance-config="performanceConfig" title="图表1设置"
      mode="realtime" @update:selected-items="(v) => updateSelectedItems(0, v)"
      @update:chart-config="(v) => updateChartConfig(0, v)" @update:performance-config="updatePerformanceConfig" />

    <UniversalChartSettingsDialog v-model="table2SettingsDialog" :available-items="getAvailableItems(1)"
      :selected-items="dataDisplayStore.table2Config.chartSelectedItems"
      :chart-config="dataDisplayStore.table2Config.yAxisConfig" :performance-config="performanceConfig" title="图表2设置"
      mode="realtime" @update:selected-items="(v) => updateSelectedItems(1, v)"
      @update:chart-config="(v) => updateChartConfig(1, v)" @update:performance-config="updatePerformanceConfig" />

    <!-- 特殊图配置对话框 -->
    <ScatterPlotConfigDialog v-model="table1ScatterDialog" table-id="table1" title="星座图1配置" />
    <ScatterPlotConfigDialog v-model="table2ScatterDialog" table-id="table2" title="星座图2配置" />
  </div>
</template>

<style scoped>
/* 使用工业主题样式，无需额外样式定义 */
</style>
