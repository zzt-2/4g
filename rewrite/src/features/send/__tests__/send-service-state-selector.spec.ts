import { describe, expect, it } from 'vitest';
import { createSendService, createSendReader } from '../services';
import type { SendResult } from '../core';
import { createSendState } from '../state';
import { selectSendResults, selectSendSnapshot, selectSendStatistics, selectSendStatus } from '../selectors';
import {
  createFakeFrameProvider,
  createFakeConnectionWriter,
  createFailingWriter,
} from '../adapters/test-exports';
import {
  sendFrameAssets,
  validSendRequest,
  targetFixture,
  unavailableTargetFixture,
} from '../fixtures/send-fixtures';

function createTestClock(): { now: () => string; tick: number } {
  let tick = 0;
  return {
    get tick() {
      return tick;
    },
    now: () => {
      tick += 1;
      return `2026-05-06T00:00:${String(tick).padStart(2, '0')}.000Z`;
    },
  };
}

function createTestService(options?: {
  failWrites?: boolean;
}) {
  const clock = createTestClock();
  const frameProvider = createFakeFrameProvider({ frames: sendFrameAssets });
  const connectionWriter = createFakeConnectionWriter({
    targets: [targetFixture, unavailableTargetFixture],
  });
  const state = createSendState();

  const service = createSendService({
    frameReader: frameProvider,
    targetResolver: connectionWriter,
    transportWriter: options?.failWrites ? createFailingWriter('write-failed', 'Transport error') : connectionWriter,
    state,
    now: clock.now,
  });

  return { service, state, connectionWriter, clock };
}

describe('send service: full lifecycle', () => {
  it('executes a successful send', async () => {
    const { service, state } = createTestService();

    const result = await service.execute(validSendRequest);

    expect(result.kind).toBe('sent');
    expect(result.bytesBuilt).toBe(2);
    expect(result.bytesSent).toBe(2);
    expect(result.requestRef.frameId).toBe('send-frame-001');
    expect(result.requestRef.targetId).toBe('target-001');

    const snapshot = state.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.statistics.totalRequests).toBe(1);
    expect(snapshot.statistics.totalSent).toBe(1);
    expect(snapshot.statistics.totalErrors).toBe(0);
  });

  it('returns build-error for unknown frame', async () => {
    const { service, state } = createTestService();

    const result = await service.execute({
      ...validSendRequest,
      frameId: 'nonexistent',
    });

    expect(result.kind).toBe('build-error');
    expect(result.error?.kind).toBe('frame-not-found');

    const stats = state.getSnapshot().statistics;
    expect(stats.totalErrors).toBe(1);
  });

  it('returns target-unavailable for unknown target', async () => {
    const { service, state } = createTestService();

    const result = await service.execute({
      ...validSendRequest,
      targetId: 'nonexistent-target',
    });

    expect(result.kind).toBe('target-unavailable');
    expect(result.error?.kind).toBe('target-not-found');

    const stats = state.getSnapshot().statistics;
    expect(stats.totalErrors).toBe(1);
  });

  it('returns target-unavailable for disconnected target', async () => {
    const { service } = createTestService();

    const result = await service.execute({
      ...validSendRequest,
      targetId: unavailableTargetFixture.targetId,
    });

    expect(result.kind).toBe('target-unavailable');
    expect(result.error?.kind).toBe('target-not-available');
  });

  it('returns transport-error when write fails', async () => {
    const { service } = createTestService({ failWrites: true });

    const result = await service.execute(validSendRequest);

    expect(result.kind).toBe('transport-error');
    expect(result.error?.kind).toBe('write-failed');
    expect(result.bytesBuilt).toBe(2);
    expect(result.bytesSent).toBe(0);
  });

  it('returns build-error for validation failure', async () => {
    const { service } = createTestService();

    const result = await service.execute({
      frameId: '',
      fieldValues: {},
      targetId: '',
      options: {},
      context: { source: 'user' },
    });

    expect(result.kind).toBe('build-error');
    expect(result.buildIssues.length).toBeGreaterThan(0);
  });

  it('emits result through emitter', async () => {
    const emitted: SendResult[] = [];
    const clock = createTestClock();
    const frameProvider = createFakeFrameProvider({ frames: sendFrameAssets });
    const connectionWriter = createFakeConnectionWriter({ targets: [targetFixture] });

    const service = createSendService({
      frameReader: frameProvider,
      targetResolver: connectionWriter,
      transportWriter: connectionWriter,
      resultEmitter: { emit: (r) => emitted.push(r) },
      now: clock.now,
    });

    await service.execute(validSendRequest);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.kind).toBe('sent');
  });

  it('records bytes in transport write', async () => {
    const { service, connectionWriter } = createTestService();
    await service.execute(validSendRequest);

    expect(connectionWriter.recordedWrites).toHaveLength(1);
    expect(connectionWriter.recordedWrites[0]!.connectionId).toBe('conn-serial-001');
    expect(connectionWriter.recordedWrites[0]!.bytes).toEqual([0xff, 0x01]);
  });
});

