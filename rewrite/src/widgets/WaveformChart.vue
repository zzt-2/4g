<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart as ELineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSeriesProjection } from '@/features/display';

echarts.use([ELineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

function getChartColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return Array.from({ length: 6 }, (_, i) =>
    style.getPropertyValue(`--rw-chart-color-${i + 1}`).trim() || '#1f6feb',
  );
}

interface WaveformChartProps {
  series: ChartSeriesProjection[];
  loading?: boolean;
  height?: string;
}

const props = withDefaults(defineProps<WaveformChartProps>(), {
  loading: false,
  height: '300px',
});

const chartRef = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

function buildOption(series: ChartSeriesProjection[]): echarts.EChartsOption {
  return {
    animation: false,
    grid: { left: 56, right: 16, top: 32, bottom: 56 },
    tooltip: { trigger: 'axis' },
    legend: {
      show: series.length > 1,
      top: 0,
      textStyle: { fontSize: 11 },
    },
    dataZoom: [{
      type: 'inside',
      xAxisIndex: 0,
    }],
    xAxis: {
      type: 'category',
      data: series.length > 0 && series[0].points.length > 0
        ? series[0].points.map((p) => p.timestamp)
        : [],
      axisLabel: { show: false },
    },
    yAxis: { type: 'value' },
    series: series.map((s, i) => ({
      name: s.fieldName,
      type: 'line',
      data: s.points.map((p) => p.value),
      showSymbol: false,
      lineStyle: { width: 1.5 },
      itemStyle: { color: getChartColors()[i % 6] },
    })),
  };
}

watch(() => props.series, (series) => {
  if (!chart) return;
  chart.setOption(buildOption(series), { replaceMerge: ['series'] });
}, { deep: false });

watch(() => props.loading, (loading) => {
  if (!chart) return;
  if (loading) {
    chart.showLoading('default', { text: '' });
  } else {
    chart.hideLoading();
  }
});

onMounted(() => {
  if (!chartRef.value) return;
  chart = echarts.init(chartRef.value);
  chart.setOption(buildOption(props.series));

  resizeObserver = new ResizeObserver(() => {
    chart?.resize();
  });
  resizeObserver.observe(chartRef.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="chartRef" :style="{ height }" class="waveform-chart" />
</template>

<style scoped>
.waveform-chart {
  min-height: 200px;
  width: 100%;
}
</style>
