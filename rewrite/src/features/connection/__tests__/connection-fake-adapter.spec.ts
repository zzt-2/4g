import { describe, expect, it } from 'vitest';
import { createFakeConnectionTransportAdapter } from '../adapters/test-exports';
import {
  fakeByteBatchFixture,
  fakeWriteFailureFixture,
  serialTransportConfigFixture,
} from '../fixtures/connection-fixtures';

type MutableSerialConfigForTest = {
  portPath: string;
};

type MutableDataEventForTest = {
  bytes: number[];
};

function createTestClock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-05-04T00:00:${String(tick).padStart(2, '0')}.000Z`;
  };
}

describe('connection fake adapter pilot', () => {
  it('stores cloned configs and write batches', async () => {
    const adapter = createFakeConnectionTransportAdapter({ now: createTestClock() });
    const config = { ...serialTransportConfigFixture };
    const bytes = [1, 2, 3];

    await adapter.connect(config);
    (config as MutableSerialConfigForTest).portPath = 'mutated';
    await adapter.write({ connectionId: config.id, bytes });
    bytes[0] = 99;

    expect(adapter.readStoredConfig(config.id)?.portPath).toBe('COM3');
    expect(adapter.readWrittenBatches(config.id)).toEqual([[1, 2, 3]]);

    const storedBatches = adapter.readWrittenBatches(config.id);
    storedBatches[0]![0] = 100;
    expect(adapter.readWrittenBatches(config.id)).toEqual([[1, 2, 3]]);
  });

  it('returns injected write failures without storing bytes', async () => {
    const adapter = createFakeConnectionTransportAdapter({
      now: createTestClock(),
      failures: [
        {
          operation: 'write',
          connectionId: serialTransportConfigFixture.id,
          error: fakeWriteFailureFixture,
        },
      ],
    });

    await adapter.connect(serialTransportConfigFixture);
    const outcome = await adapter.write({
      connectionId: serialTransportConfigFixture.id,
      bytes: fakeByteBatchFixture,
    });

    expect(outcome).toEqual({
      ok: false,
      error: fakeWriteFailureFixture,
      events: [
        {
          kind: 'write-failed',
          connectionId: serialTransportConfigFixture.id,
          occurredAt: '2026-05-04T00:00:02.000Z',
          byteLength: fakeByteBatchFixture.length,
          error: fakeWriteFailureFixture,
        },
      ],
    });
    expect(adapter.readWrittenBatches(serialTransportConfigFixture.id)).toEqual([]);
  });

  it('toggles injected failures and returns unopened writes as transport errors', async () => {
    const adapter = createFakeConnectionTransportAdapter({ now: createTestClock() });
    adapter.setFailure({
      operation: 'connect',
      connectionId: serialTransportConfigFixture.id,
      error: {
        kind: 'open-failed',
        message: 'Open failed.',
      },
    });

    const failedConnect = await adapter.connect(serialTransportConfigFixture);
    expect(failedConnect.ok).toBe(false);
    expect(adapter.readStoredConfig(serialTransportConfigFixture.id)).toBeUndefined();

    adapter.clearFailures();
    await expect(adapter.connect(serialTransportConfigFixture)).resolves.toMatchObject({
      ok: true,
    });

    await adapter.disconnect(serialTransportConfigFixture.id);
    const writeOutcome = await adapter.write({
      connectionId: serialTransportConfigFixture.id,
      bytes: fakeByteBatchFixture,
    });

    expect(writeOutcome).toEqual({
      ok: false,
      error: {
        kind: 'resource-unavailable',
        message: `Connection is not open: ${serialTransportConfigFixture.id}.`,
        recoverable: true,
      },
      events: [
        {
          kind: 'write-failed',
          connectionId: serialTransportConfigFixture.id,
          occurredAt: '2026-05-04T00:00:04.000Z',
          byteLength: fakeByteBatchFixture.length,
          error: {
            kind: 'resource-unavailable',
            message: `Connection is not open: ${serialTransportConfigFixture.id}.`,
            recoverable: true,
          },
        },
      ],
    });
  });

  it('cleans up open fake resources through close events', async () => {
    const adapter = createFakeConnectionTransportAdapter({ now: createTestClock() });

    await adapter.connect(serialTransportConfigFixture);
    const outcome = await adapter.cleanup();

    expect(outcome.ok).toBe(true);
    expect(outcome.events).toEqual([
      {
        kind: 'disconnected',
        connectionId: serialTransportConfigFixture.id,
        occurredAt: '2026-05-04T00:00:02.000Z',
        target: {
          targetId: 'transport:serial-main',
          connectionId: 'serial-main',
          kind: 'serial',
          role: 'serial-port',
          label: 'Main serial',
          routeLabel: 'COM3',
          available: false,
        },
      },
    ]);
    expect(adapter.readStoredConfig(serialTransportConfigFixture.id)).toBeUndefined();
  });

  it('queues cloned data, error, and close events', async () => {
    const adapter = createFakeConnectionTransportAdapter({ now: createTestClock() });

    await adapter.connect(serialTransportConfigFixture);
    adapter.pushData(serialTransportConfigFixture.id, fakeByteBatchFixture);
    adapter.pushError(serialTransportConfigFixture.id, {
      kind: 'timeout',
      message: 'Transport timeout.',
      recoverable: true,
    });
    adapter.pushClose(serialTransportConfigFixture.id);

    const events = await adapter.drainEvents();
    (events[0] as MutableDataEventForTest).bytes[0] = 99;

    expect(events.map((event) => event.kind)).toEqual(['data', 'error', 'disconnected']);
    expect((await adapter.drainEvents()).length).toBe(0);

    adapter.pushData(serialTransportConfigFixture.id, fakeByteBatchFixture);
    const nextEvents = await adapter.drainEvents();
    expect(nextEvents[0]?.bytes).toEqual(fakeByteBatchFixture);
  });
});
