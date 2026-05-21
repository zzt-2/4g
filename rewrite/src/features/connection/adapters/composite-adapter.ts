import type { TransportConfig } from '../core';
import type {
  ConnectionAdapterCommandOutcome,
  ConnectionAdapterEvent,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from './ports';

const SERIAL_KIND = 'serial';
const NETWORK_KINDS = new Set(['tcp-client', 'tcp-server', 'udp']);

export interface CreateCompositeAdapterOptions {
  readonly serialAdapter?: ConnectionTransportAdapter;
  readonly networkAdapter?: ConnectionTransportAdapter;
}

export function createCompositeAdapter(
  options: CreateCompositeAdapterOptions,
): ConnectionTransportAdapter {
  const { serialAdapter, networkAdapter } = options;

  function resolveAdapter(config: TransportConfig): ConnectionTransportAdapter | null {
    if (config.kind === SERIAL_KIND) return serialAdapter ?? null;
    if (NETWORK_KINDS.has(config.kind)) return networkAdapter ?? null;
    return null;
  }

  return {
    async connect(config: TransportConfig): Promise<ConnectionAdapterCommandOutcome> {
      const adapter = resolveAdapter(config);
      if (!adapter) {
        return {
          ok: false,
          error: {
            kind: 'invalid-config',
            message: `No adapter for transport kind "${config.kind}"`,
            recoverable: false,
          },
          events: [],
        };
      }
      return adapter.connect(config);
    },

    async disconnect(connectionId: string): Promise<ConnectionAdapterCommandOutcome> {
      // delegate to both — only the one that owns the connection will succeed meaningfully
      if (serialAdapter && networkAdapter) {
        const [s, n] = await Promise.all([
          serialAdapter.disconnect(connectionId),
          networkAdapter.disconnect(connectionId),
        ]);
        return s.ok ? s : n;
      }
      const adapter = serialAdapter ?? networkAdapter;
      if (!adapter) {
        return { ok: true, events: [] };
      }
      return adapter.disconnect(connectionId);
    },

    async write(request: TransportWriteRequest): Promise<ConnectionAdapterCommandOutcome> {
      // Try serial first, then network — only one will own the connection
      if (serialAdapter) {
        const result = await serialAdapter.write(request);
        if (result.ok) return result;
      }
      if (networkAdapter) {
        return networkAdapter.write(request);
      }
      return {
        ok: false,
        error: {
          kind: 'write-failed',
          message: 'No adapter available for write',
          recoverable: false,
        },
        events: [],
      };
    },

    async cleanup(): Promise<ConnectionAdapterCommandOutcome> {
      const results = await Promise.all([
        serialAdapter?.cleanup() ?? Promise.resolve({ ok: true as const, events: [] as const }),
        networkAdapter?.cleanup() ?? Promise.resolve({ ok: true as const, events: [] as const }),
      ]);
      const allEvents = results.flatMap((r) => r.events);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) return { ...failed, events: allEvents };
      return { ok: true, events: allEvents };
    },

    async drainEvents(): Promise<readonly ConnectionAdapterEvent[]> {
      const allEvents: ConnectionAdapterEvent[] = [];
      if (serialAdapter) {
        const events = await serialAdapter.drainEvents();
        allEvents.push(...events);
      }
      if (networkAdapter) {
        const events = await networkAdapter.drainEvents();
        allEvents.push(...events);
      }
      return allEvents;
    },
  };
}
