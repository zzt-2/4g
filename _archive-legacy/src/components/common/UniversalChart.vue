<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import * as echarts from 'echarts';
import type { YAxisConfig, PerformanceConfig, ChartConfig, HistoryDataRecord } from '../../types/storage/historyData';
import type { DataItem } from '../../types/frames/receive';
import { useDataDisplayStore } from '../../stores/frames/dataDisplayStore';

// 扩展的图表数据项接口（包含color属性）
interface ChartDataItem extends Partial<DataItem> {
  id: number;
  label: string;
  displayValue?: string;
  isVisible?: boolean;
  color?: string;
}

// 定义图表数据记录接口
interface ChartDataRecord {
  timestamp: number;
  dataItems: Array<{
    id: number;
    value: string | number | boolean;
  }>;
}

// Props定义
const props = defineProps<{
  // 实时模式：指定数据分组ID，组件内部获取数据
  groupId?: number;
  // 历史模式：直接传入历史数据
  historyData?: HistoryDataRecord[];
  // 可用的数据项
  availableItems?: ChartDataItem[];
  // 当前选中的数据项ID列表
  selectedItems?: number[];
  // 图表配置（用于HistoryChart模式）
  chartConfig?: ChartConfig;
  // Y轴配置
  yAxisConfig?: YAxisConfig | undefined;
  // 图表标题
  chartTitle?: string;
  // 图表高度
  height?: string;
  // 是否禁用
  disabled?: boolean;
  // 是否加载中
  loading?: boolean;
  // 是否显示设置按钮
  showSettingsButton?: boolean;
  // 图表模式：'realtime' 实时模式 | 'history' 历史模式
  mode?: 'realtime' | 'history';
  // 性能配置
  performanceConfig?: PerformanceConfig;
}>();

const emit = defineEmits<{
  'settings-click': [];
  'chart-click': [params: unknown];
  'legend-select': [params: unknown];
}>();

// 图表容器引用
const chartContainer = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;

// Store 引用
const dataDisplayStore = useDataDisplayStore();

// 高性能时间格式化函数 - 替代昂贵的 toLocaleTimeString
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// 时间格式化缓存 - 避免重复计算相同时间戳
const timeFormatCache = new Map<number, string>();

// 批量时间格式化 - 进一步优化性能
const formatTimestampsBatch = (timestamps: number[]): string[] => {
  const result: string[] = [];
  const uncachedTimestamps: number[] = [];
  const uncachedIndices: number[] = [];

  // 第一遍：检查缓存，收集未缓存的时间戳
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    if (timestamp !== undefined && timeFormatCache.has(timestamp)) {
      result[i] = timeFormatCache.get(timestamp)!;
    } else if (timestamp !== undefined) {
      uncachedTimestamps.push(timestamp);
      uncachedIndices.push(i);
    }
  }

  // 第二遍：批量处理未缓存的时间戳
  if (uncachedTimestamps.length > 0) {
    for (let i = 0; i < uncachedTimestamps.length; i++) {
      const timestamp = uncachedTimestamps[i]!;
      const formatted = formatTime(timestamp);
      const originalIndex = uncachedIndices[i]!;
      result[originalIndex] = formatted;
      timeFormatCache.set(timestamp, formatted);
    }

    // 清理缓存
    if (timeFormatCache.size > 10000) {
      const entries = Array.from(timeFormatCache.entries());
      const toKeep = entries.slice(-5000);
      timeFormatCache.clear();
      toKeep.forEach(([key, value]) => timeFormatCache.set(key, value));
    }
  }

  return result;
};

// 本地数据状态 - 用于定时更新
interface ChartSeries {
  name: string;
  type: 'line';
  data: (number | null)[];
  smooth: boolean;
  symbol: string;
  symbolSize: number;
  lineStyle: { width: number; color?: string };
  itemStyle?: { color: string };
  emphasis: {
    focus: 'series';
    lineStyle?: { width: number };
    itemStyle?: { shadowBlur?: number; shadowColor?: string };
  };
}

const processedChartData = ref<{ xAxisData: string[]; series: ChartSeries[] }>({
  xAxisData: [],
  series: [],
});

// 统计数据
const statisticsData = ref<{
  mean: { [key: string]: number };
  rmse: { [key: string]: number };
}>({
  mean: {},
  rmse: {},
});

