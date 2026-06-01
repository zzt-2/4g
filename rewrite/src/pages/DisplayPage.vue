<script setup lang="ts">
import { onMounted, ref, computed, onUnmounted, shallowRef } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { usePolling } from '@/shared/composables';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { useDisplayRefresh } from '@/features/display/composables';
import { receiveLifecycleMap } from '@/features/receive/components/receiveStatusMap';
import DisplayPanel from '@/features/display/components/DisplayPanel.vue';
import ChartConfigDialog from '@/features/display/components/ChartConfigDialog.vue';
import ScatterConfigDialog from '@/features/display/components/ScatterConfigDialog.vue';
import type { ReceiveCounterSnapshot, ReceiveLifecycleStatus } from '@/features/receive';
import type {
  ChartInstancePatch,
  DisplayMode,
  ScatterDisplayPreference,
} from '@/features/display';
import type { StorageLocalRecord } from '@/features/storage-local-baseline';

// ===== Service references =====
const runtime = useRewriteRuntime();
const receiveService = runtime.features.receiveService;
const displayService = runtime.features.displayService;
const storageService = runtime.features.storageService;

const displayRefresh = useDisplayRefresh(displayService);

// ===== Receive stats =====
const lifecycle = ref<ReceiveLifecycleStatus>('idle');
const counters = ref<ReceiveCounterSnapshot>({
  batchCount: 0, byteCount: 0, matchedCount: 0, unmatchedCount: 0,
  configErrorCount: 0, parseErrorCount: 0, inputErrorCount: 0, staleInputCount: 0,
});
const matchRate = computed(() => {
  const total = counters.value.matchedCount + counters.value.unmatchedCount;
  return total > 0 ? `${((counters.value.matchedCount / total) * 100).toFixed(1)}%` : '--';
});

function refreshStats(): void {
  const ui = receiveService.getUiSnapshot();
  lifecycle.value = ui.lifecycle;
  counters.value = ui.counters;
}

const polling = usePolling(refreshStats, 500);

// ===== Derived display data =====
const prefs = computed(() => displayRefresh.preferences.value);

const groups = computed(() => {
  const set = new Set<string>();
  for (const r of displayRefresh.table1Rows.value) {
    if (r.groupId) set.add(r.groupId);
  }
  for (const r of displayRefresh.table2Rows.value) {
    if (r.groupId) set.add(r.groupId);
  }
  return [...set].sort();
});

const availableFields = computed(() => {
  const map = new Map<string, { fieldId: string; fieldName: string }>();
  for (const r of displayRefresh.table1Rows.value) {
    const key = `${r.groupId}:${r.dataItemId}`;
    if (!map.has(key)) map.set(key, { fieldId: key, fieldName: r.fieldName });
  }
  for (const r of displayRefresh.table2Rows.value) {
    const key = `${r.groupId}:${r.dataItemId}`;
    if (!map.has(key)) map.set(key, { fieldId: key, fieldName: r.fieldName });
  }
  return [...map.values()];
});

const mode1 = computed(() => prefs.value.table1.displayMode);
const mode2 = computed(() => prefs.value.table2.displayMode);
const chart1 = computed(() => displayRefresh.chartInstances.value[0] ?? null);
const chart2 = computed(() => displayRefresh.chartInstances.value[1] ?? null);

// ===== Constellation mutual exclusion (D5) =====
const canPanel1UseConstellation = computed(() => mode2.value !== 'special');
const canPanel2UseConstellation = computed(() => mode1.value !== 'special');

// ===== Dialog state =====
const chartConfigOpen = ref(false);
const chartConfigPanel = ref<'1' | '2'>('1');
const scatterConfigOpen = ref(false);

const chartConfigPreference = computed(() => {
  const idx = chartConfigPanel.value === '1' ? 0 : 1;
  return prefs.value.charts[idx] ?? null;
});

const chartConfigTarget = computed(() => {
  const idx = chartConfigPanel.value === '1' ? 0 : 1;
  return displayRefresh.chartInstances.value[idx] ?? null;
});

const scatterPreference = computed(() => prefs.value.scatter);

// ===== Mode / group change handlers =====
function onModeChange(panel: '1' | '2', mode: DisplayMode): void {
  const thisKey = panel === '1' ? 'table1' : 'table2';
  const otherKey = panel === '1' ? 'table2' : 'table1';

  if (mode === 'special' && prefs.value[otherKey].displayMode === 'special') {
    displayService.updatePreferences({
      [otherKey]: { displayMode: 'table' },
      [thisKey]: { displayMode: mode },
    });
    return;
  }
  displayService.updatePreferences({ [thisKey]: { displayMode: mode } });
}

function onGroupChange(panel: '1' | '2', groupId: string): void {
  const key = panel === '1' ? 'table1' : 'table2';
  displayService.updatePreferences({ [key]: { selectedGroupId: groupId } });
}

// ===== Chart / scatter config =====
function openChartConfig(panel: '1' | '2'): void {
  chartConfigPanel.value = panel;
  chartConfigOpen.value = true;
}

function saveChartConfig(patch: ChartInstancePatch): void {
  const chartId = chartConfigPanel.value === '1' ? 'chart-1' : 'chart-2';
  displayService.updateChartConfig(chartId, patch);
  chartConfigOpen.value = false;
}

function saveScatterConfig(partial: Partial<ScatterDisplayPreference>): void {
  displayService.updatePreferences({ scatter: partial });
  scatterConfigOpen.value = false;
}

