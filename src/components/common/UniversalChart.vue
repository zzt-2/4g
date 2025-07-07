<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import * as echarts from 'echarts';
import type { YAxisConfig } from '../../types/storage/historyData';

// 定义数据项接口
interface DataItem {
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

// 定义历史数据记录接口（用于HistoryChart）
interface HistoryDataRecord {
  timestamp: number;
  data: unknown[];
}

// 定义图表配置接口（用于HistoryChart）
interface ChartConfig {
  id: number;
  title: string;
  selectedDataItems: Array<{
    groupId: number;
    dataItemId: number;
    label: string;
    color: string;
  }>;
}

// Props定义
const props = defineProps<{
  // 图表数据 - 支持两种格式
  chartData?: ChartDataRecord[];
  historyData?: HistoryDataRecord[];
  // 可用的数据项
  availableItems?: DataItem[];
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
}>();

const emit = defineEmits<{
  'settings-click': [];
  'chart-click': [params: unknown];
  'legend-select': [params: unknown];
}>();

// 图表容器引用
const chartContainer = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;

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

// 更新定时器
let updateTimer: NodeJS.Timeout | null = null;

// 计算属性：确定当前模式
const currentMode = computed(() => {
  if (props.mode) return props.mode;
  // 自动判断模式
  if (props.chartConfig && props.historyData) return 'history';
  return 'realtime';
});

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
  return props.chartData && props.chartData.length > 0;
});

// 计算属性：是否有选中的数据项
const hasSelectedDataItems = computed(() => selectedItemsDetails.value.length > 0);

// 更新图表数据的方法
const updateChartData = () => {
  if (!hasSelectedDataItems.value || !hasData.value) {
    processedChartData.value = { xAxisData: [], series: [] };
    return;
  }

  if (currentMode.value === 'history') {
    updateHistoryChartData();
  } else {
    updateRealtimeChartData();
  }
  updateChart();
};

// 更新历史模式图表数据
const updateHistoryChartData = () => {
  if (!props.historyData || !props.chartConfig) return;

  // 按时间戳排序
  const sortedRecords = [...props.historyData].sort((a, b) => a.timestamp - b.timestamp);

  // 生成时间轴数据 - 使用与实时模式相同的格式
  const xAxisData = sortedRecords.map((record) =>
    new Date(record.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  // 为每个选中的数据项生成系列数据
  const series = props.chartConfig.selectedDataItems.map((dataItem, index) => {
    const seriesData = sortedRecords.map((record) => {
      const value = record.data[index];
      if (value === undefined || value === null) return null;

      // 尝试转换为数字
      const numValue = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(numValue) ? null : numValue;
    });

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

// 更新实时模式图表数据
const updateRealtimeChartData = () => {
  if (!props.chartData || selectedItemsDetails.value.length === 0) return;

  // 按时间戳排序
  const sortedRecords = [...props.chartData].sort((a, b) => a.timestamp - b.timestamp);

  // 生成时间轴数据
  const xAxisData = sortedRecords.map((record) =>
    new Date(record.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  // 为每个选中的数据项生成系列数据
  const series = selectedItemsDetails.value
    .map((item) => {
      const data = sortedRecords.map((record) => {
        const recordItem = record.dataItems.find((ri) => ri.id === item.id);
        if (!recordItem) return null;

        const numValue = parseFloat(String(recordItem.value));
        return isNaN(numValue) ? null : numValue;
      });

      return {
        name: item.label,
        type: 'line' as const,
        data: data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        sampling: 'none', // 禁用数据采样，确保不抽点
        lineStyle: { width: 2, color: item.color || '#3b82f6' },
        itemStyle: item.color ? { color: item.color } : { color: '#3b82f6' },
        emphasis: { focus: 'series' as const },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  processedChartData.value = { xAxisData, series };
};

// 启动定时更新（仅在实时模式下）
const startUpdateTimer = () => {
  if (updateTimer) return;

  // 立即更新一次
  updateChartData();

  // 启动定时器，每1秒更新一次
  updateTimer = setInterval(() => {
    updateChartData();
  }, 1000);
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
    animation: true,
    animationDuration: 300,

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

// 更新图表
const updateChart = () => {
  if (!chartInstance) return;

  try {
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

// 监听props变化
watch(
  () => [
    props.selectedItems,
    props.availableItems,
    props.chartConfig,
    props.historyData,
    props.yAxisConfig,
    // props.chartData,
  ],
  () => {
    updateChartData();
    initChart();
  },
  { deep: true },
);

// 监听加载状态变化
watch(
  () => props.loading,
  () => updateChart(),
);

// 生命周期
onMounted(() => {
  initChart();
  if (currentMode.value === 'realtime') {
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

    <!-- 浮动提示层 - 使用LineChart的样式 -->
    <div
      v-if="!hasData && !loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm"
    >
      <div class="text-center">
        <i
          class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary"
          >show_chart</i
        >
        <div class="text-sm text-industrial-primary">暂无可用数据项</div>
      </div>
    </div>

    <div
      v-else-if="!hasSelectedDataItems && !loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm"
    >
      <div class="text-center">
        <i
          class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary"
          >timeline</i
        >
        <div class="text-sm text-industrial-primary">请点击设置按钮选择要显示的数据项</div>
        <button
          v-if="showSettingsButton !== false"
          class="btn-industrial-primary px-3 py-1 text-xs rounded mt-2"
          @click="emit('settings-click')"
        >
          打开设置
        </button>
      </div>
    </div>

    <div
      v-else-if="processedChartData.xAxisData.length === 0 && !loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm"
    >
      <div class="text-center">
        <i
          class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary"
          >hourglass_empty</i
        >
        <div class="text-sm text-industrial-primary">暂无历史数据</div>
        <div class="text-xs mt-1 opacity-75 text-industrial-secondary">
          开始记录后将显示数据变化趋势
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div
      v-if="loading"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/50 backdrop-blur-sm"
    >
      <div class="flex items-center gap-2 text-industrial-primary">
        <q-spinner-dots size="md" />
        <span class="text-sm">加载中...</span>
      </div>
    </div>
  </div>
</template>
