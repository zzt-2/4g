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
  readonly table1Rows: Readonly<Ref<TableRowProjection[]>>;
  readonly table2Rows: Readonly<Ref<TableRowProjection[]>>;
  readonly chartInstances: Readonly<Ref<ChartInstanceProjection[]>>;
  readonly chartSeries: Readonly<Ref<ChartSeriesProjection[]>>;
  readonly scatter: Readonly<Ref<ScatterProjection>>;
  readonly availability: Readonly<Ref<DisplaySourceAvailability>>;
  readonly preferences: Readonly<Ref<DisplayPreferences>>;
}

function chartItemKey(groupId: string, frameId: string, fieldId: string): string {
  return `${groupId}:${frameId}:${fieldId}`;
}

export function useDisplayRefresh(
  service: DisplayService,
  frameReader: ChartSelectionFrameLookup,
  cadenceMs = 200,
): DisplayRefreshState & { start: () => void; stop: () => void } {
  const table1Rows = shallowRef<TableRowProjection[]>([]);
  const table2Rows = shallowRef<TableRowProjection[]>([]);
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

  function refresh(): void {
    table1Rows.value = service.getTable1Rows();
    table2Rows.value = service.getTable2Rows();
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
    // If frameReader doesn't have the field, return placeholder '[Unknown Field]' (V5/R19: never show raw fieldId/UUID).
    const fieldNameCache = new Map<string, string>();
    function getFieldName(frameId: string, fieldId: string): string {
      const cacheKey = `${frameId}:${fieldId}`;
      const cached = fieldNameCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const refs = frameReader.listFieldReferences({ frameId });
      const match = refs.find((r) => r.fieldId === fieldId);
      const resolved = match ? match.fieldName : '[Unknown Field]';
      if (!match) {
        console.warn('[display] chart selected item resolved to placeholder: field not found in frameReader', { frameId, fieldId });
      }
      fieldNameCache.set(cacheKey, resolved);
      return resolved;
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

  onUnmounted(() => {
    disposed = true;
    stop();
  });

  return {
    table1Rows: readonly(table1Rows),
    table2Rows: readonly(table2Rows),
    chartInstances: readonly(chartInstances),
    chartSeries: readonly(chartSeries),
    scatter: readonly(scatter),
    availability: readonly(availability),
    preferences: readonly(preferences),
    start,
    stop,
  };
}
