import {
  cloneDisplaySnapshot,
  createDefaultDisplaySnapshot,
  computeDisplayProjection,
  applyDisplayPreferencesPatch,
  type ChartPoint,
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
import {
  selectAvailability,
  selectChartSeries,
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
  ingestSourceMaterial(material: DisplaySourceMaterial): DisplayOperationResult;
  clearProjection(): DisplayOperationResult;
  reset(): DisplayOperationResult;
}

interface DisplayBuffer {
  chartHistory: Map<string, ChartPoint[]>;
  sourceFields: DisplayFieldMaterial[];
}

function recomputeSnapshot(
  buffer: DisplayBuffer,
  preferences: DisplayPreferences,
  availability: DisplaySourceAvailability,
  state: DisplayStateContainer,
): DisplaySnapshot {
  const now = new Date().toISOString();
  const projection = computeDisplayProjection(
    buffer.sourceFields,
    preferences,
    buffer.chartHistory,
  );

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
    getChartSeries() {
      return selectChartSeries(snapshotProvider());
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
    chartHistory: new Map(),
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
      buffer.chartHistory.clear();

      const snapshot = state.replaceSnapshot({
        ...createDefaultDisplaySnapshot(),
        preferences: current.preferences,
        availability: current.availability,
      });
      return toOperationResult(snapshot, []);
    },

    reset() {
      buffer.sourceFields = [];
      buffer.chartHistory.clear();

      const snapshot = state.resetSnapshot();
      return toOperationResult(snapshot, []);
    },
  };
}
