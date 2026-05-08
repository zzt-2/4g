import { defaultNow } from '@/shared';
import {
  createConnectionIssue,
  createConnectionValidationOutcome,
  cloneTransportEvent,
  normalizeTransportConfig,
  type ConnectionRuntimeFact,
  type ConnectionStateSnapshot,
  type ConnectionValidationOutcome,
  type NormalizedTransportEventInput,
  type ReadonlyConnectionStateSnapshot,
  type TransportConfig,
  type TransportErrorSnapshot,
  type TransportEventSnapshot,
  type TransportTargetSnapshot,
} from '../core';
import type {
  ConnectionAdapterCommandOutcome,
  ConnectionAdapterErrorInput,
  ConnectionAdapterEvent,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from '../adapters';
import { createConnectionState, type ConnectionStateContainer } from '../state/connection-state';
import {
  selectConnectionFact,
  selectConnectionFacts,
  selectConnectionSnapshot,
  selectConnectionSummaries,
  selectLastTransportError,
  selectTransportConfigs,
  selectTransportEvents,
  selectTransportTargets,
  type ConnectionSummary,
  type ConnectionTargetQuery,
} from '../selectors';

export interface ConnectionReader {
  getSnapshot(): ConnectionStateSnapshot;
  listTransportConfigs(): TransportConfig[];
  listConnectionFacts(): ConnectionRuntimeFact[];
  getConnectionFact(connectionId: string): ConnectionRuntimeFact | undefined;
  listConnectionSummaries(): ConnectionSummary[];
  listTransportTargets(query?: ConnectionTargetQuery): TransportTargetSnapshot[];
  getLastTransportError(): TransportErrorSnapshot | undefined;
  listTransportEvents(): TransportEventSnapshot[];
}

export interface ConnectionOperationOutcome {
  readonly ok: boolean;
  readonly validation: ConnectionValidationOutcome;
  readonly snapshot: ConnectionStateSnapshot;
  readonly events: readonly TransportEventSnapshot[];
  readonly error?: TransportErrorSnapshot;
}

export interface ConnectionService extends ConnectionReader {
  connect(config: unknown): Promise<ConnectionOperationOutcome>;
  disconnect(connectionId: string): Promise<ConnectionOperationOutcome>;
  write(request: TransportWriteRequest): Promise<ConnectionOperationOutcome>;
  drainAdapterEvents(): Promise<ConnectionOperationOutcome>;
  cleanup(): Promise<ConnectionOperationOutcome>;
}

export interface CreateConnectionServiceOptions {
  readonly adapter: ConnectionTransportAdapter;
  readonly state?: ConnectionStateContainer;
  readonly now?: () => string;
}


function validValidation(): ConnectionValidationOutcome {
  return createConnectionValidationOutcome([]);
}

function invalidConfigValidation(): ConnectionValidationOutcome {
  return createConnectionValidationOutcome([
    createConnectionIssue(
      'connection.config.missing',
      'config',
      'Connection config could not be normalized.',
      'error',
    ),
  ]);
}

function adapterErrorToSnapshot(
  error: ConnectionAdapterErrorInput,
  connectionId: string,
  occurredAt: string,
): TransportErrorSnapshot {
  return {
    kind: error.kind,
    message: error.message,
    occurredAt,
    connectionId,
    ...(error.recoverable !== undefined ? { recoverable: error.recoverable } : {}),
  };
}

function adapterEventToNormalized(
  event: ConnectionAdapterEvent,
  now: () => string,
): NormalizedTransportEventInput {
  const occurredAt = event.occurredAt ?? now();
  return {
    kind: event.kind,
    connectionId: event.connectionId,
    occurredAt,
    ...(event.target ? { target: event.target } : {}),
    ...(event.byteLength !== undefined
      ? { byteLength: event.byteLength }
      : event.bytes
        ? { byteLength: event.bytes.length }
        : {}),
    ...(event.bytes ? { bytes: event.bytes } : {}),
    ...(event.error
      ? {
          error: {
            kind: event.error.kind,
            message: event.error.message,
            ...(event.error.recoverable !== undefined
              ? { recoverable: event.error.recoverable }
              : {}),
          },
        }
      : {}),
  };
}

function toErrorEvent(
  connectionId: string,
  error: ConnectionAdapterErrorInput,
  occurredAt: string,
): NormalizedTransportEventInput {
  return {
    kind: 'error',
    connectionId,
    occurredAt,
    error,
  };
}

function collectEventsAfter(
  beforeLength: number,
  snapshot: ReadonlyConnectionStateSnapshot,
): TransportEventSnapshot[] {
  return snapshot.events.slice(beforeLength).map(cloneTransportEvent);
}

export function createConnectionReader(
  snapshotProvider: () => ReadonlyConnectionStateSnapshot,
): ConnectionReader {
  return {
    getSnapshot() {
      return selectConnectionSnapshot(snapshotProvider());
    },

    listTransportConfigs() {
      return selectTransportConfigs(snapshotProvider());
    },

    listConnectionFacts() {
      return selectConnectionFacts(snapshotProvider());
    },

    getConnectionFact(connectionId) {
      return selectConnectionFact(snapshotProvider(), connectionId);
    },

    listConnectionSummaries() {
      return selectConnectionSummaries(snapshotProvider());
    },

    listTransportTargets(query) {
      return selectTransportTargets(snapshotProvider(), query);
    },

    getLastTransportError() {
      return selectLastTransportError(snapshotProvider());
    },

    listTransportEvents() {
      return selectTransportEvents(snapshotProvider());
    },
  };
}

export function createConnectionService(
  options: CreateConnectionServiceOptions,
): ConnectionService {
  const state = options.state ?? createConnectionState();
  const now = options.now ?? defaultNow;
  const reader = createConnectionReader(() => state.getSnapshot());

  function applyEvents(events: readonly ConnectionAdapterEvent[]): void {
    for (const event of events) {
      state.applyEvent(adapterEventToNormalized(event, now));
    }
  }

  function applyAdapterOutcome(
    connectionId: string,
    command: ConnectionAdapterCommandOutcome,
  ): ConnectionOperationOutcome {
    const beforeLength = state.getSnapshot().events.length;

    applyEvents(command.events ?? []);
    if (!command.ok && command.events === undefined) {
      state.applyEvent(toErrorEvent(connectionId, command.error, now()));
    }

    const snapshot = state.getSnapshot();
    const events = collectEventsAfter(beforeLength, snapshot);
    const lastEvent = events[events.length - 1];
    const error = !command.ok
      ? adapterErrorToSnapshot(command.error, connectionId, lastEvent?.occurredAt ?? now())
      : undefined;

    return {
      ok: command.ok,
      validation: command.ok
        ? validValidation()
        : createConnectionValidationOutcome([
            createConnectionIssue(
              `connection.adapter.${command.error.kind}`,
              'adapter',
              command.error.message,
              'error',
            ),
          ]),
      snapshot,
      events,
      ...(error ? { error } : {}),
    };
  }

  return {
    ...reader,

    async connect(input) {
      const normalized = normalizeTransportConfig(input);
      if (!normalized.valid || !normalized.config) {
        return {
          ok: false,
          validation: normalized.issues.length > 0 ? normalized : invalidConfigValidation(),
          snapshot: state.getSnapshot(),
          events: [],
        };
      }

      state.upsertConfig(normalized.config);
      state.applyEvent({
        kind: 'connect-requested',
        connectionId: normalized.config.id,
        occurredAt: now(),
      });

      const command = await options.adapter.connect(normalized.config);
      return applyAdapterOutcome(normalized.config.id, command);
    },

    async disconnect(connectionId) {
      state.applyEvent({
        kind: 'disconnect-requested',
        connectionId,
        occurredAt: now(),
      });

      const command = await options.adapter.disconnect(connectionId);
      return applyAdapterOutcome(connectionId, command);
    },

    async write(request) {
      state.applyEvent({
        kind: 'write-requested',
        connectionId: request.connectionId,
        occurredAt: now(),
        byteLength: request.bytes.length,
      });

      const command = await options.adapter.write(request);
      return applyAdapterOutcome(request.connectionId, command);
    },

    async drainAdapterEvents() {
      const beforeLength = state.getSnapshot().events.length;
      const events = await options.adapter.drainEvents();
      applyEvents(events);
      const snapshot = state.getSnapshot();

      return {
        ok: true,
        validation: validValidation(),
        snapshot,
        events: collectEventsAfter(beforeLength, snapshot),
        ...(selectLastTransportError(snapshot)
          ? { error: selectLastTransportError(snapshot) }
          : {}),
      };
    },

    async cleanup() {
      for (const fact of state.getSnapshot().runtimeFacts) {
        state.applyEvent({
          kind: 'cleanup',
          connectionId: fact.connectionId,
          occurredAt: now(),
        });
      }

      const command = await options.adapter.cleanup();
      return applyAdapterOutcome('cleanup', command);
    },
  };
}
