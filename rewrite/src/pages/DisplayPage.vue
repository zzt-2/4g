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
  ChartSelectedItem,
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

const receiveFrames = computed(() => frameService.listFrames({ direction: 'receive' }));

// 分组下拉列表：用户手动建的分组 + emergent 分组。
// emergent 分组按帧定义生成（不依赖是否收到数据）：每个没被归入任何手动分组的接收帧，
// 各自作为一个 emergent 分组项（value=frameId, label=帧名）。
// 修复"emergent 分组靠扫表格行算出 → 没收到数据就没分组 / 行抖动时分组列表也抖"。
// 设计文档 line 100 原定 emergent 靠运行时数据，此处改为立足于帧定义（R19 精神：静态优先）。
const groups = computed((): GroupOption[] => {
  const configured = configuredGroups.value;
  // 已被手动分组引用的 frameId，不再作为 emergent 重复出现
  const assignedFrameIds = new Set<string>();
  for (const g of configured) {
    for (const entry of g.frames) assignedFrameIds.add(entry.frameId);
  }
  const options: GroupOption[] = configured.map((g) => ({ value: g.id, label: g.label }));
  for (const frame of receiveFrames.value) {
    if (assignedFrameIds.has(frame.id)) continue;
    options.push({ value: frame.id, label: frame.name });
  }
  return options;
});

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

// R19: fieldName enrichment lives inside displayRefresh.getTable{1,2}Rows() (design 5.5).
// Page MUST NOT enrich fieldName from frameReader directly — single source of truth in composable.

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

// 解析某分组下可选的字段列表（供图表配置 + 换分组自动选首帧复用）。
// groupId='' → 全部分组（手动分组按配置 + 未分组帧全部字段）；
// groupId=手动分组 id → 该分组配置的帧（按 visibleFieldIds 过滤）；
// groupId=frameId（emergent 分组，不在 configuredGroups）→ 该帧全部字段。
interface AvailableField {
  readonly groupId: string;
  readonly frameId: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly frameName: string;
}
function resolveFieldsForGroup(groupId: string): AvailableField[] {
  const result: AvailableField[] = [];
  const covered = new Set<string>();
  function push(gId: string, frameId: string, fieldId: string, fieldName: string, frameName: string): void {
    const key = `${gId}:${frameId}:${fieldId}`;
    if (covered.has(key)) return;
    covered.add(key);
    result.push({ groupId: gId, frameId, fieldId, fieldName, frameName });
  }

  if (groupId) {
    const group = configuredGroups.value.find((g) => g.id === groupId);
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
    // emergent 分组（value=frameId，不在 configuredGroups）：该帧全部字段
    const emergentFields = frameReader.listFieldReferences({ frameId: groupId });
    for (const f of emergentFields) {
      push(groupId, f.frameId, f.fieldId, f.fieldName, f.frameName);
    }
    return result;
  }

  // 全部分组：手动分组按配置 + 未分组帧全部字段
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
}

const chartAvailableFields = computed(() => {
  const panelKey = chartConfigPanel.value === '1' ? 'table1' : 'table2';
  return resolveFieldsForGroup(prefs.value[panelKey].selectedGroupId);
});

// 换分组后图表配置自动选中当前分组的第一个帧的全部字段（而非清空）。
// 用户切分组后图表立即有内容，不用手动点开配置选字段。
function pickFirstFrameItems(groupId: string): ChartSelectedItem[] {
  const fields = resolveFieldsForGroup(groupId);
  if (fields.length === 0) return [];
  const firstFrameId = fields[0]!.frameId;
  return fields
    .filter((f) => f.frameId === firstFrameId)
    .map((f) => ({ groupId: f.groupId, frameId: f.frameId, fieldId: f.fieldId }));
}

const mode1 = computed(() => prefs.value.table1.displayMode);
const mode2 = computed(() => prefs.value.table2.displayMode);
const chart1 = computed(() => displayRefresh.chartInstances.value[0] ?? null);
const chart2 = computed(() => displayRefresh.chartInstances.value[1] ?? null);

