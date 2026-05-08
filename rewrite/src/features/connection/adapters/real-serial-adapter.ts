import { defaultNow } from '@/shared';
import { TRANSPORT_ERROR_KINDS, type TransportConfig, type TransportErrorKind, type TransportKind, type TransportTargetRole } from '../core';
import type {
  ConnectionAdapterCommandOutcome,
  ConnectionAdapterErrorInput,
  ConnectionAdapterEvent,
  ConnectionResourceCandidate,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from './ports';
import type {
  TransportFacade,
  SerialPortCandidate,
  TransportBridgeEvent,
} from '@/platform';

const TRANSPORT_ERROR_KIND_SET: ReadonlySet<string> = new Set(TRANSPORT_ERROR_KINDS);

function toAdapterErrorKind(
  kind: string | undefined,
  fallback: TransportErrorKind,
): TransportErrorKind {
  if (kind !== undefined && TRANSPORT_ERROR_KIND_SET.has(kind)) return kind;
  return fallback;
}

export interface CreateRealSerialAdapterOptions {
  readonly transport: TransportFacade;
  readonly now?: () => string;
}


function mapBridgeEvent(event: TransportBridgeEvent): ConnectionAdapterEvent {
  const base = {
    connectionId: event.connectionId,
    occurredAt: event.occurredAt,
  };

  switch (event.kind) {
    case 'connected':
      return {
        kind: 'connected',
        ...base,
        ...(event.target
          ? {
              target: {
                targetId: event.target.targetId,
                connectionId: event.connectionId,
                kind: event.target.kind as TransportKind,
                role: event.target.role as TransportTargetRole,
                label: event.target.label,
                routeLabel: event.target.routeLabel,
                available: true,
              },
            }
          : {}),
      };
    case 'disconnected':
      return { kind: 'disconnected', ...base };
    case 'data':
      return {
        kind: 'data',
        ...base,
        ...(event.bytes ? { bytes: [...event.bytes] } : {}),
        byteLength: event.byteLength,
      };
    case 'error':
      return {
        kind: 'error',
        ...base,
        error: {
          kind: event.error?.kind ?? 'resource-unavailable',
          message: event.error?.message ?? 'Unknown transport error',
          recoverable: event.error?.recoverable ?? true,
        },
      };
  }
}

export interface RealSerialAdapter extends ConnectionTransportAdapter {
  discoverResources(): Promise<readonly ConnectionResourceCandidate[]>;
}

export function createRealSerialAdapter(
  options: CreateRealSerialAdapterOptions,
): RealSerialAdapter {
  const { transport } = options;
  const now = options.now ?? defaultNow;

  return {
    async connect(config: TransportConfig): Promise<ConnectionAdapterCommandOutcome> {
      if (config.kind !== 'serial') {
        const error: ConnectionAdapterErrorInput = {
          kind: 'invalid-config',
          message: `RealSerialAdapter only accepts serial configs, got ${config.kind}`,
          recoverable: false,
        };
        return {
          ok: false,
          error,
          events: [{ kind: 'error', connectionId: config.id, occurredAt: now(), error }],
        };
      }

      const result = await transport.connect({
        kind: 'serial',
        id: config.id,
        portPath: config.portPath,
        baudRate: config.baudRate,
      });

      const events = result.events.map(mapBridgeEvent);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: toAdapterErrorKind(result.error?.kind, 'open-failed'),
            message: result.error?.message ?? 'Serial connect failed',
            recoverable: result.error?.recoverable ?? true,
          },
          events,
        };
      }

      return { ok: true, events };
    },

    async disconnect(connectionId: string): Promise<ConnectionAdapterCommandOutcome> {
      const result = await transport.disconnect(connectionId);
      const events = result.events.map(mapBridgeEvent);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: toAdapterErrorKind(result.error?.kind, 'close-failed'),
            message: result.error?.message ?? 'Serial disconnect failed',
            recoverable: true,
          },
          events,
        };
      }

      return { ok: true, events };
    },

    async write(request: TransportWriteRequest): Promise<ConnectionAdapterCommandOutcome> {
      const result = await transport.write(request.connectionId, [...request.bytes]);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: toAdapterErrorKind(result.error?.kind, 'write-failed'),
            message: result.error?.message ?? 'Serial write failed',
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
                message: result.error?.message ?? 'Serial write failed',
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
      return { ok: true, events };
    },

    async drainEvents(): Promise<readonly ConnectionAdapterEvent[]> {
      const bridgeEvents = transport.drainEvents();
      return bridgeEvents.map(mapBridgeEvent);
    },

    async discoverResources(): Promise<readonly ConnectionResourceCandidate[]> {
      const ports: readonly SerialPortCandidate[] = await transport.enumerateSerialPorts();
      return ports.map((port) => ({
        kind: 'serial' as const,
        id: `serial:${port.path}`,
        label: port.path,
      }));
    },
  };
}
