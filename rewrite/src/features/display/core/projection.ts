import type {
  DisplayFieldMaterial,
  DisplayGroupConfig,
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
  fieldOrder?: readonly string[],
): TableRowProjection[] {
  const filtered = selectedGroupId
    ? fields.filter((f) => f.groupId === selectedGroupId)
    : fields;

  const rows = selectedItems.length === 0
    ? filtered.map(toRow)
    : (() => {
        const itemSet = new Set(selectedItems);
        return filtered.filter((f) => itemSet.has(f.dataItemId)).map(toRow);
      })();

  if (fieldOrder && fieldOrder.length > 0) {
    const orderMap = new Map(fieldOrder.map((id, i) => [id, i]));
    rows.sort((a, b) => {
      const ai = orderMap.get(a.dataItemId) ?? Infinity;
      const bi = orderMap.get(b.dataItemId) ?? Infinity;
      return ai - bi;
    });
  }

  return rows;
}

function toRow(f: DisplayFieldMaterial): TableRowProjection {
  // R19: fieldName is NOT projected from material — UI must resolve from frameReader.
  // TableRowProjection.fieldName is optional; consumers enrich via frameReader lookup.
  return {
    groupId: f.groupId,
    dataItemId: f.dataItemId,
    value: f.value,
    displayValue: f.displayValue,
    ...(f.rawHex != null ? { rawHex: f.rawHex } : {}),
    ...(f.updatedAt ? { updatedAt: f.updatedAt } : {}),
  };
}

/**
 * Project chart series from selected items.
 * Chart time-series accumulation lives in useDisplayRefresh composable.
 */
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

function resolveFieldOrder(
  groups: readonly DisplayGroupConfig[],
  selectedGroupId: string,
): readonly string[] | undefined {
  if (!selectedGroupId) return undefined;
  const group = groups.find((g) => g.id === selectedGroupId);
  if (!group) return undefined;
  const orders = group.frames
    .filter((f) => f.fieldOrder && f.fieldOrder.length > 0)
    .flatMap((f) => f.fieldOrder!);
  return orders.length > 0 ? orders : undefined;
}

export function computeDisplayProjection(
  fields: readonly DisplayFieldMaterial[],
  preferences: DisplayPreferences,
): DisplayProjection {
  const groups = preferences.groups ?? [];
  return {
    table1Rows: projectTableRows(
      fields, preferences.table1.selectedGroupId, preferences.table1.selectedItems,
      resolveFieldOrder(groups, preferences.table1.selectedGroupId),
    ),
    table2Rows: projectTableRows(
      fields, preferences.table2.selectedGroupId, preferences.table2.selectedItems,
      resolveFieldOrder(groups, preferences.table2.selectedGroupId),
    ),
    scatter: projectScatter(fields, preferences.scatter),
  };
}
