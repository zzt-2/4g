import { defaultNow } from '@/shared';
import type { TransportConfig, TransportErrorKind } from '../core';
import type {
  ConnectionAdapterCommandOutcome,
  ConnectionAdapterErrorInput,
  ConnectionAdapterEvent,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from './ports';
import type { TransportConnectConfig, TransportFacade } from '@/platform';
import { mapBridgeEvent, toAdapterErrorKind } from './internal/map-bridge-event';

export interface CreateRealNetworkAdapterOptions {
  readonly transport: TransportFacade;
  readonly now?: () => string;
}

const NETWORK_KINDS = new Set(['tcp-client', 'tcp-server', 'udp']);

function toPlatformConfig(config: TransportConfig): TransportConnectConfig {
  switch (config.kind) {
    case 'tcp-client':
      return { kind: 'tcp-client', id: config.id, host: config.host, port: config.port };
    case 'tcp-server':
      return { kind: 'tcp-server', id: config.id, host: config.host, port: config.port };
    case 'udp':
      return {
        kind: 'udp',
        id: config.id,
        localHost: config.localHost,
        localPort: config.localPort,
        ...(config.remoteHost != null ? { remoteHost: config.remoteHost } : {}),
        ...(config.remotePort != null ? { remotePort: config.remotePort } : {}),
      };
    default:
      return undefined as never;
  }
}

function connectErrorFallback(config: TransportConfig): TransportErrorKind {
  switch (config.kind) {
    case 'tcp-client':
      return 'connect-failed';
    case 'tcp-server':
      return 'listen-failed';
    case 'udp':
      return 'bind-failed';
    default:
      return 'open-failed';
  }
}

export function createRealNetworkAdapter(
  options: CreateRealNetworkAdapterOptions,
): ConnectionTransportAdapter {
  const { transport } = options;
  const now = options.now ?? defaultNow;
  const configStore = new Map<string, TransportConfig>();

  return {
    async connect(config: TransportConfig): Promise<ConnectionAdapterCommandOutcome> {
      if (!NETWORK_KINDS.has(config.kind)) {
        const error: ConnectionAdapterErrorInput = {
          kind: 'invalid-config',
          message: `RealNetworkAdapter only accepts tcp-client, tcp-server, udp configs, got ${config.kind}`,
          recoverable: false,
        };
        return {
          ok: false,
          error,
          events: [{ kind: 'error', connectionId: config.id, occurredAt: now(), error }],
        };
      }

      const platformConfig = toPlatformConfig(config);
      const result = await transport.connect(platformConfig);
      const events = result.events.map(mapBridgeEvent);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: toAdapterErrorKind(result.error?.kind, connectErrorFallback(config)),
            message: result.error?.message ?? `Network connect failed (${config.kind})`,
            recoverable: result.error?.recoverable ?? true,
          },
          events,
        };
      }

      configStore.set(config.id, config);
      return { ok: true, events };
    },

    async disconnect(connectionId: string): Promise<ConnectionAdapterCommandOutcome> {
      const result = await transport.disconnect(connectionId);
      const events = result.events.map(mapBridgeEvent);

      configStore.delete(connectionId);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: toAdapterErrorKind(result.error?.kind, 'close-failed'),
            message: result.error?.message ?? 'Network disconnect failed',
            recoverable: true,
          },
          events,
        };
      }

      return { ok: true, events };
    },

    async write(request: TransportWriteRequest): Promise<ConnectionAdapterCommandOutcome> {
      const storedConfig = configStore.get(request.connectionId);

      if (storedConfig?.kind === 'udp' && !storedConfig.remoteHost && !storedConfig.remotePort) {
        return {
          ok: false,
          error: {
            kind: 'write-failed',
            message: 'UDP write requires remoteHost and remotePort',
            recoverable: true,
          },
          events: [
            {
              kind: 'write-failed',
              connectionId: request.connectionId,
              occurredAt: now(),
              byteLength: request.bytes.length,
              error: {
                kind: 'write-failed',
                message: 'UDP write requires remoteHost and remotePort',
                recoverable: true,
              },
            },
          ],
        };
      }

      const result = await transport.write(request.connectionId, [...request.bytes]);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: toAdapterErrorKind(result.error?.kind, 'write-failed'),
            message: result.error?.message ?? 'Network write failed',
            recoverable: true,
          },
          events: [
            {
              kind: 'write-failed',
              connectionId: request.connectionId,
              occurredAt: now(),
              byteLength: request.bytes.length,
              error: {
                kind: toAdapterErrorKind(result.error?.kind, 'write-failed'),
                message: result.error?.message ?? 'Network write failed',
                recoverable: true,
              },
            },
          ],
        };
      }

      return {
        ok: true,
        events: [
          {
            kind: 'write-accepted',
            connectionId: request.connectionId,
            occurredAt: now(),
            byteLength: request.bytes.length,
          },
        ],
      };
    },

    async cleanup(): Promise<ConnectionAdapterCommandOutcome> {
      const result = await transport.cleanup();
      const events = result.events.map(mapBridgeEvent);
      configStore.clear();
      return { ok: true, events };
    },

    async drainEvents(): Promise<readonly ConnectionAdapterEvent[]> {
      const bridgeEvents = transport.drainEvents();
      return bridgeEvents.map(mapBridgeEvent);
    },
  };
}
