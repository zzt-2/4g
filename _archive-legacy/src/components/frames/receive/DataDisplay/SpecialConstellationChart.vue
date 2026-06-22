<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as echarts from 'echarts';

export interface ConstellationConfig {
  bitWidth: number;
  sampleCount: number;
  pointSize?: number;
  iDataSource?: { frameId: string; fieldId: string };
  qDataSource?: { frameId: string; fieldId: string };
  refreshInterval?: number;
}

const props = defineProps<{
  constellationData?: [number, number][];
  config?: ConstellationConfig;
  title?: string;
}>();

const chartRef = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let resizeHandler: (() => void) | null = null;

const computeAxisRange = (bitWidth: number) => {
  const halfRange = Math.pow(2, bitWidth - 1);
  return { min: -halfRange, max: halfRange - 1 };
};

const createChartOption = (): echarts.EChartsOption => {
  const config = { bitWidth: 12, pointSize: 3, ...props.config };
  const { min, max } = computeAxisRange(config.bitWidth);

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `I:${p.value[0]} Q:${p.value[1]}`
    },
    grid: { left: 40, right: 20, top: props.title ? 30 : 10, bottom: 30 },
    xAxis: {
      type: 'value', min, max,
      axisLine: { lineStyle: { color: '#2A2F45' } },
      splitLine: { lineStyle: { color: '#1E293B' } },
      axisLabel: { color: '#94a3b8' },
      nameTextStyle: { color: '#94a3b8' },
    },
    yAxis: {
      type: 'value', min, max,
      axisLine: { lineStyle: { color: '#2A2F45' } },
      splitLine: { lineStyle: { color: '#1E293B' } },
      axisLabel: { color: '#94a3b8' },
      nameTextStyle: { color: '#94a3b8' },
    },
    series: [{
      type: 'scatter',
      symbolSize: config.pointSize,
      data: props.constellationData || [],
      itemStyle: { color: '#60A5FA' },
      animation: false,
    }],
  };

  if (props.title) {
    option.title = {
      text: props.title,
      left: 'center',
      textStyle: { color: '#94a3b8', fontSize: 12 }
    };
  }

  return option;
};

const renderChart = () => {
  if (!chartRef.value) return;

  if (!chart) chart = echarts.init(chartRef.value);
  chart.setOption(createChartOption(), true);
  chart.resize();
};

onMounted(() => {
  nextTick(renderChart);
  resizeHandler = () => chart?.resize();
  window.addEventListener('resize', resizeHandler);
});

onBeforeUnmount(() => {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  chart?.dispose();
});

watch(() => [props.constellationData, props.config, props.title], () => nextTick(renderChart), { deep: true });

defineExpose({});
</script>

<template>
  <div class="w-full h-full bg-industrial-panel">
    <div ref="chartRef" class="w-full h-full" />
  </div>
</template>

<style scoped></style>
