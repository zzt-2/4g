import { describe, expect, it } from 'vitest';
import * as storagePublicApi from '../index';
import { createFakeLocalMaterialAdapter } from '../adapters/test-exports';
import { createStorageLocalService } from '../services';
import { createStorageState } from '../state';
import {
  expectedStorageCsvContent,
  historyHourMaterial,
  invalidStorageRecord,
  legacyArrayMaterial,
  storageCsvColumns,
  storageRecordA,
  storageRecordB,
  storageRecordNextHour,
} from '../fixtures/storage-fixtures';
import type { StorageLocalRecord } from '../core';

describe('storage local service/state/selector pilot', () => {
  it('appends records through the adapter and keeps state snapshots isolated', async () => {
    const adapter = createFakeLocalMaterialAdapter();
    const service = createStorageLocalService({ adapter });

    const result = await service.appendLocalRecords([storageRecordB, storageRecordA]);

    expect(result.ok).toBe(true);
    expect(service.listLocalRecords().map((record) => record.id)).toEqual([
      storageRecordA.id,
      storageRecordB.id,
    ]);
    expect(adapter.readStoredMaterial('records', 'local-records')).toEqual([
      storageRecordA,
      storageRecordB,
    ]);

    const snapshot = service.getSnapshot();
    (snapshot.records[0] as StorageLocalRecord).fields[0] = { key: 'temperature', value: 100 };

    expect(service.getSnapshot().records[0]!.fields[0]!.value).toBe(20.5);
  });

  it('rejects invalid append input without changing existing records', async () => {
    const service = createStorageLocalService({
      adapter: createFakeLocalMaterialAdapter(),
      state: createStorageState({ records: [storageRecordA] }),
    });

    const result = await service.appendLocalRecords([invalidStorageRecord as StorageLocalRecord]);

    expect(result.ok).toBe(false);
    expect(result.validation.issues.map((issue) => issue.code)).toContain('record.idMissing');
    expect(service.listLocalRecords().map((record) => record.id)).toEqual([storageRecordA.id]);
    expect(service.getLastIssue()?.code).toBe('record.idMissing');
  });

  it('keeps existing records when the adapter rejects a write', async () => {
    const service = createStorageLocalService({
      adapter: createFakeLocalMaterialAdapter({
        failures: [
          {
            operation: 'write',
            bucket: 'records',
            id: 'local-records',
            error: { kind: 'write-failed', message: '本地写入失败' },
          },
        ],
      }),
      state: createStorageState({ records: [storageRecordA] }),
    });

    const result = await service.appendLocalRecords([storageRecordB]);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'write-failed', message: '本地写入失败' },
    });
    expect(result.validation.issues.map((issue) => issue.code)).toEqual(['adapter.write-failed']);
    expect(service.listLocalRecords().map((record) => record.id)).toEqual([storageRecordA.id]);
    expect(service.getLastIssue()).toEqual({
      code: 'adapter.write-failed',
      message: '本地写入失败',
    });
  });

  it('loads history material and projects hour summaries for readers', async () => {
    const service = createStorageLocalService({
      adapter: createFakeLocalMaterialAdapter({
        seeds: [{ bucket: 'history', id: '2026-04-30T08', value: historyHourMaterial }],
      }),
    });

    const result = await service.loadHistoryMaterials(['2026-04-30T08']);

    expect(result.ok).toBe(true);
    expect(service.listHistoryHours()).toEqual([
      {
        hourKey: '2026-04-30T08',
        recordCount: 2,
        firstCapturedAt: storageRecordA.capturedAt,
        lastCapturedAt: storageRecordB.capturedAt,
      },
    ]);
  });

  it('creates CSV material from queried local records and stores a copied snapshot', async () => {
    const adapter = createFakeLocalMaterialAdapter();
    const service = createStorageLocalService({
      adapter,
      state: createStorageState({ records: [storageRecordA, storageRecordB, storageRecordNextHour] }),
    });

    const csvResult = await service.createCsvFromLocalRecords({
      id: 'csv-a',
      name: 'local-csv-a',
      generatedAt: '2026-04-30T10:00:00.000Z',
      columns: storageCsvColumns,
      query: { channel: 'telemetry-a' },
    });
    const snapshotResult = await service.copySnapshot('snapshot-a');

    expect(csvResult.ok).toBe(true);
    expect(csvResult.material?.content).toBe(expectedStorageCsvContent);
    expect(snapshotResult.ok).toBe(true);

    const copiedSnapshot = adapter.readStoredMaterial('snapshot', 'snapshot-a') as ReturnType<
      typeof service.getSnapshot
    >;
    (copiedSnapshot.records[0] as StorageLocalRecord).fields[0] = { key: 'temperature', value: 500 };
    expect(service.getSnapshot().records[0]!.fields[0]!.value).toBe(20.5);
  });

  it('saves legacy material summaries while keeping payload only behind the adapter', async () => {
    const adapter = createFakeLocalMaterialAdapter();
    const service = createStorageLocalService({ adapter });

    const result = await service.saveLegacyJsonMaterial(
      'legacy-array',
      legacyArrayMaterial,
      '2026-04-30T10:00:00.000Z',
    );

    expect(result.ok).toBe(true);
    expect(service.listLegacyMaterials()).toEqual([
      {
        key: 'legacy-array',
        itemCount: 2,
        acceptedAt: '2026-04-30T10:00:00.000Z',
      },
    ]);
    expect(adapter.readStoredMaterial('legacy', 'legacy-array')).toEqual(legacyArrayMaterial);
  });

  it('keeps the root public API free of internal state and fake instances', () => {
    expect(storagePublicApi).toHaveProperty('createStorageLocalReader');
    expect(storagePublicApi).toHaveProperty('createStorageLocalService');
    expect(storagePublicApi).not.toHaveProperty('createStorageState');
    expect(storagePublicApi).not.toHaveProperty('createFakeLocalMaterialAdapter');
  });
});
