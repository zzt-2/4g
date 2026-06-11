import type { DisplayService, DisplayFieldMaterial } from '@/features/display';
import type { ReceiveBatchOutcome } from '@/features/receive';
import { buildFrameGroupLookup } from '@/features/display/core/group-resolution';

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

      if (mapping) {
        if (mapping.visibleFieldIds.size > 0 && !mapping.visibleFieldIds.has(f.fieldId)) continue;
        fields.push({
          groupId: mapping.groupId,
          dataItemId,
          fieldName: f.fieldName,
          value: f.value,
          displayValue: f.displayValue,
          updatedAt: outcome.processedAt,
        });
      } else {
        fields.push({
          groupId: f.frameId,
          dataItemId,
          fieldName: f.fieldName,
          value: f.value,
          displayValue: f.displayValue,
          updatedAt: outcome.processedAt,
        });
      }
    }
  }

  if (fields.length === 0) return 0;

  const result = service.ingestSourceMaterial({ fields });
  return result.ok ? fields.length : 0;
}
