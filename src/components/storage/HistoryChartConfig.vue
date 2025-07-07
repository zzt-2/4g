<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import type { ChartConfig, DataItemSelection } from '../../types/storage/historyData';
import { useHistoryAnalysisStore } from '../../stores/historyAnalysis';

// Props
interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const $q = useQuasar();
const historyStore = useHistoryAnalysisStore();

// 本地状态
const showAdvancedSettings = ref(false);

// 计算属性
const multiChartSettings = computed(() => historyStore.multiChartSettings);
const dataItemSelections = computed(() => historyStore.dataItemSelections);
const selectedDataItems = computed(() => dataItemSelections.value.filter((item) => item.selected));
const isLoading = computed(() => historyStore.isLoading);

// 图表数量选项
const chartCountOptions = [
  { label: '1 个图表', value: 1 },
  { label: '2 个图表', value: 2 },
  { label: '3 个图表', value: 3 },
  { label: '4 个图表', value: 4 },
];

// 颜色选项
const colorOptions = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#64748b',
  '#dc2626',
  '#059669',
  '#d97706',
];

// 更新图表数量
const updateChartCount = (count: number): void => {
  historyStore.updateChartCount(count);

  $q.notify({
    type: 'positive',
    message: `图表数量已设置为 ${count} 个`,
    position: 'top',
  });
};

// 更新图表标题
const updateChartTitle = (chartId: number, title: string): void => {
  historyStore.updateChartConfig(chartId, { title });
};

// 为图表添加数据项
const addDataItemToChart = (chartId: number, selection: DataItemSelection): void => {
  const label = historyStore.getDataItemLabel(selection.groupId, selection.dataItemId);
  const color = getNextAvailableColor(chartId);

  historyStore.addDataItemToChart(chartId, selection.groupId, selection.dataItemId, label, color);

  $q.notify({
    type: 'positive',
    message: `已添加 "${label}" 到图表${chartId}`,
    position: 'top',
  });
};

// 从图表移除数据项
const removeDataItemFromChart = (chartId: number, groupId: number, dataItemId: number): void => {
  const label = historyStore.getDataItemLabel(groupId, dataItemId);
  historyStore.removeDataItemFromChart(chartId, groupId, dataItemId);

  $q.notify({
    type: 'info',
    message: `已从图表${chartId}移除 "${label}"`,
    position: 'top',
  });
};

// 更改数据项颜色
const updateDataItemColor = (
  chartId: number,
  groupId: number,
  dataItemId: number,
  color: string,
): void => {
  const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
  if (chart) {
    const dataItem = chart.selectedDataItems.find(
      (item) => item.groupId === groupId && item.dataItemId === dataItemId,
    );
    if (dataItem) {
      dataItem.color = color;
    }
  }
};

// 获取下一个可用颜色
const getNextAvailableColor = (chartId: number): string => {
  const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
  if (!chart) return colorOptions[0];

  const usedColors = new Set(chart.selectedDataItems.map((item) => item.color));
  const availableColor = colorOptions.find((color) => !usedColors.has(color));

  return availableColor || colorOptions[chart.selectedDataItems.length % colorOptions.length];
};

// 清空图表所有数据项
const clearChartDataItems = (chartId: number): void => {
  const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
  if (chart) {
    chart.selectedDataItems = [];
    $q.notify({
      type: 'info',
      message: `已清空图表${chartId}的所有数据项`,
      position: 'top',
    });
  }
};

// 快速分配：将选中的数据项平均分配到所有图表
const quickAssignDataItems = (): void => {
  if (selectedDataItems.value.length === 0) {
    $q.notify({
      type: 'warning',
      message: '请先选择要分配的数据项',
      position: 'top',
    });
    return;
  }

  const chartCount = multiChartSettings.value.chartCount;
  const itemsPerChart = Math.ceil(selectedDataItems.value.length / chartCount);

  // 清空所有图表
  multiChartSettings.value.charts.forEach((chart) => {
    chart.selectedDataItems = [];
  });

  // 分配数据项
  selectedDataItems.value.forEach((selection, index) => {
    const chartIndex = Math.floor(index / itemsPerChart);
    const chartId = chartIndex + 1;

    if (chartId <= chartCount) {
      const label = historyStore.getDataItemLabel(selection.groupId, selection.dataItemId);
      const color = getNextAvailableColor(chartId);

      historyStore.addDataItemToChart(
        chartId,
        selection.groupId,
        selection.dataItemId,
        label,
        color,
      );
    }
  });

  $q.notify({
    type: 'positive',
    message: `已将 ${selectedDataItems.value.length} 个数据项分配到 ${chartCount} 个图表`,
    position: 'top',
  });
};

