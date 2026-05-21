<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { usePolling } from '@/shared/composables';
import DataTable from '@/widgets/DataTable.vue';
import StatusBadge from '@/widgets/StatusBadge.vue';
import ScatterChart from '@/widgets/ScatterChart.vue';
import WaveformChart from '@/widgets/WaveformChart.vue';
import { useDisplayRefresh } from '@/features/display/composables';
import { receiveLifecycleMap } from '@/features/receive/components/receiveStatusMap';
import { fieldValueColumns, recentInputColumns, frameStatsColumns } from '@/features/display/components/display-columns';
import type { ReceiveCounterSnapshot, ReceiveLifecycleStatus, ReceiveFieldValueSnapshot, ReceiveRecentInputSnapshot, ReceiveFrameStatisticsSnapshot } from '@/features/receive';

// ===== Service references =====
const runtime = useRewriteRuntime();
const receiveService = runtime.features.receiveService;
const displayService = runtime.features.displayService;
const displayRefresh = useDisplayRefresh(displayService);

// ===== Business data =====
const lifecycle = ref<ReceiveLifecycleStatus>('idle');
const counters = ref<ReceiveCounterSnapshot>({
  batchCount: 0, byteCount: 0, matchedCount: 0, unmatchedCount: 0,
  configErrorCount: 0, parseErrorCount: 0, inputErrorCount: 0, staleInputCount: 0,
});

// ===== Derived data (shallowRef per P2/P4) =====
const fieldValues = shallowRef<ReceiveFieldValueSnapshot[]>([]);
const recentInputs = shallowRef<ReceiveRecentInputSnapshot[]>([]);
const frameStats = shallowRef<ReceiveFrameStatisticsSnapshot[]>([]);

// ===== UI state =====
const activeTab = ref('overview');
const matchRate = ref('--');

// ===== Polling =====
function refreshData(): void {
  const ui = receiveService.getUiSnapshot();
  lifecycle.value = ui.lifecycle;
  counters.value = ui.counters;
  fieldValues.value = receiveService.listFieldValues();
  recentInputs.value = receiveService.listRecentInputs({ limit: 50 });
  frameStats.value = receiveService.listFrameStats();

  const total = ui.counters.matchedCount + ui.counters.unmatchedCount;
  matchRate.value = total > 0
    ? `${((ui.counters.matchedCount / total) * 100).toFixed(1)}%`
    : '--';
}

const polling = usePolling(refreshData, 500);

function formatTime(iso?: string): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    matched: '匹配', unmatched: '未匹配', 'config-error': '配置错误',
    'parse-error': '解析错误', 'input-error': '输入错误', 'stale-input': '过期',
  };
  return map[kind] ?? kind;
}

onMounted(() => {
  refreshData();
  polling.start();
  displayRefresh.start();
});
</script>

