import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { createRealLocalMaterialAdapter } from '@/features/storage-local-baseline/adapters/real-local-material-adapter';
import type { FileFacade } from '@/platform';
import type { StorageMaterialBucket } from '@/features/storage-local-baseline/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFakeFileFacade(store: Record<string, string> = {}): FileFacade & { store: Record<string, string> } {
  const facade: Record<string, unknown> = {
    store,
    readTextFile: vi.fn(async (path: string) => {
      if (store[path] === undefined) {
        const err = new Error(`ENOENT: ${path}`);
        (err as unknown as { code: string }).code = 'ENOENT';
        throw err;
      }
      return store[path];
    }),
    writeTextFile: vi.fn(async (path: string, text: string) => {
      store[path] = text;
    }),
    showSaveDialog: vi.fn(async () => null),
    showOpenDialog: vi.fn(async () => null),
    getUserDataPath: vi.fn(async () => '/test'),
  };
  return facade as FileFacade & { store: Record<string, string> };
}

const BASE_DIR = '/test/materials';

function matPath(bucket: StorageMaterialBucket, id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${BASE_DIR}/${bucket}/${safeId}.json`;
}

function indexPath(bucket: StorageMaterialBucket): string {
  return `${BASE_DIR}/${bucket}/_index.json`;
}

// ---------------------------------------------------------------------------
// T024g: Storage RealLocalMaterialAdapter CRUD Lifecycle
// ---------------------------------------------------------------------------

describe('T024g: Storage RealLocalMaterialAdapter CRUD lifecycle', () => {
  let facade: ReturnType<typeof createFakeFileFacade>;

  beforeEach(() => {
    facade = createFakeFileFacade();
  });

  function createAdapter() {
    return createRealLocalMaterialAdapter({ fileFacade: facade, baseDir: BASE_DIR });
  }

  // -------------------------------------------------------------------------
  // Create + Read
  // -------------------------------------------------------------------------

  describe('create and read', () => {
    it('writeMaterial then readMaterial returns same value', async () => {
      const adapter = createAdapter();
      const value = { name: 'test-record', data: [1, 2, 3] };

      const writeResult = await adapter.writeMaterial('records', 'rec-001', value);
      expect(writeResult.ok).toBe(true);

      const readResult = await adapter.readMaterial('records', 'rec-001');
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toEqual(value);
      }
    });

    it('written data is persisted as JSON in the store', async () => {
      const adapter = createAdapter();
      const value = { count: 42 };

      await adapter.writeMaterial('records', 'rec-check', value);

      const stored = facade.store[matPath('records', 'rec-check')];
      expect(stored).toBeDefined();
      expect(JSON.parse(stored)).toEqual(value);
    });
  });

  // -------------------------------------------------------------------------
  // Read missing
  // -------------------------------------------------------------------------

  describe('read missing material', () => {
    it('returns { ok: false, error: { kind: "missing" } }', async () => {
      const adapter = createAdapter();

      const result = await adapter.readMaterial('records', 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('missing');
        expect(result.error.message).toContain('nonexistent');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  describe('delete material', () => {
    it('writeMaterial → deleteMaterial → creates .deleted file', async () => {
      const adapter = createAdapter();
      await adapter.writeMaterial('records', 'rec-del', { name: 'to-delete' });

      const deleteResult = await adapter.deleteMaterial('records', 'rec-del');
      expect(deleteResult.ok).toBe(true);

      // Verify the .deleted file was written
      const deletedPath = matPath('records', 'rec-del.deleted');
      expect(facade.store[deletedPath]).toBeDefined();
      const deletedContent = JSON.parse(facade.store[deletedPath]);
      expect(deletedContent.deletedAt).toBeDefined();
      expect(deletedContent.original).toEqual({ name: 'to-delete' });
    });

    it('delete on nonexistent material returns ok: true (idempotent)', async () => {
      const adapter = createAdapter();

      const result = await adapter.deleteMaterial('records', 'ghost');
      expect(result.ok).toBe(true);
    });

    it('read after delete still returns the original data (file not removed)', async () => {
      const adapter = createAdapter();
      const value = { name: 'will-be-deleted' };
      await adapter.writeMaterial('records', 'rec-read-del', value);

      await adapter.deleteMaterial('records', 'rec-read-del');

      // The adapter writes a .deleted file but does NOT remove the original
      const readResult = await adapter.readMaterial('records', 'rec-read-del');
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toEqual(value);
      }
    });
  });

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  describe('list materials', () => {
    it('with _index.json returns listed IDs', async () => {
      facade.store[indexPath('records')] = JSON.stringify(['rec-a', 'rec-b', 'rec-c']);
      const adapter = createAdapter();

      const result = await adapter.listMaterials('records');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ids).toEqual(['rec-a', 'rec-b', 'rec-c']);
      }
    });

    it('with no _index.json returns empty array', async () => {
      const adapter = createAdapter();

      const result = await adapter.listMaterials('records');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ids).toEqual([]);
      }
    });

    it('with _index.json containing non-string values filters them out', async () => {
      facade.store[indexPath('records')] = JSON.stringify(['rec-1', 42, null, 'rec-2', true]);
      const adapter = createAdapter();

      const result = await adapter.listMaterials('records');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ids).toEqual(['rec-1', 'rec-2']);
      }
    });

    it('with _index.json containing non-array returns empty', async () => {
      facade.store[indexPath('records')] = JSON.stringify({ not: 'an array' });
      const adapter = createAdapter();

      const result = await adapter.listMaterials('records');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ids).toEqual([]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Write failure
  // ---------------------------------------------------------------------------

  describe('write failure', () => {
    it('writeTextFile rejects → result is { ok: false }', async () => {
      (facade.writeTextFile as unknown as Mock) = vi.fn(async () => {
        throw new Error('Disk full');
      });

      const adapter = createAdapter();
      const result = await adapter.writeMaterial('records', 'fail-write', { data: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('write-failed');
        expect(result.error.message).toContain('Disk full');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Read corrupted
  // ---------------------------------------------------------------------------

  describe('read corrupted material', () => {
    it('invalid JSON returns corrupted error', async () => {
      facade.store[matPath('records', 'corrupt')] = '{not valid json###';

      const adapter = createAdapter();
      const result = await adapter.readMaterial('records', 'corrupt');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('corrupted');
      }
    });
  });

  // -------------------------------------------------------------------------
  // CRUD round-trip
  // ---------------------------------------------------------------------------

  describe('full CRUD round-trip', () => {
    it('write → read → update → read → delete', async () => {
      const adapter = createAdapter();

      // 1. Write initial value
      const v1 = { name: 'initial', version: 1 };
      const write1 = await adapter.writeMaterial('records', 'rt-001', v1);
      expect(write1.ok).toBe(true);

      // 2. Read and verify
      const read1 = await adapter.readMaterial('records', 'rt-001');
      expect(read1.ok).toBe(true);
      if (read1.ok) {
        expect(read1.value).toEqual(v1);
      }

      // 3. Update (write again with new value)
      const v2 = { name: 'updated', version: 2 };
      const write2 = await adapter.writeMaterial('records', 'rt-001', v2);
      expect(write2.ok).toBe(true);

      // 4. Read and verify updated value
      const read2 = await adapter.readMaterial('records', 'rt-001');
      expect(read2.ok).toBe(true);
      if (read2.ok) {
        expect(read2.value).toEqual(v2);
        // Verify it's really the new value, not the old one
        expect((read2.value as Record<string, unknown>).version).toBe(2);
      }

      // 5. Delete
      const del = await adapter.deleteMaterial('records', 'rt-001');
      expect(del.ok).toBe(true);

      // 6. Verify .deleted file exists
      const deletedPath = matPath('records', 'rt-001.deleted');
      expect(facade.store[deletedPath]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Multiple buckets
  // ---------------------------------------------------------------------------

  describe('multiple buckets', () => {
    it('write to records, history, csv independently', async () => {
      const adapter = createAdapter();

      const recordValue = { type: 'record', data: [1, 2, 3] };
      const historyValue = { hourKey: '2026-05-19T10', records: [] };
      const csvValue = { id: 'csv-1', content: 'a,b,c' };

      await adapter.writeMaterial('records', 'item-1', recordValue);
      await adapter.writeMaterial('history', 'item-1', historyValue);
      await adapter.writeMaterial('csv', 'item-1', csvValue);

      // Each bucket has its own path
      const readRecord = await adapter.readMaterial('records', 'item-1');
      const readHistory = await adapter.readMaterial('history', 'item-1');
      const readCsv = await adapter.readMaterial('csv', 'item-1');

      expect(readRecord.ok).toBe(true);
      expect(readHistory.ok).toBe(true);
      expect(readCsv.ok).toBe(true);

      if (readRecord.ok) expect(readRecord.value).toEqual(recordValue);
      if (readHistory.ok) expect(readHistory.value).toEqual(historyValue);
      if (readCsv.ok) expect(readCsv.value).toEqual(csvValue);
    });

    it('same ID in different buckets are independent', async () => {
      const adapter = createAdapter();

      await adapter.writeMaterial('records', 'shared-id', { bucket: 'records' });
      await adapter.writeMaterial('history', 'shared-id', { bucket: 'history' });

      const readRecords = await adapter.readMaterial('records', 'shared-id');
      const readHistory = await adapter.readMaterial('history', 'shared-id');

      if (readRecords.ok && readHistory.ok) {
        expect(readRecords.value).not.toEqual(readHistory.value);
        expect((readRecords.value as Record<string, unknown>).bucket).toBe('records');
        expect((readHistory.value as Record<string, unknown>).bucket).toBe('history');
      }
    });

    it('list on each bucket is independent', async () => {
      facade.store[indexPath('records')] = JSON.stringify(['r1', 'r2']);
      facade.store[indexPath('history')] = JSON.stringify(['h1']);
      // csv has no index → empty

      const adapter = createAdapter();

      const listRecords = await adapter.listMaterials('records');
      const listHistory = await adapter.listMaterials('history');
      const listCsv = await adapter.listMaterials('csv');

      if (listRecords.ok) expect(listRecords.ids).toEqual(['r1', 'r2']);
      if (listHistory.ok) expect(listHistory.ids).toEqual(['h1']);
      if (listCsv.ok) expect(listCsv.ids).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Special characters in ID
  // -------------------------------------------------------------------------

  describe('ID sanitization', () => {
    it('special characters in ID are replaced with underscore', async () => {
      const adapter = createAdapter();
      const value = { test: true };

      await adapter.writeMaterial('records', 'id/with:special chars', value);

      // The adapter should sanitize the ID for the file path
      const sanitizedPath = `${BASE_DIR}/records/id_with_special_chars.json`;
      expect(facade.store[sanitizedPath]).toBeDefined();

      // Read with the original ID (adapter will sanitize again)
      const result = await adapter.readMaterial('records', 'id/with:special chars');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(value);
      }
    });
  });
});
