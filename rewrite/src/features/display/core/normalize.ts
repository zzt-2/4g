import { cloneDisplaySnapshot, cloneDisplayPreferences, cloneDisplayProjection } from './clone';
import { createDefaultDisplaySnapshot, DEFAULT_CHART_INSTANCE } from './defaults';
import {
  DISPLAY_SCHEMA_VERSION,
  type ChartInstancePreference,
  type DisplayNormalizationResult,
  type DisplayPreferences,
  type DisplayPreferencesPatch,
  type DisplaySnapshot,
  type DisplayValidationIssue,
  type YAxisPreference,
} from './types';
import { createDisplayIssue, toDisplayValidationResult } from './validation';

const DISPLAY_MODES = new Set(['table', 'chart', 'special']);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayModeValue(
  value: unknown,
  fallback: string,
  path: string,
  issues: DisplayValidationIssue[],
): string {
  if (typeof value === 'string' && DISPLAY_MODES.has(value)) {
    return value;
  }
  if (value !== undefined) {
    issues.push(
      createDisplayIssue(
        'display.preference.displayModeInvalid',
        path,
        `Invalid display mode defaulted to "${fallback}".`,
      ),
    );
  }
  return fallback;
}

function stringArrayValue(
  value: unknown,
  path: string,
  issues: DisplayValidationIssue[],
): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return [...value];
  }
  if (value !== undefined) {
    issues.push(
      createDisplayIssue(
        'display.preference.selectedItemsInvalid',
        path,
        'Invalid selected items defaulted to empty.',
      ),
    );
  }
  return [];
}

function positiveNumberValue(
  value: unknown,
  fallback: number,
  path: string,
  code: string,
  issues: DisplayValidationIssue[],
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (value !== undefined) {
    issues.push(createDisplayIssue(code, path, `Invalid value defaulted to ${fallback}.`));
  }
  return fallback;
}

function normalizeTablePreference(
  raw: unknown,
  fallback: DisplayPreferences['table1'],
  prefix: string,
  issues: DisplayValidationIssue[],
): DisplayPreferences['table1'] {
  if (!isRecord(raw)) {
    return { ...fallback, selectedItems: [...fallback.selectedItems] };
  }

  return {
    displayMode: displayModeValue(raw.displayMode, fallback.displayMode, `${prefix}.displayMode`, issues) as DisplayPreferences['table1']['displayMode'],
    selectedGroupId: typeof raw.selectedGroupId === 'string' ? raw.selectedGroupId : fallback.selectedGroupId,
    selectedItems: stringArrayValue(raw.selectedItems, `${prefix}.selectedItems`, issues),
  };
}

function normalizeYAxis(raw: unknown, fallback: YAxisPreference): YAxisPreference {
  if (!isRecord(raw)) return { ...fallback };
  const y = raw as UnknownRecord;
  return {
    autoScale: typeof y.autoScale === 'boolean' ? y.autoScale : fallback.autoScale,
    min: typeof y.min === 'number' ? y.min : fallback.min,
    max: typeof y.max === 'number' ? y.max : fallback.max,
  };
}

function normalizeChartInstance(
  raw: unknown,
  fallback: ChartInstancePreference,
  issues: DisplayValidationIssue[],
): ChartInstancePreference {
  if (!isRecord(raw)) {
    return {
      id: fallback.id,
      title: fallback.title,
      selectedItems: [...fallback.selectedItems],
      yAxis: { ...fallback.yAxis },
      performance: { ...fallback.performance },
    };
  }

  const perfRaw = isRecord(raw.performance) ? raw.performance : {};
  const path = `charts[${raw.id ?? fallback.id}]`;
  return {
    id: typeof raw.id === 'string' ? raw.id : fallback.id,
    title: typeof raw.title === 'string' ? raw.title : fallback.title,
    selectedItems: stringArrayValue(raw.selectedItems, `${path}.selectedItems`, issues),
    yAxis: normalizeYAxis(raw.yAxis, fallback.yAxis),
    performance: {
      maxPoints: positiveNumberValue(perfRaw.maxPoints, fallback.performance.maxPoints, `${path}.performance.maxPoints`, 'display.chart.maxPointsInvalid', issues),
      refreshIntervalMs: positiveNumberValue(perfRaw.refreshIntervalMs, fallback.performance.refreshIntervalMs, `${path}.performance.refreshIntervalMs`, 'display.chart.refreshIntervalInvalid', issues),
    },
  };
}

function normalizeCharts(
  raw: unknown,
  fallbacks: readonly ChartInstancePreference[],
  issues: DisplayValidationIssue[],
): ChartInstancePreference[] {
  const safeFallbacks = fallbacks.length > 0 ? fallbacks : [DEFAULT_CHART_INSTANCE];

  if (!Array.isArray(raw)) {
    return safeFallbacks.map((f) => ({
      id: f.id,
      title: f.title,
      selectedItems: [...f.selectedItems],
      yAxis: { ...f.yAxis },
      performance: { ...f.performance },
    }));
  }

  if (raw.length > 4) {
    issues.push(createDisplayIssue(
      'display.chart.countExceeded',
      'charts',
      `Chart count ${raw.length} exceeds maximum 4; excess entries truncated.`,
    ));
  }

  const maxCount = Math.min(raw.length, 4);
  const result: ChartInstancePreference[] = [];
  for (let i = 0; i < maxCount; i++) {
    const base = safeFallbacks[i] ?? safeFallbacks[0];
    // New charts beyond existing count start with empty selectedItems
    const isNew = i >= safeFallbacks.length;
    const fallback: ChartInstancePreference = {
      ...base,
      id: `chart-${i + 1}`,
      title: `图表${i + 1}`,
      ...(isNew ? { selectedItems: [] } : {}),
    };
    result.push(normalizeChartInstance(raw[i], fallback, issues));
  }
  return result.length > 0 ? result : [normalizeChartInstance(undefined, safeFallbacks[0], issues)];
}

