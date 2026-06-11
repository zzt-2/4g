import type { DisplayService, DisplayFieldMaterial } from '@/features/display';
import type { ReceiveBatchOutcome } from '@/features/receive';
import { buildFrameGroupLookup } from '@/features/display/core/group-resolution';

const HEX_HIDDEN_TYPES = new Set(['float', 'double']);

export function fanOutToDisplay(
  service: DisplayService,
  outcomes: readonly ReceiveBatchOutcome[],
): number {
  const groups = service.getPreferences().groups ?? [];
  const lookup = buildFrameGroupLookup(groups);
  const fields: DisplayFieldMaterial[] = [];

  for (const outcome of outcomes) {
    if (outcome.kind !== 'matched') continue;
    if (outcome.fields.length === 0) continue;

    for (const f of outcome.fields) {
      const mapping = lookup.get(f.frameId);
      const dataItemId = `${f.frameId}:${f.fieldId}`;
      const rawHex = HEX_HIDDEN_TYPES.has(f.dataType) ? undefined : f.rawHex;

      if (mapping) {
        if (mapping.visibleFieldIds.size > 0 && !mapping.visibleFieldIds.has(f.fieldId)) continue;
        fields.push({
          groupId: mapping.groupId,
          dataItemId,
          // fieldName is runtime-redundant: UI MUST NOT trust it for static metadata display.
          // Static fieldName/frameName must be resolved from frameReader (R19, design 5.1).
          fieldName: f.fieldName,
          value: f.value,
          displayValue: f.displayValue,
          ...(rawHex !== undefined ? { rawHex } : {}),
          updatedAt: outcome.processedAt,
        });
      } else {
        fields.push({
          groupId: f.frameId,
          dataItemId,
          // fieldName is runtime-redundant: UI MUST NOT trust it for static metadata display.
          // Static fieldName/frameName must be resolved from frameReader (R19, design 5.1).
          fieldName: f.fieldName,
          value: f.value,
          displayValue: f.displayValue,
          ...(rawHex !== undefined ? { rawHex } : {}),
          updatedAt: outcome.processedAt,
        });
      }
    }
  }

  if (fields.length === 0) return 0;

  const result = service.ingestSourceMaterial({ fields });
  return result.ok ? fields.length : 0;
}
