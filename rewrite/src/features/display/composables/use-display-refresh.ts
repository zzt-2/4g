import { onUnmounted, readonly, shallowRef, watch, type Ref } from 'vue';
import type {
  ChartInstanceProjection,
  ChartPoint,
  ChartSeriesProjection,
  ChartSelectionFrameLookup,
  DisplayFieldMaterial,
  ScatterProjection,
  TableRowProjection,
  DisplaySourceAvailability,
  DisplayPreferences,
} from '../core';
import type { DisplayService } from '../services/display-service';

export interface DisplayRefreshState {
  readonly chartInstances: Readonly<Ref<ChartInstanceProjection[]>>;
  readonly chartSeries: Readonly<Ref<ChartSeriesProjection[]>>;
  readonly scatter: Readonly<Ref<ScatterProjection>>;
  readonly availability: Readonly<Ref<DisplaySourceAvailability>>;
  readonly preferences: Readonly<Ref<DisplayPreferences>>;
  getTable1Rows(): readonly TableRowProjection[];
  getTable2Rows(): readonly TableRowProjection[];
}

function chartItemKey(groupId: string, frameId: string, fieldId: string): string {
  return `${groupId}:${frameId}:${fieldId}`;
}

// Split `${frameId}:${fieldId}` dataItemId into parts. Returns empty frameId if format unexpected.
function splitDataItemId(dataItemId: string): { frameId: string; fieldId: string } {
  const sep = dataItemId.indexOf(':');
  if (sep <= 0) return { frameId: '', fieldId: dataItemId };
  return { frameId: dataItemId.slice(0, sep), fieldId: dataItemId.slice(sep + 1) };
}

// S010: 表格无独立刷新配置入口，固定节奏 500ms（用户拍板）。
// 顶层 refreshCadenceMs 不再驱动任何视图（弃用，底栏不再显示）。
const TABLE_CADENCE_MS = 500;
// 下限：节奏再小也不低于 1 帧，避免 cadence 被设成 0/负数导致死循环。
const MIN_CADENCE_MS = 16;

// S010 export 供单测：cadence 计算/钳制是纯函数，独立验证比驱动整个 rAF 更可靠。
export function clampCadence(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(value, MIN_CADENCE_MS) : TABLE_CADENCE_MS;
}

// 图表 cadence = 所有 chart.performance.refreshIntervalMs 的最小值。
// chartBuffer 是共享的，多图表必须统一节奏，否则不同 cadence 累积会错乱。
// 无图表或全部无效时回退表格节奏。
export function computeChartCadence(charts: readonly { performance: { refreshIntervalMs: number } }[]): number {
  if (charts.length === 0) return TABLE_CADENCE_MS;
  let min = Infinity;
  for (const c of charts) {
    const v = c.performance.refreshIntervalMs;
    if (Number.isFinite(v) && v > 0 && v < min) min = v;
  }
  return min === Infinity ? TABLE_CADENCE_MS : Math.max(min, MIN_CADENCE_MS);
}

