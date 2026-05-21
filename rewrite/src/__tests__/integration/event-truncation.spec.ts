import { describe, it, expect, beforeEach } from 'vitest';
import {
  createFakeConnectionTransportAdapter,
  type FakeConnectionTransportAdapter,
} from '@/features/connection';
import {
  createConnectionService,
  type ConnectionService,
} from '@/features/connection';
import {
  createReceiveService,
  type ReceiveService,
} from '@/features/receive';
import {
  createDisplayService,
  type DisplayService,
} from '@/features/display';
import { fanOutToDisplay } from '@/runtime/bridges/receive-display-bridge';
import { ConnectionToReceiveInputSource } from '@/runtime/bridges/connection-to-receive';
import type { TransportConfig } from '@/features/connection';

// ---------------------------------------------------------------------------
// Constants matching production code
// ---------------------------------------------------------------------------

// Connection event buffer limit (from lifecycle.ts)
const CONNECTION_EVENT_LIMIT = 50;

// Receive state limits (from receive-state.ts)
const RECEIVE_RECENT_INPUT_LIMIT = 20;
const RECEIVE_EVENT_LIMIT = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSerialConfig(id: string): TransportConfig {
  return {
    id,
    kind: 'serial',
    portPath: `/dev/tty${id}`,
    baudRate: 9600,
  };
}

// ---------------------------------------------------------------------------
// T008: Event truncation and statistics accuracy
// ---------------------------------------------------------------------------

