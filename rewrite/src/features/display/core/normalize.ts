import { cloneDisplaySnapshot, cloneDisplayPreferences, cloneDisplayProjection } from './clone';
import { createDefaultDisplaySnapshot, DEFAULT_CHART_INSTANCE } from './defaults';
import {
  DISPLAY_SCHEMA_VERSION,
  type ChartInstancePreference,
  type ChartSelectedItem,
  type DisplayGroupConfig,
  type DisplayGroupFrameEntry,
  type DisplayNormalizationResult,
  type DisplayPreferences,
  type DisplayPreferencesPatch,
  type DisplaySnapshot,
  type DisplayValidationIssue,
  type YAxisPreference,
} from './types';
import type { RecordingConfig } from '@/features/recording/core/types';
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

function chartSelectedItemsValue(
  value: unknown,
  path: string,
  issues: DisplayValidationIssue[],
): ChartSelectedItem[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) {
      issues.push(
        createDisplayIssue(
          'display.preference.selectedItemsInvalid',
          path,
          'Invalid chart selected items defaulted to empty.',
        ),
      );
    }
    return [];
  }
  const result: ChartSelectedItem[] = [];
  for (const item of value) {
    if (
      item !== null
      && typeof item === 'object'
      && typeof (item as Record<string, unknown>).groupId === 'string'
      && typeof (item as Record<string, unknown>).frameId === 'string'
      && typeof (item as Record<string, unknown>).fieldId === 'string'
    ) {
      const v = item as { groupId: string; frameId: string; fieldId: string };
      result.push({ groupId: v.groupId, frameId: v.frameId, fieldId: v.fieldId });
    } else {
      issues.push(
        createDisplayIssue(
          'display.preference.chartSelectedItemInvalid',
          path,
          'Invalid chart selected item dropped.',
        ),
      );
    }
  }
  return result;
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

  const visibleColumns = stringArrayValue(raw.visibleColumns, `${prefix}.visibleColumns`, issues);

  return {
    displayMode: displayModeValue(raw.displayMode, fallback.displayMode, `${prefix}.displayMode`, issues) as DisplayPreferences['table1']['displayMode'],
    selectedGroupId: typeof raw.selectedGroupId === 'string' ? raw.selectedGroupId : fallback.selectedGroupId,
    selectedItems: stringArrayValue(raw.selectedItems, `${prefix}.selectedItems`, issues),
    ...(visibleColumns.length > 0 ? { visibleColumns } : {}),
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

function cloneChartSelectedItems(items: readonly ChartSelectedItem[]): ChartSelectedItem[] {
  return items.map((it) => ({ groupId: it.groupId, frameId: it.frameId, fieldId: it.fieldId }));
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
      selectedItems: cloneChartSelectedItems(fallback.selectedItems),
      yAxis: { ...fallback.yAxis },
      performance: { ...fallback.performance },
    };
  }

  const perfRaw = isRecord(raw.performance) ? raw.performance : {};
  const path = `charts[${raw.id ?? fallback.id}]`;
  return {
    id: typeof raw.id === 'string' ? raw.id : fallback.id,
    title: typeof raw.title === 'string' ? raw.title : fallback.title,
    selectedItems: chartSelectedItemsValue(raw.selectedItems, `${path}.selectedItems`, issues),
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
      selectedItems: cloneChartSelectedItems(f.selectedItems),
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
      id: `chart-${i + 1}`,
      title: `图表${i + 1}`,
      selectedItems: isNew ? [] : [...base!.selectedItems],
      yAxis: { ...base!.yAxis },
      performance: { ...base!.performance },
    };
    result.push(normalizeChartInstance(raw[i], fallback, issues));
  }
  const firstFallback = safeFallbacks[0]!;
  return result.length > 0 ? result : [normalizeChartInstance(undefined, firstFallback, issues)];
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
      pointSize: fallback.pointSize,
    };
  }

  return {
    iSource: normalizeScatterBinding(raw.iSource, fallback.iSource),
    qSource: normalizeScatterBinding(raw.qSource, fallback.qSource),
    sampleCount: positiveNumberValue(raw.sampleCount, fallback.sampleCount, 'scatter.sampleCount', 'display.scatter.sampleCountInvalid', issues),
    bitWidth: positiveNumberValue(raw.bitWidth, fallback.bitWidth, 'scatter.bitWidth', 'display.scatter.bitWidthInvalid', issues),
    refreshIntervalMs: positiveNumberValue(raw.refreshIntervalMs, fallback.refreshIntervalMs, 'scatter.refreshIntervalMs', 'display.scatter.refreshIntervalInvalid', issues),
    pointSize: positiveNumberValue(raw.pointSize, fallback.pointSize, 'scatter.pointSize', 'display.scatter.pointSizeInvalid', issues),
  };
}

