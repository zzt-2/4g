<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useHistoryAnalysisStore } from '../stores/historyAnalysis';
import HistoryTimeSelector from '../components/storage/HistoryTimeSelector.vue';
import HistoryDataSelector from '../components/storage/HistoryDataSelector.vue';
import UniversalChart from '../components/common/UniversalChart.vue';
import UniversalChartSettingsDialog from '../components/common/UniversalChartSettingsDialog.vue';
import CSVExportDialog from '../components/storage/CSVExportDialog.vue';
import type { YAxisConfig } from '../types/storage/historyData';

const $q = useQuasar();
const historyStore = useHistoryAnalysisStore();

// 本地UI状态
const showExportDialog = ref(false);
const showChartSettingsDialog = ref(false);
const currentEditingChartId = ref<number | null>(null);
const leftPanelWidth = ref(320); // 左侧面板宽度
const isResizing = ref(false);

// 获取图表高度（根据图表数量动态调整）
const getChartHeight = computed(() => {
  const chartCount = historyStore.multiChartSettings.chartCount;
  const headerHeight = 32; // 顶部状态栏高度
  const padding = 8; // 间距
  const availableHeight =
    window.innerHeight - headerHeight * chartCount - padding * (chartCount + 1) - 150;
  const heightPerChart = Math.floor((availableHeight - (chartCount - 1) * padding) / chartCount);
  return Math.max(160, heightPerChart); // 最小200px
});

// 图表数量选项
const chartCountOptions = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
];

// 处理数据加载
const handleLoadData = async (): Promise<void> => {
  try {
    await historyStore.loadHistoryData();
  } catch (error) {
    console.error('数据加载失败:', error);
  }
};

// 处理CSV导出成功
const handleExportSuccess = (filePath: string): void => {
  $q.notify({
    type: 'positive',
    message: 'CSV导出成功',
    caption: filePath ? `文件已保存: ${filePath}` : '文件已成功导出',
    position: 'top',
  });
};

// 处理CSV导出错误
const handleExportError = (error: string): void => {
  $q.notify({
    type: 'negative',
    message: 'CSV导出失败',
    caption: error,
    position: 'top',
  });
};

// 更新图表数量
const updateChartCount = (count: number): void => {
  historyStore.updateChartCount(count);
  $q.notify({
    type: 'positive',
    message: `图表数量已设置为 ${count} 个`,
    position: 'top',
  });
};

// 当前编辑图表的配置
const currentEditingChart = computed(() => {
  if (currentEditingChartId.value === null) return null;
  return (
    historyStore.multiChartSettings.charts.find(
      (chart) => chart.id === currentEditingChartId.value,
    ) || null
  );
});

// 为图表配置对话框准备可用数据项（从左侧已选择的数据项转换）
const availableItemsForChart = computed(() => {
  const selectedDataItems = historyStore.dataItemSelections.filter((item) => item.selected);

  return selectedDataItems.map((selection, index) => {
    const group = historyStore.loadedMetadata.find((g) => g.id === selection.groupId);
    const dataItem = group?.dataItems.find((item) => item.id === selection.dataItemId);

    let label: string;
    if (dataItem && group) {
      label = `${group.label} - ${dataItem.label}`;
    } else {
      label = '未知数据项';
    }

    return {
      id: index + 1, // 简单的递增ID
      label,
      displayValue: `组${selection.groupId}`,
      groupId: selection.groupId,
      dataItemId: selection.dataItemId,
    };
  });
});

// 获取当前编辑图表的选中项ID列表
const currentChartSelectedIds = computed(() => {
  if (!currentEditingChart.value) return [];

  return currentEditingChart.value.selectedDataItems
    .map((item) => {
      // 在 availableItemsForChart 中找到对应的ID
      const availableItem = availableItemsForChart.value.find(
        (available) =>
          available.groupId === item.groupId && available.dataItemId === item.dataItemId,
      );
      return availableItem?.id || 0;
    })
    .filter((id) => id > 0);
});

// 打开图表配置对话框
const openChartSettings = (chartId: number): void => {
  currentEditingChartId.value = chartId;
  showChartSettingsDialog.value = true;
};

