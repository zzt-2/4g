import { describe, expect, it } from 'vitest';
import type {
  ReceiveBatchOutcome,
} from '@/features/receive';
import type { ConditionMatchInput } from '@/features/task';
import { ReceiveEventSourceBridge } from '../bridges/receive-event-source-bridge';
import { routingTick } from '../routing-tick';
import {
  createMockWiredFeatures,
  dataEvent,
  failOutcome,
  matchedOutcome,
  okOutcome,
  okReceiveOutcome,
} from './helpers';

// --- Tests ---

describe('routingTick', () => {
  it('returns error when connection drain fails', async () => {
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          failOutcome('Connection lost'),
      },
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
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([
            {
              id: 'conn-1:connected:now',
              kind: 'connected',
              connectionId: 'conn-1',
              occurredAt: '2026-01-01T00:00:00.000Z',
            },
          ]),
      },
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

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([
            dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04]),
          ]),
      },
      receiveService: {
        drainInputSource: async () =>
          okReceiveOutcome([
            matchedOutcome('frame-a', [
              { fieldId: 'field-1', value: 42 },
              { fieldId: 'field-2', value: 'hello' },
            ], 'conn-1'),
          ]),
      },
      bridge,
    });

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(1);
    expect(result.matchesEmitted).toBe(1);
    expect(received).toEqual([
      {
        frameId: 'frame-a',
        fieldValues: { 'field-1': 42, 'field-2': 'hello' },
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

    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([
            dataEvent('conn-1', [0x01, 0x02]),
          ]),
      },
      receiveService: {
        drainInputSource: async () =>
          okReceiveOutcome([unmatchedOutcome]),
      },
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
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          failOutcome('Connection lost'),
      },
      receiveService: {
        drainInputSource: async () => {
          drainInputCalled = true;
          return okReceiveOutcome();
        },
      },
    });

    await routingTick(features);

    expect(drainInputCalled).toBe(false);
  });

  it('skips data events without bytes', async () => {
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([
            {
              id: 'conn-1:data:now',
              kind: 'data',
              connectionId: 'conn-1',
              occurredAt: '2026-01-01T00:00:00.000Z',
              byteLength: 4,
            },
          ]),
      },
    });

    const result = await routingTick(features);

    expect(result).toEqual({
      ok: true,
      eventsRouted: 0,
      matchesEmitted: 0,
    });
  });
});
