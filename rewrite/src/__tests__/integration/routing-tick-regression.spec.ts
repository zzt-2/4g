/**
 * Regression tests for BF-3 (composite adapter null safety).
 *
 * 注(D013):BF-1(fanOutToStorage await fix)的回归测试随 B 路径根除(routingTick 不再写
 * storage)一并删除——测的是已不存在的代码路径。BF-3 与 storage 无关,保留。
 *
 * BF-3: Verifies that createCompositeAdapter handles undefined adapters gracefully
 * without crashing on drainEvents or disconnect.
 */
import { describe, it, expect } from 'vitest';
import { createCompositeAdapter } from '@/features/connection/adapters/composite-adapter';
import type { ConnectionTransportAdapter, ConnectionAdapterCommandOutcome } from '@/features/connection/adapters/ports';

// ---------------------------------------------------------------------------
// BF-3: composite adapter null safety
// ---------------------------------------------------------------------------

describe('BF-3 verification: composite adapter null safety', () => {
  function createStubAdapter(events: readonly unknown[] = []): ConnectionTransportAdapter {
    return {
      connect: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      disconnect: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      write: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      cleanup: async () => ({ ok: true, events: [] }) as ConnectionAdapterCommandOutcome,
      drainEvents: async () => events as unknown[],
    };
  }

  it('both adapters undefined: drainEvents returns empty array without crashing', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const events = await adapter.drainEvents();
    expect(events).toEqual([]);
  });

  it('both adapters undefined: disconnect returns ok', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const result = await adapter.disconnect('conn-1');
    expect(result.ok).toBe(true);
  });

  it('only network adapter: drainEvents delegates correctly', async () => {
    const fakeEvents = [
      { kind: 'data' as const, connectionId: 'net-1', bytes: [0x01, 0x02] },
    ];
    const networkAdapter = createStubAdapter(fakeEvents);

    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter,
    });

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].connectionId).toBe('net-1');
  });

  it('only serial adapter: drainEvents delegates correctly', async () => {
    const fakeEvents = [
      { kind: 'data' as const, connectionId: 'serial-1', bytes: [0x03, 0x04] },
    ];
    const serialAdapter = createStubAdapter(fakeEvents);

    const adapter = createCompositeAdapter({
      serialAdapter,
      networkAdapter: undefined,
    });

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].connectionId).toBe('serial-1');
  });

  it('both adapters present: drainEvents merges events from both', async () => {
    const serialEvents = [
      { kind: 'data' as const, connectionId: 'serial-1', bytes: [0x01] },
    ];
    const networkEvents = [
      { kind: 'data' as const, connectionId: 'net-1', bytes: [0x02] },
    ];

    const adapter = createCompositeAdapter({
      serialAdapter: createStubAdapter(serialEvents),
      networkAdapter: createStubAdapter(networkEvents),
    });

    const events = await adapter.drainEvents();
    expect(events).toHaveLength(2);
    const ids = events.map((e) => e.connectionId);
    expect(ids).toContain('serial-1');
    expect(ids).toContain('net-1');
  });

  it('both adapters undefined: connect returns error outcome', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const result = await adapter.connect({ kind: 'serial', id: 's1', label: 'Serial 1', baudRate: 9600 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No adapter');
    }
  });

  it('both adapters undefined: cleanup returns ok', async () => {
    const adapter = createCompositeAdapter({
      serialAdapter: undefined,
      networkAdapter: undefined,
    });

    const result = await adapter.cleanup();
    expect(result.ok).toBe(true);
  });
});
