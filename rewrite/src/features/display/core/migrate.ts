import type {
  ChartInstancePatch,
  ChartSelectedItem,
  DisplayPreferencesPatch,
  YAxisPreference,
  ChartPerformancePreference,
} from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLegacySelectedItem(item: unknown): ChartSelectedItem | null {
  if (typeof item !== 'string') {
    if (
      isRecord(item)
      && typeof item.groupId === 'string'
      && typeof item.frameId === 'string'
      && typeof item.fieldId === 'string'
    ) {
      return { groupId: item.groupId, frameId: item.frameId, fieldId: item.fieldId };
    }
    return null;
  }
  const parts = item.split(':');
  if (parts.length === 3) {
    return { groupId: parts[0]!, frameId: parts[1]!, fieldId: parts[2]! };
  }
  if (parts.length === 2) {
    return { groupId: parts[0]!, frameId: parts[0]!, fieldId: parts[1]! };
  }
  console.warn('[display] migration dropped malformed chart selected item:', item);
  return null;
}

function migrateChartInstance(raw: unknown): ChartInstancePatch | null {
  if (!isRecord(raw)) return null;
  const result: {
    title?: string;
    selectedItems?: readonly ChartSelectedItem[];
    yAxis?: Partial<YAxisPreference>;
    performance?: Partial<ChartPerformancePreference>;
  } = {};
  if (typeof raw.title === 'string') result.title = raw.title;
  if (isRecord(raw.yAxis)) result.yAxis = raw.yAxis as Partial<YAxisPreference>;
  if (isRecord(raw.performance)) result.performance = raw.performance as Partial<ChartPerformancePreference>;

  if (Array.isArray(raw.selectedItems)) {
    const migrated: ChartSelectedItem[] = [];
    for (const item of raw.selectedItems) {
      const parsed = parseLegacySelectedItem(item);
      if (parsed) migrated.push(parsed);
    }
    result.selectedItems = migrated;
  }
  return result;
}

export function migrateDisplayPreferencesFromV1(raw: unknown): DisplayPreferencesPatch {
  if (!isRecord(raw)) return {};

  const schemaVersion = raw.schemaVersion;
  const isV1 = schemaVersion === undefined || schemaVersion === 1;
  const chartsRaw = raw.charts;

  const result: {
    table1?: DisplayPreferencesPatch['table1'];
    table2?: DisplayPreferencesPatch['table2'];
    scatter?: DisplayPreferencesPatch['scatter'];
    refreshCadenceMs?: unknown;
    groups?: DisplayPreferencesPatch['groups'];
    charts?: readonly ChartInstancePatch[];
  } = {};
  if (isRecord(raw.table1)) result.table1 = raw.table1 as DisplayPreferencesPatch['table1'];
  if (isRecord(raw.table2)) result.table2 = raw.table2 as DisplayPreferencesPatch['table2'];
  if (isRecord(raw.scatter)) result.scatter = raw.scatter as DisplayPreferencesPatch['scatter'];
  if (typeof raw.refreshCadenceMs === 'number') result.refreshCadenceMs = raw.refreshCadenceMs;
  if (Array.isArray(raw.groups)) result.groups = raw.groups as DisplayPreferencesPatch['groups'];

  if (isV1 && Array.isArray(chartsRaw)) {
    try {
      const migratedCharts: ChartInstancePatch[] = [];
      for (const chart of chartsRaw) {
        const migrated = migrateChartInstance(chart);
        if (migrated) migratedCharts.push(migrated);
      }
      result.charts = migratedCharts;
    } catch (err) {
      console.error('[display] migration failed; returning empty chart patch to preserve other prefs:', err);
    }
  } else if (Array.isArray(chartsRaw)) {
    result.charts = chartsRaw.map((c) => migrateChartInstance(c)!).filter(Boolean);
  }

  return result as DisplayPreferencesPatch;
}
