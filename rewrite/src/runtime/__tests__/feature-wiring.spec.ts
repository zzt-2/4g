import { describe, expect, it } from 'vitest';
import type {
  TransportEventSnapshot,
  TransportTargetSnapshot,
} from '@/features/connection';
import { createFakeConnectionTransportAdapter } from '@/features/connection';
import type { ConditionMatchInput } from '@/features/task';
import { ConnectionBackedSendWriter } from '../bridges/connection-backed-writer';
import { ConnectionBackedTargetResolver } from '../bridges/connection-backed-target-resolver';
import { ConnectionToReceiveInputSource } from '../bridges/connection-to-receive';
import { ReceiveEventSourceBridge } from '../bridges/receive-event-source-bridge';
import { wireFeatures } from '../feature-wiring';
import {
  createMockConnectionService,
  dataEvent,
  okOutcome,
  failOutcome,
} from './helpers';

// --- Helpers ---

const fakeTarget: TransportTargetSnapshot = {
  targetId: 'target-1',
  connectionId: 'conn-1',
  kind: 'serial',
  role: 'serial-port',
  label: 'Target 1',
  routeLabel: '/dev/ttyUSB0',
  available: true,
};

function dataEventWithTarget(
  connectionId: string,
  bytes: readonly number[],
  target: TransportTargetSnapshot,
): TransportEventSnapshot {
  return {
    ...dataEvent(connectionId, bytes),
    target,
  };
}

// --- Tests ---

describe('feature wiring', () => {
  it('creates all service/reader/bridge references', () => {
    const adapter = createFakeConnectionTransportAdapter();
    const features = wireFeatures({ connectionAdapter: adapter });

    expect(features.frameReader).toBeDefined();
    expect(features.settingsService).toBeDefined();
    expect(features.storageReader).toBeDefined();
    expect(features.connectionService).toBeDefined();
    expect(features.receiveService).toBeDefined();
    expect(features.sendService).toBeDefined();
    expect(features.taskService).toBeDefined();
    expect(features.receiveEventSourceBridge).toBeInstanceOf(
      ReceiveEventSourceBridge,
    );
  });
});

describe('ConnectionToReceiveInputSource', () => {
  it('converts data events with bytes to receive input events', async () => {
    const events = [
      dataEvent('conn-1', [0x01, 0x02, 0x03]),
      dataEvent('conn-1', [0x04, 0x05]),
    ];
    const source = new ConnectionToReceiveInputSource(events);
    const result = await source.drainEvents();

    expect(result).toHaveLength(2);
    const first = result[0]!;
    expect(first.kind).toBe('batch');
    if (first.kind === 'batch') {
      expect(first.batch).toEqual({
        id: events[0]!.id,
        bytes: [0x01, 0x02, 0x03],
        receivedAt: events[0]!.occurredAt,
        source: {
          sourceId: 'conn-1',
          connectionId: 'conn-1',
          kind: 'serial',
          label: 'conn-1',
        },
      });
    }
  });

  it('uses target info when available', async () => {
    const events = [
      dataEventWithTarget('conn-1', [0x01], fakeTarget),
    ];
    const source = new ConnectionToReceiveInputSource(events);
    const result = await source.drainEvents();

    expect(result).toHaveLength(1);
    const first = result[0]!;
    expect(first.kind).toBe('batch');
    if (first.kind === 'batch') {
      expect(first.batch.source).toEqual({
        sourceId: 'conn-1',
        connectionId: 'conn-1',
        kind: 'serial',
        label: 'Target 1',
        targetId: 'target-1',
      });
    }
  });

  it('returns empty array for events without bytes', async () => {
    const { bytes: _, ...eventWithoutBytes } = dataEvent('conn-1', [0x01]); // eslint-disable-line @typescript-eslint/no-unused-vars
    const source = new ConnectionToReceiveInputSource([eventWithoutBytes]);
    const result = await source.drainEvents();

    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', async () => {
    const source = new ConnectionToReceiveInputSource([]);
    const result = await source.drainEvents();

    expect(result).toHaveLength(0);
  });
});

