import type {
  ChartInstancePreference,
  DisplayGroupConfig,
  DisplayGroupFrameEntry,
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
    ...(pref.visibleColumns ? { visibleColumns: [...pref.visibleColumns] } : {}),
  };
}

export function cloneChartInstancePreference(pref: ChartInstancePreference): ChartInstancePreference {
  return {
    id: pref.id,
    title: pref.title,
    selectedItems: [...pref.selectedItems],
    yAxis: { ...pref.yAxis },
    performance: { ...pref.performance },
  };
}

export function cloneScatterSourceBinding(binding: ScatterSourceBinding): ScatterSourceBinding {
  return { ...binding };
}

export function cloneDisplayGroupFrameEntry(entry: DisplayGroupFrameEntry): DisplayGroupFrameEntry {
  return {
    frameId: entry.frameId,
    visibleFieldIds: [...entry.visibleFieldIds],
    ...(entry.fieldOrder ? { fieldOrder: [...entry.fieldOrder] } : {}),
  };
}

export function cloneDisplayGroupConfig(config: DisplayGroupConfig): DisplayGroupConfig {
  return {
    id: config.id,
    label: config.label,
    frames: config.frames.map(cloneDisplayGroupFrameEntry),
  };
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
    charts: pref.charts.map(cloneChartInstancePreference),
    scatter: cloneScatterDisplayPreference(pref.scatter),
    refreshCadenceMs: pref.refreshCadenceMs,
    groups: pref.groups.map(cloneDisplayGroupConfig),
  };
}

export function cloneTableRowProjection(row: TableRowProjection): TableRowProjection {
  return { ...row };
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
