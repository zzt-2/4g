import { describe, expect, it } from 'vitest';
import * as connectionPublicApi from '../index';
import { createFakeConnectionTransportAdapter } from '../adapters/test-exports';
import type { ConnectionAdapterCommandOutcome, ConnectionTransportAdapter } from '../adapters';
import {
  createConnectionReader,
  createConnectionService,
  type ConnectionOperationOutcome,
} from '../services';
import { createConnectionState } from '../state';
import type { ConnectionSummary } from '../core';
import type {
  ConnectionStateSnapshot,
  TransportConfig,
  TransportEventSnapshot,
  TransportTargetSnapshot,
} from '../core';
import {
  fakeByteBatchFixture,
  fakeTimeoutErrorFixture,
  invalidTransportConfigSample,
  serialTransportConfigFixture,
} from '../fixtures/connection-fixtures';

type MutableSnapshotForTest = {
  configs: TransportConfig[];
  runtimeFacts: {
    target: TransportTargetSnapshot;
  }[];
  events: TransportEventSnapshot[];
};

type MutableTargetForTest = {
  label: string;
};

type MutableSummaryForTest = {
  label: string;
};

function createTestClock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-05-04T00:01:${String(tick).padStart(2, '0')}.000Z`;
  };
}

async function createConnectedService(): Promise<{
  service: ReturnType<typeof createConnectionService>;
  adapter: ReturnType<typeof createFakeConnectionTransportAdapter>;
}> {
  const clock = createTestClock();
  const adapter = createFakeConnectionTransportAdapter({ now: clock });
  const service = createConnectionService({ adapter, now: clock });
  await service.connect(serialTransportConfigFixture);
  return { service, adapter };
}

function expectOk(outcome: ConnectionOperationOutcome): void {
  expect(outcome.ok).toBe(true);
  expect(outcome.validation.valid).toBe(true);
}

describe('connection state and service pilot', () => {
  it('drives lifecycle, data, write, error, and close through the service', async () => {
    const { service, adapter } = await createConnectedService();

    const writeOutcome = await service.write({
      connectionId: serialTransportConfigFixture.id,
      bytes: [0x10, 0x11],
    });
    adapter.pushData(serialTransportConfigFixture.id, fakeByteBatchFixture);
    const dataOutcome = await service.drainAdapterEvents();
    adapter.pushError(serialTransportConfigFixture.id, fakeTimeoutErrorFixture);
    const errorOutcome = await service.drainAdapterEvents();
    const closeOutcome = await service.disconnect(serialTransportConfigFixture.id);

    expectOk(writeOutcome);
    expectOk(dataOutcome);
    expectOk(errorOutcome);
    expectOk(closeOutcome);

    const fact = service.getConnectionFact(serialTransportConfigFixture.id)!;
    expect(fact.lifecycle).toBe('disconnected');
    expect(fact.target.available).toBe(false);
    expect(fact.counters).toMatchObject({
      connectAttempts: 1,
      successfulConnects: 1,
      disconnects: 1,
      writeAttempts: 1,
      writeAccepted: 1,
      rxBytes: fakeByteBatchFixture.length,
      txBytes: 2,
      errorCount: 1,
    });
    expect(service.getLastTransportError()?.kind).toBe('timeout');
    expect(service.listTransportEvents().map((event) => event.kind)).toEqual([
      'connect-requested',
      'connected',
      'write-requested',
      'write-accepted',
      'data',
      'error',
      'disconnect-requested',
      'disconnected',
    ]);
  });

  it('keeps invalid config out of state', async () => {
    const adapter = createFakeConnectionTransportAdapter({ now: createTestClock() });
    const service = createConnectionService({ adapter, now: createTestClock() });

    const outcome = await service.connect(invalidTransportConfigSample as unknown as TransportConfig);

    expect(outcome.ok).toBe(false);
    expect(outcome.validation.valid).toBe(false);
    expect(service.getSnapshot()).toEqual({
      schemaVersion: 1,
      configs: [],
      runtimeFacts: [],
      events: [],
    });
  });

  it('cleans up open connections through the service entry', async () => {
    const { service } = await createConnectedService();

    const cleanupOutcome = await service.cleanup();

    expectOk(cleanupOutcome);
    expect(cleanupOutcome.events.map((event) => event.kind)).toEqual(['disconnected']);
    expect(service.getConnectionFact(serialTransportConfigFixture.id)).toMatchObject({
      lifecycle: 'disconnected',
      target: {
        available: false,
      },
    });
  });

  it('normalizes adapter failures that do not provide events', async () => {
    const adapter: ConnectionTransportAdapter = {
      async connect(): Promise<ConnectionAdapterCommandOutcome> {
        return {
          ok: false,
          error: {
            kind: 'open-failed',
            message: 'Open failed without adapter event.',
            recoverable: true,
          },
        };
      },
      async disconnect(): Promise<ConnectionAdapterCommandOutcome> {
        return { ok: true, events: [] };
      },
      async write(): Promise<ConnectionAdapterCommandOutcome> {
        return { ok: true, events: [] };
      },
      async cleanup(): Promise<ConnectionAdapterCommandOutcome> {
        return { ok: true, events: [] };
      },
      async drainEvents() {
        return [];
      },
    };
    const service = createConnectionService({ adapter, now: createTestClock() });

    const outcome = await service.connect(serialTransportConfigFixture);

    expect(outcome.ok).toBe(false);
    expect(outcome.validation.issues[0]).toMatchObject({
      code: 'connection.adapter.open-failed',
      path: 'adapter',
    });
    expect(outcome.events).toEqual([]);
    expect(outcome.error).toMatchObject({
      kind: 'open-failed',
      message: 'Open failed without adapter event.',
    });
    expect(service.getConnectionFact(serialTransportConfigFixture.id)).toBeUndefined();
  });

  it('returns copied snapshots from state and reader boundaries', async () => {
    const state = createConnectionState();
    state.upsertConfig(serialTransportConfigFixture);
    state.applyEvent({
      kind: 'connected',
      connectionId: serialTransportConfigFixture.id,
      occurredAt: '2026-05-04T00:00:00.000Z',
    });

    const snapshot = state.getSnapshot() as MutableSnapshotForTest;
    snapshot.configs[0]!.id = 'mutated';
    (snapshot.runtimeFacts[0]!.target as TransportTargetSnapshot as MutableTargetForTest).label =
      'mutated target';

    const nextSnapshot = state.getSnapshot();
    expect(nextSnapshot.configs[0]?.id).toBe(serialTransportConfigFixture.id);
    expect(nextSnapshot.runtimeFacts[0]?.target.label).toBe('Main serial');

    const reader = createConnectionReader((): ConnectionStateSnapshot => state.getSnapshot());
    const readerSnapshot = reader.getSnapshot() as MutableSnapshotForTest;
    readerSnapshot.configs[0]!.id = 'reader mutation';
    expect(reader.getSnapshot().configs[0]?.id).toBe(serialTransportConfigFixture.id);
  });

  it('copies replaced and reset snapshots instead of caller-owned objects', () => {
    const state = createConnectionState();
    const snapshot = createConnectionState().upsertConfig(serialTransportConfigFixture);

    state.replaceSnapshot(snapshot);
    (snapshot as MutableSnapshotForTest).configs[0]!.id = 'caller mutation';

    expect(state.getSnapshot().configs[0]?.id).toBe(serialTransportConfigFixture.id);

    const resetSnapshot = createConnectionState().upsertConfig({
      ...serialTransportConfigFixture,
      id: 'serial-backup',
    });
    state.resetSnapshot(resetSnapshot);
    (resetSnapshot as MutableSnapshotForTest).configs[0]!.id = 'reset caller mutation';

    expect(state.getSnapshot().configs[0]?.id).toBe('serial-backup');
  });
});

describe('connection selector and public api pilot', () => {
  it('returns selector projections that cannot mutate backing state', async () => {
    const { service } = await createConnectedService();
    const summaries = service.listConnectionSummaries();
    const targets = service.listTransportTargets({ availableOnly: true });

    (summaries[0] as ConnectionSummary as MutableSummaryForTest).label = 'mutated summary';
    (targets[0] as TransportTargetSnapshot as MutableTargetForTest).label = 'mutated target';

    expect(service.listConnectionSummaries()[0]?.label).toBe('Main serial');
    expect(service.listTransportTargets({ availableOnly: true })[0]?.label).toBe('Main serial');
  });

  it('keeps root public api free of internal mutable state', () => {
    expect(connectionPublicApi).toHaveProperty('createConnectionReader');
    expect(connectionPublicApi).toHaveProperty('createConnectionService');
    expect(connectionPublicApi).not.toHaveProperty('createConnectionState');
  });
});