function normalizeScatterBinding(
  raw: unknown,
  fallback: { groupId: string; dataItemId: string },
): { groupId: string; dataItemId: string } {
  if (!isRecord(raw)) return { ...fallback };
  return {
    groupId: typeof raw.groupId === 'string' ? raw.groupId : fallback.groupId,
    dataItemId: typeof raw.dataItemId === 'string' ? raw.dataItemId : fallback.dataItemId,
  };
}

function normalizeScatterPreference(
  raw: unknown,
  fallback: DisplayPreferences['scatter'],
  issues: DisplayValidationIssue[],
): DisplayPreferences['scatter'] {
  if (!isRecord(raw)) {
    return {
      iSource: { ...fallback.iSource },
      qSource: { ...fallback.qSource },
      sampleCount: fallback.sampleCount,
      bitWidth: fallback.bitWidth,
      refreshIntervalMs: fallback.refreshIntervalMs,
    };
  }

  return {
    iSource: normalizeScatterBinding(raw.iSource, fallback.iSource),
    qSource: normalizeScatterBinding(raw.qSource, fallback.qSource),
    sampleCount: positiveNumberValue(raw.sampleCount, fallback.sampleCount, 'scatter.sampleCount', 'display.scatter.sampleCountInvalid', issues),
    bitWidth: positiveNumberValue(raw.bitWidth, fallback.bitWidth, 'scatter.bitWidth', 'display.scatter.bitWidthInvalid', issues),
    refreshIntervalMs: positiveNumberValue(raw.refreshIntervalMs, fallback.refreshIntervalMs, 'scatter.refreshIntervalMs', 'display.scatter.refreshIntervalInvalid', issues),
  };
}

export function normalizeDisplayPreferencesInput(
  value: unknown,
  fallback: DisplaySnapshot = createDefaultDisplaySnapshot(),
): DisplayNormalizationResult {
  const issues: DisplayValidationIssue[] = [];
  const defaults = fallback.preferences;

  if (value === undefined || value === null) {
    return {
      ...toDisplayValidationResult(issues),
      snapshot: cloneDisplaySnapshot(fallback),
    };
  }

  if (!isRecord(value)) {
    issues.push(createDisplayIssue('display.inputInvalid', 'preferences', 'Display preferences input defaulted.', 'error'));
    return {
      ...toDisplayValidationResult(issues),
      snapshot: cloneDisplaySnapshot(fallback),
    };
  }

  const preferences: DisplayPreferences = {
    table1: normalizeTablePreference(value.table1, defaults.table1, 'table1', issues),
    table2: normalizeTablePreference(value.table2, defaults.table2, 'table2', issues),
    charts: normalizeCharts(value.charts, defaults.charts, issues),
    scatter: normalizeScatterPreference(value.scatter, defaults.scatter, issues),
    refreshCadenceMs: positiveNumberValue(value.refreshCadenceMs, defaults.refreshCadenceMs, 'refreshCadenceMs', 'display.refreshCadenceInvalid', issues),
  };

  const snapshot: DisplaySnapshot = {
    schemaVersion: DISPLAY_SCHEMA_VERSION,
    preferences,
    projection: cloneDisplayProjection(fallback.projection),
    availability: { ...fallback.availability },
  };

  return { ...toDisplayValidationResult(issues), snapshot };
}

export function applyDisplayPreferencesPatch(
  current: DisplaySnapshot,
  patch: DisplayPreferencesPatch,
): DisplayNormalizationResult {
  const currentPrefs = cloneDisplayPreferences(current.preferences);

  const table1 = patch.table1 ? { ...currentPrefs.table1, ...patch.table1 } as DisplayPreferences['table1'] : currentPrefs.table1;
  const table2 = patch.table2 ? { ...currentPrefs.table2, ...patch.table2 } as DisplayPreferences['table2'] : currentPrefs.table2;

  let charts = currentPrefs.charts;
  if (patch.charts) {
    charts = currentPrefs.charts.map((existing, i) => {
      const p = patch.charts![i];
      if (!p) return existing;
      return {
        id: existing.id,
        title: p.title ?? existing.title,
        selectedItems: p.selectedItems ? [...p.selectedItems] : existing.selectedItems,
        yAxis: p.yAxis ? { ...existing.yAxis, ...p.yAxis } : existing.yAxis,
        performance: p.performance ? { ...existing.performance, ...p.performance } : existing.performance,
      };
    });
  }

  let scatter = currentPrefs.scatter;
  if (patch.scatter) {
    scatter = {
      ...scatter,
      ...(patch.scatter.iSource ? { iSource: { ...scatter.iSource, ...patch.scatter.iSource } } : {}),
      ...(patch.scatter.qSource ? { qSource: { ...scatter.qSource, ...patch.scatter.qSource } } : {}),
    };
  }

  const refreshCadenceMs = patch.refreshCadenceMs !== undefined
    ? (typeof patch.refreshCadenceMs === 'number' ? patch.refreshCadenceMs : currentPrefs.refreshCadenceMs)
    : currentPrefs.refreshCadenceMs;

  const merged: DisplayPreferences = {
    table1,
    table2,
    charts,
    scatter,
    refreshCadenceMs,
  };

  return normalizeDisplayPreferencesInput(merged, current);
}
