/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import type {
  ConnectionOperationOutcome,
  ConnectionStateSnapshot,
  ConnectionService,
  TransportEventSnapshot,
} from '@/features/connection';
import type {
  ReceiveBatchOutcome,
  ReceiveService,
  ReceiveServiceOutcome,
  ReceiveStateSnapshot,
} from '@/features/receive';
import type { ConditionMatchInput } from '@/features/task';
import { ReceiveEventSourceBridge } from '../bridges/receive-event-source-bridge';
import type { RewriteWiredFeatures } from '../feature-wiring';
import { routingTick } from '../routing-tick';

// --- Helpers ---

const emptyConnSnapshot: ConnectionStateSnapshot = {
  schemaVersion: 1 as const,
  configs: [],
  runtimeFacts: [],
  events: [],
};

const emptyReceiveSnapshot = {
  schemaVersion: 1,
  counters: { batchCount: 0, byteCount: 0, matchedCount: 0, unmatchedCount: 0, configErrorCount: 0, parseErrorCount: 0, inputErrorCount: 0, staleInputCount: 0 },
  sources: [],
  frameStats: [],
  recentInputs: [],
  events: [],
  lastError: null,
} as unknown as ReceiveStateSnapshot;

function okDrainOutcome(
  events: readonly TransportEventSnapshot[] = [],
): ConnectionOperationOutcome {
  return {
    ok: true,
    validation: { valid: true, issues: [] },
    snapshot: emptyConnSnapshot,
    events,
  };
}

function failDrainOutcome(
  message: string,
): ConnectionOperationOutcome {
  return {
    ok: false,
    validation: { valid: true, issues: [] },
    snapshot: emptyConnSnapshot,
    events: [],
    error: {
      kind: 'timeout' as const,
      message,
      occurredAt: '2026-01-01T00:00:00.000Z',
      connectionId: 'conn-1',
      recoverable: false,
    },
  };
}

function dataEvent(
  connectionId: string,
  bytes: readonly number[],
): TransportEventSnapshot {
  return {
    id: `${connectionId}:data:now`,
    kind: 'data',
    connectionId,
    occurredAt: '2026-01-01T00:00:00.000Z',
    bytes,
    byteLength: bytes.length,
  };
}

function matchedOutcome(
  frameId: string,
  fields: ReadonlyArray<{
    fieldId: string;
    value: number | string | null;
  }>,
  sourceId?: string,
): ReceiveBatchOutcome {
  return {
    id: 'outcome-1',
    kind: 'matched',
    processedAt: '2026-01-01T00:00:00.000Z',
    matchedFrame: {
      frameId,
      frameName: `Frame ${frameId}`,
      byteLength: 4,
      fieldCount: fields.length,
    },
    fields: fields.map((f, i) => ({
      frameId,
      frameName: `Frame ${frameId}`,
      fieldId: f.fieldId,
      fieldName: `Field ${f.fieldId}`,
      dataType: 'uint8',
      offset: i,
      length: 1,
      rawHex: '00',
      value: f.value,
      displayValue: String(f.value),
    })),
    issues: [],
    statsDelta: {
      batchCount: 1,
      byteCount: 4,
      matchedCount: 1,
      unmatchedCount: 0,
      configErrorCount: 0,
      parseErrorCount: 0,
      inputErrorCount: 0,
      staleInputCount: 0,
      frameHits: [],
      sourceHits: [],
    },
    ...(sourceId
      ? {
          input: {
            id: 'input-1',
            bytes: [0x01, 0x02, 0x03, 0x04],
            receivedAt: '2026-01-01T00:00:00.000Z',
            source: {
              sourceId,
              connectionId: 'conn-1',
              kind: 'serial' as const,
              label: sourceId,
            },
          },
        }
      : {}),
  };
}

function receiveOutcome(
  outcomes: readonly ReceiveBatchOutcome[] = [],
): ReceiveServiceOutcome {
  return {
    ok: true,
    outcomes,
    snapshot: emptyReceiveSnapshot,
    issues: [],
  };
}