<template>
  <q-page class="display-page p-page min-h-full">
    <div class="display-page__content mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <h1 class="home-page__title m-0">实时展示</h1>
          <StatusBadge :status="lifecycle" :status-map="receiveLifecycleMap" />
        </div>
      </div>

      <!-- Stats bar -->
      <div class="display-page__stats rw-panel-base mb-4">
        <div class="display-page__stat-item">
          <span class="rw-text-label">匹配率</span>
          <strong class="rw-text-value">{{ matchRate }}</strong>
        </div>
        <div class="display-page__stat-item">
          <span class="rw-text-label">总批次</span>
          <strong class="rw-text-value">{{ counters.batchCount }}</strong>
        </div>
        <div class="display-page__stat-item">
          <span class="rw-text-label">已匹配</span>
          <strong class="rw-text-value text-positive">{{ counters.matchedCount }}</strong>
        </div>
        <div class="display-page__stat-item">
          <span class="rw-text-label">未匹配</span>
          <strong class="rw-text-value">{{ counters.unmatchedCount }}</strong>
        </div>
        <div class="display-page__stat-item">
          <span class="rw-text-label">错误</span>
          <strong class="rw-text-value text-negative">{{ counters.inputErrorCount + counters.configErrorCount + counters.parseErrorCount }}</strong>
        </div>
        <div class="display-page__stat-item">
          <span class="rw-text-label">字节数</span>
          <strong class="rw-text-value">{{ counters.byteCount }}</strong>
        </div>
      </div>

      <!-- Tabs -->
      <q-tabs v-model="activeTab" dense active-color="primary" indicator-color="primary" class="mb-3">
        <q-tab name="overview" label="数据总览" no-caps />
        <q-tab name="charts" label="可视化" no-caps />
      </q-tabs>

      <!-- Overview tab -->
      <template v-if="activeTab === 'overview'">
        <div class="grid grid-cols-2 gap-4">
          <!-- Field values -->
          <div class="rw-panel-base rounded overflow-hidden">
            <div class="px-4 py-2 rw-divider-b">
              <span class="rw-text-label">字段值</span>
            </div>
            <DataTable
              :columns="fieldValueColumns"
              :rows="fieldValues"
              row-key="fieldId"
              container-height="360px"
            >
              <template #no-data>
                <div class="text-center w-full p-4 rw-text-label">暂无字段数据</div>
              </template>
              <template #body-cell-updatedAt="props">
                <q-td :props="props">
                  <span class="rw-text-desc text-xs">{{ formatTime(props.row.updatedAt) }}</span>
                </q-td>
              </template>
            </DataTable>
          </div>

          <!-- Frame stats -->
          <div class="rw-panel-base rounded overflow-hidden">
            <div class="px-4 py-2 rw-divider-b">
              <span class="rw-text-label">帧匹配统计</span>
            </div>
            <DataTable
              :columns="frameStatsColumns"
              :rows="frameStats"
              row-key="frameId"
              container-height="360px"
            >
              <template #no-data>
                <div class="text-center w-full p-4 rw-text-label">暂无帧统计</div>
              </template>
              <template #body-cell-lastMatchedAt="props">
                <q-td :props="props">
                  <span class="rw-text-desc text-xs">{{ formatTime(props.row.lastMatchedAt) }}</span>
                </q-td>
              </template>
            </DataTable>
          </div>
        </div>

        <!-- Recent inputs -->
        <div class="rw-panel-base rounded overflow-hidden mt-4">
          <div class="px-4 py-2 rw-divider-b">
            <span class="rw-text-label">最近输入</span>
          </div>
          <DataTable
            :columns="recentInputColumns"
            :rows="recentInputs"
            row-key="id"
            container-height="280px"
          >
            <template #no-data>
              <div class="text-center w-full p-4 rw-text-label">暂无输入数据</div>
            </template>
            <template #body-cell-kind="props">
              <q-td :props="props">
                <q-badge :color="props.row.kind === 'matched' ? 'positive' : props.row.kind === 'unmatched' ? 'grey' : 'negative'" outline>
                  {{ kindLabel(props.row.kind) }}
                </q-badge>
              </q-td>
            </template>
            <template #body-cell-occurredAt="props">
              <q-td :props="props">
                <span class="rw-text-desc text-xs">{{ formatTime(props.row.occurredAt) }}</span>
              </q-td>
            </template>
          </DataTable>
        </div>
      </template>

      <!-- Charts tab -->
      <template v-if="activeTab === 'charts'">
        <div class="grid grid-cols-2 gap-4">
          <!-- Waveform -->
          <div class="rw-panel-base rounded overflow-hidden">
            <div class="px-4 py-2 rw-divider-b">
              <span class="rw-text-label">波形图</span>
            </div>
            <div class="p-2">
              <WaveformChart :series="displayRefresh.chartSeries.value" height="340px" />
            </div>
          </div>

          <!-- Scatter -->
          <div class="rw-panel-base rounded overflow-hidden">
            <div class="px-4 py-2 rw-divider-b">
              <span class="rw-text-label">星座图</span>
            </div>
            <div class="p-2">
              <ScatterChart :data="displayRefresh.scatter.value" height="340px" />
            </div>
          </div>
        </div>
      </template>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.display-page {
  background: var(--rw-color-surface-app);
}

.display-page__content {
  max-width: var(--rw-size-content-wide);
}

.display-page__stats {
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.display-page__stat-item {
  border-right: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  display: grid;
  gap: 2px;
  padding: 12px 16px;

  &:last-child {
    border-right: none;
  }

  span {
    color: var(--rw-color-text-muted);
    font-size: var(--rw-font-size-caption);
    line-height: var(--rw-line-height-caption);
  }

  strong {
    color: var(--rw-color-text-primary);
    font-size: var(--rw-font-size-body);
    font-weight: var(--rw-font-weight-semibold);
    line-height: var(--rw-line-height-body);
  }
}

.home-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
}
</style>
