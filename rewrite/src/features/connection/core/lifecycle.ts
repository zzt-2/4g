import { cloneConnectionStateSnapshot, cloneTransportConfig } from './clone';
import {
  CONNECTION_SCHEMA_VERSION,
  type ConnectionCounterSnapshot,
  type ConnectionRuntimeFact,
  type ConnectionStateSnapshot,
  type NormalizedTransportEventInput,
  type ReadonlyConnectionStateSnapshot,
  type TransportConfig,
  type TransportErrorSnapshot,
  type TransportEventKind,
  type TransportEventSnapshot,
  type TransportTargetRole,
  type TransportTargetSnapshot,
} from './types';

const EVENT_LIMIT = 50;

export function createEmptyConnectionCounters(): ConnectionCounterSnapshot {
  return {
    connectAttempts: 0,
    successfulConnects: 0,
    disconnects: 0,
    writeAttempts: 0,
    writeAccepted: 0,
    writeFailures: 0,
    rxBytes: 0,
    txBytes: 0,
    errorCount: 0,
    staleEvents: 0,
  };
}

export function createEmptyConnectionSnapshot(): ConnectionStateSnapshot {
  return {
    schemaVersion: CONNECTION_SCHEMA_VERSION,
    configs: [],
    runtimeFacts: [],
    events: [],
  };
}

function targetRoleForConfig(config: TransportConfig): TransportTargetRole {
  switch (config.kind) {
    case 'serial':
      return 'serial-port';
    case 'tcp-client':
      return 'tcp-client-peer';
    case 'tcp-server':
      return 'tcp-server-listener';
    case 'udp':
      return 'udp-remote';
  }
}

function routeLabelForConfig(config: TransportConfig): string {
  switch (config.kind) {
    case 'serial':
      return config.portPath;
    case 'tcp-client':
    case 'tcp-server':
      return `${config.host}:${config.port}`;
    case 'udp':
      return config.remoteHost && config.remotePort
        ? `${config.localHost}:${config.localPort} → ${config.remoteHost}:${config.remotePort}`
        : `${config.localHost}:${config.localPort}`;
  }
}

export function deriveTransportTarget(
  config: TransportConfig,
  available: boolean,
): TransportTargetSnapshot {
  const routeLabel = routeLabelForConfig(config);
  return {
    targetId: `transport:${config.id}`,
    connectionId: config.id,
    kind: config.kind,
    role: targetRoleForConfig(config),
    label: config.label ?? routeLabel,
    routeLabel,
    available,
  };
}

export function createDisconnectedRuntimeFact(config: TransportConfig): ConnectionRuntimeFact {
  return {
    connectionId: config.id,
    kind: config.kind,
    lifecycle: 'disconnected',
    config: cloneTransportConfig(config),
    target: deriveTransportTarget(config, false),
    counters: createEmptyConnectionCounters(),
  };
}

function toEventError(
  event: NormalizedTransportEventInput,
): TransportErrorSnapshot | undefined {
  if (!event.error) {
    return undefined;
  }

  return {
    kind: event.error.kind,
    message: event.error.message,
    occurredAt: event.error.occurredAt ?? event.occurredAt,
    connectionId: event.error.connectionId ?? event.connectionId,
    ...(event.error.recoverable !== undefined ? { recoverable: event.error.recoverable } : {}),
  };
}

export function createTransportEventSnapshot(
  event: NormalizedTransportEventInput,
): TransportEventSnapshot {
  const error = toEventError(event);
  return {
    id: `${event.connectionId}:${event.kind}:${event.occurredAt}`,
    kind: event.kind,
    connectionId: event.connectionId,
    occurredAt: event.occurredAt,
    ...(event.target ? { target: event.target } : {}),
    ...(event.byteLength !== undefined ? { byteLength: event.byteLength } : {}),
    ...(event.bytes ? { bytes: event.bytes } : {}),
    ...(error ? { error } : {}),
    ...(event.reconnectAttempt !== undefined ? { reconnectAttempt: event.reconnectAttempt } : {}),
    ...(event.reconnectNextAt ? { reconnectNextAt: event.reconnectNextAt } : {}),
  };
}

function updateCountersForEvent(
  counters: ConnectionCounterSnapshot,
  event: TransportEventSnapshot,
): ConnectionCounterSnapshot {
  switch (event.kind) {
    case 'connect-requested':
      return { ...counters, connectAttempts: counters.connectAttempts + 1 };
    case 'connected':
      return { ...counters, successfulConnects: counters.successfulConnects + 1 };
    case 'disconnected':
      return { ...counters, disconnects: counters.disconnects + 1 };
    case 'data':
      return { ...counters, rxBytes: counters.rxBytes + (event.byteLength ?? 0) };
    case 'write-requested':
      return { ...counters, writeAttempts: counters.writeAttempts + 1 };
    case 'write-accepted':
      return {
        ...counters,
        writeAccepted: counters.writeAccepted + 1,
        txBytes: counters.txBytes + (event.byteLength ?? 0),
      };
    case 'write-failed':
      return {
        ...counters,
        writeFailures: counters.writeFailures + 1,
        errorCount: counters.errorCount + 1,
      };
    case 'error':
      return { ...counters, errorCount: counters.errorCount + 1 };
    case 'stale-event':
      return { ...counters, staleEvents: counters.staleEvents + 1 };
    case 'cleanup':
    case 'disconnect-requested':
    case 'reconnect-scheduled':
    case 'reconnect-exhausted':
      return counters;
  }
}

