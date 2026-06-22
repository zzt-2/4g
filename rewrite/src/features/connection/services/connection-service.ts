import { defaultNow } from '@/shared';
import {
  cloneConnectionRuntimeFact,
  cloneConnectionStateSnapshot,
  cloneTransportConfig,
  cloneTransportError,
  cloneTransportEvent,
  cloneTransportTarget,
  createConnectionIssue,
  createConnectionValidationOutcome,
  createTransportEventSnapshot,
  normalizeTransportConfig,
  type ConnectionRuntimeFact,
  type ConnectionStateSnapshot,
  type ConnectionSummary,
  type ConnectionTargetQuery,
  type ConnectionValidationOutcome,
  type NormalizedTransportEventInput,
  type ReadonlyConnectionStateSnapshot,
  type TransportConfig,
  type TransportErrorSnapshot,
  type TransportEventSnapshot,
  type TransportTargetSnapshot,
} from '../core';
import type {
  ConnectionAdapterErrorInput,
  ConnectionAdapterEvent,
  ConnectionResourceCandidate,
  ConnectionTransportAdapter,
  TransportWriteRequest,
} from '../adapters';
import { getReconnectPolicy, nextReconnectDelay, shouldReconnect } from '../core/reconnect';
import { createConnectionState, type ConnectionStateContainer } from '../state/connection-state';

export interface ReconnectStatus {
  readonly connectionId: string;
  readonly phase: 'idle' | 'scheduled' | 'connecting' | 'aborting';
  readonly attempt: number;
  readonly nextAttemptAt?: string;
}

export interface ConnectionReader {
  getSnapshot(): ConnectionStateSnapshot;
  listTransportConfigs(): TransportConfig[];
  listConnectionFacts(): ConnectionRuntimeFact[];
  getConnectionFact(connectionId: string): ConnectionRuntimeFact | undefined;
  listConnectionSummaries(): ConnectionSummary[];
  listTransportTargets(query?: ConnectionTargetQuery): TransportTargetSnapshot[];
  getLastTransportError(): TransportErrorSnapshot | undefined;
  listTransportEvents(): TransportEventSnapshot[];
  getReconnectStatus(connectionId: string): ReconnectStatus | undefined;
}

export interface ConnectionOperationOutcome {
  readonly ok: boolean;
  readonly validation: ConnectionValidationOutcome;
  readonly snapshot: ConnectionStateSnapshot;
  readonly events: readonly TransportEventSnapshot[];
  readonly error?: TransportErrorSnapshot;
}

export interface ConnectionService extends ConnectionReader {
  connect(config: TransportConfig): Promise<ConnectionOperationOutcome>;
  disconnect(connectionId: string): Promise<ConnectionOperationOutcome>;
  upsertConfig(config: TransportConfig): void;
  removeConfig(configId: string): void;
  write(request: TransportWriteRequest): Promise<ConnectionOperationOutcome>;
  drainAdapterEvents(): Promise<ConnectionOperationOutcome>;
  cleanup(): Promise<ConnectionOperationOutcome>;
  discoverResources(): Promise<readonly ConnectionResourceCandidate[]>;
}

export interface CreateConnectionServiceOptions {
  readonly adapter: ConnectionTransportAdapter;
  readonly state?: ConnectionStateContainer;
  readonly now?: () => string;
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (id: unknown) => void;
}

// --- Inline selector helpers (replaces deleted selectors/) ---

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

// --- Private helpers ---

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

// Note: 不再用「数组下标 beforeLength」来取本轮新增事件。connection state 的
// events 是 EVENT_LIMIT 的滚动窗口(appendEvent 用 .slice(-50) 裁剪),一旦填满,
// 下标恒为 limit、滚动数组长度恒为 limit, slice(limit) 会永远返回 [] —— 导致
// routingTick 在累计到约 48 帧(connect 占 2 槽)后路由冻结、匹配计数不再增长。
// 改由 applyEvents 直接返回本轮新加入的事件快照,与 events 是否被截断解耦。
// See: rewrite/src/__tests__/integration/routing-truncation-freeze.spec.ts

// --- Public factories ---

export function createConnectionReader(
  snapshotProvider: () => ReadonlyConnectionStateSnapshot,
): ConnectionReader {
  return {
    getSnapshot() {
      return cloneConnectionStateSnapshot(snapshotProvider());
    },

    listTransportConfigs() {
      return snapshotProvider().configs.map(cloneTransportConfig);
    },

    listConnectionFacts() {
      return snapshotProvider().runtimeFacts.map(cloneConnectionRuntimeFact);
    },

    getConnectionFact(connectionId) {
      const fact = snapshotProvider().runtimeFacts.find(
        (item) => item.connectionId === connectionId,
      );
      return fact ? cloneConnectionRuntimeFact(fact) : undefined;
    },

    listConnectionSummaries() {
      return snapshotProvider().runtimeFacts.map(toSummary);
    },

    listTransportTargets(query) {
      return snapshotProvider().runtimeFacts
        .map((fact) => fact.target)
        .filter((target) => matchesTarget(target, query))
        .map(cloneTransportTarget);
    },

    getLastTransportError() {
      const snapshot = snapshotProvider();
      return snapshot.lastError ? cloneTransportError(snapshot.lastError) : undefined;
    },

    listTransportEvents() {
      return snapshotProvider().events.map(cloneTransportEvent);
    },

    getReconnectStatus() {
      return undefined;
    },
  };
}

