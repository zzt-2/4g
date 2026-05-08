import type {
  ChartDisplayPreference,
  ChartPoint,
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

export function projectChartSeries(
  fields: readonly DisplayFieldMaterial[],
  preference: ChartDisplayPreference,
  historyBuffer: ReadonlyMap<string, ChartPoint[]>,
): ChartSeriesProjection[] {
  const selectedItems = preference.selectedItems;

  if (selectedItems.length === 0) {
    return [];
  }

  const maxPoints = preference.performance.maxPoints;
  const result: ChartSeriesProjection[] = [];

  for (const fieldId of selectedItems) {
    const field = fields.find((f) => `${f.groupId}:${f.dataItemId}` === fieldId);
    const history = historyBuffer.get(fieldId);
    const points: ChartPoint[] = history ? history.slice(-maxPoints) : [];

    result.push({
      fieldId,
      fieldName: field?.fieldName ?? fieldId,
      points,
    });
  }

  return result;
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
  historyBuffer: ReadonlyMap<string, ChartPoint[]>,
): DisplayProjection {
  return {
    table1Rows: projectTableRows(fields, preferences.table1.selectedGroupId, preferences.table1.selectedItems),
    table2Rows: projectTableRows(fields, preferences.table2.selectedGroupId, preferences.table2.selectedItems),
    chartSeries: projectChartSeries(fields, preferences.chart, historyBuffer),
    scatter: projectScatter(fields, preferences.scatter),
  };
}
