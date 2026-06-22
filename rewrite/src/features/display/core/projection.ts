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
import { extractValuesFromHex } from './sampling';

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
 *
 * scatter（星座图）采样：
 *   - bytes 字段（value 是 hex string）：按 preference.bitWidth 从 hex 切出多个有符号采样值，
 *     一段 I + 一段 Q 按 index 配对成多点（对接旧版 extractValuesFromHex 语义）。
 *   - 数值字段（value 是 number）：保持单点行为（向后兼容）。
 *   - 点数上限取 min(iValues.length, qValues.length, preference.sampleCount)。
 *   - bitWidth/sampleCount 由 ScatterConfigDialog 配置（默认 8/256）。
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

  const iValues = extractScatterSamples(iField.value, preference.bitWidth);
  const qValues = extractScatterSamples(qField.value, preference.bitWidth);

  if (iValues.length === 0 || qValues.length === 0) {
    return { points: [], sampleCount: 0 };
  }

  const maxPoints = preference.sampleCount > 0 ? preference.sampleCount : Math.max(iValues.length, qValues.length);
  const pairCount = Math.min(iValues.length, qValues.length, maxPoints);

  const points = [];
  for (let i = 0; i < pairCount; i++) {
    points.push({ i: iValues[i]!, q: qValues[i]! });
  }

  return {
    points,
    sampleCount: points.length,
  };
}

/**
 * 从单个字段的 value 提取 scatter 采样值。
 * - number（数值字段）：单值包装成 [value]。
 * - string（bytes 字段的 hex）：按 bitWidth 切多点。
 * - 其它：空数组。
 */
function extractScatterSamples(value: unknown, bitWidth: number): number[] {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? [value] : [];
  }
  if (typeof value === 'string') {
    return extractValuesFromHex(value, bitWidth);
  }
  return [];
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
