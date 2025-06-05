<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import * as echarts from 'echarts';
import type { DataRecord } from '../../../../types/frames/dataDisplay';
import { useDataDisplayStore } from '../../../../stores/frames/dataDisplayStore';
import { useReceiveFramesStore } from '../../../../stores/frames/receiveFramesStore';

const props = defineProps<{
  groupId: number | null;
  chartSelectedItems: number[];
}>();

const emit = defineEmits<{
  'update:chartSelectedItems': [items: number[]];
}>();

// Store引用
const dataDisplayStore = useDataDisplayStore();
const receiveFramesStore = useReceiveFramesStore();

// 图表容器引用
const chartContainer = ref<HTMLDivElement>();
let chartInstance: echarts.ECharts | null = null;

// 计算属性：当前分组的数据项
const currentGroupItems = computed(() => {
  if (!props.groupId) return [];
  const group = receiveFramesStore.groups.find((g) => g.id === props.groupId);
  return group?.dataItems.filter((item) => item.isVisible) || [];
});

// 计算属性：图表数据
const chartData = computed(() => {
  if (!props.groupId || props.chartSelectedItems.length === 0) {
    return { xAxisData: [], series: [] };
  }

  // 过滤当前分组的历史记录
  const groupRecords = dataDisplayStore.historyRecords
    .filter((record) => record.groupId === props.groupId)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (groupRecords.length === 0) {
    return { xAxisData: [], series: [] };
  }

  // 生成时间轴数据
  const xAxisData = groupRecords.map((record) =>
    new Date(record.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  // 为每个选中的数据项生成系列数据
  const series = props.chartSelectedItems
    .map((itemId) => {
      const item = currentGroupItems.value.find((item) => item.id === itemId);
      if (!item) return null;

      const data = groupRecords.map((record) => {
        const recordItem = record.dataItems.find((ri) => ri.id === itemId);
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
        lineStyle: { width: 2 },
        emphasis: { focus: 'series' as const },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return { xAxisData, series };
});

// 初始化图表
const initChart = async () => {
  if (!chartContainer.value) return;

  await nextTick();

  if (chartInstance) {
    chartInstance.dispose();
  }

  chartInstance = echarts.init(chartContainer.value, 'dark');

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
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
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
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
      textStyle: { color: '#94a3b8', fontSize: 10 },
      data: chartData.value.series.map((s) => s.name),
      show: chartData.value.series.length > 0,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData.value.xAxisData,
      axisLine: { lineStyle: { color: '#1a3663' } },
      axisTick: { lineStyle: { color: '#1a3663' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#1a3663' } },
      axisTick: { lineStyle: { color: '#1a3663' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1a3663', opacity: 0.5 } },
    },
    series: chartData.value.series,
  };

  chartInstance.setOption(option);

  // 窗口大小变化处理
  const handleResize = () => chartInstance?.resize();
  window.addEventListener('resize', handleResize);
  onUnmounted(() => window.removeEventListener('resize', handleResize));
};

// 更新图表数据
const updateChart = () => {
  if (!chartInstance) return;

  chartInstance.setOption({
    legend: {
      data: chartData.value.series.map((s) => s.name),
      show: chartData.value.series.length > 0,
    },
    xAxis: {
      data: chartData.value.xAxisData,
    },
    series: chartData.value.series,
  });
};

// 监听选中项和分组变化，重新初始化图表
watch(
  () => [props.chartSelectedItems, props.groupId],
  () => initChart(),
);

// 监听图表数据变化，更新图表
watch(
  () => chartData.value,
  () => updateChart(),
  { deep: true },
);

// 生命周期
onMounted(() => initChart());
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});
</script>

<template>
  <div class="h-full relative">
    <!-- 图表容器 - 始终存在 -->
    <div ref="chartContainer" class="w-full h-full"></div>

    <!-- 浮动提示层 -->
    <div
      v-if="!props.groupId"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm"
    >
      <div class="text-center">
        <i
          class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary"
          >show_chart</i
        >
        <div class="text-sm text-industrial-primary">请选择数据分组</div>
      </div>
    </div>

    <div
      v-else-if="props.chartSelectedItems.length === 0"
      class="absolute inset-0 flex items-center justify-center bg-industrial-primary/80 backdrop-blur-sm"
    >
      <div class="text-center">
        <i
          class="q-icon notranslate material-icons text-4xl opacity-50 mb-2 text-industrial-secondary"
          >timeline</i
        >
        <div class="text-sm text-industrial-primary">请点击设置按钮选择要显示的数据项</div>
      </div>
    </div>

    <div
      v-else-if="chartData.xAxisData.length === 0"
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
  </div>
</template>