// 检查数据项是否已在某个图表中
const isDataItemInChart = (chartId: number, groupId: number, dataItemId: number): boolean => {
  const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
  if (!chart) return false;

  return chart.selectedDataItems.some(
    (item) => item.groupId === groupId && item.dataItemId === dataItemId,
  );
};

// 获取数据项在图表中的数量统计
const getDataItemStats = () => {
  const stats = {
    totalSelected: selectedDataItems.value.length,
    assignedCount: 0,
    unassignedCount: 0,
  };

  const assignedItems = new Set<string>();
  multiChartSettings.value.charts.forEach((chart) => {
    chart.selectedDataItems.forEach((item) => {
      assignedItems.add(`${item.groupId}-${item.dataItemId}`);
    });
  });

  stats.assignedCount = assignedItems.size;
  stats.unassignedCount = stats.totalSelected - stats.assignedCount;

  return stats;
};
</script>

<template>
  <div class="bg-industrial-panel border border-industrial rounded p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-industrial-primary text-sm font-medium">图表配置</h3>
      <q-btn
        flat
        dense
        :icon="showAdvancedSettings ? 'expand_less' : 'expand_more'"
        size="sm"
        class="text-industrial-accent hover:bg-industrial-highlight"
        @click="showAdvancedSettings = !showAdvancedSettings"
      >
        <q-tooltip>{{ showAdvancedSettings ? '收起' : '展开' }}高级设置</q-tooltip>
      </q-btn>
    </div>

    <!-- 图表数量选择 -->
    <div class="space-y-2">
      <label class="text-industrial-secondary text-xs">图表数量</label>
      <div class="grid grid-cols-2 gap-2">
        <q-btn
          v-for="option in chartCountOptions"
          :key="option.value"
          flat
          dense
          size="sm"
          :label="option.label"
          :color="multiChartSettings.chartCount === option.value ? 'primary' : 'grey'"
          :outline="multiChartSettings.chartCount !== option.value"
          class="text-xs"
          :disabled="disabled || isLoading"
          @click="updateChartCount(option.value)"
        />
      </div>
    </div>

    <!-- 快速分配 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-industrial-secondary text-xs">快速操作</label>
        <div class="text-industrial-tertiary text-xs">
          {{ getDataItemStats().assignedCount }}/{{ getDataItemStats().totalSelected }} 已分配
        </div>
      </div>
      <q-btn
        flat
        dense
        label="智能分配数据项"
        icon="auto_awesome"
        size="sm"
        class="w-full btn-industrial-primary text-xs"
        :disabled="disabled || isLoading || selectedDataItems.length === 0"
        @click="quickAssignDataItems"
      >
        <q-tooltip>将选中的数据项平均分配到所有图表</q-tooltip>
      </q-btn>
    </div>

    <!-- 图表配置列表 -->
    <div class="space-y-3">
      <label class="text-industrial-secondary text-xs">图表设置</label>

      <div
        v-for="chart in multiChartSettings.charts"
        :key="chart.id"
        class="border border-industrial rounded p-3 space-y-3"
      >
        <!-- 图表标题 -->
        <div class="flex items-center gap-2">
          <q-input
            :model-value="chart.title"
            dense
            outlined
            placeholder="图表标题"
            class="flex-1 text-xs"
            input-class="text-industrial-primary"
            :disabled="disabled || isLoading"
            @update:model-value="updateChartTitle(chart.id, $event)"
          />
          <q-btn
            flat
            dense
            icon="clear_all"
            size="sm"
            class="text-industrial-secondary hover:bg-industrial-highlight"
            :disabled="disabled || isLoading || chart.selectedDataItems.length === 0"
            @click="clearChartDataItems(chart.id)"
          >
            <q-tooltip>清空图表</q-tooltip>
          </q-btn>
        </div>

        <!-- 数据项列表 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-industrial-tertiary text-xs">
              数据项 ({{ chart.selectedDataItems.length }})
            </span>
          </div>

          <div class="space-y-1 max-h-32 overflow-y-auto">
            <div
              v-for="dataItem in chart.selectedDataItems"
              :key="`${dataItem.groupId}-${dataItem.dataItemId}`"
              class="flex items-center gap-2 p-2 bg-industrial-secondary rounded hover:bg-industrial-highlight"
            >
              <!-- 颜色选择器 -->
              <q-btn
                flat
                dense
                size="sm"
                class="w-6 h-6 rounded-full border border-gray-400"
                :style="{ backgroundColor: dataItem.color }"
                :disabled="disabled || isLoading"
              >
                <q-popup-proxy>
                  <div
                    class="grid grid-cols-4 gap-2 p-2 bg-industrial-panel border border-industrial rounded"
                  >
                    <div
                      v-for="color in colorOptions"
                      :key="color"
                      class="w-6 h-6 rounded-full cursor-pointer border border-gray-400 hover:scale-110 transition-transform"
                      :style="{ backgroundColor: color }"
                      @click="
                        updateDataItemColor(chart.id, dataItem.groupId, dataItem.dataItemId, color)
                      "
                    />
                  </div>
                </q-popup-proxy>
              </q-btn>

              <!-- 数据项标签 -->
              <span class="flex-1 text-industrial-primary text-xs truncate">
                {{ dataItem.label }}
              </span>

              <!-- 移除按钮 -->
              <q-btn
                flat
                dense
                icon="close"
                size="sm"
                class="text-industrial-secondary hover:text-red-400"
                :disabled="disabled || isLoading"
                @click="removeDataItemFromChart(chart.id, dataItem.groupId, dataItem.dataItemId)"
              />
            </div>

            <!-- 空状态 -->
            <div
              v-if="chart.selectedDataItems.length === 0"
              class="text-center text-industrial-tertiary text-xs py-4"
            >
              暂无数据项，请从左侧选择数据项后拖拽到此处
            </div>
          </div>
        </div>

        <!-- 添加数据项下拉 -->
        <q-select
          :options="selectedDataItems"
          option-label="label"
          :option-value="(item) => `${item.groupId}-${item.dataItemId}`"
          placeholder="添加数据项到此图表..."
          dense
          outlined
          clearable
          class="text-xs"
          input-class="text-industrial-primary"
          :disabled="disabled || isLoading || selectedDataItems.length === 0"
          @update:model-value="(item) => item && addDataItemToChart(chart.id, item)"
        >
          <template #option="{ itemProps, opt }">
            <q-item
              v-bind="itemProps"
              :disable="isDataItemInChart(chart.id, opt.groupId, opt.dataItemId)"
            >
              <q-item-section>
                <q-item-label class="text-xs">
                  {{ historyStore.getDataItemLabel(opt.groupId, opt.dataItemId) }}
                </q-item-label>
                <q-item-label
                  v-if="isDataItemInChart(chart.id, opt.groupId, opt.dataItemId)"
                  caption
                  class="text-industrial-tertiary"
                >
                  已添加
                </q-item-label>
              </q-item-section>
            </q-item>
          </template>

          <template #no-option>
            <q-item>
              <q-item-section class="text-industrial-secondary"> 暂无可用数据项 </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>
    </div>

    <!-- 高级设置 -->
    <div v-show="showAdvancedSettings" class="space-y-3">
      <label class="text-industrial-secondary text-xs">高级设置</label>

      <div class="grid grid-cols-2 gap-4 text-xs">
        <div class="space-y-1">
          <span class="text-industrial-tertiary">总数据项</span>
          <span class="text-industrial-primary">{{ getDataItemStats().totalSelected }}</span>
        </div>
        <div class="space-y-1">
          <span class="text-industrial-tertiary">已分配</span>
          <span class="text-industrial-primary">{{ getDataItemStats().assignedCount }}</span>
        </div>
        <div class="space-y-1">
          <span class="text-industrial-tertiary">未分配</span>
          <span class="text-industrial-primary">{{ getDataItemStats().unassignedCount }}</span>
        </div>
        <div class="space-y-1">
          <span class="text-industrial-tertiary">图表数量</span>
          <span class="text-industrial-primary">{{ multiChartSettings.chartCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义滚动条 */
.max-h-32::-webkit-scrollbar {
  width: 4px;
}

.max-h-32::-webkit-scrollbar-track {
  background: #0f2744;
}

.max-h-32::-webkit-scrollbar-thumb {
  background: #1a3663;
  border-radius: 2px;
}

.max-h-32::-webkit-scrollbar-thumb:hover {
  background: #93c5fd;
}
</style>
