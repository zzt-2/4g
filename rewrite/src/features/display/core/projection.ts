import type {
  ChartInstancePreference,
  ChartInstanceProjection,
  ChartSeriesProjection,
  DisplayFieldMaterial,
  DisplayPreferences,
  DisplayProjection,
  ScatterDisplayPreference,
  ScatterProjection,
  ScatterSourceBinding,
  TableRowProjection,
} from './types';

export function projectTableRows(
  fields: readonly DisplayFieldMaterial[],
  selectedGroupId: string,
  selectedItems: readonly string[],
): TableRowProjection[] {
  const filtered = selectedGroupId
    ? fields.filter((f) => f.groupId === selectedGroupId)
    : fields;

  if (selectedItems.length === 0) {
    return filtered.map(toRow);
  }

  const itemSet = new Set(selectedItems);
  return filtered.filter((f) => itemSet.has(f.dataItemId)).map(toRow);
}

function toRow(f: DisplayFieldMaterial): TableRowProjection {
  return {
    groupId: f.groupId,
    dataItemId: f.dataItemId,
    fieldName: f.fieldName,
    value: f.value,
    displayValue: f.displayValue,
    ...(f.updatedAt ? { updatedAt: f.updatedAt } : {}),
  };
}

/**
 * Project chart series from selected items.
 * selectedItems use composite key format "groupId:dataItemId".
 * Points are always empty — display does not accumulate time-series history.
 */
export function projectChartSeries(
  fields: readonly DisplayFieldMaterial[],
  selectedItems: readonly string[],
): ChartSeriesProjection[] {
  if (selectedItems.length === 0) {
    return [];
  }

  const fieldMap = new Map<string, DisplayFieldMaterial>();
  for (const f of fields) {
    fieldMap.set(`${f.groupId}:${f.dataItemId}`, f);
  }

  const result: ChartSeriesProjection[] = [];

  for (const fieldId of selectedItems) {
    const field = fieldMap.get(fieldId);
    result.push({
      fieldId,
      fieldName: field?.fieldName ?? fieldId,
      points: [],
    });
  }

  return result;
}

export function projectChartInstances(
  fields: readonly DisplayFieldMaterial[],
  charts: readonly ChartInstancePreference[],
): ChartInstanceProjection[] {
  return charts.map((chart) => ({
    id: chart.id,
    series: projectChartSeries(fields, chart.selectedItems),
  }));
}

export function projectScatter(
  fields: readonly DisplayFieldMaterial[],
  preference: ScatterDisplayPreference,
): ScatterProjection {
  const iField = findFieldByBinding(fields, preference.iSource);
  const qField = findFieldByBinding(fields, preference.qSource);

  if (!iField || !qField) {
    return { points: [], sampleCount: 0 };
  }

  const iVal = typeof iField.value === 'number' ? iField.value : null;
  const qVal = typeof qField.value === 'number' ? qField.value : null;

  if (iVal === null || qVal === null) {
    return { points: [], sampleCount: 0 };
  }

  return {
    points: [{ i: iVal, q: qVal }],
    sampleCount: 1,
  };
}

function findFieldByBinding(
  fields: readonly DisplayFieldMaterial[],
  binding: ScatterSourceBinding,
): DisplayFieldMaterial | undefined {
  if (!binding.groupId || !binding.dataItemId) {
    return undefined;
  }
  return fields.find(
    (f) => f.groupId === binding.groupId && f.dataItemId === binding.dataItemId,
  );
}

export function computeDisplayProjection(
  fields: readonly DisplayFieldMaterial[],
  preferences: DisplayPreferences,
): DisplayProjection {
  return {
    table1Rows: projectTableRows(fields, preferences.table1.selectedGroupId, preferences.table1.selectedItems),
    table2Rows: projectTableRows(fields, preferences.table2.selectedGroupId, preferences.table2.selectedItems),
    charts: projectChartInstances(fields, preferences.charts),
    scatter: projectScatter(fields, preferences.scatter),
  };
}