describe('send service: statistics accumulation', () => {
  it('accumulates stats across multiple sends', async () => {
    const { service, state } = createTestService();

    await service.execute(validSendRequest);
    await service.execute({
      ...validSendRequest,
      targetId: 'nonexistent',
    });

    const stats = state.getSnapshot().statistics;
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalSent).toBe(1);
    expect(stats.totalErrors).toBe(1);
    expect(stats.byFrame['send-frame-001']).toEqual({ sent: 1, errors: 1 });
    expect(stats.byResultKind['sent']).toBe(1);
    expect(stats.byResultKind['target-unavailable']).toBe(1);
  });

  it('resets statistics', async () => {
    const { service, state } = createTestService();
    await service.execute(validSendRequest);

    service.resetStats();
    const stats = state.getSnapshot().statistics;
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalSent).toBe(0);
  });
});

describe('send state', () => {
  it('initializes with idle status and empty stats', () => {
    const state = createSendState();
    const snapshot = state.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.statistics.totalRequests).toBe(0);
    expect(snapshot.recentResults).toHaveLength(0);
  });

  it('updates status', () => {
    const state = createSendState();
    state.setStatus('sending');
    expect(state.getSnapshot().status).toBe('sending');
  });

  it('adds result and updates stats', () => {
    const state = createSendState();
    const result: SendResult = {
      kind: 'sent',
      requestRef: { frameId: 'f1', targetId: 't1', context: { source: 'test' } },
      bytesBuilt: 4,
      bytesSent: 4,
      timestamp: '2026-05-06T00:00:00.000Z',
      buildIssues: [],
    };

    state.addResult(result);
    const snapshot = state.getSnapshot();

    expect(snapshot.status).toBe('idle');
    expect(snapshot.statistics.totalSent).toBe(1);
    expect(snapshot.statistics.totalBytesSent).toBe(4);
    expect(snapshot.recentResults).toHaveLength(1);
    expect(snapshot.statistics.lastSendAt).toBe('2026-05-06T00:00:00.000Z');
  });

  it('sets error status on failure result', () => {
    const state = createSendState();
    state.addResult({
      kind: 'transport-error',
      requestRef: { frameId: 'f1', targetId: 't1', context: { source: 'test' } },
      bytesBuilt: 2,
      bytesSent: 0,
      timestamp: '2026-05-06T00:00:00.000Z',
      error: { kind: 'write-failed', message: 'error' },
      buildIssues: [],
    });

    expect(state.getSnapshot().status).toBe('error');
    expect(state.getSnapshot().lastError?.kind).toBe('write-failed');
  });

  it('clones snapshots to prevent mutation', () => {
    const state = createSendState();
    const snap1 = state.getSnapshot();
    state.setStatus('sending');
    expect(snap1.status).toBe('idle');
    expect(state.getSnapshot().status).toBe('sending');
  });
});

describe('send selectors', () => {
  it('selectSendStatistics returns cloned stats', () => {
    const state = createSendState();
    state.addResult({
      kind: 'sent',
      requestRef: { frameId: 'f1', targetId: 't1', context: { source: 'test' } },
      bytesBuilt: 2,
      bytesSent: 2,
      timestamp: '2026-05-06T00:00:00.000Z',
      buildIssues: [],
    });

    const stats = selectSendStatistics(state.getSnapshot());
    expect(stats.totalSent).toBe(1);
    // Mutating returned stats should not affect state
    (stats as { totalSent: number }).totalSent = 999;
    expect(state.getSnapshot().statistics.totalSent).toBe(1);
  });

  it('selectSendResults returns cloned results', () => {
    const state = createSendState();
    state.addResult({
      kind: 'sent',
      requestRef: { frameId: 'f1', targetId: 't1', context: { source: 'test' } },
      bytesBuilt: 2,
      bytesSent: 2,
      timestamp: '2026-05-06T00:00:00.000Z',
      buildIssues: [],
    });

    const results = selectSendResults(state.getSnapshot());
    expect(results).toHaveLength(1);
    expect(results[0]!.kind).toBe('sent');
  });

  it('selectSendSnapshot returns full snapshot', () => {
    const state = createSendState();
    const snapshot = selectSendSnapshot(state.getSnapshot());
    expect(snapshot.status).toBe('idle');
    expect(snapshot.statistics.totalRequests).toBe(0);
    expect(snapshot.recentResults).toHaveLength(0);
  });

  it('selectSendStatus returns current status', () => {
    const state = createSendState();
    expect(selectSendStatus(state.getSnapshot())).toBe('idle');
    state.setStatus('sending');
    expect(selectSendStatus(state.getSnapshot())).toBe('sending');
  });
});

describe('send reader', () => {
  it('provides read-only access through state', () => {
    const state = createSendState();
    const reader = createSendReader(() => state.getSnapshot());

    expect(reader.getStatus()).toBe('idle');
    expect(reader.getStatistics().totalRequests).toBe(0);
    expect(reader.listResults()).toHaveLength(0);
  });
});

describe('send boundary checks', () => {
  it('public API does not expose mutable state', async () => {
    const { service } = createTestService();
    const snapshot = service.getSnapshot();
    const before = snapshot.statistics.totalSent;

    (snapshot.statistics as { totalSent: number }).totalSent = 999;
    expect(service.getSnapshot().statistics.totalSent).toBe(before);
  });

  it('send result snapshot is independent', async () => {
    const { service } = createTestService();
    await service.execute(validSendRequest);

    const results1 = service.listResults();
    const results2 = service.listResults();
    expect(results1).not.toBe(results2);
    expect(results1).toEqual(results2);
  });
});
