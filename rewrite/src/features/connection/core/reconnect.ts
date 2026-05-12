import type { TransportKind } from './types';

export interface ReconnectPolicy {
  readonly enabled: boolean;
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

const SERIAL_POLICY: ReconnectPolicy = {
  enabled: false,
  maxAttempts: 0,
  initialDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 0,
};

const TCP_CLIENT_POLICY: ReconnectPolicy = {
  enabled: true,
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2.0,
};

const TCP_SERVER_POLICY: ReconnectPolicy = {
  enabled: true,
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2.0,
};

const UDP_POLICY: ReconnectPolicy = {
  enabled: true,
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2.0,
};

const POLICIES: Readonly<Record<TransportKind, ReconnectPolicy>> = {
  serial: SERIAL_POLICY,
  'tcp-client': TCP_CLIENT_POLICY,
  'tcp-server': TCP_SERVER_POLICY,
  udp: UDP_POLICY,
};

export function getReconnectPolicy(kind: TransportKind): ReconnectPolicy {
  return POLICIES[kind];
}

export function nextReconnectDelay(policy: ReconnectPolicy, attempt: number): number {
  const raw = policy.initialDelayMs * policy.backoffMultiplier ** attempt;
  return Math.min(raw, policy.maxDelayMs);
}

export function shouldReconnect(policy: ReconnectPolicy, attempt: number): boolean {
  if (!policy.enabled) return false;
  if (policy.maxAttempts === 0) return true;
  return attempt < policy.maxAttempts;
}
