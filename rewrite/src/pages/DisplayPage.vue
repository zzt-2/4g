<script setup lang="ts">
import { onMounted, ref, computed, onUnmounted } from 'vue';
import { useRewriteRuntime } from '@/app/rewriteRuntime';
import { usePolling } from '@/shared/composables';
import StatusBadge from '@/widgets/StatusBadge.vue';
import { useDisplayRefresh } from '@/features/display/composables';
import { receiveLifecycleMap } from '@/features/receive/components/receiveStatusMap';
import DisplayPanel from '@/features/display/components/DisplayPanel.vue';
import ChartConfigDialog from '@/features/display/components/ChartConfigDialog.vue';
import ScatterConfigDialog from '@/features/display/components/ScatterConfigDialog.vue';
import GroupConfigDialog from '@/features/display/components/GroupConfigDialog.vue';
import type { ReceiveCounterSnapshot, ReceiveLifecycleStatus } from '@/features/receive';
import type {
  ChartInstancePatch,
  DisplayGroupConfig,
  DisplayMode,
  GroupOption,
  ScatterDisplayPreference,
  ScatterSourceBinding,
  TableDisplayPreference,
  TableRowProjection,
} from '@/features/display';
import type { StorageLocalRecord } from '@/features/storage-local-baseline';

// ===== Service references =====
const runtime = useRewriteRuntime();
const receiveService = runtime.features.receiveService;
const displayService = runtime.features.displayService;
const storageService = runtime.features.storageService;
const frameService = runtime.features.frameService;
const frameReader = runtime.features.frameReader;

const displayRefresh = useDisplayRefresh(displayService, frameReader);

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

const configuredGroups = computed(() => prefs.value.groups);

const groups = computed((): GroupOption[] => {
  const configured = configuredGroups.value;
  const configuredIds = new Set(configured.map((g) => g.id));
  const emergent = new Set<string>();
  for (const r of displayRefresh.table1Rows.value) {
    if (r.groupId && !configuredIds.has(r.groupId)) emergent.add(r.groupId);
  }
  for (const r of displayRefresh.table2Rows.value) {
    if (r.groupId && !configuredIds.has(r.groupId)) emergent.add(r.groupId);
  }
  const options: GroupOption[] = configured.map((g) => ({ value: g.id, label: g.label }));
  for (const id of [...emergent].sort()) {
    options.push({ value: id, label: id });
  }
  return options;
});

const receiveFrames = computed(() => frameService.listFrames({ direction: 'receive' }));

// ===== Field metadata (description/unit for tooltips) =====
const fieldMeta = computed(() => {
  const map = new Map<string, { description?: string }>();
  for (const frame of receiveFrames.value) {
    const full = frameReader.getFrame(frame.id);
    if (!full) continue;
    for (const f of full.fields) {
      if (!f.description) continue;
      const dataItemId = `${frame.id}:${f.id}`;
      map.set(dataItemId, { description: f.description });
    }
  }
  return map;
});

// R19: fieldName lookup from frameReader (static metadata).
// TableRowProjection.fieldName is intentionally not projected from material (see projection.toRow);
// UI consumption of fieldName MUST go through this lookup, never material.fieldName.
const fieldNameLookup = computed(() => {
  const map = new Map<string, string>();
  for (const frame of receiveFrames.value) {
    const refs = frameReader.listFieldReferences({ frameId: frame.id });
    for (const r of refs) {
      map.set(`${r.frameId}:${r.fieldId}`, r.fieldName);
    }
  }
  return map;
});

function enrichRows(rows: readonly TableRowProjection[]): TableRowProjection[] {
  const lookup = fieldNameLookup.value;
  return rows.map((r) => ({
    ...r,
    fieldName: lookup.get(r.dataItemId) ?? '[Unknown Field]',
  }));
}

