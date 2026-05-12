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

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function cloneTransportConfig(config: ReadonlyTransportConfig): TransportConfig {
  return deepClone(config);
}

export function cloneTransportConfigs(
  configs: readonly ReadonlyTransportConfig[],
): TransportConfig[] {
  return configs.map(cloneTransportConfig);
}

export function cloneConnectionCounters(
  counters: Readonly<ConnectionCounterSnapshot>,
): ConnectionCounterSnapshot {
  return deepClone(counters);
}

export function cloneTransportTarget(
  target: ReadonlyTransportTargetSnapshot,
): TransportTargetSnapshot {
  return deepClone(target);
}

export function cloneTransportError(
  error: Readonly<TransportErrorSnapshot>,
): TransportErrorSnapshot {
  return deepClone(error);
}

export function cloneTransportEvent(
  event: ReadonlyTransportEventSnapshot,
): TransportEventSnapshot {
  return deepClone(event);
}

export function cloneConnectionRuntimeFact(
  fact: ReadonlyConnectionRuntimeFact,
): ConnectionRuntimeFact {
  return deepClone(fact);
}

export function cloneConnectionStateSnapshot(
  snapshot: ReadonlyConnectionStateSnapshot,
): ConnectionStateSnapshot {
  return deepClone(snapshot);
}
