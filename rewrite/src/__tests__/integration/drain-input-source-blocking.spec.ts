/**
 * T024c: drainInputSource sync blocking behavior under heavy load.
 *
 * Verifies that the receive service can drain a large number of input
 * events in a single pass without hanging, OOMing, or producing
 * inaccurate counters.
 */
import { describe, it, expect } from 'vitest';
import {
  createReceiveService,
  type ReceiveInputSource,
  type ReceiveInputEvent,
} from '@/features/receive';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ReceiveInputSource that yields `eventCount` batch events.
 *
 * Each batch carries 4 bytes and originates from the same serial source.
 * Because no frame definitions are registered, every batch resolves to
 * "config-error" — this is the simplest path through the receive pipeline
 * and avoids needing a frame reader.
 */
function createMockSource(eventCount: number): ReceiveInputSource {
  const events: ReceiveInputEvent[] = [];
  for (let i = 0; i < eventCount; i++) {
    events.push({
      kind: 'batch',
      batch: {
        id: `batch-${i}`,
        bytes: [0x01, 0x02, 0x03, 0x04],
        receivedAt: new Date().toISOString(),
        source: {
          sourceId: 'src-1',
          connectionId: 'conn-1',
          kind: 'serial',
          label: 'Test Source',
        },
      },
    });
  }
  return {
    drainEvents: async () => events,
  };
}

// ---------------------------------------------------------------------------
// T024c tests
// ---------------------------------------------------------------------------

describe('T024c: drainInputSource sync blocking behavior under heavy load', () => {
  it('1000 batch events are processed without error', async () => {
    const service = createReceiveService();
    const source = createMockSource(1000);

    const outcome = await service.drainInputSource(source);

    // All 1000 events produce outcomes
    expect(outcome.outcomes).toHaveLength(1000);

    // No frames registered → every batch is config-error, but ok is still true
    // because config-error is a valid outcome kind (not an unexpected failure)
    expect(outcome.outcomes.every(o => o.kind === 'config-error')).toBe(true);
  });

  it('processing 1000 events completes within a reasonable time', async () => {
    const service = createReceiveService();
    const source = createMockSource(1000);

    const start = performance.now();
    await service.drainInputSource(source);
    const elapsed = performance.now() - start;

    // 5 seconds is extremely generous — the loop is synchronous
    // and each iteration is a lightweight state update.
    expect(elapsed).toBeLessThan(5000);
  });

  it('counters are accurate after processing 1000 events', async () => {
    const service = createReceiveService();
    const source = createMockSource(1000);

    await service.drainInputSource(source);

    const counters = service.getCounters();

    // Every batch was processed
    expect(counters.batchCount).toBe(1000);

    // 1000 batches * 4 bytes each
    expect(counters.byteCount).toBe(4000);

    // No frames defined → all config-error, zero matched/unmatched
    expect(counters.configErrorCount).toBe(1000);
    expect(counters.matchedCount).toBe(0);
    expect(counters.unmatchedCount).toBe(0);

    // Source-level stats
    const sourceStats = service.listSourceStats();
    expect(sourceStats).toHaveLength(1);
    expect(sourceStats[0].sourceId).toBe('src-1');
    expect(sourceStats[0].batchCount).toBe(1000);
    expect(sourceStats[0].byteCount).toBe(4000);
    expect(sourceStats[0].configErrorCount).toBe(1000);
  });
});
