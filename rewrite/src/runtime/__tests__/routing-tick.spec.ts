import { describe, expect, it, vi } from 'vitest';
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

// timings 字段值来自 performance.now(),非确定;断言形状(全部 number 且非负)而非精确值。
// 注(D013):storageMs 已移除(routingTick 不再写 storage,只剩 drain/parse/display 三段)。
function expectTimingShape(t: unknown): void {
  expect(t).toEqual(
    expect.objectContaining({
      drainMs: expect.any(Number),
      parseMs: expect.any(Number),
      displayMs: expect.any(Number),
      eventCount: expect.any(Number),
    }),
  );
}

describe('routingTick', () => {
  it('returns error when connection drain fails', async () => {
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          failOutcome('Connection lost'),
      },
    });

    const result = await routingTick(features);

    expect(result).toMatchObject({
      ok: false,
      error: 'Connection lost',
      eventsRouted: 0,
      matchesEmitted: 0,
    });
    expectTimingShape(result.timings);
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

    expect(result).toMatchObject({
      ok: true,
      eventsRouted: 0,
      matchesEmitted: 0,
    });
    expectTimingShape(result.timings);
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

    expect(result).toMatchObject({
      ok: true,
      eventsRouted: 0,
      matchesEmitted: 0,
    });
    expectTimingShape(result.timings);
  });

  // D013 回归:routingTick 不再把接收帧写进 storage records(B 路径已根除)。
  // 钉死"routingTick 不调 storage 的写方法",防止以后偷偷加回来。
  it('does not write to storage records (B path removed, D013)', async () => {
    const features = createMockWiredFeatures({
      connectionService: {
        drainAdapterEvents: async () =>
          okOutcome([dataEvent('conn-1', [0x01, 0x02, 0x03, 0x04])]),
      },
      receiveService: {
        drainInputSource: async () =>
          okReceiveOutcome([
            matchedOutcome('frame-a', [{ fieldId: 'f1', value: 42 }], 'conn-1'),
          ]),
      },
    });
    // 在内置 storageService mock 上 spy 写方法,routingTick 不应触发它们。
    const appendSpy = vi.spyOn(features.storageService, 'appendLocalRecords');

    const result = await routingTick(features);

    expect(result.ok).toBe(true);
    expect(result.eventsRouted).toBe(1);
    expect(result.matchesEmitted).toBe(1);
    expect(appendSpy).not.toHaveBeenCalled();
  });
});
