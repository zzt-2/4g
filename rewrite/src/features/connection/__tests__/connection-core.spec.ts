import { describe, expect, it } from 'vitest';
import {
  createEmptyConnectionSnapshot,
  deriveTransportTarget,
  normalizeTransportConfig,
  reduceTransportEvent,
  upsertConnectionConfig,
  validateTransportConfig,
} from '../core';
import {
  fakeByteBatchFixture,
  invalidTransportConfigSample,
  serialTransportConfigFixture,
  transportConfigFixtures,
} from '../fixtures/connection-fixtures';

describe('connection core pilot', () => {
  it('validates the four transport config fixture categories', () => {
    for (const config of transportConfigFixtures) {
      expect(validateTransportConfig(config)).toEqual({
        valid: true,
        issues: [],
      });
      expect(normalizeTransportConfig(config).config).toEqual(config);
    }
  });

  it('normalizes invalid config input without accepting unknown fields', () => {
    const outcome = normalizeTransportConfig(invalidTransportConfigSample);

    expect(outcome.valid).toBe(false);
    expect(outcome.config).toEqual({
      id: 'udp-connection',
      kind: 'udp',
      localHost: '0.0.0.0',
      localPort: 1,
    });
    expect(outcome.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'connection.config.unknownFieldIgnored',
        'connection.config.stringInvalid',
        'connection.config.numberInvalid',
      ]),
    );
  });

  it('derives target availability from transport config only', () => {
    expect(deriveTransportTarget(serialTransportConfigFixture, true)).toEqual({
      targetId: 'transport:serial-main',
      connectionId: 'serial-main',
      kind: 'serial',
      role: 'serial-port',
      label: 'Main serial',
      routeLabel: 'COM3',
      available: true,
    });
  });

  it('reduces lifecycle, data, write, error, and close events into runtime facts', () => {
    let snapshot = upsertConnectionConfig(
      createEmptyConnectionSnapshot(),
      serialTransportConfigFixture,
    );

    snapshot = reduceTransportEvent(snapshot, {
      kind: 'connect-requested',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:00.000Z',
    });
    snapshot = reduceTransportEvent(snapshot, {
      kind: 'connected',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:01.000Z',
    });
    snapshot = reduceTransportEvent(snapshot, {
      kind: 'data',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:02.000Z',
      byteLength: fakeByteBatchFixture.length,
    });
    snapshot = reduceTransportEvent(snapshot, {
      kind: 'write-requested',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:03.000Z',
      byteLength: 2,
    });
    snapshot = reduceTransportEvent(snapshot, {
      kind: 'write-accepted',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:04.000Z',
      byteLength: 2,
    });
    snapshot = reduceTransportEvent(snapshot, {
      kind: 'error',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:05.000Z',
      error: {
        kind: 'timeout',
        message: 'Transport timeout.',
        recoverable: true,
      },
    });
    snapshot = reduceTransportEvent(snapshot, {
      kind: 'disconnected',
      connectionId: 'serial-main',
      occurredAt: '2026-05-04T00:00:06.000Z',
    });

    const fact = snapshot.runtimeFacts[0]!;
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
    expect(snapshot.lastError?.kind).toBe('timeout');
    expect(snapshot.events.map((event) => event.kind)).toEqual([
      'connect-requested',
      'connected',
      'data',
      'write-requested',
      'write-accepted',
      'error',
      'disconnected',
    ]);
  });

  it('captures stale platform events as transport errors', () => {
    const snapshot = reduceTransportEvent(createEmptyConnectionSnapshot(), {
      kind: 'data',
      connectionId: 'missing-connection',
      occurredAt: '2026-05-04T00:00:00.000Z',
      byteLength: 1,
    });

    expect(snapshot.events[0]?.kind).toBe('stale-event');
    expect(snapshot.lastError).toMatchObject({
      kind: 'stale-event',
      connectionId: 'missing-connection',
    });
  });
});
