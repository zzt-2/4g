export const CONNECTION_SCHEMA_VERSION = 1 as const;

export const TRANSPORT_KINDS = ['serial', 'tcp-client', 'tcp-server', 'udp'] as const;
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

export const CONNECTION_LIFECYCLE_STATUSES = [
  'idle',
  'connecting',
  'connected',
  'disconnecting',
  'disconnected',
  'error',
] as const;
export type ConnectionLifecycleStatus = (typeof CONNECTION_LIFECYCLE_STATUSES)[number];

export const TRANSPORT_EVENT_KINDS = [
  'connect-requested',
  'connected',
  'disconnect-requested',
  'disconnected',
  'cleanup',
  'data',
  'write-requested',
  'write-accepted',
  'write-failed',
  'error',
  'stale-event',
] as const;
export type TransportEventKind = (typeof TRANSPORT_EVENT_KINDS)[number];

export const TRANSPORT_ERROR_KINDS = [
  'resource-unavailable',
  'open-failed',
  'connect-failed',
  'listen-failed',
  'bind-failed',
  'write-failed',
  'timeout',
  'close-failed',
  'stale-event',
  'invalid-config',
] as const;
export type TransportErrorKind = (typeof TRANSPORT_ERROR_KINDS)[number];

export const TRANSPORT_TARGET_ROLES = [
  'serial-port',
  'tcp-client-peer',
  'tcp-server-listener',
  'tcp-server-client',
  'udp-remote',
] as const;
export type TransportTargetRole = (typeof TRANSPORT_TARGET_ROLES)[number];

export interface BaseTransportConfig {
  readonly id: string;
  readonly kind: TransportKind;
  readonly label?: string;
  readonly autoConnect?: boolean;
}

export interface SerialTransportConfig extends BaseTransportConfig {
  readonly kind: 'serial';
  readonly portPath: string;
  readonly baudRate: number;
}

export interface TcpClientTransportConfig extends BaseTransportConfig {
  readonly kind: 'tcp-client';
  readonly host: string;
  readonly port: number;
}

export interface TcpServerTransportConfig extends BaseTransportConfig {
  readonly kind: 'tcp-server';
  readonly host: string;
  readonly port: number;
}

export interface UdpTransportConfig extends BaseTransportConfig {
  readonly kind: 'udp';
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost?: string;
  readonly remotePort?: number;
}

export type TransportConfig =
  | SerialTransportConfig
  | TcpClientTransportConfig
  | TcpServerTransportConfig
  | UdpTransportConfig;

export interface TransportTargetSnapshot {
  readonly targetId: string;
  readonly connectionId: string;
  readonly kind: TransportKind;
  readonly role: TransportTargetRole;
  readonly label: string;
  readonly routeLabel: string;
  readonly available: boolean;
}

export interface TransportErrorSnapshot {
  readonly kind: TransportErrorKind;
  readonly message: string;
  readonly occurredAt: string;
  readonly connectionId?: string;
  readonly recoverable?: boolean;
}

export interface ConnectionCounterSnapshot {
  readonly connectAttempts: number;
  readonly successfulConnects: number;
  readonly disconnects: number;
  readonly writeAttempts: number;
  readonly writeAccepted: number;
  readonly writeFailures: number;
  readonly rxBytes: number;
  readonly txBytes: number;
  readonly errorCount: number;
  readonly staleEvents: number;
}

export interface TransportEventSnapshot {
  readonly id: string;
  readonly kind: TransportEventKind;
  readonly connectionId: string;
  readonly occurredAt: string;
  readonly target?: TransportTargetSnapshot;
  readonly byteLength?: number;
  readonly bytes?: readonly number[];
  readonly error?: TransportErrorSnapshot;
}

export interface ConnectionRuntimeFact {
  readonly connectionId: string;
  readonly kind: TransportKind;
  readonly lifecycle: ConnectionLifecycleStatus;
  readonly config: TransportConfig;
  readonly target: TransportTargetSnapshot;
  readonly counters: ConnectionCounterSnapshot;
  readonly lastActivityAt?: string;
  readonly lastError?: TransportErrorSnapshot;
}

export interface ConnectionStateSnapshot {
  readonly schemaVersion: typeof CONNECTION_SCHEMA_VERSION;
  readonly configs: readonly TransportConfig[];
  readonly runtimeFacts: readonly ConnectionRuntimeFact[];
  readonly events: readonly TransportEventSnapshot[];
  readonly lastError?: TransportErrorSnapshot;
}

export type ConnectionValidationSeverity = 'error' | 'warning';

export interface ConnectionValidationIssue {
  readonly severity: ConnectionValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ConnectionValidationOutcome {
  readonly valid: boolean;
  readonly issues: readonly ConnectionValidationIssue[];
}

export interface ConnectionConfigNormalization extends ConnectionValidationOutcome {
  readonly config?: TransportConfig;
}

export interface NormalizedTransportEventInput {
  readonly kind: TransportEventKind;
  readonly connectionId: string;
  readonly occurredAt: string;
  readonly target?: TransportTargetSnapshot;
  readonly byteLength?: number;
  readonly bytes?: readonly number[];
  readonly error?: Omit<TransportErrorSnapshot, 'occurredAt' | 'connectionId'> & {
    readonly occurredAt?: string;
    readonly connectionId?: string;
  };
}

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlyTransportConfig = ReadonlyDeep<TransportConfig>;
export type ReadonlyConnectionStateSnapshot = ReadonlyDeep<ConnectionStateSnapshot>;
export type ReadonlyConnectionRuntimeFact = ReadonlyDeep<ConnectionRuntimeFact>;
export type ReadonlyTransportEventSnapshot = ReadonlyDeep<TransportEventSnapshot>;
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

export type ReadonlyTransportTargetSnapshot = ReadonlyDeep<TransportTargetSnapshot>;
