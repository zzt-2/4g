import { defaultNow } from '@/shared';
import type { TransportConfig } from '../core';
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
} from '@/platform';
import { mapBridgeEvent, toAdapterErrorKind } from './internal/map-bridge-event';

export interface CreateRealSerialAdapterOptions {
  readonly transport: TransportFacade;
  readonly now?: () => string;
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
