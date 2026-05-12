import type {
  TransportConfig,
  TransportErrorKind,
  TransportKind,
  TransportTargetSnapshot,
} from '../core';

export type ConnectionAdapterOperation = 'connect' | 'disconnect' | 'write' | 'cleanup';

export interface ConnectionAdapterErrorInput {
  readonly kind: TransportErrorKind;
  readonly message: string;
  readonly recoverable?: boolean;
}

export type ConnectionAdapterEventKind =
  | 'connected'
  | 'disconnected'
  | 'data'
  | 'write-accepted'
  | 'write-failed'
  | 'error';

export interface ConnectionAdapterEvent {
  readonly kind: ConnectionAdapterEventKind;
  readonly connectionId: string;
  readonly occurredAt?: string;
  readonly target?: TransportTargetSnapshot;
  readonly bytes?: readonly number[];
  readonly byteLength?: number;
  readonly error?: ConnectionAdapterErrorInput;
}

export interface ConnectionAdapterAccepted {
  readonly ok: true;
  readonly events: readonly ConnectionAdapterEvent[];
}

export interface ConnectionAdapterRejected {
  readonly ok: false;
  readonly error: ConnectionAdapterErrorInput;
  readonly events?: readonly ConnectionAdapterEvent[];
}

export type ConnectionAdapterCommandOutcome =
  | ConnectionAdapterAccepted
  | ConnectionAdapterRejected;

export interface TransportWriteRequest {
  readonly connectionId: string;
  readonly bytes: readonly number[];
  readonly targetId?: string;
}

export interface ConnectionTransportAdapter {
  connect(config: TransportConfig): Promise<ConnectionAdapterCommandOutcome>;
  disconnect(connectionId: string): Promise<ConnectionAdapterCommandOutcome>;
  write(request: TransportWriteRequest): Promise<ConnectionAdapterCommandOutcome>;
  cleanup(): Promise<ConnectionAdapterCommandOutcome>;
  drainEvents(): Promise<readonly ConnectionAdapterEvent[]>;
  discoverResources?(): Promise<readonly ConnectionResourceCandidate[]>;
}

export interface ConnectionResourceCandidate {
  readonly kind: TransportKind;
  readonly id: string;
  readonly label: string;
}