// 处理图表配置更新
const handleChartConfigUpdate = (selectedIds: number[]): void => {
  if (currentEditingChartId.value === null) return;

  // 将选中的ID列表转换为 HistoryDataItem 格式
  const selectedItems = selectedIds
    .map((id) => {
      const availableItem = availableItemsForChart.value.find((item) => item.id === id);
      if (!availableItem) return null;

      return {
        groupId: availableItem.groupId!,
        dataItemId: availableItem.dataItemId!,
        label: availableItem.label,
        color: generateChartColor(id), // 生成颜色
      };
    })
    .filter((item) => item !== null) as Array<{
      groupId: number;
      dataItemId: number;
      label: string;
      color: string;
    }>;

  historyStore.updateChartConfig(currentEditingChartId.value, {
    selectedDataItems: selectedItems,
  });

  $q.notify({
    type: 'positive',
    message: '图表配置已更新',
    position: 'top',
  });
};

// 处理Y轴配置更新
const handleYAxisConfigUpdate = (config: YAxisConfig): void => {
  if (currentEditingChartId.value === null) return;

  historyStore.updateChartConfig(currentEditingChartId.value, {
    yAxisConfig: config,
  });

  $q.notify({
    type: 'positive',
    message: '图表Y轴配置已更新',
    position: 'top',
  });
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

// 左侧面板拖拽调整宽度
const startResize = (event: MouseEvent): void => {
  isResizing.value = true;
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  event.preventDefault();
};

const handleResize = (event: MouseEvent): void => {
  if (!isResizing.value) return;

  const newWidth = event.clientX;
  if (newWidth >= 280 && newWidth <= 500) {
    leftPanelWidth.value = newWidth;
  }
};

const stopResize = (): void => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};

// 快捷键处理
const handleKeydown = (event: KeyboardEvent): void => {
  // Ctrl+E 打开导出对话框
  if (event.ctrlKey && event.key === 'e') {
    event.preventDefault();
    if (historyStore.selectedItemsCount > 0) {
      showExportDialog.value = true;
    } else {
      $q.notify({
        type: 'warning',
        message: '请先选择要导出的数据项',
        position: 'top',
      });
    }
  }

  // Ctrl+R 重新加载数据
  if (event.ctrlKey && event.key === 'r') {
    event.preventDefault();
    handleLoadData();
  }
};

// 组件挂载和卸载
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);

  // 初始化获取可用时间
  historyStore.fetchAvailableHours();
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
});
</script>

