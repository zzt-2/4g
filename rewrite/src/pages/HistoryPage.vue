<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { useNotify } from '@/shared/composables';
import WaveformChart from '@/widgets/WaveformChart.vue';
import HistoryTimeSelector from './history/HistoryTimeSelector.vue';
import HistoryDataSelector from './history/HistoryDataSelector.vue';
import CSVExportDialog from './history/CSVExportDialog.vue';
// 复用 display feature 的标准 ChartConfigDialog(对象语义,非本地旧字符串副本)。
import ChartConfigDialog from '@/features/display/components/ChartConfigDialog.vue';
import { useHistoryData } from './history/useHistoryData';
import { getFileFacade } from '@/platform';
import type { ChartInstancePatch, ChartInstancePreference } from '@/features/display';

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
// 图表配置弹窗(复用 display 标准 ChartConfigDialog):chartConfigOpen 控制显隐,
// editingChartId 记正在编辑哪个 chart,editingChartPreference 是该 chart 当前 preference。
const chartConfigOpen = ref(false);
const editingChartId = ref<string>('');
// preferences 响应式快照:displayService 是普通对象(非响应式),editingChartPreference
// 不能直接依赖 getPreferences()(service 内部变不会触发重算 → 弹窗显示滞后的旧配置)。
// 用本地 shallowRef 持有快照,在 open/save 时手动刷新,让 computed 正确重算。
const preferencesSnapshot = ref(displayService.getPreferences());

// ===== Operations =====
async function handleLoad(): Promise<void> {
  // loadData/refreshCharts 是 composable 返回的裸函数(非 ref),直接调用,不解包 .value。
  await history.loadData();
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

// 正在编辑的 chart 当前 preference(传给标准 ChartConfigDialog 作 chartPreference prop)。
// 依赖 preferencesSnapshot(响应式)而非直接调 getPreferences()(非响应式,会滞後)。
const editingChartPreference = computed<ChartInstancePreference | null>(() => {
  if (!editingChartId.value) return null;
  return preferencesSnapshot.value.charts.find((c) => c.id === editingChartId.value) ?? null;
});

function openChartConfig(chartId: string): void {
  // 打开前刷新快照(拿到 service 最新 preferences,如别处改过),避免显示旧配置。
  preferencesSnapshot.value = displayService.getPreferences();
  editingChartId.value = chartId;
  chartConfigOpen.value = true;
}

// 标准 ChartConfigDialog save 事件:patch 含 selectedItems(ChartSelectedItem[])+yAxis。
// updateChartConfig 落 service 内存 + persistDisplay 落盘 + 刷新快照 + refreshCharts 重算曲线。
function saveChartConfig(patch: ChartInstancePatch): void {
  displayService.updateChartConfig(editingChartId.value, patch);
  persistDisplay();
  preferencesSnapshot.value = displayService.getPreferences();
  history.refreshCharts();
  chartConfigOpen.value = false;
}

function persistDisplay(): void {
  runtime.persistence.saveDisplayPreferences();
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
                <q-btn flat dense no-caps size="xs" label="配置" color="primary" @click="openChartConfig(chart.id)" />
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
      v-model="chartConfigOpen"
      :chart-preference="editingChartPreference"
      :available-fields="history.availableFields.value"
      @save="saveChartConfig"
    />
  </q-page>
</template>

<style scoped lang="scss">
.history-page {
  background: var(--rw-color-surface-app);
}
</style>
