import {
  cloneConnectionRuntimeFact,
  cloneConnectionStateSnapshot,
  cloneTransportConfig,
  cloneTransportError,
  cloneTransportEvent,
  cloneTransportTarget,
  type ConnectionRuntimeFact,
  type ConnectionStateSnapshot,
  type ReadonlyConnectionStateSnapshot,
  type TransportConfig,
  type TransportErrorSnapshot,
  type TransportEventSnapshot,
  type TransportKind,
  type TransportTargetSnapshot,
} from '../core';

export interface ConnectionTargetQuery {
  readonly kind?: TransportKind;
  readonly availableOnly?: boolean;
}

export interface ConnectionSummary {
  readonly connectionId: string;
  readonly kind: TransportKind;
  readonly lifecycle: ConnectionRuntimeFact['lifecycle'];
  readonly label: string;
  readonly routeLabel: string;
  readonly available: boolean;
  readonly rxBytes: number;
  readonly txBytes: number;
  readonly errorCount: number;
  readonly lastActivityAt?: string;
  readonly lastError?: TransportErrorSnapshot;
}

function matchesTarget(
  target: TransportTargetSnapshot,
  query: ConnectionTargetQuery | undefined,
): boolean {
  if (query?.kind && target.kind !== query.kind) {
    return false;
  }

  return query?.availableOnly ? target.available : true;
}

function toSummary(fact: ConnectionRuntimeFact): ConnectionSummary {
  return {
    connectionId: fact.connectionId,
    kind: fact.kind,
    lifecycle: fact.lifecycle,
    label: fact.target.label,
    routeLabel: fact.target.routeLabel,
    available: fact.target.available,
    rxBytes: fact.counters.rxBytes,
    txBytes: fact.counters.txBytes,
    errorCount: fact.counters.errorCount,
    ...(fact.lastActivityAt ? { lastActivityAt: fact.lastActivityAt } : {}),
    ...(fact.lastError ? { lastError: cloneTransportError(fact.lastError) } : {}),
  };
}

export function selectConnectionSnapshot(
  snapshot: ReadonlyConnectionStateSnapshot,
): ConnectionStateSnapshot {
  return cloneConnectionStateSnapshot(snapshot);
}

export function selectTransportConfigs(
  snapshot: ReadonlyConnectionStateSnapshot,
): TransportConfig[] {
  return snapshot.configs.map(cloneTransportConfig);
}

export function selectConnectionFacts(
  snapshot: ReadonlyConnectionStateSnapshot,
): ConnectionRuntimeFact[] {
  return snapshot.runtimeFacts.map(cloneConnectionRuntimeFact);
}

export function selectConnectionFact(
  snapshot: ReadonlyConnectionStateSnapshot,
  connectionId: string,
): ConnectionRuntimeFact | undefined {
  const fact = snapshot.runtimeFacts.find((item) => item.connectionId === connectionId);
  return fact ? cloneConnectionRuntimeFact(fact) : undefined;
}

export function selectConnectionSummaries(
  snapshot: ReadonlyConnectionStateSnapshot,
): ConnectionSummary[] {
  return snapshot.runtimeFacts.map(toSummary);
}

export function selectTransportTargets(
  snapshot: ReadonlyConnectionStateSnapshot,
  query?: ConnectionTargetQuery,
): TransportTargetSnapshot[] {
  return snapshot.runtimeFacts
    .map((fact) => fact.target)
    .filter((target) => matchesTarget(target, query))
    .map(cloneTransportTarget);
}

export function selectLastTransportError(
  snapshot: ReadonlyConnectionStateSnapshot,
): TransportErrorSnapshot | undefined {
  return snapshot.lastError ? cloneTransportError(snapshot.lastError) : undefined;
}

export function selectTransportEvents(
  snapshot: ReadonlyConnectionStateSnapshot,
): TransportEventSnapshot[] {
  return snapshot.events.map(cloneTransportEvent);
}