// H014/S012:录制配置归一化。逐字段校验 + 补默认,旧 snapshot(无 recording 字段)
// 走 fallback 补默认(S010 教训:加字段必须过 normalize,否则旧数据迁移丢字段)。
// fallback 本身可能缺 recording(旧 snapshot 作 fallback),用 DEFAULT_RECORDING_CONFIG 兜底。
import { DEFAULT_RECORDING_CONFIG } from '@/features/recording/core/defaults';
function normalizeRecordingConfig(
  raw: unknown,
  fallback: RecordingConfig | undefined,
  issues: DisplayValidationIssue[],
): RecordingConfig {
  const base: RecordingConfig = fallback ?? { ...DEFAULT_RECORDING_CONFIG, selectedFrameIds: [] };
  if (!isRecord(raw)) {
    return { ...base, selectedFrameIds: [] };
  }
  const selectedFrameIds = Array.isArray(raw.selectedFrameIds)
    ? raw.selectedFrameIds.filter((x): x is string => typeof x === 'string')
    : [];
  if (Array.isArray(raw.selectedFrameIds) && raw.selectedFrameIds.length !== selectedFrameIds.length) {
    issues.push(createDisplayIssue('display.recording.selectedFrameIdsInvalid', 'recording.selectedFrameIds', 'Non-string frameIds filtered out.', 'warning'));
  }
  return {
    selectedFrameIds,
    maxFileSizeMb: positiveNumberValue(raw.maxFileSizeMb, base.maxFileSizeMb, 'recording.maxFileSizeMb', 'display.recording.maxFileSizeMbInvalid', issues),
    enableRotation: typeof raw.enableRotation === 'boolean' ? raw.enableRotation : base.enableRotation,
    rotationCount: positiveNumberValue(raw.rotationCount, base.rotationCount, 'recording.rotationCount', 'display.recording.rotationCountInvalid', issues),
  };
}

function normalizeGroupConfigs(
  raw: unknown,
  issues: DisplayValidationIssue[],
): DisplayGroupConfig[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const globalFrameIds = new Set<string>();
  const result: DisplayGroupConfig[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const label = typeof item.label === 'string' ? item.label : '';
    if (!id) continue;
    if (seen.has(id)) {
      issues.push(createDisplayIssue('display.group.duplicateId', `groups[${id}]`, `Duplicate group id "${id}" skipped.`));
      continue;
    }
    seen.add(id);
    const frames = normalizeGroupFrames(item.frames, issues, id, globalFrameIds);
    result.push({ id, label: label || id, frames });
  }
  return result;
}