function stubFeatures(
  overrides: {
    drainAdapterEvents?: ConnectionService['drainAdapterEvents'];
    drainInputSource?: ReceiveService['drainInputSource'];
    bridge?: ReceiveEventSourceBridge;
  } = {},
): RewriteWiredFeatures {
  const bridge = overrides.bridge ?? new ReceiveEventSourceBridge();
  return {
    frameReader: {} as any,
    settingsService: {} as any,
    storageReader: {} as any,
    connectionService: {
      getSnapshot: () => emptyConnSnapshot,
      listTransportConfigs: () => [],
      listConnectionFacts: () => [],
      getConnectionFact: () => undefined,
      listConnectionSummaries: () => [],
      listTransportTargets: () => [],
      getLastTransportError: () => undefined,
      listTransportEvents: () => [],
      connect: async () => okDrainOutcome(),
      disconnect: async () => okDrainOutcome(),
      write: async () => okDrainOutcome(),
      drainAdapterEvents:
        overrides.drainAdapterEvents ?? (async () => okDrainOutcome()),
      cleanup: async () => okDrainOutcome(),
    } as ConnectionService,
    receiveService: {
      getSnapshot: () => emptyReceiveSnapshot,
      getUiSnapshot: () => ({}) as any,
      getCounters: () => ({}) as any,
      listFrameStats: () => [],
      listSourceStats: () => [],
      listFieldValues: () => [],
      listRecentInputs: () => [],
      listEvents: () => [],
      refreshFrameReferences: () => receiveOutcome(),
      ingestBatch: () => receiveOutcome(),
      recordInputError: () => receiveOutcome(),
      drainInputSource:
        overrides.drainInputSource ??
        (async () => receiveOutcome()),
      reset: () => receiveOutcome(),
    } as ReceiveService,
    sendService: {} as any,
    taskService: {} as any,
    receiveEventSourceBridge: bridge,
  };
}

// --- Tests ---

describe('routingTick', () => {
  it('returns error when connection drain fails', async () => {
    const features = stubFeatures({
      drainAdapterEvents: async () =>
        failDrainOutcome('Connection lost'),
    });

    const result = await routingTick(features);

    expect(result).toEqual({
      ok: false,
      error: 'Connection lost',
      eventsRouted: 0,
      matchesEmitted: 0,
    });
  });

  it('returns empty result when no data events', async () => {
    const features = stubFeatures({
      drainAdapterEvents: async () =>
        okDrainOutcome([
          {
            id: 'conn-1:connected:now',
            kind: 'connected',
            connectionId: 'conn-1',
            occurredAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
    });

    const result = await routingTick(features);

    expect(result).toEqual({
      ok: true,
      eventsRouted: 0,
      matchesEmitted: 0,
    });
  });

  it('routes data events through receive and emits matches', async () => {
    const bridge = new ReceiveEventSourceBridge();
    const received: ConditionMatchInput[] = [];
    bridge.subscribe((input) => received.push(input));

    const features = stubFeatures({
      drainAdapterEvents: async () =>
        okDrainOutcome([
          dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04]),
        ]),
      drainInputSource: async () =>
        receiveOutcome([
          matchedOutcome('frame-a', [
            { fieldId: 'field-1', value: 42 },
            { fieldId: 'field-2', value: 'hello' },
          ], 'conn-1'),
        ]),
      bridge,
    });

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(1);
    expect(result.matchesEmitted).toBe(2);
    expect(received).toEqual([
      {
        frameId: 'frame-a',
        fieldId: 'field-1',
        value: 42,
        sourceId: 'conn-1',
      },
      {
        frameId: 'frame-a',
        fieldId: 'field-2',
        value: 'hello',
        sourceId: 'conn-1',
      },
    ]);
  });

  it('skips unmatched outcomes', async () => {
    const bridge = new ReceiveEventSourceBridge();
    const received: ConditionMatchInput[] = [];
    bridge.subscribe((input) => received.push(input));

    const unmatchedOutcome: ReceiveBatchOutcome = {
      id: 'outcome-unmatched',
      kind: 'unmatched',
      processedAt: '2026-01-01T00:00:00.000Z',
      fields: [],
      issues: [],
      statsDelta: {
        batchCount: 1,
        byteCount: 4,
        matchedCount: 0,
        unmatchedCount: 1,
        configErrorCount: 0,
        parseErrorCount: 0,
        inputErrorCount: 0,
        staleInputCount: 0,
        frameHits: [],
        sourceHits: [],
      },
    };

    const features = stubFeatures({
      drainAdapterEvents: async () =>
        okDrainOutcome([
          dataEvent('conn-1', [0x01, 0x02]),
        ]),
      drainInputSource: async () =>
        receiveOutcome([unmatchedOutcome]),
      bridge,
    });

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(1);
    expect(result.matchesEmitted).toBe(0);
    expect(received).toHaveLength(0);
  });

  it('does not call receive when connection drain fails', async () => {
    let drainInputCalled = false;
    const features = stubFeatures({
      drainAdapterEvents: async () =>
        failDrainOutcome('Connection lost'),
      drainInputSource: async () => {
        drainInputCalled = true;
        return receiveOutcome();
      },
    });

    await routingTick(features);

    expect(drainInputCalled).toBe(false);
  });

  it('skips data events without bytes', async () => {
    const features = stubFeatures({
      drainAdapterEvents: async () =>
        okDrainOutcome([
          {
            id: 'conn-1:data:now',
            kind: 'data',
            connectionId: 'conn-1',
            occurredAt: '2026-01-01T00:00:00.000Z',
            byteLength: 4,
          },
        ]),
    });

    const result = await routingTick(features);

    expect(result).toEqual({
      ok: true,
      eventsRouted: 0,
      matchesEmitted: 0,
    });
  });
});
