import { cloneDisplaySnapshot } from './clone';
import { createDefaultDisplaySnapshot } from './defaults';
import {
  DISPLAY_SCHEMA_VERSION,
  type DisplayNormalizationResult,
  type DisplayPreferences,
  type DisplayPreferencesPatch,
  type DisplaySnapshot,
  type DisplayValidationIssue,
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

function normalizeChartPreference(
  raw: unknown,
  fallback: DisplayPreferences['chart'],
  issues: DisplayValidationIssue[],
): DisplayPreferences['chart'] {
  if (!isRecord(raw)) {
    return { selectedItems: [...fallback.selectedItems], performance: { ...fallback.performance } };
  }

  const perfRaw = isRecord(raw.performance) ? raw.performance : {};
  return {
    selectedItems: stringArrayValue(raw.selectedItems, 'chart.selectedItems', issues),
    performance: {
      maxPoints: positiveNumberValue(perfRaw.maxPoints, fallback.performance.maxPoints, 'chart.performance.maxPoints', 'display.chart.maxPointsInvalid', issues),
      refreshIntervalMs: positiveNumberValue(perfRaw.refreshIntervalMs, fallback.performance.refreshIntervalMs, 'chart.performance.refreshIntervalMs', 'display.chart.refreshIntervalInvalid', issues),
    },
  };
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
    chart: normalizeChartPreference(value.chart, defaults.chart, issues),
    scatter: normalizeScatterPreference(value.scatter, defaults.scatter, issues),
    refreshCadenceMs: positiveNumberValue(value.refreshCadenceMs, defaults.refreshCadenceMs, 'refreshCadenceMs', 'display.refreshCadenceInvalid', issues),
  };

  const snapshot: DisplaySnapshot = {
    schemaVersion: DISPLAY_SCHEMA_VERSION,
    preferences,
    projection: cloneDisplaySnapshot(fallback).projection,
    availability: { ...fallback.availability },
  };

  return { ...toDisplayValidationResult(issues), snapshot };
}

export function applyDisplayPreferencesPatch(
  current: DisplaySnapshot,
  patch: DisplayPreferencesPatch,
): DisplayNormalizationResult {
  const merged: UnknownRecord = {
    ...cloneDisplaySnapshot(current).preferences,
  };

  if (patch.table1) merged.table1 = { ...merged.table1 as UnknownRecord, ...patch.table1 };
  if (patch.table2) merged.table2 = { ...merged.table2 as UnknownRecord, ...patch.table2 };
  if (patch.chart) {
    const chartMerged = { ...(merged.chart as UnknownRecord) };
    if (patch.chart.performance) {
      chartMerged.performance = { ...(chartMerged.performance as UnknownRecord), ...patch.chart.performance };
    }
    if (patch.chart.selectedItems) {
      chartMerged.selectedItems = patch.chart.selectedItems;
    }
    merged.chart = chartMerged;
  }
  if (patch.scatter) {
    const scatterMerged = { ...(merged.scatter as UnknownRecord) };
    if (patch.scatter.iSource) scatterMerged.iSource = { ...(scatterMerged.iSource as UnknownRecord), ...patch.scatter.iSource };
    if (patch.scatter.qSource) scatterMerged.qSource = { ...(scatterMerged.qSource as UnknownRecord), ...patch.scatter.qSource };
    merged.scatter = scatterMerged;
  }
  if (patch.refreshCadenceMs !== undefined) merged.refreshCadenceMs = patch.refreshCadenceMs;

  return normalizeDisplayPreferencesInput(merged, current);
}
