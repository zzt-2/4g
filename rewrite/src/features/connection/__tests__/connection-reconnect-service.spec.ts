import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeConnectionTransportAdapter } from '../adapters/test-exports';
import { createConnectionService, type ConnectionOperationOutcome } from '../services';
import {
  tcpClientTransportConfigFixture,
  serialTransportConfigFixture,
  fakeConnectFailedErrorFixture,
} from '../fixtures/connection-fixtures';
import { getReconnectPolicy, nextReconnectDelay } from '../core/reconnect';

function createTestClock(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-05-08T00:01:${String(tick).padStart(2, '0')}.000Z`;
  };
}

function expectOk(outcome: ConnectionOperationOutcome): void {
  expect(outcome.ok).toBe(true);
  expect(outcome.validation.valid).toBe(true);
}

async function connectTcpClient(
  service: ReturnType<typeof createConnectionService>,
): Promise<ConnectionOperationOutcome> {
  return service.connect(tcpClientTransportConfigFixture);
}

describe('connection reconnect service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('reconnect scheduling on adapter disconnect', () => {
    it('schedules reconnect when tcp-client gets disconnected via drainAdapterEvents', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      await connectTcpClient(service);

      // Simulate adapter-level disconnect (e.g. connection lost)
      adapter.pushClose(tcpClientTransportConfigFixture.id);

      const outcome = await service.drainAdapterEvents();
      expectOk(outcome);

      const kinds = outcome.events.map((e) => e.kind);
      expect(kinds).toContain('disconnected');
      expect(kinds).toContain('reconnect-scheduled');

      const fact = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(fact.reconnectAttempt).toBe(0);
      expect(fact.reconnectNextAt).toBeDefined();
    });

    it('does not schedule reconnect for serial transport', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      await service.connect(serialTransportConfigFixture);

      adapter.pushClose(serialTransportConfigFixture.id);

      const outcome = await service.drainAdapterEvents();
      expectOk(outcome);

      const kinds = outcome.events.map((e) => e.kind);
      expect(kinds).toContain('disconnected');
      expect(kinds).not.toContain('reconnect-scheduled');
      expect(kinds).not.toContain('reconnect-exhausted');

      const fact = service.getConnectionFact(serialTransportConfigFixture.id)!;
      expect(fact.reconnectAttempt).toBeUndefined();
      expect(fact.reconnectNextAt).toBeUndefined();
    });
  });

  describe('single reconnect success', () => {
    it('reconnects successfully after timer fires', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      await connectTcpClient(service);

      // Disconnect via adapter
      adapter.pushClose(tcpClientTransportConfigFixture.id);
      const drainOutcome = await service.drainAdapterEvents();
      expectOk(drainOutcome);

      const factBefore = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factBefore.reconnectAttempt).toBe(0);

      // Advance timer to trigger reconnect
      const policy = getReconnectPolicy('tcp-client');
      const delay = nextReconnectDelay(policy, 0);
      await vi.advanceTimersByTimeAsync(delay);

      // After successful reconnect, state should be reset
      const factAfter = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factAfter.reconnectAttempt).toBeUndefined();
      expect(factAfter.reconnectNextAt).toBeUndefined();
      expect(factAfter.lifecycle).toBe('connected');
    });
  });

  describe('multiple backoff attempts', () => {
    it('retries with increasing delay until success', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      await connectTcpClient(service);

      // Disconnect
      adapter.pushClose(tcpClientTransportConfigFixture.id);
      await service.drainAdapterEvents();

      // First reconnect attempt will fail
      adapter.setFailure({
        operation: 'connect',
        connectionId: tcpClientTransportConfigFixture.id,
        error: fakeConnectFailedErrorFixture,
      });

      const policy = getReconnectPolicy('tcp-client');

      // Fire first timer - attempt 0 -> fails -> schedules attempt 1
      const delay0 = nextReconnectDelay(policy, 0);
      await vi.advanceTimersByTimeAsync(delay0);

      const factAfterFirstFail = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factAfterFirstFail.reconnectAttempt).toBe(1);

      // Clear failure for next attempt to succeed
      adapter.clearFailures();

      // Fire second timer - attempt 1 -> succeeds
      const delay1 = nextReconnectDelay(policy, 1);
      await vi.advanceTimersByTimeAsync(delay1);

      const factAfterSuccess = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factAfterSuccess.reconnectAttempt).toBeUndefined();
      expect(factAfterSuccess.reconnectNextAt).toBeUndefined();
      expect(factAfterSuccess.lifecycle).toBe('connected');
    });
  });

  describe('maxAttempts exhaustion', () => {
    it('emits reconnect-exhausted after all attempts fail', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      // Use a custom config with low maxAttempts for faster testing
      // tcp-client has maxAttempts=10, let's use udp which has maxAttempts=5
      const udpConfig = {
        id: 'udp-test',
        kind: 'udp' as const,
        label: 'UDP test',
        localHost: '0.0.0.0',
        localPort: 6000,
        remoteHost: '127.0.0.1',
        remotePort: 6001,
      };

      await service.connect(udpConfig);

      // Disconnect
      adapter.pushClose(udpConfig.id);
      await service.drainAdapterEvents();

      // All reconnect attempts will fail
      adapter.setFailure({
        operation: 'connect',
        connectionId: udpConfig.id,
        error: fakeConnectFailedErrorFixture,
      });

      const policy = getReconnectPolicy('udp');
      expect(policy.maxAttempts).toBe(5);

      // Run through all attempts
      for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
        const delay = nextReconnectDelay(policy, attempt);
        await vi.advanceTimersByTimeAsync(delay);
      }

      const factAfterExhausted = service.getConnectionFact(udpConfig.id)!;
      expect(factAfterExhausted.reconnectNextAt).toBeUndefined();

      // Check that reconnect-exhausted event was emitted
      const events = service.listTransportEvents();
      const exhaustedEvents = events.filter((e) => e.kind === 'reconnect-exhausted');
      expect(exhaustedEvents.length).toBe(1);
      expect(exhaustedEvents[0]!.connectionId).toBe(udpConfig.id);
    });
  });

  describe('cancel reconnect on disconnect', () => {
    it('cancels pending reconnect when disconnect is called', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      await connectTcpClient(service);

      // Disconnect via adapter
      adapter.pushClose(tcpClientTransportConfigFixture.id);
      await service.drainAdapterEvents();

      const factBefore = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factBefore.reconnectAttempt).toBe(0);
      expect(factBefore.reconnectNextAt).toBeDefined();

      // Explicitly disconnect (cancel reconnect)
      const disconnectOutcome = await service.disconnect(tcpClientTransportConfigFixture.id);
      expectOk(disconnectOutcome);

      const factAfter = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factAfter.reconnectNextAt).toBeUndefined();

      // Advance timer past reconnect delay - no reconnect should happen
      const policy = getReconnectPolicy('tcp-client');
      const delay = nextReconnectDelay(policy, 0);
      await vi.advanceTimersByTimeAsync(delay + 1000);

      // State should remain disconnected (not reconnected)
      const factAfterTimer = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      expect(factAfterTimer.lifecycle).toBe('disconnected');
      expect(factAfterTimer.reconnectNextAt).toBeUndefined();
    });
  });

  describe('cancel reconnect on cleanup', () => {
    it('cancels all pending reconnects on cleanup', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      // Connect two tcp-client connections
      await service.connect(tcpClientTransportConfigFixture);
      const tcpConfig2 = {
        id: 'tcp-client-2',
        kind: 'tcp-client' as const,
        label: 'TCP client 2',
        host: '127.0.0.1',
        port: 5002,
      };
      await service.connect(tcpConfig2);

      // Disconnect both via adapter
      adapter.pushClose(tcpClientTransportConfigFixture.id);
      adapter.pushClose(tcpConfig2.id);
      await service.drainAdapterEvents();

      // Both should have reconnect scheduled
      const fact1 = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      const fact2 = service.getConnectionFact(tcpConfig2.id)!;
      expect(fact1.reconnectAttempt).toBe(0);
      expect(fact2.reconnectAttempt).toBe(0);

      // Cleanup cancels all
      const cleanupOutcome = await service.cleanup();
      expectOk(cleanupOutcome);

      // Advance past all timers
      await vi.advanceTimersByTimeAsync(60000);

      // No reconnects should have happened for either connection
      const fact1After = service.getConnectionFact(tcpClientTransportConfigFixture.id)!;
      const fact2After = service.getConnectionFact(tcpConfig2.id)!;
      expect(fact1After.reconnectNextAt).toBeUndefined();
      expect(fact2After.reconnectNextAt).toBeUndefined();
    });
  });

  describe('reconnect events in drainAdapterEvents result', () => {
    it('includes reconnect-scheduled events in returned events', async () => {
      const clock = createTestClock();
      const adapter = createFakeConnectionTransportAdapter({ now: clock });
      const service = createConnectionService({ adapter, now: clock });

      await connectTcpClient(service);

      adapter.pushClose(tcpClientTransportConfigFixture.id);
      const outcome = await service.drainAdapterEvents();

      const scheduledEvents = outcome.events.filter((e) => e.kind === 'reconnect-scheduled');
      expect(scheduledEvents.length).toBe(1);
      expect(scheduledEvents[0]!.reconnectAttempt).toBe(0);
      expect(scheduledEvents[0]!.reconnectNextAt).toBeDefined();
      expect(scheduledEvents[0]!.connectionId).toBe(tcpClientTransportConfigFixture.id);
    });
  });
});