// 更新定时器 - 仅用于历史模式，实时模式通过响应式数据更新
let updateTimer: NodeJS.Timeout | null = null;

// 性能配置默认值 - 优化实时图表性能
const defaultPerformanceConfig: PerformanceConfig = {
  maxDataPoints: 500, // 减少默认数据点数量，提高性能
  updateInterval: 1000, // 默认1秒更新一次
  enableIncrementalUpdate: true, // 默认启用增量更新
  enableSampling: true, // 默认启用抽样，减少数据量
  samplingInterval: 2, // 默认每2个点取1个，平衡性能和精度
};

// 合并性能配置
const mergedPerformanceConfig = computed(() => ({
  ...defaultPerformanceConfig,
  ...props.performanceConfig,
}));

// 计算属性：确定当前模式
const currentMode = computed(() => {
  if (props.mode) return props.mode;
  if (props.chartConfig && props.historyData) return 'history';
  return 'realtime';
});

// 获取实时图表数据的函数（非响应式，按需调用）
const getRealtimeChartData = (): ChartDataRecord[] => {
  if (currentMode.value !== 'realtime' || !props.groupId) return [];

  // 从 store 获取指定分组的历史数据
  const records = dataDisplayStore.getGroupHistoryRecords(props.groupId);

  // 转换为 ChartDataRecord 格式
  return records.map((record) => ({
    timestamp: record.timestamp,
    dataItems: record.dataItems.map((item) => ({
      id: item.id,
      value: item.value as string | number | boolean,
    })),
  }));
};

// 计算属性：当前选中的数据项详情
const selectedItemsDetails = computed(() => {
  if (currentMode.value === 'history' && props.chartConfig) {
    return props.chartConfig.selectedDataItems.map((item) => ({
      id: item.dataItemId,
      label: item.label,
      color: item.color,
      isVisible: true,
    }));
  }

  if (props.availableItems && props.selectedItems) {
    return props.availableItems.filter((item) => props.selectedItems!.includes(item.id));
  }

  return [];
});

// 计算属性：是否有数据
const hasData = computed(() => {
  if (currentMode.value === 'history') {
    return props.historyData && props.historyData.length > 0;
  }
  // 实时模式检查是否有数据
  if (props.groupId) {
    const records = dataDisplayStore.getGroupHistoryRecords(props.groupId);
    return records.length > 0;
  }
  return false;
});

// 计算属性：是否有选中的数据项
const hasSelectedDataItems = computed(() => selectedItemsDetails.value.length > 0);

// 数据处理函数
const applyDataWindow = (data: unknown[], maxPoints: number): unknown[] => {
  if (data.length <= maxPoints) return data;
  return data.slice(-maxPoints);
};

const applySampling = (data: unknown[], interval: number): unknown[] => {
  if (interval <= 1) return data;
  return data.filter((_, index) => index % interval === 0);
};