describe('ConnectionBackedSendWriter', () => {
  it('maps successful write with write-accepted event', async () => {
    const acceptedEvent = {
      id: 'conn-1:write-accepted:now',
      kind: 'write-accepted' as const,
      connectionId: 'conn-1',
      occurredAt: '2026-01-01T00:00:00.000Z',
      byteLength: 5,
    };
    const service = createMockConnectionService({
      write: async () => okOutcome([acceptedEvent]),
    });
    const writer = new ConnectionBackedSendWriter(service);
    const result = await writer.writeBytes('conn-1', [1, 2, 3, 4, 5]);

    expect(result).toEqual({ ok: true, bytesWritten: 5 });
  });

  it('falls back to bytesWritten=0 when no write-accepted event', async () => {
    const service = createMockConnectionService({
      write: async () => okOutcome([]),
    });
    const writer = new ConnectionBackedSendWriter(service);
    const result = await writer.writeBytes('conn-1', [1, 2, 3]);

    expect(result).toEqual({ ok: true, bytesWritten: 0 });
  });

  it('maps failed write to error outcome', async () => {
    const service = createMockConnectionService({
      write: async () =>
        failOutcome('Write timed out', { kind: 'timeout' }),
    });
    const writer = new ConnectionBackedSendWriter(service);
    const result = await writer.writeBytes('conn-1', [1, 2, 3]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bytesWritten).toBe(0);
      expect(result.error?.kind).toBe('timeout');
      expect(result.error?.message).toBe('Write timed out');
    }
  });
});

describe('ConnectionBackedTargetResolver', () => {
  it('resolves target by id', () => {
    const service = createMockConnectionService({
      listTransportTargets: () => [fakeTarget],
    });
    const resolver = new ConnectionBackedTargetResolver(service);

    expect(resolver.resolveTarget('target-1')).toEqual(fakeTarget);
  });

  it('returns undefined for unknown target', () => {
    const service = createMockConnectionService({
      listTransportTargets: () => [fakeTarget],
    });
    const resolver = new ConnectionBackedTargetResolver(service);

    expect(resolver.resolveTarget('unknown')).toBeUndefined();
  });
});

describe('ReceiveEventSourceBridge', () => {
  it('notifies subscribers on emit', () => {
    const bridge = new ReceiveEventSourceBridge();
    const received: ConditionMatchInput[][] = [];
    bridge.subscribe((input) => received.push([input]));

    const inputs: ConditionMatchInput[] = [
      { frameId: 'f1', fieldId: 'field-1', value: 42, sourceId: 'conn-1' },
      { frameId: 'f1', fieldId: 'field-2', value: 'hello' },
    ];
    bridge.emit(inputs);

    expect(received).toHaveLength(2);
    expect(received[0]![0]).toEqual(inputs[0]);
    expect(received[1]![0]).toEqual(inputs[1]);
  });

  it('supports multiple subscribers', () => {
    const bridge = new ReceiveEventSourceBridge();
    const received1: ConditionMatchInput[] = [];
    const received2: ConditionMatchInput[] = [];
    bridge.subscribe((input) => received1.push(input));
    bridge.subscribe((input) => received2.push(input));

    const input: ConditionMatchInput = {
      frameId: 'f1',
      fieldId: 'field-1',
      value: 1,
    };
    bridge.emit([input]);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('unsubscribes correctly', () => {
    const bridge = new ReceiveEventSourceBridge();
    const received: ConditionMatchInput[] = [];
    const unsub = bridge.subscribe((input) => received.push(input));

    unsub();
    bridge.emit([
      { frameId: 'f1', fieldId: 'field-1', value: 1 },
    ]);

    expect(received).toHaveLength(0);
  });

  it('clears all subscribers', () => {
    const bridge = new ReceiveEventSourceBridge();
    const received: ConditionMatchInput[] = [];
    bridge.subscribe((input) => received.push(input));

    bridge.clear();
    bridge.emit([
      { frameId: 'f1', fieldId: 'field-1', value: 1 },
    ]);

    expect(received).toHaveLength(0);
  });
});