<template>
  <div class="bg-industrial-primary h-full flex flex-col">
    <!-- 主内容区域 -->
    <div class="flex gap-4 p-4 h-full">
      <!-- 左侧控制面板 -->
      <div
        class="bg-industrial-panel border border-solid border-industrial rounded-lg shadow-lg flex-shrink-0 flex flex-col overflow-hidden"
        :style="{ width: `${leftPanelWidth}px`, minWidth: '280px', maxWidth: '400px' }">
        <!-- 面板内容 -->
        <div class="flex-1 flex flex-col p-3">
          <!-- 时间选择器 -->
          <div class="flex-shrink-0 mb-2">
            <HistoryTimeSelector :disabled="historyStore.isLoading" @load-data="handleLoadData" />
          </div>

          <!-- 数据项选择器 -->
          <div class="flex-1 mb-2 min-h-0">
            <HistoryDataSelector :disabled="historyStore.isLoading" />
          </div>

          <!-- CSV导出按钮 -->
          <div class="flex-shrink-0">
            <q-btn flat label="导出为CSV" icon="file_download" size="sm" class="w-full btn-industrial-secondary text-xs"
              :disabled="historyStore.isLoading || historyStore.selectedItemsCount === 0"
              @click="showExportDialog = true" />
          </div>
        </div>

        <!-- 调整手柄 -->
        <div
          class="w-1 bg-industrial-highlight hover:bg-industrial-accent cursor-col-resize absolute right-0 top-0 bottom-0 opacity-0 hover:opacity-100 transition-opacity"
          @mousedown="startResize" />
      </div>

      <!-- 右侧图表区域 -->
      <div class="flex-1 flex flex-col bg-industrial-primary">
        <!-- 顶部状态栏 -->
        <div class="flex items-center justify-between bg-industrial-secondary border-b border-industrial px-6 py-4">
          <!-- 左侧：图表数量选择 -->
          <div class="flex items-center gap-4">
            <span class="text-industrial-secondary text-xs">图表数量:</span>
            <div class="flex gap-1">
              <button v-for="option in chartCountOptions" :key="option.value" :class="[
                'px-2 py-1 text-xs rounded bg-industrial-secondary border border-industrial-highlight text-industrial-accent hover:bg-industrial-highlight transition-colors',
                historyStore.multiChartSettings.chartCount === option.value
                  ? 'bg-industrial-accent border-industrial-accent text-white'
                  : 'border-industrial text-industrial-primary hover:bg-industrial-highlight',
              ]" :disabled="historyStore.isLoading" @click="updateChartCount(option.value)">
                {{ option.label }}
              </button>
            </div>
          </div>

          <!-- 右侧：页面统计 -->
          <div class="flex items-center gap-6">
            <div class="text-center">
              <div class="text-industrial-tertiary text-xs">数据记录</div>
              <div class="text-industrial-primary font-medium">
                {{ historyStore.getStatistics().value.totalRecords.toLocaleString() }}
              </div>
            </div>
            <div class="text-center">
              <div class="text-industrial-tertiary text-xs">已选择项</div>
              <div class="text-industrial-primary font-medium">
                {{ historyStore.selectedItemsCount }}
              </div>
            </div>
            <div class="text-center">
              <div class="text-industrial-tertiary text-xs">时间范围</div>
              <div class="text-industrial-primary font-medium text-xs font-mono">
                {{ historyStore.getStatistics().value.timeRangeText }}
              </div>
            </div>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="historyStore.isLoading" class="flex-1 flex items-center justify-center">
          <div class="text-center space-y-4">
            <q-spinner-dots size="xl" class="text-industrial-accent" />
            <div class="text-industrial-primary text-lg">{{ historyStore.loadingMessage }}</div>
            <div class="text-industrial-tertiary text-sm">正在处理历史数据，请稍候...</div>
          </div>
        </div>

        <!-- 图表展示区域 -->
        <div v-else class="flex-1 overflow-y-hidden">
          <!-- 多图表展示 -->
          <div v-for="chart in historyStore.multiChartSettings.charts" :key="chart.id" class="w-full">
            <div class="bg-industrial-panel border-industrial rounded overflow-hidden">
              <!-- 图表标题栏 -->
              <div
                class="h-32px bg-industrial-secondary border-b border-industrial px-3 flex items-center justify-between">
                <h4 class="text-industrial-primary text-sm font-medium m-0">
                  {{ chart.title }}
                </h4>
                <div class="flex items-center gap-2">
                  <span class="text-industrial-tertiary text-xs">
                    {{ chart.selectedDataItems.length }} 项
                  </span>
                  <button class="btn-industrial-secondary px-2 py-1 text-xs rounded hover:bg-industrial-highlight"
                    @click="openChartSettings(chart.id)">
                    配置
                  </button>
                </div>
              </div>

              <!-- 图表内容 -->
              <UniversalChart :history-data="historyStore.chartDataSets[chart.id] || []" :chart-config="chart"
                :y-axis-config="chart.yAxisConfig" :height="`${getChartHeight}px`" :loading="historyStore.isLoading"
                mode="history" :show-settings-button="false" />
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="historyStore.multiChartSettings.charts.length === 0"
            class="flex-1 flex items-center justify-center">
            <div class="text-center space-y-4">
              <q-icon name="show_chart" size="xl" class="text-industrial-tertiary opacity-50" />
              <div class="text-industrial-tertiary text-lg">暂无图表配置</div>
              <div class="text-industrial-secondary text-sm">
                请在左侧面板中选择数据项，然后设置图表数量
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CSV导出对话框 -->
    <CSVExportDialog v-model="showExportDialog" @export-success="handleExportSuccess"
      @export-error="handleExportError" />

    <!-- 图表配置对话框 -->
    <UniversalChartSettingsDialog v-model="showChartSettingsDialog" :available-items="availableItemsForChart"
      :selected-items="currentChartSelectedIds" :chart-config="currentEditingChart?.yAxisConfig"
      :title="currentEditingChart ? `配置 ${currentEditingChart.title}` : '图表配置'" mode="history"
      @update:selected-items="handleChartConfigUpdate" @update:chart-config="handleYAxisConfigUpdate" />
  </div>
</template>

<style scoped>
/* 调整手柄样式 */
.cursor-col-resize {
  z-index: 10;
}

/* 拖拽时的样式 */
.dragging {
  user-select: none;
  cursor: col-resize;
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .flex {
    flex-direction: column;
  }

  .cursor-col-resize {
    display: none;
  }
}
</style>