const availableFields = computed(() => {
  const map = new Map<string, { fieldId: string; binding: ScatterSourceBinding; fieldName: string; frameName: string; frameId: string }>();
  const groups = configuredGroups.value;
  const coveredFrameIds = new Set<string>();

  for (const group of groups) {
    for (const entry of group.frames) {
      coveredFrameIds.add(entry.frameId);
      const fields = frameReader.listFieldReferences({ frameId: entry.frameId });
      for (const f of fields) {
        const dataItemId = `${f.frameId}:${f.fieldId}`;
        const key = `${group.id}:${dataItemId}`;
        if (!map.has(key)) map.set(key, {
          fieldId: key,
          binding: { groupId: group.id, dataItemId },
          fieldName: f.fieldName,
          frameName: f.frameName,
          frameId: f.frameId,
        });
      }
    }
  }

  for (const frame of receiveFrames.value) {
    if (coveredFrameIds.has(frame.id)) continue;
    const fields = frameReader.listFieldReferences({ frameId: frame.id });
    for (const f of fields) {
      const dataItemId = `${f.frameId}:${f.fieldId}`;
      const key = `${frame.id}:${dataItemId}`;
      if (!map.has(key)) map.set(key, {
        fieldId: key,
        binding: { groupId: frame.id, dataItemId },
        fieldName: f.fieldName,
        frameName: f.frameName,
        frameId: f.frameId,
      });
    }
  }

  return [...map.values()];
});

const chartAvailableFields = computed(() => {
  const panelKey = chartConfigPanel.value === '1' ? 'table1' : 'table2';
  const selectedGroupId = prefs.value[panelKey].selectedGroupId;

  const result: { groupId: string; frameId: string; fieldId: string; fieldName: string; frameName: string }[] = [];
  const covered = new Set<string>();

  function push(groupId: string, frameId: string, fieldId: string, fieldName: string, frameName: string): void {
    const key = `${groupId}:${frameId}:${fieldId}`;
    if (covered.has(key)) return;
    covered.add(key);
    result.push({ groupId, frameId, fieldId, fieldName, frameName });
  }

  if (selectedGroupId) {
    const group = configuredGroups.value.find((g) => g.id === selectedGroupId);
    if (group) {
      for (const entry of group.frames) {
        const fields = frameReader.listFieldReferences({ frameId: entry.frameId });
        for (const f of fields) {
          if (entry.visibleFieldIds.length > 0 && !entry.visibleFieldIds.includes(f.fieldId)) continue;
          push(group.id, f.frameId, f.fieldId, f.fieldName, f.frameName);
        }
      }
      return result;
    }
  }

  for (const group of configuredGroups.value) {
    for (const entry of group.frames) {
      const fields = frameReader.listFieldReferences({ frameId: entry.frameId });
      for (const f of fields) {
        if (entry.visibleFieldIds.length > 0 && !entry.visibleFieldIds.includes(f.fieldId)) continue;
        push(group.id, f.frameId, f.fieldId, f.fieldName, f.frameName);
      }
    }
  }
  for (const frame of receiveFrames.value) {
    const fields = frameReader.listFieldReferences({ frameId: frame.id });
    for (const f of fields) {
      push(frame.id, f.frameId, f.fieldId, f.fieldName, f.frameName);
    }
  }
  return result;
});

const mode1 = computed(() => prefs.value.table1.displayMode);
const mode2 = computed(() => prefs.value.table2.displayMode);
const chart1 = computed(() => displayRefresh.chartInstances.value[0] ?? null);
const chart2 = computed(() => displayRefresh.chartInstances.value[1] ?? null);

function buildPlaceholderRows(selectedGroupId: string): TableRowProjection[] {
  if (selectedGroupId) {
    const group = configuredGroups.value.find((g) => g.id === selectedGroupId);
    if (!group) return [];
    const rows: TableRowProjection[] = [];
    for (const entry of group.frames) {
      const fields = frameReader.listFieldReferences({ frameId: entry.frameId });
      for (const f of fields) {
        if (entry.visibleFieldIds.length > 0 && !entry.visibleFieldIds.includes(f.fieldId)) continue;
        rows.push({
          groupId: selectedGroupId,
          dataItemId: `${f.frameId}:${f.fieldId}`,
          fieldName: f.fieldName,
          value: null,
          displayValue: '-',
        });
      }
    }
    return rows;
  }
  const rows: TableRowProjection[] = [];
  for (const frame of receiveFrames.value) {
    const fields = frameReader.listFieldReferences({ frameId: frame.id });
    for (const f of fields) {
      rows.push({
        groupId: frame.id,
        dataItemId: `${f.frameId}:${f.fieldId}`,
        fieldName: f.fieldName,
        value: null,
        displayValue: '-',
      });
    }
  }
  return rows;
}

