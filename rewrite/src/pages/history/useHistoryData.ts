import { computed, ref, shallowRef, type Ref } from 'vue';
import type {
  ChartInstanceProjection,
  ChartSeriesProjection,
  ChartPoint,
  ChartSelectedItem,
  ChartSelectionFrameLookup,
  DisplayService,
} from '@/features/display';
import type {
  StorageLocalService,
  StorageLocalRecord,
  StorageHourSummary,
} from '@/features/storage-local-baseline';

// --- Hierarchy types ---

export interface DataItemInfo {
  readonly fieldId: string;
  readonly key: string;
  readonly dataType: 'numeric' | 'other';
}

export interface DataItemGroup {
  readonly groupId: string;
  readonly label: string;
  readonly items: readonly DataItemInfo[];
}

// --- Statistics types ---

export interface SeriesStatistics {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly mean: number;
  readonly rmse: number;
  readonly count: number;
}

export interface ChartStatistics {
  readonly chartId: string;
  readonly series: readonly SeriesStatistics[];
}

// --- Time range ---

export interface TimeRange {
  readonly start: Date;
  readonly end: Date;
}

export function getDefaultTimeRange(): TimeRange {
  const end = new Date();
  const start = new Date(end.getTime() - 3600_000);
  return { start, end };
}

// --- Hierarchy extraction ---

export function extractItemHierarchy(records: readonly StorageLocalRecord[]): DataItemGroup[] {
  const groupMap = new Map<string, Map<string, DataItemInfo>>();

  for (const record of records) {
    if (!groupMap.has(record.channel)) {
      groupMap.set(record.channel, new Map());
    }
    const items = groupMap.get(record.channel)!;
    for (const field of record.fields) {
      if (!items.has(field.key)) {
        items.set(field.key, {
          fieldId: `${record.channel}:${field.key}`,
          key: field.key,
          dataType: typeof field.value === 'number' ? 'numeric' : 'other',
        });
      }
    }
  }

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupId, items]) => ({
      groupId,
      label: groupId,
      items: Array.from(items.values()),
    }));
}

// --- Storage → ChartSeriesProjection bridge ---

function buildSeriesWithPoints(
  selectedItems: readonly ChartSelectedItem[],
  records: readonly StorageLocalRecord[],
  frameReader: ChartSelectionFrameLookup,
): ChartSeriesProjection[] {
  const fieldNameCache = new Map<string, string>();
  function getFieldName(frameId: string, fieldId: string): string {
    const cacheKey = `${frameId}:${fieldId}`;
    const cached = fieldNameCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const refs = frameReader.listFieldReferences({ frameId });
    const match = refs.find((r) => r.fieldId === fieldId);
    const resolved = match ? match.fieldName : '[Unknown Field]';
    if (!match) {
      // Align with display composable (R19/V5): never leak raw fieldId/UUID to the UI.
      console.warn('[history] chart series fieldName resolved to placeholder: field not found in frameReader', { frameId, fieldId });
    }
    fieldNameCache.set(cacheKey, resolved);
    return resolved;
  }

  const sortedRecords = [...records].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );

  // history record.fields.key format: `${groupId}:${frameId}:${fieldId}:${fieldName}` (set at recording time)
  return selectedItems.map((item) => {
    const fieldName = getFieldName(item.frameId, item.fieldId);
    const recordKey = `${item.groupId}:${item.frameId}:${item.fieldId}:${fieldName}`;
    const points: ChartPoint[] = [];
    for (const record of sortedRecords) {
      for (const field of record.fields) {
        if (field.key !== recordKey) continue;
        if (typeof field.value === 'number') {
          points.push({ timestamp: record.capturedAt, value: field.value });
        }
      }
    }
    return {
      fieldId: `${item.groupId}:${item.frameId}:${item.fieldId}`,
      fieldName,
      points,
    };
  });
}

// --- Statistics computation ---