export function createConnectionService(
  options: CreateConnectionServiceOptions,
): ConnectionService {
  const state = options.state ?? createConnectionState();
  const now = options.now ?? defaultNow;
  const reader = createConnectionReader(() => state.getSnapshot());
  const scheduleTimeout = options.setTimeout ?? setTimeout;
  const cancelTimeout = options.clearTimeout ?? clearTimeout;

  const reconnectTimers = new Map<string, unknown>();

  function applyEvents(
    events: readonly ConnectionAdapterEvent[],
  ): TransportEventSnapshot[] {
    const appended: TransportEventSnapshot[] = [];
    for (const event of events) {
      if (event.kind === 'disconnected' || event.kind === 'error' || event.kind === 'cleanup') {
        console.warn('[connection] adapter event:', event.kind, event.connectionId);
      }
      const normalized = adapterEventToNormalized(event, now);
      state.applyEvent(normalized);
      // state.applyEvent 内部会对 events 滚动截断, 但「本次新加入的事件」是确定的,
      // 直接克隆一份作为本轮新增返回, 不依赖 events 数组的下标/长度。
      appended.push(cloneTransportEvent(createTransportEventSnapshot(normalized)));
    }
    return appended;
  }

  function cancelReconnectTimer(connectionId: string): void {
    const timerId = reconnectTimers.get(connectionId);
    if (timerId !== undefined) {
      cancelTimeout(timerId);
      reconnectTimers.delete(connectionId);
    }
  }

  function cancelAllReconnectTimers(): void {
    for (const [, timerId] of reconnectTimers) {
      cancelTimeout(timerId);
    }
    reconnectTimers.clear();
  }

  function scheduleReconnect(
    connectionId: string,
    policy: ReturnType<typeof getReconnectPolicy>,
    attempt: number,
  ): TransportEventSnapshot {
    const delay = nextReconnectDelay(policy, attempt);
    const nextAt = new Date(Date.now() + delay).toISOString();

    const reconnectScheduled = {
      kind: 'reconnect-scheduled' as const,
      connectionId,
      occurredAt: now(),
      reconnectAttempt: attempt,
      reconnectNextAt: nextAt,
    };
    state.applyEvent(reconnectScheduled);

    const timerId = scheduleTimeout(() => {
      reconnectTimers.delete(connectionId);
      attemptReconnect(connectionId);
    }, delay);

    reconnectTimers.set(connectionId, timerId);

    return cloneTransportEvent(createTransportEventSnapshot(reconnectScheduled));
  }

  function handleAdapterDisconnects(
    events: readonly TransportEventSnapshot[],
  ): TransportEventSnapshot[] {
    const generated: TransportEventSnapshot[] = [];
    for (const event of events) {
      if (event.kind !== 'disconnected') continue;

      const fact = state.getSnapshot().runtimeFacts.find(
        (f) => f.connectionId === event.connectionId,
      );
      if (!fact) continue;

      const policy = getReconnectPolicy(fact.kind);
      if (!shouldReconnect(policy, 0)) continue;

      generated.push(scheduleReconnect(event.connectionId, policy, 0));
    }
    return generated;
  }

  async function attemptReconnect(connectionId: string): Promise<void> {
    const fact = state.getSnapshot().runtimeFacts.find(
      (f) => f.connectionId === connectionId,
    );
    if (!fact) return;

    const currentAttempt = fact.reconnectAttempt ?? 0;
    const config = fact.config;
    const policy = getReconnectPolicy(config.kind);

    const command = await options.adapter.connect(config);

    if (command.ok) {
      state.applyEvent({
        kind: 'connect-requested',
        connectionId,
        occurredAt: now(),
      });
      // 重连不对外报告事件，显式丢弃 applyEvents 的返回值。
      void applyEvents(command.events);
    } else {
      const nextAttempt = currentAttempt + 1;
      if (shouldReconnect(policy, nextAttempt)) {
        scheduleReconnect(connectionId, policy, nextAttempt);
      } else {
        state.applyEvent({
          kind: 'reconnect-exhausted',
          connectionId,
          occurredAt: now(),
        });
      }
    }
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

      const command = await options.adapter.connect(normalized.config);

      if (!command.ok) {
        return {
          ok: false,
          validation: createConnectionValidationOutcome([
            createConnectionIssue(
              `connection.adapter.${command.error.kind}`,
              'adapter',
              command.error.message,
              'error',
            ),
          ]),
          snapshot: state.getSnapshot(),
          events: [],
          error: adapterErrorToSnapshot(command.error, normalized.config.id, now()),
        };
      }

      state.upsertConfig(normalized.config);
      const connectRequested = {
        kind: 'connect-requested' as const,
        connectionId: normalized.config.id,
        occurredAt: now(),
      };
      state.applyEvent(connectRequested);
      const events: TransportEventSnapshot[] = [
        cloneTransportEvent(createTransportEventSnapshot(connectRequested)),
        ...applyEvents(command.events),
      ];

      const snapshot = state.getSnapshot();

      return {
        ok: true,
        validation: validValidation(),
        snapshot,
        events,
      };
    },

    async disconnect(connectionId) {
      cancelReconnectTimer(connectionId);

      const disconnectRequested = {
        kind: 'disconnect-requested' as const,
        connectionId,
        occurredAt: now(),
      };
      state.applyEvent(disconnectRequested);
      const events: TransportEventSnapshot[] = [
        cloneTransportEvent(createTransportEventSnapshot(disconnectRequested)),
      ];

      const command = await options.adapter.disconnect(connectionId);

      events.push(...applyEvents(command.events ?? []));
      if (!command.ok && command.events === undefined) {
        const errorEvent = toErrorEvent(connectionId, command.error, now());
        state.applyEvent(errorEvent);
        events.push(cloneTransportEvent(createTransportEventSnapshot(errorEvent)));
      }

      const snapshot = state.getSnapshot();
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
    },

    async write(request) {
      const writeRequested = {
        kind: 'write-requested' as const,
        connectionId: request.connectionId,
        occurredAt: now(),
        byteLength: request.bytes.length,
      };
      state.applyEvent(writeRequested);
      const events: TransportEventSnapshot[] = [
        cloneTransportEvent(createTransportEventSnapshot(writeRequested)),
      ];

      const command = await options.adapter.write(request);

      events.push(...applyEvents(command.events ?? []));
      if (!command.ok && command.events === undefined) {
        const errorEvent = toErrorEvent(request.connectionId, command.error, now());
        state.applyEvent(errorEvent);
        events.push(cloneTransportEvent(createTransportEventSnapshot(errorEvent)));
      }

      const snapshot = state.getSnapshot();
      const lastEvent = events[events.length - 1];
      const error = !command.ok
        ? adapterErrorToSnapshot(command.error, request.connectionId, lastEvent?.occurredAt ?? now())
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
    },

    async drainAdapterEvents() {
      const adapterEvents = await options.adapter.drainEvents();
      const drainedEvents = applyEvents(adapterEvents);

      // handleAdapterDisconnects 可能因 disconnected 事件派生出 reconnect-scheduled
      // 事件(经 scheduleReconnect 写入 state),这些也是本轮新增,需并入返回值。
      drainedEvents.push(...handleAdapterDisconnects(drainedEvents));

      const snapshot = state.getSnapshot();
      const lastError = snapshot.lastError
        ? cloneTransportError(snapshot.lastError)
        : undefined;

      return {
        ok: true,
        validation: validValidation(),
        snapshot,
        events: drainedEvents,
        ...(lastError ? { error: lastError } : {}),
      };
    },

    async cleanup() {
      cancelAllReconnectTimers();

      const events: TransportEventSnapshot[] = [];
      for (const fact of state.getSnapshot().runtimeFacts) {
        const cleanupEvent = {
          kind: 'cleanup' as const,
          connectionId: fact.connectionId,
          occurredAt: now(),
        };
        state.applyEvent(cleanupEvent);
        events.push(cloneTransportEvent(createTransportEventSnapshot(cleanupEvent)));
      }

      const command = await options.adapter.cleanup();

      events.push(...applyEvents(command.events ?? []));
      if (!command.ok && command.events === undefined) {
        const errorEvent = toErrorEvent('cleanup', command.error, now());
        state.applyEvent(errorEvent);
        events.push(cloneTransportEvent(createTransportEventSnapshot(errorEvent)));
      }

      const snapshot = state.getSnapshot();
      const lastEvent = events[events.length - 1];
      const error = !command.ok
        ? adapterErrorToSnapshot(command.error, 'cleanup', lastEvent?.occurredAt ?? now())
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
    },

    async discoverResources() {
      if (options.adapter.discoverResources) {
        return options.adapter.discoverResources();
      }
      return [];
    },

    removeConfig(configId: string): void {
      state.removeConfig(configId);
    },

    upsertConfig(config: TransportConfig): void {
      state.upsertConfig(config);
    },

    getReconnectStatus(connectionId) {
      const fact = state.getSnapshot().runtimeFacts.find(
        (f) => f.connectionId === connectionId,
      );
      if (!fact) return undefined;

      if (fact.reconnectAttempt === undefined) return undefined;

      return {
        connectionId,
        phase: reconnectTimers.has(connectionId) ? 'scheduled' as const : 'idle' as const,
        attempt: fact.reconnectAttempt,
        ...(fact.reconnectNextAt ? { nextAttemptAt: fact.reconnectNextAt } : {}),
      };
    },
  };
}
