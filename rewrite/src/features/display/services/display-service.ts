import {
  cloneDisplaySnapshot,
  createDefaultDisplaySnapshot,
  computeDisplayProjection,
  applyDisplayPreferencesPatch,
  normalizeDisplayPreferencesInput,
  createDisplayIssue,
  type ChartInstancePatch,
  type ChartInstancePreference,
  type ChartInstanceProjection,
  type DisplayFieldMaterial,
  type DisplayPreferences,
  type DisplayPreferencesPatch,
  type DisplaySourceAvailability,
  type DisplaySourceMaterial,
  type DisplaySnapshot,
  type DisplayValidationIssue,
  type ReadonlyDisplaySnapshot,
  type ReadonlyDisplayPreferences,
  type TableRowProjection,
  type ChartSeriesProjection,
  type ScatterProjection,
} from '../core';
import { DEFAULT_CHART_INSTANCE } from '../core/defaults';
import {
  selectAvailability,
  selectChartInstances,
  selectDisplaySnapshot,
  selectPreferences,
  selectScatterProjection,
  selectTable1Rows,
  selectTable2Rows,
} from '../selectors';
import { createDisplayState, type DisplayStateContainer } from '../state';

export interface DisplayReader {
  getSnapshot(): ReadonlyDisplaySnapshot;
  getPreferences(): ReadonlyDisplayPreferences;
  getTable1Rows(): TableRowProjection[];
  getTable2Rows(): TableRowProjection[];
  getChartInstances(): ChartInstanceProjection[];
  getChartSeries(): ChartSeriesProjection[];
  getScatterProjection(): ScatterProjection;
  getAvailability(): DisplaySourceAvailability;
}

export interface DisplayOperationResult {
  readonly ok: boolean;
  readonly issues: readonly DisplayValidationIssue[];
  readonly snapshot: ReadonlyDisplaySnapshot;
}

export interface DisplayService extends DisplayReader {
  updatePreferences(patch: DisplayPreferencesPatch): DisplayOperationResult;
  updateChartConfig(chartId: string, patch: ChartInstancePatch): DisplayOperationResult;
  updateChartCount(count: number): DisplayOperationResult;
  ingestSourceMaterial(material: DisplaySourceMaterial): DisplayOperationResult;
  clearProjection(): DisplayOperationResult;
  reset(): DisplayOperationResult;
}

interface DisplayBuffer {
  sourceFields: DisplayFieldMaterial[];
}

function recomputeSnapshot(
  buffer: DisplayBuffer,
  preferences: DisplayPreferences,
  availability: DisplaySourceAvailability,
  state: DisplayStateContainer,
): DisplaySnapshot {
  const now = new Date().toISOString();
  const projection = computeDisplayProjection(buffer.sourceFields, preferences);

  return state.replaceSnapshot({
    schemaVersion: state.getSnapshot().schemaVersion,
    preferences,
    projection,
    availability,
    lastUpdatedAt: now,
  });
}

function toOperationResult(
  snapshot: DisplaySnapshot,
  issues: readonly DisplayValidationIssue[],
): DisplayOperationResult {
  return {
    ok: issues.every((i) => i.severity !== 'error'),
    issues,
    snapshot: cloneDisplaySnapshot(snapshot),
  };
}

export function createDisplayReader(
  snapshotProvider: () => ReadonlyDisplaySnapshot,
): DisplayReader {
  return {
    getSnapshot() {
      return selectDisplaySnapshot(snapshotProvider());
    },
    getPreferences() {
      return selectPreferences(snapshotProvider());
    },
    getTable1Rows() {
      return selectTable1Rows(snapshotProvider());
    },
    getTable2Rows() {
      return selectTable2Rows(snapshotProvider());
    },
    getChartInstances() {
      return selectChartInstances(snapshotProvider());
    },
    getChartSeries() {
      const charts = selectChartInstances(snapshotProvider());
      return charts.length > 0 ? charts[0].series : [];
    },
    getScatterProjection() {
      return selectScatterProjection(snapshotProvider());
    },
    getAvailability() {
      return selectAvailability(snapshotProvider());
    },
  };
}

export function createDisplayService(
  state: DisplayStateContainer = createDisplayState(),
): DisplayService {
  const reader = createDisplayReader(() => state.getSnapshot());

  const buffer: DisplayBuffer = {
    sourceFields: [],
  };

  return {
    ...reader,

    updatePreferences(patch) {
      const current = state.getSnapshot();
      const result = applyDisplayPreferencesPatch(current, patch);
      const snapshot = recomputeSnapshot(
        buffer,
        result.snapshot.preferences,
        current.availability,
        state,
      );
      return toOperationResult(snapshot, result.issues);
    },

    updateChartConfig(chartId, patch) {
      const current = state.getSnapshot();
      const chartIdx = current.preferences.charts.findIndex((c) => c.id === chartId);
      if (chartIdx === -1) {
        return toOperationResult(current, [createDisplayIssue('display.chart.notFound', `charts[${chartId}]`, 'Chart instance not found.', 'error')]);
      }

      // Build merged preferences directly, skip double-indirection through patch
      const charts = current.preferences.charts.map((c, i) =>
        i === chartIdx
          ? {
              id: c.id,
              title: patch.title ?? c.title,
              selectedItems: patch.selectedItems ? [...patch.selectedItems] : c.selectedItems,
              yAxis: patch.yAxis ? { ...c.yAxis, ...patch.yAxis } : c.yAxis,
              performance: patch.performance ? { ...c.performance, ...patch.performance } : c.performance,
            }
          : c,
      );

      const newPrefs: DisplayPreferences = { ...current.preferences, charts };
      const result = normalizeDisplayPreferencesInput(newPrefs, current);
      const snapshot = recomputeSnapshot(buffer, result.snapshot.preferences, current.availability, state);
      return toOperationResult(snapshot, result.issues);
    },

    updateChartCount(count) {
      const clamped = Math.max(1, Math.min(4, count));
      const current = state.getSnapshot();
      const currentCharts = current.preferences.charts;

      const charts: ChartInstancePreference[] = Array.from({ length: clamped }, (_, i) =>
        currentCharts[i] ?? {
          ...DEFAULT_CHART_INSTANCE,
          id: `chart-${i + 1}`,
          title: `图表${i + 1}`,
        },
      );

      const newPrefs: DisplayPreferences = { ...current.preferences, charts };
      const result = normalizeDisplayPreferencesInput(newPrefs, current);
      const snapshot = recomputeSnapshot(buffer, result.snapshot.preferences, current.availability, state);
      return toOperationResult(snapshot, result.issues);
    },

    ingestSourceMaterial(material) {
      const current = state.getSnapshot();

      if (material.fields) {
        buffer.sourceFields = material.fields.map((f) => ({ ...f }));
      }

      if (material.availability) {
        const snapshot = recomputeSnapshot(
          buffer,
          current.preferences,
          material.availability,
          state,
        );
        return toOperationResult(snapshot, []);
      }

      const snapshot = recomputeSnapshot(
        buffer,
        current.preferences,
        current.availability,
        state,
      );
      return toOperationResult(snapshot, []);
    },

    clearProjection() {
      const current = state.getSnapshot();
      buffer.sourceFields = [];

      const snapshot = state.replaceSnapshot({
        ...createDefaultDisplaySnapshot(),
        preferences: current.preferences,
        availability: current.availability,
      });
      return toOperationResult(snapshot, []);
    },

    reset() {
      buffer.sourceFields = [];

      const snapshot = state.resetSnapshot();
      return toOperationResult(snapshot, []);
    },
  };
}