function lifecycleForEvent(
  current: ConnectionRuntimeFact,
  eventKind: TransportEventKind,
): ConnectionRuntimeFact['lifecycle'] {
  switch (eventKind) {
    case 'connect-requested':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'disconnect-requested':
      return 'disconnecting';
    case 'disconnected':
    case 'cleanup':
      return 'disconnected';
    case 'error':
      return 'error';
    case 'write-failed':
    case 'data':
    case 'write-requested':
    case 'write-accepted':
    case 'stale-event':
    case 'reconnect-scheduled':
    case 'reconnect-exhausted':
      return current.lifecycle;
  }
}

function applyEventToFact(
  fact: ConnectionRuntimeFact,
  event: TransportEventSnapshot,
): ConnectionRuntimeFact {
  const lifecycle = lifecycleForEvent(fact, event.kind);
  const available =
    lifecycle === 'connected' &&
    event.kind !== 'disconnected' &&
    event.kind !== 'cleanup' &&
    event.kind !== 'error';
  const target = event.target ?? deriveTransportTarget(fact.config, available);
  const counters = updateCountersForEvent(fact.counters, event);

  const reconnectUpdate =
    event.kind === 'reconnect-scheduled'
      ? {
          reconnectAttempt: event.reconnectAttempt ?? fact.reconnectAttempt,
          reconnectNextAt: event.reconnectNextAt ?? fact.reconnectNextAt,
        }
      : event.kind === 'reconnect-exhausted'
        ? { reconnectAttempt: undefined, reconnectNextAt: undefined }
        : event.kind === 'connected' || event.kind === 'disconnected' || event.kind === 'cleanup'
          ? { reconnectAttempt: undefined, reconnectNextAt: undefined }
          : {};

  return {
    ...fact,
    lifecycle,
    target: { ...target, available },
    counters,
    ...(event.kind === 'data' || event.kind === 'write-accepted'
      ? { lastActivityAt: event.occurredAt }
      : fact.lastActivityAt
        ? { lastActivityAt: fact.lastActivityAt }
        : {}),
    ...(event.error ? { lastError: event.error } : fact.lastError ? { lastError: fact.lastError } : {}),
    ...reconnectUpdate,
  };
}

function appendEvent(
  events: readonly TransportEventSnapshot[],
  event: TransportEventSnapshot,
): TransportEventSnapshot[] {
  return [...events, event].slice(-EVENT_LIMIT);
}

export function upsertConnectionConfig(
  snapshot: ReadonlyConnectionStateSnapshot,
  config: TransportConfig,
): ConnectionStateSnapshot {
  const current = cloneConnectionStateSnapshot(snapshot);
  const configCopy = cloneTransportConfig(config);
  const configs = [
    ...current.configs.filter((item) => item.id !== configCopy.id),
    configCopy,
  ].sort((left, right) => left.id.localeCompare(right.id));

  const existingFact = current.runtimeFacts.find((fact) => fact.connectionId === configCopy.id);
  const runtimeFacts = [
    ...current.runtimeFacts.filter((fact) => fact.connectionId !== configCopy.id),
    existingFact
      ? {
          ...existingFact,
          kind: configCopy.kind,
          config: cloneTransportConfig(configCopy),
          target: deriveTransportTarget(configCopy, existingFact.target.available),
        }
      : createDisconnectedRuntimeFact(configCopy),
  ].sort((left, right) => left.connectionId.localeCompare(right.connectionId));

  return {
    ...current,
    configs,
    runtimeFacts,
  };
}

export function reduceTransportEvent(
  snapshot: ReadonlyConnectionStateSnapshot,
  input: NormalizedTransportEventInput,
): ConnectionStateSnapshot {
  const current = cloneConnectionStateSnapshot(snapshot);
  const event = createTransportEventSnapshot(input);
  const fact = current.runtimeFacts.find((item) => item.connectionId === event.connectionId);

  if (!fact) {
    const staleError: TransportErrorSnapshot = {
      kind: 'stale-event',
      message: `Ignored stale transport event for ${event.connectionId}.`,
      occurredAt: event.occurredAt,
      connectionId: event.connectionId,
      recoverable: true,
    };
    const staleEvent: TransportEventSnapshot = {
      id: `${event.connectionId}:stale-event:${event.occurredAt}`,
      kind: 'stale-event',
      connectionId: event.connectionId,
      occurredAt: event.occurredAt,
      error: staleError,
    };
    return {
      ...current,
      events: appendEvent(current.events, staleEvent),
      lastError: staleError,
    };
  }

  const nextFact = applyEventToFact(fact, event);
  const runtimeFacts = current.runtimeFacts.map((item) =>
    item.connectionId === nextFact.connectionId ? nextFact : item,
  );
  const lastError = event.error ?? current.lastError;

  return {
    ...current,
    runtimeFacts,
    events: appendEvent(current.events, event),
    ...(lastError ? { lastError } : {}),
  };
}
