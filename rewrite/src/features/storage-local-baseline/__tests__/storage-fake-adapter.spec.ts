import { describe, expect, it } from 'vitest';
import { createFakeLocalMaterialAdapter } from '../adapters/test-exports';
import { storageRecordA } from '../fixtures/storage-fixtures';

describe('storage local fake adapter pilot', () => {
  it('stores cloned material instead of caller-owned objects', async () => {
    const adapter = createFakeLocalMaterialAdapter();
    const payload = globalThis.structuredClone([storageRecordA]);

    const writeResult = await adapter.writeMaterial('records', 'local-records', payload);
    payload[0]!.fields[0] = { key: 'temperature', value: 99 };

    const readResult = await adapter.readMaterial('records', 'local-records');

    expect(writeResult.ok).toBe(true);
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value).toEqual([storageRecordA]);
      (readResult.value as typeof payload)[0]!.fields[0] = { key: 'temperature', value: 100 };
    }
    expect(adapter.readStoredMaterial('records', 'local-records')).toEqual([storageRecordA]);
  });

  it('returns injected permission errors without mutating stored material', async () => {
    const adapter = createFakeLocalMaterialAdapter({
      seeds: [{ bucket: 'records', id: 'local-records', value: [storageRecordA] }],
      failures: [
        {
          operation: 'write',
          bucket: 'records',
          id: 'local-records',
          error: { kind: 'permission-denied', message: '禁止写入本地材料' },
        },
      ],
    });

    const writeResult = await adapter.writeMaterial('records', 'local-records', []);

    expect(writeResult).toEqual({
      ok: false,
      error: { kind: 'permission-denied', message: '禁止写入本地材料' },
    });
    expect(adapter.readStoredMaterial('records', 'local-records')).toEqual([storageRecordA]);
  });

  it('returns missing reads as adapter boundary errors', async () => {
    const adapter = createFakeLocalMaterialAdapter();

    await expect(adapter.readMaterial('history', 'missing-hour')).resolves.toEqual({
      ok: false,
      error: {
        kind: 'missing',
        message: '未找到本地材料: history/missing-hour',
      },
    });
  });
});