function buildPlaceholderRows(selectedGroupId: string): TableRowProjection[] {
  if (selectedGroupId) {
    const group = configuredGroups.value.find((g) => g.id === selectedGroupId);
    if (group) {
      // 用户手动建的分组：按 frames + visibleFieldIds 过滤
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
    // emergent 分组（value=frameId，不在 configuredGroups 里）：
    // 当作单个未分组帧兜底，显示该帧全部字段。修复"选中 emergent 分组后
    // placeholder 返回空 → buffer 覆盖瞬间整表闪'暂无字段数据'"的鬼畜。
    // 若该 id 连帧都不是，才返回空（真正的无定义状态）。
    const emergentFields = frameReader.listFieldReferences({ frameId: selectedGroupId });
    return emergentFields.map((f) => ({
      groupId: selectedGroupId,
      dataItemId: `${f.frameId}:${f.fieldId}`,
      fieldName: f.fieldName,
      value: null,
      displayValue: '-',
    }));
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
  const live = displayRefresh.getTable1Rows();
  const placeholders = buildPlaceholderRows(prefs.value.table1.selectedGroupId);
  if (placeholders.length === 0) return live;
  const liveIds = new Set(live.map((r) => r.dataItemId));
  return [...live, ...placeholders.filter((p) => !liveIds.has(p.dataItemId))];
});

const panel2Rows = computed(() => {
  const live = displayRefresh.getTable2Rows();
  const placeholders = buildPlaceholderRows(prefs.value.table2.selectedGroupId);
  if (placeholders.length === 0) return live;
  const liveIds = new Set(live.map((r) => r.dataItemId));
  return [...live, ...placeholders.filter((p) => !liveIds.has(p.dataItemId))];
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
  // 切分组后图表配置自动选中当前分组的第一个帧全部字段（而非清空），
  // 用户切分组后图表立即有内容。selectedItems 变化也会触发 chartBuffer 自动清空旧数据。
  const chartId = panel === '1' ? 'chart-1' : 'chart-2';
  displayService.updateChartConfig(chartId, { selectedItems: pickFirstFrameItems(groupId) });
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
    const rows = displayRefresh.getTable1Rows();
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
  // DisplayPage 是双面板 UI（panel1 对应 chart-1，panel2 对应 chart-2），但 display preferences
  // 默认只 1 个 chart 实例。挂载时确保至少 2 个，否则右面板图表永远读不到 chart-2 → "未选择字段"。
  // updateChartCount(2) 在已有 ≥2 个时保留原状（currentCharts[i] ?? default），多次挂载安全。
  if (prefs.value.charts.length < 2) {
    displayService.updateChartCount(2);
  }
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
        @clear-chart-data="displayRefresh.clearChartData()"
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
        @clear-chart-data="displayRefresh.clearChartData()"
      />
    </div>

    <!-- Bottom bar: recording controls + 统计指标（同一行） -->
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

      <div class="display-page__bottom-stats flex items-center">
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

        <span class="display-page__bottom-divider" />

        <span class="rw-text-desc">刷新: {{ prefs.refreshCadenceMs }}ms</span>
        <StatusBadge :status="lifecycle" :status-map="receiveLifecycleMap" />
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

.display-page__stat-item {
  display: inline-flex;
  align-items: baseline;
  gap: var(--rw-space-2);
  // 固定槽位宽度：数字增长先吃掉槽位右侧留白，到 min-width 上限才推挤相邻项。
  // 容纳 label(≤3字) + 预期最大数字(约 7 位 body 字号)，取整 104px。
  min-width: 104px;
  white-space: nowrap;

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

// 录制控件区与统计指标区的竖向分隔线
.display-page__bottom-divider {
  width: 1px;
  align-self: stretch;
  background: var(--rw-color-border-subtle);
}

// 底栏右侧统计指标组：stat 之间大间距（固定 24px > space-6），
// 配合每个 stat-item min-width，数字增长不挤走相邻项。
.display-page__bottom-stats {
  gap: 24px;
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
