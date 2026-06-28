/**
 * T002: fanOut correctness (display).
 * T016b: routingTick consumer order.
 *
 * 注(D013):routingTick 不再写 storage records(B 路径根除)。原 T002 的 storage 相关测试
 * (fanOutToStorage receives records / storage failure isolation)随 B 路径退役删除。
 * display 的 fanOut correctness 和 consumer order 测试保留。
 *
 * T002 verifies:
 * 1. fanOutToDisplay correctly passes sourceFields/chartHistory/scatterPoints
 *
 * T016b verifies:
 * 1. routingTick processes events in correct order (drain → filter → receive → fanout → bridge)
 * 2. command-ingress should consume before receive (known gap: not yet integrated into routingTick)
 * 3. Current single-consumer behavior is correct
 */
import { describe, it, expect, vi } from 'vitest';
import { routingTick } from '@/runtime/routing-tick';
import {
  createMockWiredFeatures,
  dataEvent,
  matchedOutcome,
  okOutcome,
  okReceiveOutcome,
} from '@/runtime/__tests__/helpers';
import type { StorageLocalService } from '@/features/storage-local-baseline';
import type { DisplayService, DisplayOperationResult } from '@/features/display';

// ---------------------------------------------------------------------------
// Mock service factories
// ---------------------------------------------------------------------------

