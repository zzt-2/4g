import { defaultNow } from '@/shared';
import { cloneTransportConfig, deriveTransportTarget, type TransportConfig } from '../core';
import type {
  ConnectionAdapterCommandOutcome,
  ConnectionAdapterErrorInput,
  ConnectionAdapterEvent,
  ConnectionAdapterOperation,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from './ports';

export interface FakeConnectionAdapterFailure {
  readonly operation: ConnectionAdapterOperation;
  readonly connectionId?: string;
  readonly error: ConnectionAdapterErrorInput;
}

export interface CreateFakeConnectionTransportAdapterOptions {
  readonly failures?: readonly FakeConnectionAdapterFailure[];
  readonly now?: () => string;
}

export interface FakeConnectionTransportAdapter extends ConnectionTransportAdapter {
  setFailure(failure: FakeConnectionAdapterFailure): void;
  clearFailures(): void;
  pushData(connectionId: string, bytes: readonly number[]): void;
  pushError(connectionId: string, error: ConnectionAdapterErrorInput): void;
  pushClose(connectionId: string): void;
  readStoredConfig(connectionId: string): TransportConfig | undefined;
  readWrittenBatches(connectionId: string): number[][];
}


function cloneBytes(bytes: readonly number[]): number[] {
  return [...bytes];
}

function findFailure(
  failures: readonly FakeConnectionAdapterFailure[],
  operation: ConnectionAdapterOperation,
  connectionId?: string,
): FakeConnectionAdapterFailure | undefined {
  return failures.find((failure) => {
    if (failure.operation !== operation) {
      return false;
    }
    return failure.connectionId === undefined || failure.connectionId === connectionId;
  });
}

function rejected(
  failure: FakeConnectionAdapterFailure,
  connectionId: string,
  occurredAt: string,
): ConnectionAdapterCommandOutcome {
  return {
    ok: false,
    error: failure.error,
    events: [
      {
        kind: 'error',
        connectionId,
        occurredAt,
        error: failure.error,
      },
    ],
  };
}

export function createFakeConnectionTransportAdapter(
  options: CreateFakeConnectionTransportAdapterOptions = {},
): FakeConnectionTransportAdapter {
  const now = options.now ?? defaultNow;
  const configs = new Map<string, TransportConfig>();
  const writes = new Map<string, number[][]>();
  const eventQueue: ConnectionAdapterEvent[] = [];
  let failures = [...(options.failures ?? [])];

  return {
    async connect(config): Promise<ConnectionAdapterCommandOutcome> {
      const occurredAt = now();
      const failure = findFailure(failures, 'connect', config.id);
      if (failure) {
        return rejected(failure, config.id, occurredAt);
      }

      const configCopy = cloneTransportConfig(config);
      configs.set(configCopy.id, configCopy);
      return {
        ok: true,
        events: [
          {
            kind: 'connected',
            connectionId: configCopy.id,
            occurredAt,
            target: deriveTransportTarget(configCopy, true),
          },
        ],
      };
    },

    async disconnect(connectionId): Promise<ConnectionAdapterCommandOutcome> {
      const occurredAt = now();
      const failure = findFailure(failures, 'disconnect', connectionId);
      if (failure) {
        return rejected(failure, connectionId, occurredAt);
      }

      const config = configs.get(connectionId);
      configs.delete(connectionId);
      return {
        ok: true,
        events: [
          {
            kind: 'disconnected',
            connectionId,
            occurredAt,
            ...(config ? { target: deriveTransportTarget(config, false) } : {}),
          },
        ],
      };
    },

    async write(request: TransportWriteRequest): Promise<ConnectionAdapterCommandOutcome> {
      const occurredAt = now();
      const failure = findFailure(failures, 'write', request.connectionId);
      if (failure) {
        return {
          ok: false,
          error: failure.error,
          events: [
            {
              kind: 'write-failed',
              connectionId: request.connectionId,
              occurredAt,
              byteLength: request.bytes.length,
              error: failure.error,
            },
          ],
        };
      }

      if (!configs.has(request.connectionId)) {
        const error: ConnectionAdapterErrorInput = {
          kind: 'resource-unavailable',
          message: `Connection is not open: ${request.connectionId}.`,
          recoverable: true,
        };
        return {
          ok: false,
          error,
          events: [
            {
              kind: 'write-failed',
              connectionId: request.connectionId,
              occurredAt,
              byteLength: request.bytes.length,
              error,
            },
          ],
        };
      }

      const existing = writes.get(request.connectionId) ?? [];
      writes.set(request.connectionId, [...existing, cloneBytes(request.bytes)]);

      return {
        ok: true,
        events: [
          {
            kind: 'write-accepted',
            connectionId: request.connectionId,
            occurredAt,
            byteLength: request.bytes.length,
          },
        ],
      };
    },

    async cleanup(): Promise<ConnectionAdapterCommandOutcome> {
      const occurredAt = now();
      const failure = findFailure(failures, 'cleanup');
      if (failure) {
        return rejected(failure, 'cleanup', occurredAt);
      }

      const events = Array.from(configs.values()).map((config) => ({
        kind: 'disconnected' as const,
        connectionId: config.id,
        occurredAt,
        target: deriveTransportTarget(config, false),
      }));
      configs.clear();
      return { ok: true, events };
    },

    async drainEvents(): Promise<readonly ConnectionAdapterEvent[]> {
      return eventQueue.splice(0, eventQueue.length).map((event) => ({
        ...event,
        ...(event.bytes ? { bytes: cloneBytes(event.bytes) } : {}),
      }));
    },

    setFailure(failure) {
      failures = [...failures, failure];
    },

    clearFailures() {
      failures = [];
    },

    pushData(connectionId, bytes) {
      eventQueue.push({
        kind: 'data',
        connectionId,
        occurredAt: now(),
        bytes: cloneBytes(bytes),
        byteLength: bytes.length,
      });
    },

    pushError(connectionId, error) {
      eventQueue.push({
        kind: 'error',
        connectionId,
        occurredAt: now(),
        error,
      });
    },

    pushClose(connectionId) {
      const config = configs.get(connectionId);
      configs.delete(connectionId);
      eventQueue.push({
        kind: 'disconnected',
        connectionId,
        occurredAt: now(),
        ...(config ? { target: deriveTransportTarget(config, false) } : {}),
      });
    },

    readStoredConfig(connectionId) {
      const config = configs.get(connectionId);
      return config ? cloneTransportConfig(config) : undefined;
    },

    readWrittenBatches(connectionId) {
      return (writes.get(connectionId) ?? []).map(cloneBytes);
    },
  };
}
