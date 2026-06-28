<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useNotify } from '@/shared/composables';
import WaveformChart from '@/widgets/WaveformChart.vue';
import HistoryTimeSelector from './history/HistoryTimeSelector.vue';
import HistoryDataSelector from './history/HistoryDataSelector.vue';
import CSVExportDialog from './history/CSVExportDialog.vue';
import ChartConfigDialog from './history/ChartConfigDialog.vue';
import { useHistoryData } from './history/useHistoryData';
import { getFileFacade } from '@/platform';

// ===== Service references =====
const runtime = useRewriteRuntime();
// H015:数据源切到录制 .bin,经 recordingService 读(useHistoryData 新签名)。
// storageService 仅供 CSVExportDialog(spec §5.4:CSV 本轮不做,prop 暂保留不强行拆)。
const storageService = runtime.features.storageService;
const recordingService = runtime.features.recordingService;
const displayService = runtime.features.displayService;
// files facade 走 getFileFacade()（项目标准写法，见 FrameListPage），
// 旧代码 `runtime.platform.files` 是 stale——runtime 无 platform 层，访问必崩。
const filesFacade = getFileFacade();

// ===== Composable =====
const history = useHistoryData(recordingService, displayService);
const notify = useNotify();

// ===== UI state =====
const chartCount = ref(1);
const showExportDialog = ref(false);
const configChartId = ref<string | null>(null);

// ===== Operations =====
async function handleLoad(): Promise<void> {
  await history.loadData.value();
  if (history.itemHierarchy.value.length > 0) {
    notify.success(`已加载 ${history.recordCount.value} 条记录`);
  } else {
    notify.info('该时间范围内无数据');
  }
}

function handleChartCountChange(count: number): void {
  chartCount.value = count;
  displayService.updateChartCount(count);
  history.refreshCharts();
}

function handleGlobalSelectChange(items: Set<string>): void {
  history.selectedGlobalItems.value = items;
}

function handleChartConfigSaved(): void {
  history.refreshCharts();
}

const CHART_HEIGHTS: Record<number, string> = {
  1: '420px',
  2: '340px',
  3: '280px',
  4: '240px',
};

// 图表数量分段控件选项（O4 模块级；照搬 CiToolbar TABS 范式）。
const CHART_COUNT_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
] as const;

function chartHeight(): string {
  return CHART_HEIGHTS[chartCount.value] ?? '300px';
}

function formatStat(val: number): string {
  return Number.isFinite(val) ? val.toFixed(4) : '--';
}

function getChartTitle(chartId: string): string {
  const prefs = displayService.getPreferences();
  const chart = prefs.charts.find((c) => c.id === chartId);
  return chart?.title ?? chartId;
}

// Refresh charts when global selection or time range changes
watch([() => history.selectedGlobalItems.value, () => history.timeRange.value], () => {
  history.refreshCharts();
}, { deep: true });

onMounted(() => {
  const prefs = displayService.getPreferences();
  chartCount.value = prefs.charts.length;
});
</script>

<template>
  <q-page class="history-page min-h-full">
    <div class="flex h-full gap-6 p-6">
      <!-- Left panel -->
      <div class="w-80 flex flex-col rw-panel-base rounded overflow-hidden">
        <HistoryTimeSelector
          v-model:range="history.timeRange.value"
          :loading="history.loading.value"
          @load="handleLoad()"
        />
        <div class="rw-divider-b" />
        <HistoryDataSelector
          :hierarchy="history.itemHierarchy.value"
          :selected="history.selectedGlobalItems.value"
          @update:selected="handleGlobalSelectChange"
        />
        <div class="rw-divider-t" />
        <div class="p-4">
          <!-- H015/spec §5.4:CSV 导出本轮不做(重写数据源=麻烦),按钮永久置灰 + tooltip。 -->
          <q-btn
            color="primary" no-caps outline
            icon="o_download"
            label="导出 CSV"
            class="full-width"
            disable
          >
            <q-tooltip>CSV 导出暂不支持新录制格式</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Right panel -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Top bar -->
        <div class="flex items-center gap-3 px-4 py-2 rw-divider-b">
          <span class="rw-text-label">图表数量</span>
          <div class="rw-segmented" role="tablist">
            <button
              v-for="opt in CHART_COUNT_OPTIONS"
              :key="opt.value"
              type="button"
              role="tab"
              :aria-selected="chartCount === opt.value"
              :class="['rw-segmented__btn', { 'rw-segmented__btn--active': chartCount === opt.value }]"
              @click="handleChartCountChange(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
          <q-space />
          <span class="rw-text-desc text-xs">
            {{ history.recordCount.value }} 条记录 · {{ history.selectedGlobalItems.value.size }} 项选中
          </span>
        </div>

        <!-- Charts -->
        <div class="flex-1 overflow-auto p-4">
          <template v-if="history.enrichedCharts.value.length === 0">
            <div class="flex items-center justify-center h-full rw-text-label">
              选择时间范围并加载数据
            </div>
          </template>
          <template v-for="chart in history.enrichedCharts.value" :key="chart.id">
            <div class="rw-panel-base rounded mb-4 overflow-hidden">
              <div class="flex items-center justify-between px-4 py-2 rw-divider-b">
                <span class="rw-text-value text-sm">{{ getChartTitle(chart.id) }}</span>
                <q-btn flat dense no-caps size="xs" label="配置" color="primary" @click="configChartId = chart.id" />
              </div>
              <div class="p-2">
                <WaveformChart
                  :series="chart.series"
                  :height="chartHeight()"
                  :empty-variant="chart.series.length > 0 ? 'no-data' : 'no-selection'"
                />
              </div>
              <!-- Statistics overlay -->
              <div v-if="chart.series.length > 0" class="px-4 pb-2">
                <div class="rw-text-label text-xs mb-1">统计</div>
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                  <template v-for="s in chart.series" :key="s.fieldId">
                    <span class="rw-text-desc text-xs">
                      {{ s.fieldName }}:
                      均值 {{ formatStat(history.chartStats.value.find((c) => c.chartId === chart.id)?.series.find((ss) => ss.fieldId === s.fieldId)?.mean ?? NaN) }}
                      RMSE {{ formatStat(history.chartStats.value.find((c) => c.chartId === chart.id)?.series.find((ss) => ss.fieldId === s.fieldId)?.rmse ?? NaN) }}
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <CSVExportDialog
      v-model="showExportDialog"
      :storage-service="storageService"
      :files-facade="filesFacade"
      :time-range="history.timeRange.value"
      :selected-items="history.selectedGlobalItems.value"
      :record-count="history.recordCount.value"
    />
    <ChartConfigDialog
      v-model="configChartId"
      :display-service="displayService"
      :available-items="history.selectedGlobalItems.value"
      :hierarchy="history.itemHierarchy.value"
      @update:model-value="handleChartConfigSaved"
    />
  </q-page>
</template>

<style scoped lang="scss">
.history-page {
  background: var(--rw-color-surface-app);
}
</style>
