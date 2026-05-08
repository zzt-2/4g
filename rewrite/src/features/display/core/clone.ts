import type {
  ChartDisplayPreference,
  ChartPoint,
  ChartSeriesProjection,
  DisplayPreferences,
  DisplayProjection,
  DisplaySnapshot,
  ScatterDisplayPreference,
  ScatterPoint,
  ScatterProjection,
  ScatterSourceBinding,
  TableDisplayPreference,
  TableRowProjection,
} from './types';

export function cloneTableDisplayPreference(pref: TableDisplayPreference): TableDisplayPreference {
  return {
    displayMode: pref.displayMode,
    selectedGroupId: pref.selectedGroupId,
    selectedItems: [...pref.selectedItems],
  };
}

export function cloneChartDisplayPreference(pref: ChartDisplayPreference): ChartDisplayPreference {
  return {
    selectedItems: [...pref.selectedItems],
    performance: { ...pref.performance },
  };
}

export function cloneScatterSourceBinding(binding: ScatterSourceBinding): ScatterSourceBinding {
  return { ...binding };
}

export function cloneScatterDisplayPreference(
  pref: ScatterDisplayPreference,
): ScatterDisplayPreference {
  return {
    iSource: cloneScatterSourceBinding(pref.iSource),
    qSource: cloneScatterSourceBinding(pref.qSource),
    sampleCount: pref.sampleCount,
    bitWidth: pref.bitWidth,
    refreshIntervalMs: pref.refreshIntervalMs,
  };
}

export function cloneDisplayPreferences(pref: DisplayPreferences): DisplayPreferences {
  return {
    table1: cloneTableDisplayPreference(pref.table1),
    table2: cloneTableDisplayPreference(pref.table2),
    chart: cloneChartDisplayPreference(pref.chart),
    scatter: cloneScatterDisplayPreference(pref.scatter),
    refreshCadenceMs: pref.refreshCadenceMs,
  };
}

export function cloneTableRowProjection(row: TableRowProjection): TableRowProjection {
  return { ...row };
}

export function cloneChartPoint(point: ChartPoint): ChartPoint {
  return { ...point };
}

export function cloneChartSeriesProjection(series: ChartSeriesProjection): ChartSeriesProjection {
  return {
    fieldId: series.fieldId,
    fieldName: series.fieldName,
    points: series.points.map(cloneChartPoint),
  };
}

export function cloneScatterPoint(point: ScatterPoint): ScatterPoint {
  return { ...point };
}

export function cloneScatterProjection(projection: ScatterProjection): ScatterProjection {
  return {
    points: projection.points.map(cloneScatterPoint),
    sampleCount: projection.sampleCount,
  };
}

export function cloneDisplayProjection(projection: DisplayProjection): DisplayProjection {
  return {
    table1Rows: projection.table1Rows.map(cloneTableRowProjection),
    table2Rows: projection.table2Rows.map(cloneTableRowProjection),
    chartSeries: projection.chartSeries.map(cloneChartSeriesProjection),
    scatter: cloneScatterProjection(projection.scatter),
  };
}

export function cloneDisplaySnapshot(snapshot: DisplaySnapshot): DisplaySnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    preferences: cloneDisplayPreferences(snapshot.preferences),
    projection: cloneDisplayProjection(snapshot.projection),
    availability: { ...snapshot.availability },
    ...(snapshot.lastUpdatedAt ? { lastUpdatedAt: snapshot.lastUpdatedAt } : {}),
  };
}
