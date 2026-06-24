<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { ScatterChart as EScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ScatterProjection } from '@/features/display';

echarts.use([EScatterChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface ScatterChartProps {
  data: ScatterProjection;
  loading?: boolean;
  height?: string;
  /** 散点直径(px)，echarts symbolSize。S010：从 scatter.pointSize 传入。 */
  pointSize?: number;
}

const props = withDefaults(defineProps<ScatterChartProps>(), {
  loading: false,
  height: '300px',
  pointSize: 4,
});

const chartRef = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

function buildOption(data: ScatterProjection): echarts.EChartsOption {
  return {
    animation: false,
    grid: { left: 48, right: 16, top: 16, bottom: 40 },
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const point = p as { data: number[] };
        return `I: ${point.data[0]?.toFixed(4)}<br/>Q: ${point.data[1]?.toFixed(4)}`;
      },
    },
    xAxis: {
      name: 'I',
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    yAxis: {
      name: 'Q',
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series: [{
      type: 'scatter',
      data: data.points.map((p) => [p.i, p.q]),
      symbolSize: props.pointSize,
      itemStyle: { color: '#1f6feb' },
    }],
  };
}

watch(() => props.data, (data) => {
  if (!chart) return;
  chart.setOption(buildOption(data));
}, { deep: false });

// S010: 点大小变化时重绘（用户在星座图弹窗调 pointSize 滑块）。
watch(() => props.pointSize, () => {
  if (!chart) return;
  chart.setOption(buildOption(props.data));
});

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
  chart.setOption(buildOption(props.data));

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
  <div ref="chartRef" :style="{ height }" class="scatter-chart" />
</template>

<style scoped>
.scatter-chart {
  min-height: 200px;
  width: 100%;
}
</style>