function normalizeGroupFrames(
  raw: unknown,
  issues: DisplayValidationIssue[],
  groupId: string,
  globalFrameIds: Set<string>,
): DisplayGroupFrameEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: DisplayGroupFrameEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const frameId = typeof item.frameId === 'string' ? item.frameId : '';
    if (!frameId) continue;
    if (seen.has(frameId)) {
      issues.push(createDisplayIssue('display.group.duplicateFrame', `groups[${groupId}].frames[${frameId}]`, `Duplicate frame "${frameId}" in group "${groupId}" skipped.`));
      continue;
    }
    seen.add(frameId);
    if (globalFrameIds.has(frameId)) {
      issues.push(createDisplayIssue('display.group.crossGroupDuplicateFrame', `groups[${groupId}].frames[${frameId}]`, `Frame "${frameId}" already assigned to another group; skipped.`));
      continue;
    }
    globalFrameIds.add(frameId);
    const visibleFieldIds = stringArrayValue(item.visibleFieldIds, `groups[${groupId}].frames[${frameId}].visibleFieldIds`, issues);
    const rawOrder = item.fieldOrder;
    const fieldOrder = stringArrayValue(rawOrder, `groups[${groupId}].frames[${frameId}].fieldOrder`, issues);
    const dedupedOrder = [...new Set(fieldOrder)];
    result.push({ frameId, visibleFieldIds, ...(dedupedOrder.length > 0 ? { fieldOrder: dedupedOrder } : {}) });
  }
  return result;
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
    groups: normalizeGroupConfigs(value.groups, issues),
    recording: normalizeRecordingConfig(value.recording, defaults.recording, issues),
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
        selectedItems: p.selectedItems ? cloneChartSelectedItems(p.selectedItems) : existing.selectedItems,
        yAxis: p.yAxis ? { ...existing.yAxis, ...p.yAxis } : existing.yAxis,
        performance: p.performance ? { ...existing.performance, ...p.performance } : existing.performance,
      };
    });
  }

  let scatter = currentPrefs.scatter;
  if (patch.scatter) {
    // S010: 之前只合并 iSource/qSource，漏了 sampleCount/bitWidth/refreshIntervalMs/pointSize
    // → 导致星座图弹窗改的刷新间隔在合并阶段被丢弃，存不住（问题 1 存储层根因）。
    // 现在所有标量字段也参与合并（undefined 保留旧值）。
    scatter = {
      ...scatter,
      ...(patch.scatter.iSource ? { iSource: { ...scatter.iSource, ...patch.scatter.iSource } } : {}),
      ...(patch.scatter.qSource ? { qSource: { ...scatter.qSource, ...patch.scatter.qSource } } : {}),
      ...(patch.scatter.sampleCount !== undefined ? { sampleCount: patch.scatter.sampleCount } : {}),
      ...(patch.scatter.bitWidth !== undefined ? { bitWidth: patch.scatter.bitWidth } : {}),
      ...(patch.scatter.refreshIntervalMs !== undefined ? { refreshIntervalMs: patch.scatter.refreshIntervalMs } : {}),
      ...(patch.scatter.pointSize !== undefined ? { pointSize: patch.scatter.pointSize } : {}),
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
    groups: patch.groups !== undefined
      ? patch.groups.map((g) => ({
          id: g.id,
          label: g.label,
          frames: g.frames.map((f) => ({
            frameId: f.frameId,
            visibleFieldIds: [...f.visibleFieldIds],
            ...(f.fieldOrder ? { fieldOrder: [...f.fieldOrder] } : {}),
          })),
        }))
      : currentPrefs.groups,
    // H014/S012:recording 走 patch 合并(显式 patch 用 patch 值,否则保留 currentPrefs)。
    // 注意 currentPrefs 来自 cloneDisplayPreferences,已含 recording(T7 clone 同步)。
    recording: patch.recording !== undefined
      ? { ...patch.recording, selectedFrameIds: [...patch.recording.selectedFrameIds] }
      : currentPrefs.recording,
  };

  return normalizeDisplayPreferencesInput(merged, current);
}

export interface ChartSelectionFrameLookup {
  listFieldReferences(query: { readonly frameId: string }): ReadonlyArray<{ readonly fieldId: string; readonly fieldName: string }>;
}

export function validateChartSelectedItems(
  prefs: DisplayPreferences,
  lookup: ChartSelectionFrameLookup,
): DisplayPreferences {
  const knownGroupIds = new Set(prefs.groups.map((g) => g.id));
  const frameFieldCache = new Map<string, Set<string>>();

  function isFieldKnown(frameId: string, fieldId: string): boolean {
    let fields = frameFieldCache.get(frameId);
    if (fields === undefined) {
      const refs = lookup.listFieldReferences({ frameId });
      fields = new Set(refs.map((r) => r.fieldId));
      frameFieldCache.set(frameId, fields);
    }
    return fields.has(fieldId);
  }

  let anyChartChanged = false;
  const validatedCharts = prefs.charts.map((chart) => {
    if (chart.selectedItems.length === 0) return chart;
    const validatedItems: ChartSelectedItem[] = [];
    let dropped = false;
    for (const item of chart.selectedItems) {
      if (!isFieldKnown(item.frameId, item.fieldId)) {
        console.warn('[display] chart selected item dropped: frame/field not found', item);
        dropped = true;
        continue;
      }
      let normalizedGroupId = item.groupId;
      if (item.groupId !== item.frameId && !knownGroupIds.has(item.groupId)) {
        console.warn('[display] chart selected item groupId fallback to frameId', item);
        normalizedGroupId = item.frameId;
        dropped = true;
      }
      validatedItems.push({ groupId: normalizedGroupId, frameId: item.frameId, fieldId: item.fieldId });
    }
    if (!dropped) return chart;
    anyChartChanged = true;
    return { ...chart, selectedItems: validatedItems };
  });

  if (!anyChartChanged) return prefs;
  return { ...prefs, charts: validatedCharts };
}
