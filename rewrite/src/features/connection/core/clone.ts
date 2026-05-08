import type {
  ConnectionCounterSnapshot,
  ConnectionRuntimeFact,
  ConnectionStateSnapshot,
  ReadonlyConnectionRuntimeFact,
  ReadonlyConnectionStateSnapshot,
  ReadonlyTransportConfig,
  ReadonlyTransportEventSnapshot,
  ReadonlyTransportTargetSnapshot,
  TransportConfig,
  TransportErrorSnapshot,
  TransportEventSnapshot,
  TransportTargetSnapshot,
} from './types';

export function cloneTransportConfig(config: ReadonlyTransportConfig): TransportConfig {
  switch (config.kind) {
    case 'serial':
      return {
        id: config.id,
        kind: config.kind,
        ...(config.label ? { label: config.label } : {}),
        portPath: config.portPath,
        baudRate: config.baudRate,
      };
    case 'tcp-client':
      return {
        id: config.id,
        kind: config.kind,
        ...(config.label ? { label: config.label } : {}),
        host: config.host,
        port: config.port,
      };
    case 'tcp-server':
      return {
        id: config.id,
        kind: config.kind,
        ...(config.label ? { label: config.label } : {}),
        host: config.host,
        port: config.port,
      };
    case 'udp':
      return {
        id: config.id,
        kind: config.kind,
        ...(config.label ? { label: config.label } : {}),
        localHost: config.localHost,
        localPort: config.localPort,
        ...(config.remoteHost ? { remoteHost: config.remoteHost } : {}),
        ...(config.remotePort !== undefined ? { remotePort: config.remotePort } : {}),
      };
  }
}

export function cloneTransportConfigs(
  configs: readonly ReadonlyTransportConfig[],
): TransportConfig[] {
  return configs.map(cloneTransportConfig);
}

export function cloneConnectionCounters(
  counters: Readonly<ConnectionCounterSnapshot>,
): ConnectionCounterSnapshot {
  return { ...counters };
}

export function cloneTransportTarget(
  target: ReadonlyTransportTargetSnapshot,
): TransportTargetSnapshot {
  return { ...target };
}

export function cloneTransportError(error: Readonly<TransportErrorSnapshot>): TransportErrorSnapshot {
  return {
    kind: error.kind,
    message: error.message,
    occurredAt: error.occurredAt,
    ...(error.connectionId ? { connectionId: error.connectionId } : {}),
    ...(error.recoverable !== undefined ? { recoverable: error.recoverable } : {}),
  };
}

export function cloneTransportEvent(
  event: ReadonlyTransportEventSnapshot,
): TransportEventSnapshot {
  return {
    id: event.id,
    kind: event.kind,
    connectionId: event.connectionId,
    occurredAt: event.occurredAt,
    ...(event.target ? { target: cloneTransportTarget(event.target) } : {}),
    ...(event.byteLength !== undefined ? { byteLength: event.byteLength } : {}),
    ...(event.error ? { error: cloneTransportError(event.error) } : {}),
  };
}

export function cloneConnectionRuntimeFact(
  fact: ReadonlyConnectionRuntimeFact,
): ConnectionRuntimeFact {
  return {
    connectionId: fact.connectionId,
    kind: fact.kind,
    lifecycle: fact.lifecycle,
    config: cloneTransportConfig(fact.config),
    target: cloneTransportTarget(fact.target),
    counters: cloneConnectionCounters(fact.counters),
    ...(fact.lastActivityAt ? { lastActivityAt: fact.lastActivityAt } : {}),
    ...(fact.lastError ? { lastError: cloneTransportError(fact.lastError) } : {}),
  };
}

export function cloneConnectionStateSnapshot(
  snapshot: ReadonlyConnectionStateSnapshot,
): ConnectionStateSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    configs: cloneTransportConfigs(snapshot.configs),
    runtimeFacts: snapshot.runtimeFacts.map(cloneConnectionRuntimeFact),
    events: snapshot.events.map(cloneTransportEvent),
    ...(snapshot.lastError ? { lastError: cloneTransportError(snapshot.lastError) } : {}),
  };
}
