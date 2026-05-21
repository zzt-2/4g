/**
 * T016: routingTick error isolation.
 *
 * Verifies that failures in one stage of the routingTick pipeline do not
 * silently cascade to block other stages. When a bridge or service fails,
 * other bridges should still execute correctly where the call order allows it,
 * and errors should be observable (not silently swallowed).
 *
 * Verification points:
 * 1. Storage failure does not block display update (display runs first, sync)
 * 2. Storage failure blocks bridge emit — known gap: fanOutToStorage rejection
 *    propagates up before bridge.emit() is reached. Test documents current behavior.
 * 3. Display failure blocks both storage and bridge — known gap: sync call throws
 *    before async stages run. Test documents current behavior.
 * 4. Bridge handler failure: one throwing handler stops iteration of remaining
 *    handlers because bridge.emit() has no per-handler try/catch.
 *    Test documents current behavior.
 * 5. Receive failure prevents all downstream processing (display, storage, bridge).
 * 6. Connection drain failure returns ok: false with error message.
 */
import { describe, it, expect, vi } from 'vitest';
import { routingTick } from '@/runtime/routing-tick';
import { ReceiveEventSourceBridge } from '@/runtime/bridges/receive-event-source-bridge';
import {
  createMockWiredFeatures,
  dataEvent,
  matchedOutcome,
  okOutcome,
  okReceiveOutcome,
  failOutcome,
} from '@/runtime/__tests__/helpers';
import type { StorageLocalService, StorageLocalOperationResult } from '@/features/storage-local-baseline';
import type { DisplayService, DisplayOperationResult } from '@/features/display';
import type { ConditionMatchInput } from '@/features/task';

function createMockStorageService(
  overrides: {
    appendLocalRecords?: (records: readonly unknown[]) => Promise<StorageLocalOperationResult>;
  } = {},
): StorageLocalService {
  return {
    getSnapshot: () => ({
      schemaVersion: 1,
      records: [],
      counters: { totalRecords: 0, totalFields: 0 },
      events: [],
      lastIssue: null,
    }),
    listLocalRecords: () => [],
    getLocalRecord: () => undefined,
    getLastIssue: () => null,
    loadLocalRecords: async () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
    appendLocalRecords:
      overrides.appendLocalRecords ??
      (async () => ({
        ok: true,
        validation: { valid: true, issues: [] },
        snapshot: {},
      })),
    loadHistoryMaterials: async () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
    createCsvFromLocalRecords: async () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
    queryLocalRecords: () => [],
    reset: () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
  } as unknown as StorageLocalService;
}

function createMockDisplayService(
  overrides: {
    ingestSourceMaterial?: (material: unknown) => DisplayOperationResult;
  } = {},
): DisplayService {
  return {
    getSnapshot: () => ({
      preferences: {},
      projection: { tables: [], charts: [], scatter: [] },
      events: [],
    }),
    ingestSourceMaterial:
      overrides.ingestSourceMaterial ??
      (() => ({
        ok: true,
        validation: { valid: true, issues: [] },
        snapshot: {},
      })),
    updatePreferences: () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
    clearProjection: () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
    reset: () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
  } as unknown as DisplayService;
}

function buildFeaturesWithSpies(opts: {
  displayIngest?: (material: unknown) => DisplayOperationResult;
  storageAppend?: (records: readonly unknown[]) => Promise<StorageLocalOperationResult>;
  receiveOutcomes?: readonly unknown[];
  bridgeEmitSpy?: ReturnType<typeof vi.fn>;
} = {}) {
  const ingestSpy = opts.displayIngest
    ? vi.fn(opts.displayIngest)
    : vi.fn().mockReturnValue({
        ok: true,
        validation: { valid: true, issues: [] },
        snapshot: {},
      });
  const appendSpy = opts.storageAppend
    ? vi.fn(opts.storageAppend)
    : vi.fn().mockResolvedValue({
        ok: true,
        validation: { valid: true, issues: [] },
        snapshot: {},
      });

  const displayService = createMockDisplayService({
    ingestSourceMaterial: ingestSpy,
  });
  const storageService = createMockStorageService({
    appendLocalRecords: appendSpy,
  });

  const features = createMockWiredFeatures({
    connectionService: {
      drainAdapterEvents: async () =>
        okOutcome([dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04])]),
    },
    receiveService: {
      drainInputSource: async () =>
        okReceiveOutcome(
          (opts.receiveOutcomes ?? [
            matchedOutcome('frame-1', [{ fieldId: 'f1', value: 42 }], 'src-1'),
          ]) as never[],
        ),
    },
  });
  (features as Record<string, unknown>).displayService = displayService;
  (features as Record<string, unknown>).storageService = storageService;

  if (opts.bridgeEmitSpy) {
    const originalBridge = features.receiveEventSourceBridge;
    (features as Record<string, unknown>).receiveEventSourceBridge = {
      ...originalBridge,
      emit: opts.bridgeEmitSpy,
    };
  }

  return { features, ingestSpy, appendSpy };
}

