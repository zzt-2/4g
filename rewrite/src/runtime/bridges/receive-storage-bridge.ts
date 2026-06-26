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

  // 治本"开久了卡"(S012 续):路由路径用 appendRoutedRecords(snapshot-free)。
  // 旧调用 appendLocalRecords 会每帧返回被丢弃的全量深拷贝 snapshot,是 O(N) 退化根源。
  // appendRoutedRecords 只增量 append + 攒批写盘,返回 { ok },彻底跳过 snapshot 生成。
  const result = await service.appendRoutedRecords(records);
  return result.ok ? records.length : 0;
}
