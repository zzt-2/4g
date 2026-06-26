/**
 * Regression tests for BF-1 (fanOutToStorage await fix) and BF-3 (composite adapter null safety).
 *
 * BF-1: Verifies that the `await fanOutToStorage()` call in routingTick properly
 * propagates storage errors instead of silently swallowing them.
 *
 * BF-3: Verifies that createCompositeAdapter handles undefined adapters gracefully
 * without crashing on drainEvents or disconnect.
 */
import { describe, it, expect, vi } from 'vitest';
import { routingTick } from '@/runtime/routing-tick';
import { createCompositeAdapter } from '@/features/connection/adapters/composite-adapter';
import {
  createMockWiredFeatures,
  dataEvent,
  matchedOutcome,
  okOutcome,
  okReceiveOutcome,
} from '@/runtime/__tests__/helpers';
import type { ConnectionTransportAdapter, ConnectionAdapterCommandOutcome } from '@/features/connection/adapters/ports';
import type { StorageLocalService, StorageLocalOperationResult } from '@/features/storage-local-baseline';

// ---------------------------------------------------------------------------
// BF-1: fanOutToStorage await regression
// ---------------------------------------------------------------------------

describe('BF-1 regression: fanOutToStorage await propagation', () => {
  function createMockStorageService(
    overrides: {
      appendRoutedRecords?: (records: readonly unknown[]) => Promise<{ ok: boolean }>;
    } = {},
  ): StorageLocalService {
    return {
      getSnapshot: () => ({ schemaVersion: 1, records: [], counters: { totalRecords: 0, totalFields: 0 }, events: [], lastIssue: null }) as StorageLocalService['getSnapshot'] extends () => infer R ? R : never,
      listLocalRecords: () => [],
      getLocalRecord: () => undefined,
      getLastIssue: () => null,
      loadLocalRecords: async () => ({ ok: true, validation: { valid: true, issues: [] }, snapshot: {} as StorageLocalService['getSnapshot'] extends () => infer R ? R : never }),
      appendLocalRecords: async () => ({ ok: true, validation: { valid: true, issues: [] }, snapshot: {} as StorageLocalService['getSnapshot'] extends () => infer R ? R : never }),
      appendRoutedRecords: overrides.appendRoutedRecords ?? (async () => ({ ok: true })),
      flushPendingWrites: async () => {},
      loadHistoryMaterials: async () => ({ ok: true, validation: { valid: true, issues: [] }, snapshot: {} as StorageLocalService['getSnapshot'] extends () => infer R ? R : never }),
      createCsvFromLocalRecords: async () => ({ ok: true, validation: { valid: true, issues: [] }, snapshot: {} as StorageLocalService['getSnapshot'] extends () => infer R ? R : never }),
      queryLocalRecords: () => [],
      reset: () => ({ ok: true, validation: { valid: true, issues: [] }, snapshot: {} as StorageLocalService['getSnapshot'] extends () => infer R ? R : never }),
    } as unknown as StorageLocalService;
  }

  it('when storage appendRoutedRecords rejects, the error propagates (not silently swallowed)', async () => {
    const storageError = new Error('disk full');
    const storageService = createMockStorageService({
      appendRoutedRecords: async () => { throw storageError; },
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () => okOutcome([dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04])]),
      },
      receiveService: {
        drainInputSource: async () => okReceiveOutcome([
          matchedOutcome('frame-1', [{ fieldId: 'f1', value: 42 }], 'src-1'),
        ]),
      },
    });
    // Overwrite storageService on the wired features object
    (features as Record<string, unknown>).storageService = storageService;

    // The await in routingTick should cause the rejection to propagate
    await expect(routingTick(features)).rejects.toThrow('disk full');
  });

  it('when fanOutToStorage succeeds, it was called with correct records', async () => {
    const appendSpy = vi.fn().mockResolvedValue({ ok: true });
    const storageService = createMockStorageService({
      appendRoutedRecords: appendSpy as StorageLocalService['appendRoutedRecords'],
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () => okOutcome([dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04])]),
      },
      receiveService: {
        drainInputSource: async () => okReceiveOutcome([
          matchedOutcome('frame-1', [{ fieldId: 'f1', value: 42 }], 'src-1'),
        ]),
      },
    });
    (features as Record<string, unknown>).storageService = storageService;

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(1);
    expect(result.matchesEmitted).toBe(1);
    // Storage received exactly one record from the matched outcome
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy.mock.calls[0][0]).toHaveLength(1);
  });

  it('fanOutToDisplay is called even when storage appendRoutedRecords rejects', async () => {
    const ingestSpy = vi.fn().mockReturnValue({ ok: true, issues: [], snapshot: {} });

    const storageService = createMockStorageService({
      appendRoutedRecords: async () => { throw new Error('disk full'); },
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () => okOutcome([dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04])]),
      },
      receiveService: {
        drainInputSource: async () => okReceiveOutcome([
          matchedOutcome('frame-1', [{ fieldId: 'f1', value: 42 }], 'src-1'),
        ]),
      },
    });
    (features as Record<string, unknown>).storageService = storageService;
    features.displayService.ingestSourceMaterial = ingestSpy;

    // routingTick rejects because storage throws, but display was already called
    await expect(routingTick(features)).rejects.toThrow('disk full');
    // Display ingest was still invoked (fanOutToDisplay runs before fanOutToStorage)
    expect(ingestSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// BF-3: composite adapter null safety
// ---------------------------------------------------------------------------

describe('BF-3 verification: composite adapter null safety', () => {
  function createStubAdapter(events: readonly unknown[] = []): ConnectionTransportAdapter {
    return {
      connect: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      disconnect: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      write: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      cleanup: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      drainEvents: async () => events as unknown[],
    };
  }

  it('both adapters undefined: drainEvents returns empty array without crashing', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const events = await adapter.drainEvents();
    expect(events).toEqual([]);
  });

  it('both adapters undefined: disconnect returns ok', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const result = await adapter.disconnect('conn-1');
    expect(result.ok).toBe(true);
  });

  it('only network adapter: drainEvents delegates correctly', async () => {
    const fakeEvents = [
      { kind: 'data' as const, connectionId: 'net-1', bytes: [0x01, 0x02] },
    ];
    const networkAdapter = createStubAdapter(fakeEvents);

    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter,
    });

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].connectionId).toBe('net-1');
  });

  it('only serial adapter: drainEvents delegates correctly', async () => {
    const fakeEvents = [
      { kind: 'data' as const, connectionId: 'serial-1', bytes: [0x03, 0x04] },
    ];
    const serialAdapter = createStubAdapter(fakeEvents);

    const adapter = createCompositeAdapter({
      serialAdapter,
      networkAdapter: undefined,
    });

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].connectionId).toBe('serial-1');
  });

  it('both adapters present: drainEvents merges events from both', async () => {
    const serialEvents = [
      { kind: 'data' as const, connectionId: 'serial-1', bytes: [0x01] },
    ];
    const networkEvents = [
      { kind: 'data' as const, connectionId: 'net-1', bytes: [0x02] },
    ];

    const adapter = createCompositeAdapter({
      serialAdapter: createStubAdapter(serialEvents),
      networkAdapter: createStubAdapter(networkEvents),
    });

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(2);
    const ids = events.map((e) => e.connectionId);
    expect(ids).toContain('serial-1');
    expect(ids).toContain('net-1');
  });

  it('both adapters undefined: connect returns error outcome', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const result = await adapter.connect({ kind: 'serial', id: 's1', label: 'Serial 1', baudRate: 9600 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No adapter');
    }
  });

  it('both adapters undefined: cleanup returns ok', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const result = await adapter.cleanup();
    expect(result.ok).toBe(true);
  });
});