describe('T016: routingTick error isolation', () => {
  it('storage failure does not block display update (display is called first)', async () => {
    const { features, ingestSpy } = buildFeaturesWithSpies({
      storageAppend: async () => {
        throw new Error('disk full');
      },
    });

    await expect(routingTick(features)).rejects.toThrow('disk full');

    expect(ingestSpy).toHaveBeenCalledTimes(1);
  });

  it('known-gap: storage failure blocks bridge emit (error propagates before emit runs)', async () => {
    const emitSpy = vi.fn();
    const { features } = buildFeaturesWithSpies({
      storageAppend: async () => {
        throw new Error('disk full');
      },
      bridgeEmitSpy: emitSpy,
    });

    await expect(routingTick(features)).rejects.toThrow('disk full');

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('known-gap: display failure blocks storage write and bridge emit (sync throw)', async () => {
    const appendSpy = vi.fn().mockResolvedValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });
    const emitSpy = vi.fn();

    const { features } = buildFeaturesWithSpies({
      displayIngest: () => {
        throw new Error('render crash');
      },
      storageAppend: appendSpy,
      bridgeEmitSpy: emitSpy,
    });

    await expect(routingTick(features)).rejects.toThrow('render crash');

    expect(appendSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('known-gap: one bridge handler throwing stops other handlers', async () => {
    const handlerA = vi.fn(() => {
      throw new Error('handler A crash');
    });
    const handlerB = vi.fn();

    const bridge = new ReceiveEventSourceBridge();
    bridge.subscribe(handlerA);
    bridge.subscribe(handlerB);

    const emitSpy = vi.fn((inputs: readonly ConditionMatchInput[]) => {
      for (const input of inputs) {
        for (const handler of bridge['handlers']) {
          handler(input);
        }
      }
    });

    const { features } = buildFeaturesWithSpies({ bridgeEmitSpy: emitSpy });

    await expect(routingTick(features)).rejects.toThrow('handler A crash');

    expect(emitSpy).toHaveBeenCalled();
    expect(handlerA).toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });

  it('bridge emit works correctly when no errors occur', async () => {
    const handler = vi.fn();

    const bridge = new ReceiveEventSourceBridge();
    bridge.subscribe(handler);
    const emitSpy = vi.fn(bridge.emit.bind(bridge));

    const { features } = buildFeaturesWithSpies({ bridgeEmitSpy: emitSpy });

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.matchesEmitted).toBe(1);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].frameId).toBe('frame-1');
    expect(handler.mock.calls[0][0].fieldValues['f1']).toBe(42);
  });

  it('bridge emit with multiple handlers: all receive data when none throw', async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const bridge = new ReceiveEventSourceBridge();
    bridge.subscribe(handlerA);
    bridge.subscribe(handlerB);

    const emitSpy = vi.fn((inputs: readonly ConditionMatchInput[]) => {
      for (const input of inputs) {
        for (const h of bridge['handlers']) {
          h(input);
        }
      }
    });

    const { features } = buildFeaturesWithSpies({ bridgeEmitSpy: emitSpy });

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerA.mock.calls[0][0].frameId).toBe('frame-1');
    expect(handlerB.mock.calls[0][0].frameId).toBe('frame-1');
  });

  it('receive failure prevents all downstream processing', async () => {
    const ingestSpy = vi.fn().mockReturnValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });
    const appendSpy = vi.fn().mockResolvedValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });
    const emitSpy = vi.fn();

    const displayService = createMockDisplayService({
      ingestSourceMaterial: ingestSpy,
    });
    const storageService = createMockStorageService({
      appendLocalRecords: appendSpy,
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([dataEvent('conn-1', [0x01, 0x02])]),
      },
      receiveService: {
        drainInputSource: async () => {
          throw new Error('receive pipeline broken');
        },
      },
    });
    (features as Record<string, unknown>).displayService = displayService;
    (features as Record<string, unknown>).storageService = storageService;
    (features as Record<string, unknown>).receiveEventSourceBridge = {
      ...features.receiveEventSourceBridge,
      emit: emitSpy,
    };

    await expect(routingTick(features)).rejects.toThrow(
      'receive pipeline broken',
    );

    expect(ingestSpy).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('connection drain failure returns ok:false with error message', async () => {
    const ingestSpy = vi.fn().mockReturnValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });
    const appendSpy = vi.fn().mockResolvedValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });
    const emitSpy = vi.fn();

    const displayService = createMockDisplayService({
      ingestSourceMaterial: ingestSpy,
    });
    const storageService = createMockStorageService({
      appendLocalRecords: appendSpy,
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () => failOutcome('port not found'),
      },
    });
    (features as Record<string, unknown>).displayService = displayService;
    (features as Record<string, unknown>).storageService = storageService;
    (features as Record<string, unknown>).receiveEventSourceBridge = {
      ...features.receiveEventSourceBridge,
      emit: emitSpy,
    };

    const result = await routingTick(features);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('port not found');
    expect(result.eventsRouted).toBe(0);
    expect(result.matchesEmitted).toBe(0);

    expect(ingestSpy).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