const panel1Rows = computed(() => {
  const live = displayRefresh.table1Rows.value;
  const placeholders = buildPlaceholderRows(prefs.value.table1.selectedGroupId);
  const merged = placeholders.length === 0
    ? live
    : (() => {
        const liveIds = new Set(live.map((r) => r.dataItemId));
        return [...live, ...placeholders.filter((p) => !liveIds.has(p.dataItemId))];
      })();
  return enrichRows(merged);
});

const panel2Rows = computed(() => {
  const live = displayRefresh.table2Rows.value;
  const placeholders = buildPlaceholderRows(prefs.value.table2.selectedGroupId);
  const merged = placeholders.length === 0
    ? live
    : (() => {
        const liveIds = new Set(live.map((r) => r.dataItemId));
        return [...live, ...placeholders.filter((p) => !liveIds.has(p.dataItemId))];
      })();
  return enrichRows(merged);
});

// ===== Constellation mutual exclusion (D5) =====
const canPanel1UseConstellation = computed(() => mode2.value !== 'special');
const canPanel2UseConstellation = computed(() => mode1.value !== 'special');

// ===== Dialog state =====
const chartConfigOpen = ref(false);
const chartConfigPanel = ref<'1' | '2'>('1');
const scatterConfigOpen = ref(false);
const groupConfigOpen = ref(false);

const chartConfigPreference = computed(() => {
  const idx = chartConfigPanel.value === '1' ? 0 : 1;
  return prefs.value.charts[idx] ?? null;
});

const scatterPreference = computed(() => prefs.value.scatter);

// ===== Reorder mode =====
const reorderMode1 = ref(false);
const reorderMode2 = ref(false);

function onReorderField(panel: '1' | '2', dataItemId: string, direction: 'up' | 'down'): void {
  const panelKey = panel === '1' ? 'table1' : 'table2';
  const groupId = prefs.value[panelKey].selectedGroupId;
  if (!groupId) return;

  const rows = panel === '1' ? panel1Rows.value : panel2Rows.value;
  const itemIds = rows.map((r) => r.dataItemId);
  const idx = itemIds.indexOf(dataItemId);
  if (idx < 0) return;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= itemIds.length) return;

  // Swap
  [itemIds[idx], itemIds[targetIdx]] = [itemIds[targetIdx], itemIds[idx]];

  // Update group config with new fieldOrder
  const newGroups = configuredGroups.value.map((g) => {
    if (g.id !== groupId) return g;
    // Extract frameId from dataItemId to group orders per frame
    const frameOrders = new Map<string, string[]>();
    for (const id of itemIds) {
      const sep = id.indexOf(':');
      const frameId = sep > 0 ? id.slice(0, sep) : id;
      const fieldId = sep > 0 ? id.slice(sep + 1) : id;
      if (!frameOrders.has(frameId)) frameOrders.set(frameId, []);
      frameOrders.get(frameId)!.push(fieldId);
    }
    return {
      ...g,
      frames: g.frames.map((entry) => ({
        ...entry,
        fieldOrder: frameOrders.get(entry.frameId) ?? entry.fieldOrder,
      })),
    };
  });

  displayService.updatePreferences({ groups: newGroups });
  persistDisplay();
}

// ===== Visible columns =====
const visibleColumns1 = computed(() => prefs.value.table1.visibleColumns ?? []);
const visibleColumns2 = computed(() => prefs.value.table2.visibleColumns ?? []);

function onVisibleColumnsChange(panel: '1' | '2', columns: readonly string[]): void {
  const panelKey = panel === '1' ? 'table1' : 'table2';
  displayService.updatePreferences({ [panelKey]: { visibleColumns: columns } as Partial<TableDisplayPreference> });
  persistDisplay();
}

// ===== Mode / group change handlers =====
function persistDisplay(): void {
  void runtime.persistence.saveDisplayPreferences();
}

function onModeChange(panel: '1' | '2', mode: DisplayMode): void {
  const thisKey = panel === '1' ? 'table1' : 'table2';
  const otherKey = panel === '1' ? 'table2' : 'table1';

  if (mode === 'special' && prefs.value[otherKey].displayMode === 'special') {
    displayService.updatePreferences({
      [otherKey]: { displayMode: 'table' },
      [thisKey]: { displayMode: mode },
    });
  } else {
    displayService.updatePreferences({ [thisKey]: { displayMode: mode } });
  }
  persistDisplay();
}