export function useDisplayRefresh(
  service: DisplayService,
  frameReader: ChartSelectionFrameLookup,
): DisplayRefreshState & { start: () => void; stop: () => void } {
  // table1/table2 rows stored enriched (fieldName resolved from frameReader at refresh time).
  // Exposed only via getTable1Rows()/getTable2Rows() which return fresh deep copies (Selector immutability).
  const table1Rows = shallowRef<readonly TableRowProjection[]>([]);
  const table2Rows = shallowRef<readonly TableRowProjection[]>([]);
  const chartInstances = shallowRef<ChartInstanceProjection[]>([]);
  const chartSeries = shallowRef<ChartSeriesProjection[]>([]);
  const scatter = shallowRef<ScatterProjection>({ points: [], sampleCount: 0 });
  const availability = shallowRef<DisplaySourceAvailability>({ available: false });
  const preferences = shallowRef<DisplayPreferences>(service.getPreferences());

  // S010: 三视图各自独立节奏。
  // 散点 ← scatter.refreshIntervalMs（星座图弹窗）；图表 ← 各 chart.performance.refreshIntervalMs
  // 的最小值（chartBuffer 共享，必须统一节奏，否则不同 cadence 累积会错乱）；表格 ← 固定 500ms。
  // 三者互不影响。顶层 refreshCadenceMs 不再驱动任何视图（弃用）。
  const scatterCadence = shallowRef(clampCadence(preferences.value.scatter.refreshIntervalMs));
  const chartCadence = shallowRef(computeChartCadence(preferences.value.charts));
  const tableCadence = shallowRef(TABLE_CADENCE_MS);

  // Chart time-series accumulation buffer: compositeKey → points (fieldName resolved at projection time from frameReader)
  const chartBuffer = new Map<string, ChartPoint[]>();
  let lastSignature = '';

  let rafId = 0;
  // 各视图独立的"上次刷新时间"。cadence 变化时重置对应 lastTime，让新值立即生效（S010 reactive）。
  let lastScatterTime = 0;
  let lastChartTime = 0;
  let lastTableTime = 0;
  let disposed = false;

  // cadence 变化 → 重置对应 lastTime 为 0，下一帧 tick 立即按新节奏刷新（不等老间隔走完）。
  watch(scatterCadence, () => { lastScatterTime = 0; });
  watch(chartCadence, () => { lastChartTime = 0; });
  watch(tableCadence, () => { lastTableTime = 0; });

  // preferences 变了（用户保存配置）→ 更新 cadence（watch 会触发上面的 lastTime 重置）。
  watch(preferences, (prefs) => {
    scatterCadence.value = clampCadence(prefs.scatter.refreshIntervalMs);
    chartCadence.value = computeChartCadence(prefs.charts);
  });

  // Resolve fieldName for a single row via frameReader (R19: static metadata from config layer).
  // Falls back to '[Unknown Field]' when frame/field is not found, never returns raw fieldId (V5).
  function resolveFieldName(
    frameId: string,
    fieldId: string,
    cache: Map<string, string>,
  ): string {
    if (!frameId) return '[Unknown Field]';
    const cacheKey = `${frameId}:${fieldId}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const refs = frameReader.listFieldReferences({ frameId });
    const match = refs.find((r) => r.fieldId === fieldId);
    const resolved = match ? match.fieldName : '[Unknown Field]';
    if (!match) {
      console.warn('[display] table row fieldName resolved to placeholder: field not found in frameReader', { frameId, fieldId });
    }
    cache.set(cacheKey, resolved);
    return resolved;
  }

  // Enrich table rows with fieldName resolved from frameReader.
  // Returns a fresh array (callers can safely mutate; internal ref is unaffected).
  function enrichTableRows(rows: readonly TableRowProjection[]): TableRowProjection[] {
    const cache = new Map<string, string>();
    return rows.map((r) => {
      const { frameId, fieldId } = splitDataItemId(r.dataItemId);
      const fieldName = resolveFieldName(frameId, fieldId, cache);
      return { ...r, fieldName };
    });
  }

  function refreshTables(): void {
    table1Rows.value = enrichTableRows(service.getTable1Rows());
    table2Rows.value = enrichTableRows(service.getTable2Rows());
  }

  function refreshScatter(): void {
    scatter.value = service.getScatterProjection();
    availability.value = service.getAvailability();
  }

  function refreshCharts(sourceFields: readonly DisplayFieldMaterial[], prefs: DisplayPreferences): void {
    const charts = prefs.charts;

    // Signature covers chart selectedItems + groups; mismatch clears buffer (key space may have changed)
    const selectionSig = charts.map((c) =>
      `${c.id}|${c.selectedItems.map((s) => chartItemKey(s.groupId, s.frameId, s.fieldId)).join(',')}`,
    ).join('||');
    const groupsSig = prefs.groups.map((g) =>
      `${g.id}|${g.frames.map((f) => `${f.frameId}:${f.visibleFieldIds.join('.')}`).join(',')}`,
    ).join('||');
    const signature = `${selectionSig}##${groupsSig}`;
    if (signature !== lastSignature) {
      chartBuffer.clear();
      lastSignature = signature;
    }

    // valueMap: compositeKey → numeric value (runtime data only; static metadata resolved from frameReader)
    const valueMap = new Map<string, unknown>();
    for (const f of sourceFields) {
      valueMap.set(`${f.groupId}:${f.dataItemId}`, f.value);
    }

    // fieldName cache per refresh; sourced from frameReader (static metadata, R19)
    const fieldNameCache = new Map<string, string>();
    function getFieldName(frameId: string, fieldId: string): string {
      return resolveFieldName(frameId, fieldId, fieldNameCache);
    }

    // Collect global maxPoints across charts (shared buffer constraint)
    let maxPoints = 100;
    for (const chart of charts) {
      if (chart.performance.maxPoints > maxPoints) maxPoints = chart.performance.maxPoints;
    }

    // Append current numeric values to buffer (single pass over sourceFields matches selectedItems)
    const now = new Date().toISOString();
    for (const chart of charts) {
      for (const item of chart.selectedItems) {
        const key = chartItemKey(item.groupId, item.frameId, item.fieldId);
        const value = valueMap.get(key);
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        const points = chartBuffer.get(key) ?? [];
        points.push({ timestamp: now, value });
        if (points.length > maxPoints) points.splice(0, points.length - maxPoints);
        chartBuffer.set(key, points);
      }
    }

    // Build chart projections from buffer; fieldName always resolved from frameReader (no sourceFields fallback)
    const instances: ChartInstanceProjection[] = charts.map((chart) => ({
      id: chart.id,
      series: chart.selectedItems.map((item) => {
        const key = chartItemKey(item.groupId, item.frameId, item.fieldId);
        const points = chartBuffer.get(key) ?? [];
        return {
          fieldId: key,
          fieldName: getFieldName(item.frameId, item.fieldId),
          points: points.map((p) => ({ timestamp: p.timestamp, value: p.value })),
        };
      }),
    }));
    chartInstances.value = instances;
    chartSeries.value = instances.length > 0 ? [...instances[0]!.series.map((s) => ({ ...s, points: [...s.points] }))] : [];
  }

  function tick(now: number): void {
    if (disposed) return;
    if (now - lastTableTime >= tableCadence.value) {
      refreshTables();
      lastTableTime = now;
    }
    if (now - lastScatterTime >= scatterCadence.value) {
      refreshScatter();
      lastScatterTime = now;
    }
    if (now - lastChartTime >= chartCadence.value) {
      preferences.value = service.getPreferences();
      refreshCharts(service.getSourceFields(), preferences.value);
      lastChartTime = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  // 全量刷新：start() 首帧 + clearChartData() 用。一次拉取所有视图，保证首屏不空。
  function refreshAll(): void {
    preferences.value = service.getPreferences();
    table1Rows.value = enrichTableRows(service.getTable1Rows());
    table2Rows.value = enrichTableRows(service.getTable2Rows());
    scatter.value = service.getScatterProjection();
    availability.value = service.getAvailability();
    refreshCharts(service.getSourceFields(), preferences.value);
  }

  function start(): void {
    if (disposed) return;
    stop();
    const now = performance.now();
    lastTableTime = now;
    lastScatterTime = now;
    lastChartTime = now;
    refreshAll();
    rafId = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // 清空折线图已累积的数据点（chartBuffer），保留字段配置（selectedItems）。
  // 数据从零重新累积。供工具栏"清空折线图数据"按钮调用。
  function clearChartData(): void {
    chartBuffer.clear();
    preferences.value = service.getPreferences();
    refreshCharts(service.getSourceFields(), preferences.value);
  }

  onUnmounted(() => {
    disposed = true;
    stop();
  });

  return {
    chartInstances: readonly(chartInstances),
    chartSeries: readonly(chartSeries),
    scatter: readonly(scatter),
    availability: readonly(availability),
    preferences: readonly(preferences),
    getTable1Rows: () => table1Rows.value.map((r) => ({ ...r })),
    getTable2Rows: () => table2Rows.value.map((r) => ({ ...r })),
    start,
    stop,
    clearChartData,
  };
}
