import type { StorageLocalService, StorageLocalRecord } from '@/features/storage-local-baseline';
import type { ReceiveBatchOutcome } from '@/features/receive';

function toStorageRecord(outcome: ReceiveBatchOutcome): StorageLocalRecord | undefined {
  if (outcome.kind !== 'matched') return undefined;
  if (!outcome.input) return undefined;
  if (outcome.fields.length === 0) return undefined;

  return {
    id: outcome.id,
    capturedAt: outcome.processedAt,
    source: 'local',
    channel: outcome.input.source.sourceId,
    fields: outcome.fields.map((f) => ({
      key: f.fieldName,
      value: f.value ?? null,
    })),
  };
}

export async function fanOutToStorage(
  service: StorageLocalService,
  outcomes: readonly ReceiveBatchOutcome[],
): Promise<number> {
  const records = outcomes
    .map(toStorageRecord)
    .filter((r): r is StorageLocalRecord => r !== undefined);

  if (records.length === 0) return 0;

  const result = await service.appendLocalRecords(records);
  return result.ok ? records.length : 0;
}
