/**
 * 历史数据分析状态管理Store
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import type {
  TimeRange,
  ChartConfig,
  MultiChartSettings,
  DataItemSelection,
  CSVExportConfig,
  HourlyDataFile,
  HistoryDataRecord,
  GroupMetadata,
} from '../types/storage/historyData';
import { historyDataAPI } from '../api/common';
import { formatDateTime } from '../utils/common/dateUtils';

export const useHistoryAnalysisStore = defineStore('historyAnalysis', () => {
  // ===== 状态管理 =====

  // 时间范围选择
  const timeRange = ref<TimeRange>({
    startTime: Date.now() - 24 * 60 * 60 * 1000, // 默认24小时前
    endTime: Date.now(),
  });

  // 可用的小时键列表
  const availableHours = ref<string[]>([]);

  // 加载状态
  const isLoading = ref(false);
  const loadingProgress = ref(0);
  const loadingMessage = ref('');

  // 已加载的历史数据
  const loadedData = ref<HistoryDataRecord[]>([]);
  const loadedMetadata = ref<GroupMetadata[]>([]);

  // 数据项选择状态
  const dataItemSelections = ref<DataItemSelection[]>([]);

  // 多图表配置（持久化存储）
  const multiChartSettings = useStorage<MultiChartSettings>('historyAnalysis_chartSettings', {
    chartCount: 1,
    charts: [
      {
        id: 1,
        title: '图表1',
        selectedDataItems: [],
      },
    ],
  });

  // ===== 计算属性 =====

  // 选中的数据项数量
  const selectedItemsCount = computed(() => {
    return dataItemSelections.value.filter((item) => item.selected).length;
  });

  // 当前时间范围的小时键列表
  const currentHourKeys = computed(() => {
    const start = new Date(timeRange.value.startTime);
    const end = new Date(timeRange.value.endTime);

    const hourKeys: string[] = [];

    const current = new Date(start);
    current.setMinutes(0, 0, 0); // 对齐到小时

    // 使用本地时间生成小时键
    while (current <= end) {
      const year = current.getFullYear();
      const month = (current.getMonth() + 1).toString().padStart(2, '0');
      const day = current.getDate().toString().padStart(2, '0');
      const hour = current.getHours().toString().padStart(2, '0');

      const hourKey = `${year}-${month}-${day}-${hour}`;
      hourKeys.push(hourKey);

      current.setHours(current.getHours() + 1);
    }

    const filteredKeys = hourKeys.filter((key) => availableHours.value.includes(key));

    return filteredKeys;
  });

  // 筛选后的历史数据（用于图表显示）
  const filteredData = computed(() => {
    const selectedItemIds = dataItemSelections.value
      .filter((item) => item.selected)
      .map((item) => ({ groupId: item.groupId, dataItemId: item.dataItemId }));

    if (selectedItemIds.length === 0) {
      return [];
    }

    return loadedData.value.filter((record) => {
      return (
        record.timestamp >= timeRange.value.startTime && record.timestamp <= timeRange.value.endTime
      );
    });
  });

  // 图表数据（按图表ID分组）
  const chartDataSets = computed(() => {
    const dataSets: Record<number, HistoryDataRecord[]> = {};

    multiChartSettings.value.charts.forEach((chart) => {
      if (chart.selectedDataItems.length === 0) {
        dataSets[chart.id] = [];
        return;
      }

      // 直接使用 loadedData，不依赖 filteredData
      // 因为图表配置应该独立于左侧面板的选择
      dataSets[chart.id] = loadedData.value
        .filter((record) => {
          // 按时间范围筛选
          return (
            record.timestamp >= timeRange.value.startTime &&
            record.timestamp <= timeRange.value.endTime
          );
        })
        .map((record) => {
          // 只保留该图表选中的数据项
          const filteredDataArray: unknown[] = [];
          const metadata = loadedMetadata.value;

          chart.selectedDataItems.forEach((selectedItem) => {
            // 根据groupId和dataItemId找到对应的数据索引
            const group = metadata.find((g) => g.id === selectedItem.groupId);
            if (group) {
              const dataItem = group.dataItems.find((item) => item.id === selectedItem.dataItemId);
              if (dataItem && dataItem.index < record.data.length) {
                filteredDataArray.push(record.data[dataItem.index]);
              }
            }
          });

          return {
            timestamp: record.timestamp,
            data: filteredDataArray,
          };
        });
    });

    return dataSets;
  });

  // ===== 方法 =====

  // 获取可用小时键列表
  const fetchAvailableHours = async (): Promise<void> => {
    try {
      const hours = await historyDataAPI.getAvailableHours();
      availableHours.value = hours.sort();
    } catch (error) {
      console.error('获取可用小时键失败:', error);
      availableHours.value = [];
    }
  };

  // 更新时间范围
  const updateTimeRange = (newRange: TimeRange): void => {
    timeRange.value = { ...newRange };
  };

  // 加载历史数据
  const loadHistoryData = async (): Promise<void> => {
    if (isLoading.value) return;

    try {
      isLoading.value = true;
      loadingProgress.value = 0;
      loadingMessage.value = '正在加载历史数据...';

      const hourKeys = currentHourKeys.value;
      if (hourKeys.length === 0) {
        loadedData.value = [];
        loadedMetadata.value = [];
        return;
      }

      loadingMessage.value = `正在加载 ${hourKeys.length} 个小时的数据...`;

      // 批量加载数据
      const result = await historyDataAPI.loadMultipleHours(hourKeys);

      if (!result.success) {
        throw new Error(result.errors?.join(', ') || '加载失败');
      }

      // 合并所有小时的数据
      const allRecords: HistoryDataRecord[] = [];
      let metadata: GroupMetadata[] = [];

      Object.values(result.data).forEach((hourlyData: HourlyDataFile) => {
        allRecords.push(...hourlyData.records);
        if (metadata.length === 0) {
          metadata = hourlyData.metadata.groups;
        }
      });

      // 按时间戳排序
      allRecords.sort((a, b) => a.timestamp - b.timestamp);

      loadedData.value = allRecords;
      loadedMetadata.value = metadata;

      // 初始化数据项选择状态
      initDataItemSelections();

      loadingProgress.value = 100;
      loadingMessage.value = `成功加载 ${allRecords.length} 条记录`;

      console.log(`历史数据加载完成：${allRecords.length} 条记录`);
    } catch (error) {
      console.error('加载历史数据失败:', error);
      loadingMessage.value = `加载失败: ${error instanceof Error ? error.message : '未知错误'}`;
      loadedData.value = [];
      loadedMetadata.value = [];
    } finally {
      isLoading.value = false;
    }
  };

  // 初始化数据项选择状态
  const initDataItemSelections = (): void => {
    const selections: DataItemSelection[] = [];

    loadedMetadata.value.forEach((group) => {
      group.dataItems.forEach((item) => {
        selections.push({
          groupId: group.id,
          dataItemId: item.id,
          selected: false,
          visible: true,
        });
      });
    });

    dataItemSelections.value = selections;
  };

  // 更新数据项选择状态
  const updateDataItemSelection = (
    groupId: number,
    dataItemId: number,
    selected: boolean,
  ): void => {
    const selection = dataItemSelections.value.find(
      (item) => item.groupId === groupId && item.dataItemId === dataItemId,
    );
    if (selection) {
      selection.selected = selected;
    }
  };

  // 全选/取消全选分组
  const toggleGroupSelection = (groupId: number, selected: boolean): void => {
    dataItemSelections.value.forEach((item) => {
      if (item.groupId === groupId) {
        item.selected = selected;
      }
    });
  };

  // 清空所有选择
  const clearAllSelections = (): void => {
    dataItemSelections.value.forEach((item) => {
      item.selected = false;
    });
  };

  // 更新图表数量
  const updateChartCount = (count: number): void => {
    if (count < 1 || count > 4) return;

    const currentCharts = multiChartSettings.value.charts;
    const newCharts: ChartConfig[] = [];

    // 保留现有图表配置
    for (let i = 0; i < count; i++) {
      if (i < currentCharts.length && currentCharts[i]) {
        const chart = currentCharts[i];
        if (chart) {
          newCharts.push({
            id: chart.id,
            title: chart.title,
            selectedDataItems: chart.selectedDataItems,
            ...(chart.yAxisConfig ? { yAxisConfig: chart.yAxisConfig } : {}),
          });
        }
      } else {
        newCharts.push({
          id: i + 1,
          title: `图表${i + 1}`,
          selectedDataItems: [],
        });
      }
    }

    multiChartSettings.value = {
      chartCount: count,
      charts: newCharts,
    };
  };

  // 更新图表配置
  const updateChartConfig = (
    chartId: number,
    config: Partial<Pick<ChartConfig, 'title' | 'selectedDataItems' | 'yAxisConfig'>>,
  ): void => {
    const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
    if (chart) {
      if (config.title !== undefined) chart.title = config.title;
      if (config.selectedDataItems !== undefined)
        chart.selectedDataItems = config.selectedDataItems;
      if (config.yAxisConfig !== undefined) chart.yAxisConfig = config.yAxisConfig;
    }
  };

  // 为图表添加数据项
  const addDataItemToChart = (
    chartId: number,
    groupId: number,
    dataItemId: number,
    label: string,
    color: string,
  ): void => {
    const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
    if (!chart) return;

    // 检查是否已存在
    const exists = chart.selectedDataItems.some(
      (item) => item.groupId === groupId && item.dataItemId === dataItemId,
    );

    if (!exists) {
      chart.selectedDataItems.push({
        groupId,
        dataItemId,
        label,
        color,
      });
    }
  };

  // 从图表移除数据项
  const removeDataItemFromChart = (chartId: number, groupId: number, dataItemId: number): void => {
    const chart = multiChartSettings.value.charts.find((c) => c.id === chartId);
    if (!chart) return;

    chart.selectedDataItems = chart.selectedDataItems.filter(
      (item) => !(item.groupId === groupId && item.dataItemId === dataItemId),
    );
  };

  // 导出CSV
  const exportCSV = async (config: CSVExportConfig): Promise<void> => {
    try {
      if (config.selectedItems.length === 0) {
        throw new Error('请先选择要导出的数据项');
      }

      if (filteredData.value.length === 0) {
        throw new Error('当前时间范围内没有数据');
      }

      const result = await historyDataAPI.exportCSV(config);

      if (!result.success) {
        throw new Error(result.error || '导出失败');
      }

      console.log(`CSV导出成功: ${result.filePath}`);
    } catch (error) {
      console.error('CSV导出失败:', error);
      throw error;
    }
  };

  // 清理过期数据
  const cleanupOldData = async (daysToKeep: number): Promise<void> => {
    try {
      const result = await historyDataAPI.cleanupOldData(daysToKeep);
      if (result.success) {
        console.log(`清理完成，删除了 ${result.deletedFiles} 个文件`);
        // 重新获取可用小时键
        await fetchAvailableHours();
      } else {
        throw new Error(result.message || '清理失败');
      }
    } catch (error) {
      console.error('清理过期数据失败:', error);
      throw error;
    }
  };

  // 获取数据项标签
  const getDataItemLabel = (groupId: number, dataItemId: number): string => {
    const group = loadedMetadata.value.find((g) => g.id === groupId);
    if (group) {
      const item = group.dataItems.find((item) => item.id === dataItemId);
      return item ? `${group.label} - ${item.label}` : '未知数据项';
    }
    return '未知数据项';
  };

  // 获取统计信息
  const getStatistics = () => {
    return computed(() => ({
      totalRecords: loadedData.value.length,
      selectedItems: selectedItemsCount.value,
      timeRangeText: `${formatDateTime(timeRange.value.startTime)} - ${formatDateTime(timeRange.value.endTime)}`,
      availableHoursCount: availableHours.value.length,
      loadedHoursCount: currentHourKeys.value.length,
    }));
  };

  return {
    // 状态
    timeRange,
    availableHours,
    isLoading,
    loadingProgress,
    loadingMessage,
    loadedData,
    loadedMetadata,
    dataItemSelections,
    multiChartSettings,

    // 计算属性
    selectedItemsCount,
    currentHourKeys,
    filteredData,
    chartDataSets,

    // 方法
    fetchAvailableHours,
    updateTimeRange,
    loadHistoryData,
    updateDataItemSelection,
    toggleGroupSelection,
    clearAllSelections,
    updateChartCount,
    updateChartConfig,
    addDataItemToChart,
    removeDataItemFromChart,
    exportCSV,
    cleanupOldData,
    getDataItemLabel,
    getStatistics,
  };
});
