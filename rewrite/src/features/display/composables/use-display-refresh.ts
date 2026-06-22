import { onUnmounted, readonly, shallowRef, type Ref } from 'vue';
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

export function useDisplayRefresh(
  service: DisplayService,
  frameReader: ChartSelectionFrameLookup,
  cadenceMs = 200,
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

  // Chart time-series accumulation buffer: compositeKey → points (fieldName resolved at projection time from frameReader)
  const chartBuffer = new Map<string, ChartPoint[]>();
  let lastSignature = '';

  let rafId = 0;
  let lastTime = 0;
  let disposed = false;

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

  function refresh(): void {
    table1Rows.value = enrichTableRows(service.getTable1Rows());
    table2Rows.value = enrichTableRows(service.getTable2Rows());
    scatter.value = service.getScatterProjection();
    availability.value = service.getAvailability();
    preferences.value = service.getPreferences();

    refreshCharts(service.getSourceFields(), preferences.value);
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
    if (now - lastTime >= cadenceMs) {
      refresh();
      lastTime = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  function start(): void {
    if (disposed) return;
    stop();
    lastTime = performance.now();
    refresh();
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
    refresh();
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