// 统计计算函数
const calculateStatistics = () => {
  if (!props.yAxisConfig?.enableStatistics || !props.yAxisConfig?.statisticsItems?.length) {
    statisticsData.value = { mean: {}, rmse: {} };
    return;
  }

  const newMean: { [key: string]: number } = {};
  const newRmse: { [key: string]: number } = {};

  // 获取时间窗口（秒），默认60秒
  const timeWindowSeconds = props.yAxisConfig.statisticsTimeWindow || 60;
  const timeWindowMs = timeWindowSeconds * 1000;
  const cutoffTime = Date.now() - timeWindowMs;

  // 获取参与统计的系列数据
  const statisticsItems = props.yAxisConfig.statisticsItems;
  const series = processedChartData.value.series.filter(s => {
    const item = selectedItemsDetails.value.find(item => item.label === s.name);
    return item && statisticsItems.includes(item.id);
  });

  series.forEach(s => {
    // 获取时间窗口内的数据
    const timeWindowData: number[] = [];

    if (currentMode.value === 'realtime' && props.groupId) {
      // 实时模式：直接从store获取数据，避免重复计算
      const records = dataDisplayStore.getGroupHistoryRecords(props.groupId);
      const filteredRecords = records.filter(record => record.timestamp >= cutoffTime);

      filteredRecords.forEach(record => {
        const item = selectedItemsDetails.value.find(item => item.label === s.name);
        if (item) {
          const recordItem = record.dataItems.find(ri => ri.id === item.id);
          if (recordItem) {
            const numValue = parseFloat(String(recordItem.value));
            if (!isNaN(numValue)) {
              timeWindowData.push(numValue);
            }
          }
        }
      });
    } else {
      // 历史模式或无时间戳数据：使用最近的数据点
      const validData = s.data.filter((value): value is number =>
        typeof value === 'number' && !isNaN(value)
      );

      // 估算每个数据点的时间间隔（基于总数据量和时间窗口）
      if (validData.length > 0) {
        const estimatedInterval = timeWindowMs / Math.max(validData.length, 1);
        const maxPoints = Math.ceil(timeWindowMs / Math.max(estimatedInterval, 1000)); // 最少1秒间隔
        const startIndex = Math.max(0, validData.length - maxPoints);
        timeWindowData.push(...validData.slice(startIndex));
      }
    }

    if (timeWindowData.length > 0) {
      // 计算平均值
      const mean = timeWindowData.reduce((sum, val) => sum + val, 0) / timeWindowData.length;
      newMean[s.name] = mean;

      // 计算均方根误差 (RMSE)
      const squaredDiffs = timeWindowData.map(val => Math.pow(val - mean, 2));
      const meanSquaredError = squaredDiffs.reduce((sum, val) => sum + val, 0) / timeWindowData.length;
      newRmse[s.name] = Math.sqrt(meanSquaredError);
    }
  });

  statisticsData.value = { mean: newMean, rmse: newRmse };
};

// 简化的更新图表数据方法
const updateChartData = () => {
  if (!hasSelectedDataItems.value || !hasData.value) {
    processedChartData.value = { xAxisData: [], series: [] };
    statisticsData.value = { mean: {}, rmse: {} };
    return;
  }

  if (currentMode.value === 'history') {
    updateHistoryChartData();
  } else {
    updateRealtimeChartData();
  }

  // 计算统计数据
  calculateStatistics();

  updateChartIncremental();
};

// 更新历史模式图表数据
const updateHistoryChartData = () => {
  if (!props.historyData || !props.chartConfig) return;

  // 历史模式不应用性能限制，直接渲染所有数据
  const sortedRecords = [...props.historyData].sort((a, b) => a.timestamp - b.timestamp);

  // 优化：一次遍历生成时间轴和系列数据，避免多次 map
  const timestamps = new Array(sortedRecords.length);
  const seriesDataArrays = props.chartConfig.selectedDataItems.map(() => new Array(sortedRecords.length));

  // 单次遍历同时处理时间戳和所有系列数据
  for (let i = 0; i < sortedRecords.length; i++) {
    const record = sortedRecords[i]!;
    timestamps[i] = record.timestamp;

    props.chartConfig.selectedDataItems.forEach((dataItem, seriesIndex) => {
      const value = record?.data[seriesIndex];
      const seriesData = seriesDataArrays[seriesIndex];

      if (seriesData && (value === undefined || value === null)) {
        seriesData[i] = null;
      } else if (seriesData) {
        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        seriesData[i] = isNaN(numValue) ? null : numValue;
      }
    });
  }

  // 批量格式化时间戳
  const xAxisData = formatTimestampsBatch(timestamps);

  // 为每个选中的数据项生成系列数据
  const series = props.chartConfig.selectedDataItems.map((dataItem, index) => {
    const seriesData = seriesDataArrays[index]!;

    return {
      name: dataItem.label,
      type: 'line' as const,
      data: seriesData,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      sampling: 'none', // 禁用数据采样，确保不抽点
      lineStyle: { width: 2, color: dataItem.color },
      itemStyle: { color: dataItem.color },
      emphasis: {
        focus: 'series' as const,
        lineStyle: { width: 3 },
        itemStyle: { shadowBlur: 10, shadowColor: dataItem.color },
      },
    };
  });

  processedChartData.value = { xAxisData, series };
};