// ===== Recording (inline composable, D2) =====
const isRecording = ref(false);
const recordCount = ref(0);
const recordStartTime = ref(0);
let recordInterval: ReturnType<typeof setInterval> | null = null;

const recordElapsed = computed(() => {
  if (!isRecording.value || !recordStartTime.value) return '--';
  const ms = Date.now() - recordStartTime.value;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
});

function startRecording(): void {
  isRecording.value = true;
  recordCount.value = 0;
  recordStartTime.value = Date.now();
  recordInterval = setInterval(() => {
    const rows = displayRefresh.table1Rows.value;
    if (rows.length === 0) return;
    const record: StorageLocalRecord = {
      id: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      source: 'local',
      channel: 'display',
      fields: rows.map((r) => ({
        key: `${r.groupId}:${r.dataItemId}:${r.fieldName}`,
        value: r.displayValue as string,
      })),
    };
    storageService.appendLocalRecords([record]);
    recordCount.value++;
  }, 1000);
}

function stopRecording(): void {
  isRecording.value = false;
  if (recordInterval !== null) {
    clearInterval(recordInterval);
    recordInterval = null;
  }
}

// ===== Lifecycle =====
onMounted(() => {
  refreshStats();
  polling.start();
  displayRefresh.start();
});

onUnmounted(() => {
  stopRecording();
});
</script>

<template>
  <q-page class="display-page p-page flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <h1 class="display-page__title m-0">实时展示</h1>
        <StatusBadge :status="lifecycle" :status-map="receiveLifecycleMap" />
      </div>
    </div>

    <!-- Stats bar -->
    <div class="display-page__stats mb-3">
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

    <!-- Dual panel area -->
    <div class="display-page__panels">
      <DisplayPanel
        panel-id="1"
        :mode="mode1"
        :selected-group-id="prefs.table1.selectedGroupId"
        :groups="groups"
        :rows="displayRefresh.table1Rows.value"
        :chart-instance="chart1"
        :scatter="displayRefresh.scatter.value"
        :can-use-constellation="canPanel1UseConstellation"
        class="flex-1 min-w-0"
        @update:mode="onModeChange('1', $event)"
        @update:selected-group-id="onGroupChange('1', $event)"
        @open-chart-settings="openChartConfig('1')"
        @open-scatter-settings="scatterConfigOpen = true"
      />
      <DisplayPanel
        panel-id="2"
        :mode="mode2"
        :selected-group-id="prefs.table2.selectedGroupId"
        :groups="groups"
        :rows="displayRefresh.table2Rows.value"
        :chart-instance="chart2"
        :scatter="displayRefresh.scatter.value"
        :can-use-constellation="canPanel2UseConstellation"
        class="flex-1 min-w-0"
        @update:mode="onModeChange('2', $event)"
        @update:selected-group-id="onGroupChange('2', $event)"
        @open-chart-settings="openChartConfig('2')"
        @open-scatter-settings="scatterConfigOpen = true"
      />
    </div>

    <!-- Bottom bar: recording controls -->
    <div class="display-page__bottom-bar mt-3">
      <div class="flex items-center gap-3">
        <q-btn
          v-if="!isRecording"
          color="negative"
          round
          dense
          icon="fiber_manual_record"
          size="sm"
          @click="startRecording"
        >
          <q-tooltip>开始录制</q-tooltip>
        </q-btn>
        <q-btn
          v-else
          color="grey"
          round
          dense
          icon="stop"
          size="sm"
          @click="stopRecording"
        >
          <q-tooltip>停止录制</q-tooltip>
        </q-btn>
        <template v-if="isRecording">
          <q-badge color="negative" outline class="recording-indicator">
            REC {{ recordElapsed }}
          </q-badge>
          <span class="rw-text-desc">{{ recordCount }} 条记录</span>
        </template>
      </div>

      <div class="flex items-center gap-3">
        <span class="rw-text-desc">刷新: {{ prefs.refreshCadenceMs }}ms</span>
        <StatusBadge
          :status="displayRefresh.availability.value.available ? 'receiving' : 'idle'"
          :status-map="{ idle: { label: '无数据源', color: 'grey' }, receiving: { label: '数据就绪', color: 'positive' } }"
        />
      </div>
    </div>

    <!-- Config dialogs -->
    <ChartConfigDialog
      v-model="chartConfigOpen"
      :chart-preference="chartConfigPreference"
      :available-fields="availableFields"
      @save="saveChartConfig"
    />
    <ScatterConfigDialog
      v-model="scatterConfigOpen"
      :scatter-preference="scatterPreference"
      :available-fields="availableFields"
      @save="saveScatterConfig"
    />
  </q-page>
</template>

<style scoped lang="scss">
.display-page {
  background: var(--rw-color-surface-app);
}

.display-page__title {
  color: var(--rw-color-text-primary);
  font-size: var(--rw-font-size-title-lg);
  font-weight: var(--rw-font-weight-semibold);
  line-height: var(--rw-line-height-title-lg);
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

.display-page__panels {
  display: flex;
  flex: 1 1 0;
  gap: var(--rw-space-4);
  min-height: 0;
}

.display-page__bottom-bar {
  border: var(--rw-border-width-subtle) solid var(--rw-color-border-subtle);
  border-radius: var(--rw-radius-panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
}

.recording-indicator {
  font-size: var(--rw-font-size-caption);
  font-weight: var(--rw-font-weight-semibold);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
