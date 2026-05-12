import type { DisplayService, DisplayFieldMaterial } from '@/features/display';
import type { ReceiveBatchOutcome } from '@/features/receive';

export function fanOutToDisplay(
  service: DisplayService,
  outcomes: readonly ReceiveBatchOutcome[],
): number {
  const fields: DisplayFieldMaterial[] = [];

  for (const outcome of outcomes) {
    if (outcome.kind !== 'matched') continue;
    if (outcome.fields.length === 0) continue;

    for (const f of outcome.fields) {
      fields.push({
        frameId: f.frameId,
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        value: f.value,
        displayValue: f.displayValue,
        updatedAt: outcome.processedAt,
      });
    }
  }

  if (fields.length === 0) return 0;

  const result = service.ingestSourceMaterial({ fields });
  return result.ok ? fields.length : 0;
}