// 更新实时模式图表数据 - 添加性能监控
const updateRealtimeChartData = () => {
  const chartData = getRealtimeChartData();
  if (!chartData || selectedItemsDetails.value.length === 0) return;

  const startTime = performance.now();
  const config = mergedPerformanceConfig.value;

  // 按时间戳排序
  let sortedRecords = [...chartData].sort((a, b) => a.timestamp - b.timestamp);

  // 性能监控：记录原始数据量
  const originalDataCount = sortedRecords.length;

  // 应用数据窗口管理
  if (config.maxDataPoints) {
    sortedRecords = applyDataWindow(sortedRecords, config.maxDataPoints) as ChartDataRecord[];
  }

  // 应用数据抽样
  if (config.enableSampling && config.samplingInterval) {
    sortedRecords = applySampling(sortedRecords, config.samplingInterval) as ChartDataRecord[];
  }

  // 性能监控：记录处理后数据量
  const processedDataCount = sortedRecords.length;

  // 优化：一次遍历生成时间轴和系列数据，避免多次 map + 预建索引避免重复 find
  const timestamps = new Array(sortedRecords.length);
  const seriesDataMap = new Map<number, (number | null)[]>();

  // 初始化每个数据项的数组
  selectedItemsDetails.value.forEach(item => {
    seriesDataMap.set(item.id, new Array(sortedRecords.length));
  });

  // 单次遍历同时处理时间戳和所有系列数据
  for (let i = 0; i < sortedRecords.length; i++) {
    const record = sortedRecords[i]!;
    timestamps[i] = record.timestamp;

    // 预建立该记录的数据项索引，避免重复 find
    const dataItemsIndex = new Map<number, { id: number; value: string | number | boolean }>();
    record.dataItems.forEach(item => {
      dataItemsIndex.set(item.id, item);
    });

    selectedItemsDetails.value.forEach(item => {
      const recordItem = dataItemsIndex.get(item.id);
      const seriesData = seriesDataMap.get(item.id)!;

      if (!recordItem) {
        seriesData[i] = null;
      } else {
        const numValue = parseFloat(String(recordItem.value));
        seriesData[i] = isNaN(numValue) ? null : numValue;
      }
    });
  }

  // 批量格式化时间戳
  const xAxisData = formatTimestampsBatch(timestamps);

  // 为每个选中的数据项生成系列数据
  const series = selectedItemsDetails.value
    .map((item) => {
      const data = seriesDataMap.get(item.id)!;

      return {
        name: item.label,
        type: 'line' as const,
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        sampling: 'none', // 禁用ECharts内部采样，使用我们的逻辑
        lineStyle: { width: 2, color: item.color || '#3b82f6' },
        itemStyle: item.color ? { color: item.color } : { color: '#3b82f6' },
        emphasis: { focus: 'series' as const },
        animation: false, // 禁用动画提高性能
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  processedChartData.value = { xAxisData, series };

  // 性能监控日志
  const endTime = performance.now();
  const processingTime = endTime - startTime;

  if (processingTime > 50) { // 处理时间超过50ms时记录警告
    console.warn(`实时图表数据处理耗时较长: ${processingTime.toFixed(2)}ms`, {
      originalDataCount,
      processedDataCount,
      seriesCount: series.length,
      compressionRatio: ((1 - processedDataCount / originalDataCount) * 100).toFixed(1) + '%'
    });
  }
};

// 启动定时更新（仅在历史模式下使用）
const startUpdateTimer = () => {
  if (updateTimer) clearInterval(updateTimer);

  const interval = mergedPerformanceConfig.value.updateInterval || 1000;

  // 立即更新一次
  updateChartData();

  // 只在历史模式下启动定时器
  if (currentMode.value === 'history') {
    updateTimer = setInterval(updateChartData, interval);
  }
};

// 停止定时更新
const stopUpdateTimer = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
};

const handleResize = () => chartInstance?.resize();

// 初始化图表 - 统一使用LineChart的样式
const initChart = async () => {
  if (!chartContainer.value) return;

  await nextTick();

  if (chartInstance) {
    chartInstance.dispose();
  }

  chartInstance = echarts.init(chartContainer.value, 'dark');

  const timeLabels = processedChartData.value.xAxisData;

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    animation: false,
    animationDuration: 0,

    ...(props.chartTitle || props.chartConfig?.title
      ? {
        title: {
          text: props.chartTitle || props.chartConfig?.title || '',
          left: 'center',
          textStyle: {
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 'normal',
          },
        },
      }
      : {}),

    grid: {
      left: '80px',
      right: '40px',
      top: '60px',
      bottom: '50px',
    },

    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0f2744',
      borderColor: '#1a3663',
      borderWidth: 1,
      textStyle: {
        color: '#e2e8f0',
        fontSize: 11,
      },
    },

    legend: {
      type: 'plain',
      left: 'left',
      top: '15px',
      orient: 'vertical',
      itemWidth: 14,
      itemHeight: 8,
      itemGap: 6,
      backgroundColor: '#0f2744',
      borderColor: '#1a3663',
      borderWidth: 1,
      borderRadius: 4,
      padding: [8, 12],
      textStyle: {
        color: '#94a3b8',
        fontSize: 10,
      },
      data: processedChartData.value.series.map((s) => s.name),
      show: processedChartData.value.series.length > 0,
    },

    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeLabels,
      axisLine: { lineStyle: { color: '#1a3663' } },
      axisTick: { lineStyle: { color: '#1a3663' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
      },
      splitLine: { show: false },
    },

    yAxis: (() => {
      const yAxisConfig: Record<string, unknown> = {
        type: 'value',
        scale: true, // 启用更好的自动缩放
        axisLine: { lineStyle: { color: '#1a3663' } },
        axisTick: { lineStyle: { color: '#1a3663' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
        splitLine: {
          lineStyle: {
            color: '#1a3663',
            opacity: 0.5,
            type: 'solid',
          },
        },
      };

      // 只有在手动模式且有有效值时才设置min/max
      if (props.yAxisConfig && !props.yAxisConfig.autoScale) {
        if (typeof props.yAxisConfig.min === 'number' && !isNaN(props.yAxisConfig.min)) {
          yAxisConfig.min = props.yAxisConfig.min;
        }
        if (typeof props.yAxisConfig.max === 'number' && !isNaN(props.yAxisConfig.max)) {
          yAxisConfig.max = props.yAxisConfig.max;
        }
      }

      return yAxisConfig;
    })(),

    series: processedChartData.value.series,
  };

  chartInstance.setOption(option);

  // 绑定事件
  chartInstance.on('click', (params) => {
    emit('chart-click', params);
  });

  chartInstance.on('legendselectchanged', (params) => {
    emit('legend-select', params);
  });

  // 处理加载状态
  if (props.loading) {
    chartInstance.showLoading('default', {
      text: '加载中...',
      color: '#3b82f6',
      textColor: '#ffffff',
      maskColor: 'rgba(13, 17, 23, 0.8)',
    });
  }

  // 窗口大小变化处理

  window.addEventListener('resize', handleResize);
};

// 增量更新图表 - 性能优化版本
const updateChartIncremental = () => {
  if (!chartInstance) return;

  try {
    const config = mergedPerformanceConfig.value;

    // 构建Y轴配置
    const yAxisConfig: Record<string, unknown> = {
      type: 'value',
      scale: true,
    };

    // 只有在手动模式且有有效值时才设置min/max
    if (props.yAxisConfig && !props.yAxisConfig.autoScale) {
      if (typeof props.yAxisConfig.min === 'number' && !isNaN(props.yAxisConfig.min)) {
        yAxisConfig.min = props.yAxisConfig.min;
      }
      if (typeof props.yAxisConfig.max === 'number' && !isNaN(props.yAxisConfig.max)) {
        yAxisConfig.max = props.yAxisConfig.max;
      }
    }

    // 优化的增量更新：使用silent模式减少重绘
    if (config.enableIncrementalUpdate) {
      // 静默更新数据，不触发动画和过渡效果
      chartInstance.setOption({
        legend: {
          data: processedChartData.value.series.map((s) => s.name),
          show: processedChartData.value.series.length > 0,
        },
        xAxis: {
          data: processedChartData.value.xAxisData,
        },
        series: processedChartData.value.series.map(series => ({
          ...series,
          animation: false, // 禁用动画提高性能
        })),
      }, {
        notMerge: false,
        silent: true, // 静默更新，减少重绘
        lazyUpdate: true, // 延迟更新，批量处理
      });
    } else {
      // 全量更新
      chartInstance.setOption({
        legend: {
          data: processedChartData.value.series.map((s) => s.name),
          show: processedChartData.value.series.length > 0,
        },
        xAxis: {
          data: processedChartData.value.xAxisData,
        },
        yAxis: yAxisConfig,
        series: processedChartData.value.series,
      });
    }

    if (props.loading) {
      chartInstance.showLoading();
    } else {
      chartInstance.hideLoading();
    }
  } catch (error) {
    console.error('更新图表失败:', error);
  }
};

// 调整图表大小
const resizeChart = (): void => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

// 监听配置变化，重新初始化图表
watch(
  () => [props.selectedItems, props.availableItems, props.chartConfig, props.yAxisConfig],
  () => {
    if (currentMode.value === 'history') {
      initChart();
    }
  },
  { deep: true },
);

// 监听实时模式数据变化，自动更新图表 - 性能优化版本
watch(
  () => dataDisplayStore.historyUpdateCounter,
  () => {
    if (currentMode.value === 'realtime' && hasSelectedDataItems.value && props.groupId) {
      updateChartData();
    }
  },
);

// 监听性能配置变化，重启定时器（仅历史模式）
watch(
  () => mergedPerformanceConfig.value.updateInterval,
  () => {
    if (currentMode.value === 'history') {
      startUpdateTimer();
    }
  },
);

// 生命周期
onMounted(() => {
  initChart();
  // 历史模式才需要定时器，实时模式通过响应式数据更新
  if (currentMode.value === 'history') {
    startUpdateTimer();
  }
});

onUnmounted(() => {
  stopUpdateTimer();
  window.removeEventListener('resize', handleResize);
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});

// 暴露方法给父组件
defineExpose({
  resizeChart,
  getChartInstance: () => chartInstance,
});
</script>

<template>
  <div class="h-full relative" :style="{ height: height || '100%' }">
    <!-- 图表容器 - 始终存在 -->
    <div ref="chartContainer" class="w-full h-full"></div>

    <!-- 统计结果显示 - 右上角浮动面板 -->
    <div v-if="yAxisConfig?.enableStatistics && Object.keys(statisticsData.mean).length > 0"
      class="absolute flex flex-col h-32 top-0 right-0 bg-industrial-panel/90 border border-industrial rounded-md p-1 backdrop-blur-sm w-60">
      <div class="flex items-center mb-2 gap-2">
        <div class="text-industrial-primary text-sm font-medium">统计结果</div>
        <span class="text-industrial-tertiary text-xs">
          {{ yAxisConfig?.statisticsTimeWindow || 60 }}s
        </span>
      </div>
      <div class="flex-1 space-y-1 overflow-y-auto">
        <div v-for="(mean, seriesName) in statisticsData.mean" :key="seriesName" class="text-xs">
          <div class="text-industrial-primary font-medium">{{ seriesName }}</div>
          <div class="grid grid-cols-2 items-center gap-1">
            <div class="text-industrial-secondary">
              平均: <span class="text-industrial-accent">{{ mean.toFixed(3) }}</span>
            </div>
            <div class="text-industrial-secondary">
              RMSE: <span class="text-industrial-accent">{{ statisticsData.rmse[seriesName]?.toFixed(3) || 'N/A'
                }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 浮动提示层 - 使用LineChart的样式 -->
    <div v-if="!hasData && !loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm">
      <div class="text-center">
        <i class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary">show_chart</i>
        <div class="text-sm text-industrial-primary">暂无可用数据项</div>
      </div>
    </div>

    <div v-else-if="!hasSelectedDataItems && !loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm">
      <div class="text-center">
        <i class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary">timeline</i>
        <div class="text-sm text-industrial-primary">请点击设置按钮选择要显示的数据项</div>
        <button v-if="showSettingsButton !== false" class="btn-industrial-primary px-3 py-1 text-xs rounded mt-2"
          @click="emit('settings-click')">
          打开设置
        </button>
      </div>
    </div>

    <div v-else-if="processedChartData.xAxisData.length === 0 && !loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm">
      <div class="text-center">
        <i
          class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary">hourglass_empty</i>
        <div class="text-sm text-industrial-primary">暂无历史数据</div>
        <div class="text-xs mt-1 opacity-75 text-industrial-secondary">
          开始记录后将显示数据变化趋势
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/50 backdrop-blur-sm">
      <div class="flex items-center gap-2 text-industrial-primary">
        <q-spinner-dots size="md" />
        <span class="text-sm">加载中...</span>
      </div>
    </div>
  </div>
</template>
