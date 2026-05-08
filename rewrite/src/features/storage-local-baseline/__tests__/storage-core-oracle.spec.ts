import { describe, expect, it } from 'vitest';
import {
  classifyStorageLegacyJsonMaterial,
  createStorageCsvMaterial,
  mergeStorageHistoryMaterials,
  normalizeStorageLocalRecord,
  summarizeStorageHours,
} from '../core';
import {
  expectedStorageCsvContent,
  historyHourMaterial,
  invalidStorageRecord,
  legacyArrayMaterial,
  storageCsvColumns,
  storageRecordA,
  storageRecordB,
} from '../fixtures/storage-fixtures';

describe('storage local core oracle comparison pilot', () => {
  it('normalizes local records and rejects unsupported field values', () => {
    const validResult = normalizeStorageLocalRecord({
      ...storageRecordA,
      id: ' record-a ',
      fields: [{ key: ' temperature ', value: 20.5, unit: ' C ' }],
    });
    const invalidResult = normalizeStorageLocalRecord(invalidStorageRecord);

    expect(validResult.ok).toBe(true);
    expect(validResult.record).toMatchObject({
      id: 'record-a',
      fields: [{ key: 'temperature', value: 20.5, unit: 'C' }],
    });
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.validation.issues.map((issue) => issue.code)).toEqual([
      'record.idMissing',
      'record.capturedAtInvalid',
      'record.fieldKeyMissing',
      'record.fieldValueInvalid',
    ]);
  });

  it('merges hour material into deterministic local record order', () => {
    const merged = mergeStorageHistoryMaterials([historyHourMaterial]);

    expect(merged.map((record) => record.id)).toEqual([storageRecordA.id, storageRecordB.id]);
    expect(summarizeStorageHours(merged)).toEqual([
      {
        hourKey: '2026-04-30T08',
        recordCount: 2,
        firstCapturedAt: storageRecordA.capturedAt,
        lastCapturedAt: storageRecordB.capturedAt,
      },
    ]);
  });

  it('renders CSV material against the fixed expected output', () => {
    const result = createStorageCsvMaterial({
      id: 'csv-a',
      name: 'local-csv-a',
      generatedAt: '2026-04-30T10:00:00.000Z',
      records: [storageRecordB, storageRecordA],
      columns: storageCsvColumns,
    });

    expect(result.ok).toBe(true);
    expect(result.material?.content).toBe(expectedStorageCsvContent);
  });

  it('classifies legacy array material without exposing source schema as state', () => {
    const result = classifyStorageLegacyJsonMaterial(
      'legacy-array',
      legacyArrayMaterial,
      '2026-04-30T10:00:00.000Z',
    );

    expect(result).toEqual({
      ok: true,
      validation: { valid: true, issues: [] },
      material: {
        key: 'legacy-array',
        itemCount: 2,
        acceptedAt: '2026-04-30T10:00:00.000Z',
      },
    });
  });
});