describe('T008: Event truncation and statistics accuracy', () => {
  let fakeAdapter: FakeConnectionTransportAdapter;
  let connectionService: ConnectionService;
  let receiveService: ReceiveService;
  let displayService: DisplayService;

  beforeEach(() => {
    fakeAdapter = createFakeConnectionTransportAdapter();
    connectionService = createConnectionService({ adapter: fakeAdapter });
    receiveService = createReceiveService();
    displayService = createDisplayService();
  });

  // -------------------------------------------------------------------------
  // Connection events buffer: bounded truncation
  // -------------------------------------------------------------------------

  describe('connection events buffer truncation', () => {
    it(`event buffer is capped at ${CONNECTION_EVENT_LIMIT} events`, async () => {
      const config = makeSerialConfig('conn-trunc');
      await connectionService.connect(config);

      // Push more events than the buffer limit
      const eventCount = 100;
      const payload = [0x01, 0x02, 0x03, 0x04];
      for (let i = 0; i < eventCount; i++) {
        fakeAdapter.pushData('conn-trunc', payload);
      }

      const outcome = await connectionService.drainAdapterEvents();
      expect(outcome.ok).toBe(true);

      // After draining, the state buffer should have at most EVENT_LIMIT events
      const snapshot = connectionService.getSnapshot();
      expect(snapshot.events.length).toBeLessThanOrEqual(CONNECTION_EVENT_LIMIT);

      // The returned events are the new ones since beforeLength,
      // but due to truncation, only the last EVENT_LIMIT events survive in the buffer
      expect(outcome.events.length).toBeLessThanOrEqual(CONNECTION_EVENT_LIMIT);
    });

    it('drainAdapterEvents clears the adapter queue completely', async () => {
      const config = makeSerialConfig('conn-clear');
      await connectionService.connect(config);

      for (let i = 0; i < 30; i++) {
        fakeAdapter.pushData('conn-clear', [0x01]);
      }

      await connectionService.drainAdapterEvents();

      // Second drain: adapter queue is empty → no new data events
      const secondDrain = await connectionService.drainAdapterEvents();
      const dataEvents = secondDrain.events.filter(e => e.kind === 'data');
      expect(dataEvents).toHaveLength(0);
    });

    it('counters accumulate correctly despite buffer truncation', async () => {
      const config = makeSerialConfig('conn-counters');
      await connectionService.connect(config);

      // Push many more events than the buffer can hold
      const eventCount = 200;
      const payload = [0x01, 0x02, 0x03, 0x04];
      for (let i = 0; i < eventCount; i++) {
        fakeAdapter.pushData('conn-counters', payload);
      }

      await connectionService.drainAdapterEvents();

      // rxBytes counter should reflect ALL events, not just the truncated buffer
      const snapshot = connectionService.getSnapshot();
      const fact = snapshot.runtimeFacts.find(f => f.connectionId === 'conn-counters');
      expect(fact).toBeDefined();
      // 200 events * 4 bytes = 800 rxBytes
      expect(fact!.counters.rxBytes).toBe(eventCount * 4);

      // But events buffer is truncated
      expect(snapshot.events.filter(e => e.kind === 'data').length).toBeLessThan(eventCount);
    });
  });

  // -------------------------------------------------------------------------
  // Connection events: small batches
  // -------------------------------------------------------------------------

  describe('connection events: small batches', () => {
    it('drainAdapterEvents with no events returns empty data events', async () => {
      const config = makeSerialConfig('conn-empty');
      await connectionService.connect(config);

      const outcome = await connectionService.drainAdapterEvents();
      const dataEvents = outcome.events.filter(e => e.kind === 'data');
      expect(dataEvents).toHaveLength(0);
    });

    it('few events within buffer limit are all returned', async () => {
      const config = makeSerialConfig('conn-few');
      await connectionService.connect(config);

      const eventCount = 10;
      for (let i = 0; i < eventCount; i++) {
        fakeAdapter.pushData('conn-few', [0x01, 0x02]);
      }

      const outcome = await connectionService.drainAdapterEvents();
      const dataEvents = outcome.events.filter(e => e.kind === 'data');
      // All 10 data events should be returned (within EVENT_LIMIT)
      expect(dataEvents).toHaveLength(eventCount);
    });
  });

  // -------------------------------------------------------------------------
  // Receive statistics accuracy (bypassing connection truncation)
  // -------------------------------------------------------------------------

  describe('receive statistics accuracy', () => {
    it('counters are accurate after processing many batches directly', async () => {
      const receive = createReceiveService();

      const batchCount = 100;
      const batches = [];
      for (let i = 0; i < batchCount; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-${i}`,
            bytes: [0x01, 0x02, 0x03, 0x04],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-1',
              connectionId: 'conn-1',
              kind: 'serial' as const,
              label: 'Test Source',
            },
          },
        });
      }

      const fakeSource = { drainEvents: async () => batches };
      const outcome = await receive.drainInputSource(fakeSource);

      expect(outcome.outcomes).toHaveLength(batchCount);

      const counters = receive.getCounters();
      // batchCount and byteCount always accumulate regardless of outcome kind
      expect(counters.batchCount).toBe(batchCount);
      expect(counters.byteCount).toBe(batchCount * 4);
      // With no frames defined, outcomes are 'config-error', not 'unmatched'
      expect(counters.configErrorCount).toBe(batchCount);
      expect(counters.matchedCount).toBe(0);
      expect(counters.unmatchedCount).toBe(0);
    });

    it('display ingests matched outcomes and counters remain accurate', async () => {
      const config = makeSerialConfig('conn-display');
      await connectionService.connect(config);

      // Use a small batch to stay within EVENT_LIMIT
      const batchCount = 10;
      const payload = [0xaa, 0xbb];
      for (let i = 0; i < batchCount; i++) {
        fakeAdapter.pushData('conn-display', payload);
      }

      const drainOutcome = await connectionService.drainAdapterEvents();
      const dataEvents = drainOutcome.events.filter(e => e.kind === 'data' && e.bytes !== undefined);

      const source = new ConnectionToReceiveInputSource(dataEvents);
      const receiveOutcome = await receiveService.drainInputSource(source);

      // Fan out to display
      const displayCount = fanOutToDisplay(displayService, receiveOutcome.outcomes);
      // No matched outcomes → 0 fields to display
      expect(displayCount).toBe(0);

      const counters = receiveService.getCounters();
      expect(counters.batchCount).toBe(batchCount);
      expect(counters.byteCount).toBe(batchCount * 2);
      // config-error because no frames defined
      expect(counters.configErrorCount).toBe(batchCount);
    });
  });

  // -------------------------------------------------------------------------
  // Source stats tracking
  // -------------------------------------------------------------------------

  describe('source stats accuracy', () => {
    it('source stats track per-source counts accurately', async () => {
      const receive = createReceiveService();

      const batches = [];
      for (let i = 0; i < 100; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-${i}`,
            bytes: [0x01, 0x02, 0x03, 0x04],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-1',
              connectionId: 'conn-1',
              kind: 'serial' as const,
              label: 'Test Source',
            },
          },
        });
      }

      const fakeSource = { drainEvents: async () => batches };
      const outcome = await receive.drainInputSource(fakeSource);
      expect(outcome.outcomes).toHaveLength(100);

      const counters = receive.getCounters();
      expect(counters.batchCount).toBe(100);
      expect(counters.byteCount).toBe(100 * 4);
      // No frames → config-error
      expect(counters.configErrorCount).toBe(100);

      const sourceStats = receive.listSourceStats();
      expect(sourceStats).toHaveLength(1);
      expect(sourceStats[0].sourceId).toBe('src-1');
      expect(sourceStats[0].batchCount).toBe(100);
      expect(sourceStats[0].byteCount).toBe(400);
      expect(sourceStats[0].configErrorCount).toBe(100);
    });

    it('draining from empty source returns zero outcomes', async () => {
      const emptySource = { drainEvents: async () => [] };
      const outcome = await receiveService.drainInputSource(emptySource);

      expect(outcome.outcomes).toHaveLength(0);
      expect(outcome.ok).toBe(true);

      const counters = receiveService.getCounters();
      expect(counters.batchCount).toBe(0);
      expect(counters.byteCount).toBe(0);
    });

    it('multiple sources are tracked independently', async () => {
      const receive = createReceiveService();

      const batches = [];
      // Source A: 50 batches of 2 bytes
      for (let i = 0; i < 50; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-a-${i}`,
            bytes: [0x01, 0x02],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-a',
              connectionId: 'conn-a',
              kind: 'serial' as const,
              label: 'Source A',
            },
          },
        });
      }
      // Source B: 30 batches of 3 bytes
      for (let i = 0; i < 30; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-b-${i}`,
            bytes: [0x03, 0x04, 0x05],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-b',
              connectionId: 'conn-b',
              kind: 'serial' as const,
              label: 'Source B',
            },
          },
        });
      }

      const source = { drainEvents: async () => batches };
      const outcome = await receive.drainInputSource(source);

      expect(outcome.outcomes).toHaveLength(80);
      const counters = receive.getCounters();
      expect(counters.batchCount).toBe(80);
      expect(counters.byteCount).toBe(50 * 2 + 30 * 3);

      const sourceStats = receive.listSourceStats();
      expect(sourceStats).toHaveLength(2);

      const srcA = sourceStats.find(s => s.sourceId === 'src-a');
      const srcB = sourceStats.find(s => s.sourceId === 'src-b');
      expect(srcA).toBeDefined();
      expect(srcB).toBeDefined();
      expect(srcA!.batchCount).toBe(50);
      expect(srcB!.batchCount).toBe(30);
      expect(srcA!.byteCount).toBe(100);
      expect(srcB!.byteCount).toBe(90);
    });
  });

  // -------------------------------------------------------------------------
  // High-volume: counters never truncate
  // -------------------------------------------------------------------------

  describe('high-volume counter accuracy', () => {
    it('receive counters are accurate for 2000 batches', async () => {
      const receive = createReceiveService();

      const batchCount = 2000;
      const batches = [];
      for (let i = 0; i < batchCount; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-${i}`,
            bytes: [0xde, 0xad, 0xbe, 0xef],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-hv',
              connectionId: 'conn-hv',
              kind: 'serial' as const,
              label: 'HV Source',
            },
          },
        });
      }

      const source = { drainEvents: async () => batches };
      const outcome = await receive.drainInputSource(source);

      expect(outcome.outcomes).toHaveLength(batchCount);

      const counters = receive.getCounters();
      expect(counters.batchCount).toBe(batchCount);
      expect(counters.byteCount).toBe(batchCount * 4);
      // No frames → config-error
      expect(counters.configErrorCount).toBe(batchCount);

      // Source stats are also accurate
      const sourceStats = receive.listSourceStats();
      expect(sourceStats).toHaveLength(1);
      expect(sourceStats[0].batchCount).toBe(batchCount);
      expect(sourceStats[0].byteCount).toBe(batchCount * 4);
    });

    it('connection rxBytes are accurate for 2000 events despite buffer truncation', async () => {
      const config = makeSerialConfig('conn-hv');
      await connectionService.connect(config);

      const eventCount = 2000;
      const payload = [0xde, 0xad, 0xbe, 0xef];
      for (let i = 0; i < eventCount; i++) {
        fakeAdapter.pushData('conn-hv', payload);
      }

      await connectionService.drainAdapterEvents();

      // Counters accumulate all events
      const snapshot = connectionService.getSnapshot();
      const fact = snapshot.runtimeFacts.find(f => f.connectionId === 'conn-hv');
      expect(fact).toBeDefined();
      expect(fact!.counters.rxBytes).toBe(eventCount * 4);

      // But the event buffer is truncated to EVENT_LIMIT
      expect(snapshot.events.length).toBeLessThanOrEqual(CONNECTION_EVENT_LIMIT);
    });
  });

  // -------------------------------------------------------------------------
  // Connection event type accuracy
  // -------------------------------------------------------------------------

  describe('connection event types', () => {
    it('draining mixed event types applies all correctly', async () => {
      const config = makeSerialConfig('conn-mix');
      await connectionService.connect(config);

      fakeAdapter.pushData('conn-mix', [0x01, 0x02]);
      fakeAdapter.pushData('conn-mix', [0x03, 0x04, 0x05]);
      fakeAdapter.pushError('conn-mix', { kind: 'timeout', message: 'timeout error' });

      const outcome = await connectionService.drainAdapterEvents();
      expect(outcome.ok).toBe(true);

      const dataEvents = outcome.events.filter(e => e.kind === 'data');
      const errorEvents = outcome.events.filter(e => e.kind === 'error');
      expect(dataEvents).toHaveLength(2);
      expect(errorEvents).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Receive state buffer truncation
  // -------------------------------------------------------------------------

  describe('receive state truncation', () => {
    it(`recent inputs are capped at ${RECEIVE_RECENT_INPUT_LIMIT}`, async () => {
      const receive = createReceiveService();

      const batchCount = 50; // more than RECEIVE_RECENT_INPUT_LIMIT (20)
      const batches = [];
      for (let i = 0; i < batchCount; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-${i}`,
            bytes: [0x01],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-1',
              connectionId: 'conn-1',
              kind: 'serial' as const,
              label: 'Source',
            },
          },
        });
      }

      const source = { drainEvents: async () => batches };
      await receive.drainInputSource(source);

      const snapshot = receive.getSnapshot();
      expect(snapshot.recentInputs.length).toBeLessThanOrEqual(RECEIVE_RECENT_INPUT_LIMIT);

      // But counters are still accurate
      expect(snapshot.counters.batchCount).toBe(batchCount);
    });

    it(`receive events are capped at ${RECEIVE_EVENT_LIMIT}`, async () => {
      const receive = createReceiveService();

      const batchCount = 100; // more than RECEIVE_EVENT_LIMIT (50)
      const batches = [];
      for (let i = 0; i < batchCount; i++) {
        batches.push({
          kind: 'batch' as const,
          batch: {
            id: `batch-${i}`,
            bytes: [0x01],
            receivedAt: new Date().toISOString(),
            source: {
              sourceId: 'src-1',
              connectionId: 'conn-1',
              kind: 'serial' as const,
              label: 'Source',
            },
          },
        });
      }

      const source = { drainEvents: async () => batches };
      await receive.drainInputSource(source);

      const snapshot = receive.getSnapshot();
      expect(snapshot.events.length).toBeLessThanOrEqual(RECEIVE_EVENT_LIMIT);

      // Counters unaffected by truncation
      expect(snapshot.counters.batchCount).toBe(batchCount);
    });
  });
});