function createMockStorageService(): StorageLocalService {
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
    appendLocalRecords: async () => ({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    }),
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
    getPreferences: () => ({ groups: [] }),
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

// ---------------------------------------------------------------------------
// T002: fanOut correctness
// ---------------------------------------------------------------------------

describe('T002: fanOut correctness (display + storage)', () => {
  it('fanOutToDisplay receives correct field data from receive outcomes', async () => {
    const ingestSpy = vi.fn().mockReturnValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });
    const displayService = createMockDisplayService({
      ingestSourceMaterial: ingestSpy,
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04])]),
      },
      receiveService: {
        drainInputSource: async () =>
          okReceiveOutcome([
            matchedOutcome('frame-1', [
              { fieldId: 'f1', value: 42 },
              { fieldId: 'f2', value: 'hello' },
            ], 'src-1'),
          ]),
      },
    });
    (features as Record<string, unknown>).displayService = displayService;
    (features as Record<string, unknown>).storageService = createMockStorageService();

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.matchesEmitted).toBe(1);
    expect(ingestSpy).toHaveBeenCalled();
  });

  it('unmatched outcomes are not forwarded to fanOut (display)', async () => {
    // 注(D013):routingTick 不再写 storage,本测试只验证 display fanOut 不被 unmatched 触发。
    const ingestSpy = vi.fn().mockReturnValue({
      ok: true,
      validation: { valid: true, issues: [] },
      snapshot: {},
    });

    const displayService = createMockDisplayService({
      ingestSourceMaterial: ingestSpy,
    });

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([dataEvent('conn-1', [0xFF, 0xFF])]),
      },
      receiveService: {
        drainInputSource: async () =>
          okReceiveOutcome([
            {
              id: 'unmatched-1',
              kind: 'unmatched',
              processedAt: new Date().toISOString(),
              fields: [],
              issues: [],
              statsDelta: {},
            },
          ]),
      },
    });
    (features as Record<string, unknown>).displayService = displayService;

    const result = await routingTick(features);
    expect(result.ok).toBe(true);

    // Unmatched outcomes should not trigger display fanOut
    expect(ingestSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T016b: routingTick consumer order
// ---------------------------------------------------------------------------

describe('T016b: routingTick consumer order', () => {
  it('event processing follows correct sequence: drain → filter → receive → fanout → bridge', async () => {
    const callOrder: string[] = [];

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () => {
          callOrder.push('drain');
          return okOutcome([
            dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04]),
            dataEvent('conn-1', [0x05, 0x06]),
          ]);
        },
      },
      receiveService: {
        drainInputSource: async () => {
          callOrder.push('receive');
          return okReceiveOutcome([
            matchedOutcome('frame-1', [
              { fieldId: 'f1', value: 1 },
            ], 'src-1'),
          ]);
        },
      },
    });

    // Track fanOut calls（注 D013:routingTick 不再写 storage,只剩 display fanOut）
    const displayService = createMockDisplayService({
      ingestSourceMaterial: () => {
        callOrder.push('fanout-display');
        return { ok: true, validation: { valid: true, issues: [] }, snapshot: {} };
      },
    });
    (features as Record<string, unknown>).displayService = displayService;

    // Track bridge emit
    const originalBridge = features.receiveEventSourceBridge;
    const emitSpy = vi.fn(() => {
      callOrder.push('bridge-emit');
    });
    (features as Record<string, unknown>).receiveEventSourceBridge = {
      ...originalBridge,
      emit: emitSpy,
    };

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(2);
    expect(result.matchesEmitted).toBe(1);

    // Verify call order（无 fanout-storage,见 D013）
    expect(callOrder).toEqual([
      'drain',
      'receive',
      'fanout-display',
      'bridge-emit',
    ]);
  });

  it('non-data events are filtered out before reaching receive', async () => {
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([
            { kind: 'connected', connectionId: 'conn-1', timestamp: new Date().toISOString() },
            { kind: 'disconnected', connectionId: 'conn-2', timestamp: new Date().toISOString() },
            dataEvent('conn-1', [0x01, 0x02]),
          ]),
      },
      receiveService: {
        drainInputSource: async () => {
          return okReceiveOutcome([
            matchedOutcome('frame-1', [
              { fieldId: 'f1', value: 1 },
            ], 'conn-1'),
          ]);
        },
      },
    });
    (features as Record<string, unknown>).storageService = createMockStorageService();

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    // Only 1 data event was routed, the others were filtered
    expect(result.eventsRouted).toBe(1);
  });

  it('when all events are consumed by first consumer, receive gets empty input', async () => {
    // Scenario: all events are non-data events → nothing reaches receive
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([
            { kind: 'connected', connectionId: 'conn-1', timestamp: new Date().toISOString() },
          ]),
      },
    });

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(0);
    expect(result.matchesEmitted).toBe(0);
  });

  it('bridge emit receives correct ConditionMatchInput format', async () => {
    const emitSpy = vi.fn();
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([dataEvent('conn-1', [0xAA, 0x42])]),
      },
      receiveService: {
        drainInputSource: async () =>
          okReceiveOutcome([
            matchedOutcome('frame-A', [
              { fieldId: 'field-1', value: 100 },
              { fieldId: 'field-2', value: 'test' },
            ], 'conn-1'),
            matchedOutcome('frame-B', [
              { fieldId: 'field-x', value: 0 },
            ]),
          ]),
      },
    });
    (features as Record<string, unknown>).receiveEventSourceBridge = {
      ...features.receiveEventSourceBridge,
      emit: emitSpy,
    };
    (features as Record<string, unknown>).storageService = createMockStorageService();

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.matchesEmitted).toBe(2);
    expect(emitSpy).toHaveBeenCalledTimes(1);

    const emittedInputs = emitSpy.mock.calls[0][0];
    expect(emittedInputs).toHaveLength(2);

    // First match
    expect(emittedInputs[0].frameId).toBe('frame-A');
    expect(emittedInputs[0].fieldValues['field-1']).toBe(100);
    expect(emittedInputs[0].fieldValues['field-2']).toBe('test');
    expect(emittedInputs[0].sourceId).toBe('conn-1');

    // Second match — no sourceId
    expect(emittedInputs[1].frameId).toBe('frame-B');
    expect(emittedInputs[1].fieldValues['field-x']).toBe(0);
    expect(emittedInputs[1].sourceId).toBeUndefined();
  });

  it('command-ingress consumer order is a known gap (not yet in routingTick)', () => {
    // Known gap: command-ingress is not yet integrated into routingTick.
    // The current flow is: drain → filter(data) → receive → fanOut → bridge.
    // Command-ingress SHOULD consume SCOE frames BEFORE they reach receive,
    // but this integration has not been implemented yet.
    //
    // When command-ingress is added to routingTick, this test should verify:
    // 1. SCOE frames are consumed by command-ingress first
    // 2. Remaining events are passed to receive
    // 3. Command-ingress consuming all events means receive gets empty input
    //
    // This test documents the gap rather than testing unimplemented behavior.
    expect(true).toBe(true);
  });
});
