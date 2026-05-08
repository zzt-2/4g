import {
  cloneDisplayPreferences,
  cloneDisplaySnapshot,
  type ChartSeriesProjection,
  type ReadonlyDisplaySnapshot,
  type ReadonlyDisplayPreferences,
  type ScatterProjection,
  type TableRowProjection,
} from '../core';

export function selectDisplaySnapshot(source: ReadonlyDisplaySnapshot) {
  return cloneDisplaySnapshot(source);
}

export function selectPreferences(source: ReadonlyDisplaySnapshot): ReadonlyDisplayPreferences {
  return cloneDisplayPreferences(source.preferences);
}

export function selectTable1Rows(source: ReadonlyDisplaySnapshot): TableRowProjection[] {
  return source.projection.table1Rows.map((r) => ({ ...r }));
}

export function selectTable2Rows(source: ReadonlyDisplaySnapshot): TableRowProjection[] {
  return source.projection.table2Rows.map((r) => ({ ...r }));
}

export function selectChartSeries(source: ReadonlyDisplaySnapshot): ChartSeriesProjection[] {
  return source.projection.chartSeries.map((s) => ({
    fieldId: s.fieldId,
    fieldName: s.fieldName,
    points: s.points.map((p) => ({ ...p })),
  }));
}

export function selectScatterProjection(source: ReadonlyDisplaySnapshot): ScatterProjection {
  const scatter = source.projection.scatter;
  return {
    points: scatter.points.map((p) => ({ ...p })),
    sampleCount: scatter.sampleCount,
  };
}

export function selectAvailability(source: ReadonlyDisplaySnapshot) {
  return { ...source.availability };
}
