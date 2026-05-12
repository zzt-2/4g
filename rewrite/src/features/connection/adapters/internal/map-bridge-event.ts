import type { TransportErrorKind, TransportKind, TransportTargetRole } from '../../core';
import type { ConnectionAdapterEvent } from '../ports';
import type { TransportBridgeEvent } from '@/platform';
import { TRANSPORT_ERROR_KINDS } from '../../core';

export const TRANSPORT_ERROR_KIND_SET: ReadonlySet<string> = new Set(TRANSPORT_ERROR_KINDS);

export function toAdapterErrorKind(
  kind: string | undefined,
  fallback: TransportErrorKind,
): TransportErrorKind {
  if (kind !== undefined && TRANSPORT_ERROR_KIND_SET.has(kind)) return kind;
  return fallback;
}

export function mapBridgeEvent(event: TransportBridgeEvent): ConnectionAdapterEvent {
  const base = {
    connectionId: event.connectionId,
    occurredAt: event.occurredAt,
  };

  switch (event.kind) {
    case 'connected':
      return {
        kind: 'connected',
        ...base,
        ...(event.target
          ? {
              target: {
                targetId: event.target.targetId,
                connectionId: event.connectionId,
                kind: event.target.kind as TransportKind,
                role: event.target.role as TransportTargetRole,
                label: event.target.label,
                routeLabel: event.target.routeLabel,
                available: true,
              },
            }
          : {}),
      };
    case 'disconnected':
      return {
        kind: 'disconnected',
        ...base,
        ...(event.target
          ? {
              target: {
                targetId: event.target.targetId,
                connectionId: event.connectionId,
                kind: event.target.kind as TransportKind,
                role: event.target.role as TransportTargetRole,
                label: event.target.label,
                routeLabel: event.target.routeLabel,
                available: false,
              },
            }
          : {}),
      };
    case 'data':
      return {
        kind: 'data',
        ...base,
        ...(event.bytes ? { bytes: [...event.bytes] } : {}),
        byteLength: event.byteLength,
      };
    case 'error':
      return {
        kind: 'error',
        ...base,
        error: {
          kind: event.error?.kind ?? 'resource-unavailable',
          message: event.error?.message ?? 'Unknown transport error',
          recoverable: event.error?.recoverable ?? true,
        },
      };
  }
}