function onGroupChange(panel: '1' | '2', groupId: string): void {
  const key = panel === '1' ? 'table1' : 'table2';
  displayService.updatePreferences({ [key]: { selectedGroupId: groupId } });
  persistDisplay();
}

// ===== Chart / scatter config =====
function openChartConfig(panel: '1' | '2'): void {
  chartConfigPanel.value = panel;
  chartConfigOpen.value = true;
}

function saveChartConfig(patch: ChartInstancePatch): void {
  const chartId = chartConfigPanel.value === '1' ? 'chart-1' : 'chart-2';
  displayService.updateChartConfig(chartId, patch);
  persistDisplay();
  chartConfigOpen.value = false;
}

function saveScatterConfig(partial: Partial<ScatterDisplayPreference>): void {
  displayService.updatePreferences({ scatter: partial });
  persistDisplay();
  scatterConfigOpen.value = false;
}

function saveGroupConfig(groups: readonly DisplayGroupConfig[]): void {
  displayService.updatePreferences({ groups });

  const validIds = new Set(groups.map((g) => g.id));
  const t1 = prefs.value.table1.selectedGroupId;
  const t2 = prefs.value.table2.selectedGroupId;
  const resetPatch: Record<string, { selectedGroupId: string }> = {};
  if (t1 && !validIds.has(t1)) resetPatch.table1 = { selectedGroupId: '' };
  if (t2 && !validIds.has(t2)) resetPatch.table2 = { selectedGroupId: '' };
  if (Object.keys(resetPatch).length > 0) {
    displayService.updatePreferences(resetPatch as Record<string, Partial<TableDisplayPreference>>);
  }
  persistDisplay();
  groupConfigOpen.value = false;
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
        :rows="panel1Rows"
        :chart-instance="chart1"
        :scatter="displayRefresh.scatter.value"
        :can-use-constellation="canPanel1UseConstellation"
        :reorder-mode="reorderMode1"
        :visible-columns="visibleColumns1"
        :field-meta="fieldMeta"
        class="flex-1 min-w-0"
        @update:mode="onModeChange('1', $event)"
        @update:selected-group-id="onGroupChange('1', $event)"
        @update:reorder-mode="reorderMode1 = $event"
        @update:visible-columns="onVisibleColumnsChange('1', $event)"
        @open-chart-settings="openChartConfig('1')"
        @open-scatter-settings="scatterConfigOpen = true"
        @open-group-config="groupConfigOpen = true"
        @reorder-field="(id, dir) => onReorderField('1', id, dir)"
      />
      <DisplayPanel
        panel-id="2"
        :mode="mode2"
        :selected-group-id="prefs.table2.selectedGroupId"
        :groups="groups"
        :rows="panel2Rows"
        :chart-instance="chart2"
        :scatter="displayRefresh.scatter.value"
        :can-use-constellation="canPanel2UseConstellation"
        :reorder-mode="reorderMode2"
        :visible-columns="visibleColumns2"
        :field-meta="fieldMeta"
        class="flex-1 min-w-0"
        @update:mode="onModeChange('2', $event)"
        @update:selected-group-id="onGroupChange('2', $event)"
        @update:reorder-mode="reorderMode2 = $event"
        @update:visible-columns="onVisibleColumnsChange('2', $event)"
        @open-chart-settings="openChartConfig('2')"
        @open-scatter-settings="scatterConfigOpen = true"
        @open-group-config="groupConfigOpen = true"
        @reorder-field="(id, dir) => onReorderField('2', id, dir)"
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
      :available-fields="chartAvailableFields"
      @save="saveChartConfig"
    />
    <ScatterConfigDialog
      v-model="scatterConfigOpen"
      :scatter-preference="scatterPreference"
      :available-fields="availableFields"
      @save="saveScatterConfig"
    />
    <GroupConfigDialog
      v-model="groupConfigOpen"
      :groups="configuredGroups"
      :receive-frames="receiveFrames"
      :frame-reader="frameReader"
      @save="saveGroupConfig"
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
  padding: var(--rw-space-3) var(--rw-space-4);

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
  padding: var(--rw-space-2) var(--rw-space-4);
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