export function computeSeriesStats(points: readonly ChartPoint[]): { mean: number; rmse: number } {
  if (points.length === 0) return { mean: 0, rmse: 0 };

  const values = points.map((p) => p.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const mse = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, rmse: Math.sqrt(mse) };
}

// --- Composable ---

export interface HistoryDataState {
  readonly hourSummaries: Readonly<Ref<readonly StorageHourSummary[]>>;
  readonly itemHierarchy: Readonly<Ref<readonly DataItemGroup[]>>;
  readonly enrichedCharts: Readonly<Ref<readonly ChartInstanceProjection[]>>;
  readonly chartStats: Readonly<Ref<readonly ChartStatistics[]>>;
  readonly recordCount: Readonly<Ref<number>>;
  readonly timeRange: Ref<TimeRange>;
  readonly selectedGlobalItems: Ref<Set<string>>;
  readonly loading: Readonly<Ref<boolean>>;
}

export function useHistoryData(
  storageService: StorageLocalService,
  displayService: DisplayService,
  frameReader: ChartSelectionFrameLookup,
): HistoryDataState & {
  loadData(): Promise<void>;
  refreshCharts(): void;
} {
  // ===== Business data =====
  const records = shallowRef<StorageLocalRecord[]>([]);
  const hourSummaries = shallowRef<StorageHourSummary[]>([]);
  const itemHierarchy = shallowRef<DataItemGroup[]>([]);
  const enrichedCharts = shallowRef<ChartInstanceProjection[]>([]);
  const chartStats = shallowRef<ChartStatistics[]>([]);

  // ===== Query/Filter =====
  const timeRange = ref<TimeRange>(getDefaultTimeRange());
  const selectedGlobalItems = ref<Set<string>>(new Set());

  // ===== UI state =====
  const loading = ref(false);

  // ===== Derived =====
  const recordCount = computed(() => records.value.length);

  function refreshCharts(): void {
    const prefs = displayService.getPreferences();
    const from = timeRange.value.start.toISOString();
    const to = timeRange.value.end.toISOString();

    const filteredRecords = storageService.listLocalRecords({ from, to });

    const charts: ChartInstanceProjection[] = prefs.charts.map((chart) => ({
      id: chart.id,
      series: buildSeriesWithPoints(chart.selectedItems, filteredRecords, frameReader),
    }));
    enrichedCharts.value = charts;

    chartStats.value = charts.map((chart) => ({
      chartId: chart.id,
      series: chart.series.map((s) => {
        const { mean, rmse } = computeSeriesStats(s.points);
        return { fieldId: s.fieldId, fieldName: s.fieldName, mean, rmse, count: s.points.length };
      }),
    }));
  }

  async function loadData(): Promise<void> {
    loading.value = true;
    try {
      const allHours = storageService.listHistoryHours();
      const fromMs = timeRange.value.start.getTime();
      const toMs = timeRange.value.end.getTime();

      const inRange = allHours.filter((h) => {
        const hourMs = Date.parse(h.hourKey.replace('T', ' ') + ':00:00');
        return hourMs >= fromMs && hourMs <= toMs;
      });

      hourSummaries.value = inRange;

      if (inRange.length > 0) {
        const hourKeys = inRange.map((h) => h.hourKey);
        const result = await storageService.loadHistoryMaterials(hourKeys);
        if (!result.ok) {
          console.error('[useHistoryData] loadHistoryMaterials failed:', result.validation.issues);
          return;
        }
      }

      const allRecords = storageService.listLocalRecords();
      records.value = allRecords;
      itemHierarchy.value = extractItemHierarchy(allRecords);

      refreshCharts();
    } catch (err) {
      console.error('[useHistoryData] loadData error:', err);
    } finally {
      loading.value = false;
    }
  }

  return {
    hourSummaries,
    itemHierarchy,
    enrichedCharts,
    chartStats,
    recordCount,
    timeRange,
    selectedGlobalItems,
    loading,
    loadData,
    refreshCharts,
  };
}
