import {
  RECEIVE_SCHEMA_VERSION,
  type ReceiveBatchOutcome,
  type ReceiveCounterSnapshot,
  type ReceiveEventSnapshot,
  type ReceiveFieldValueSnapshot,
  type ReceiveFrameStatisticsSnapshot,
  type ReceiveLifecycleStatus,
  type ReceiveRecentInputSnapshot,
  type ReceiveSourceStatisticsSnapshot,
  type ReceiveStateSnapshot,
} from '../core';
import {
  cloneBatchOutcome,
  cloneCounterSnapshot,
  cloneEvent,
  cloneFieldValue,
  cloneFrameStatistic,
  cloneIssue,
  cloneMatchedFrame,
  cloneRecentInput,
  cloneSourceStatistic,
  cloneStateSnapshot,
} from '../core/clone';
import { createRecentInputHex } from '../core/processor';

export type ReceiveResetScope = 'all' | 'runtime' | 'statistics';

export interface ReceiveStateInitialValue {
  readonly lifecycle?: ReceiveLifecycleStatus;
  readonly referenceVersion?: number;
  readonly recentInputLimit?: number;
  readonly eventLimit?: number;
}

export interface ReceiveStateContainer {
  getSnapshot(): ReceiveStateSnapshot;
  setReferenceVersion(referenceVersion: number): ReceiveStateSnapshot;
  applyOutcome(outcome: ReceiveBatchOutcome): ReceiveStateSnapshot;
  reset(scope?: ReceiveResetScope): ReceiveStateSnapshot;
}

const EMPTY_COUNTERS: ReceiveCounterSnapshot = {
  batchCount: 0,
  byteCount: 0,
  matchedCount: 0,
  unmatchedCount: 0,
  configErrorCount: 0,
  parseErrorCount: 0,
  inputErrorCount: 0,
  staleInputCount: 0,
};

function addCounters(
  current: ReceiveCounterSnapshot,
  delta: ReceiveBatchOutcome['statsDelta'],
): ReceiveCounterSnapshot {
  return {
    batchCount: current.batchCount + delta.batchCount,
    byteCount: current.byteCount + delta.byteCount,
    matchedCount: current.matchedCount + delta.matchedCount,
    unmatchedCount: current.unmatchedCount + delta.unmatchedCount,
    configErrorCount: current.configErrorCount + delta.configErrorCount,
    parseErrorCount: current.parseErrorCount + delta.parseErrorCount,
    inputErrorCount: current.inputErrorCount + delta.inputErrorCount,
    staleInputCount: current.staleInputCount + delta.staleInputCount,
  };
}

function mergeFrameStats(
  current: readonly ReceiveFrameStatisticsSnapshot[],
  delta: readonly ReceiveFrameStatisticsSnapshot[],
): ReceiveFrameStatisticsSnapshot[] {
  const merged = new Map(current.map((item) => [item.frameId, cloneFrameStatistic(item)]));

  for (const item of delta) {
    const existing = merged.get(item.frameId);
    merged.set(item.frameId, {
      frameId: item.frameId,
      frameName: item.frameName,
      hitCount: (existing?.hitCount ?? 0) + item.hitCount,
      byteCount: (existing?.byteCount ?? 0) + item.byteCount,
      ...(item.lastMatchedAt ? { lastMatchedAt: item.lastMatchedAt } : {}),
      ...(item.lastSourceId ? { lastSourceId: item.lastSourceId } : {}),
    });
  }

  return Array.from(merged.values());
}

function mergeSourceStats(
  current: readonly ReceiveSourceStatisticsSnapshot[],
  delta: readonly ReceiveSourceStatisticsSnapshot[],
): ReceiveSourceStatisticsSnapshot[] {
  const merged = new Map(current.map((item) => [item.sourceId, cloneSourceStatistic(item)]));

  for (const item of delta) {
    const existing = merged.get(item.sourceId);
    merged.set(item.sourceId, {
      sourceId: item.sourceId,
      connectionId: item.connectionId,
      kind: item.kind,
      label: item.label,
      batchCount: (existing?.batchCount ?? 0) + item.batchCount,
      byteCount: (existing?.byteCount ?? 0) + item.byteCount,
      matchedCount: (existing?.matchedCount ?? 0) + item.matchedCount,
      unmatchedCount: (existing?.unmatchedCount ?? 0) + item.unmatchedCount,
      configErrorCount: (existing?.configErrorCount ?? 0) + item.configErrorCount,
      inputErrorCount: (existing?.inputErrorCount ?? 0) + item.inputErrorCount,
      staleInputCount: (existing?.staleInputCount ?? 0) + item.staleInputCount,
      ...(item.lastInputAt ? { lastInputAt: item.lastInputAt } : {}),
    });
  }

  return Array.from(merged.values());
}

function fieldKey(field: Pick<ReceiveFieldValueSnapshot, 'frameId' | 'fieldId'>): string {
  return `${field.frameId}:${field.fieldId}`;
}

function mergeFieldValues(
  current: readonly ReceiveFieldValueSnapshot[],
  outcome: ReceiveBatchOutcome,
): ReceiveFieldValueSnapshot[] {
  if (outcome.kind !== 'matched' || !outcome.input) {
    return current.map(cloneFieldValue);
  }

  const merged = new Map(current.map((item) => [fieldKey(item), cloneFieldValue(item)]));
  for (const field of outcome.fields) {
    merged.set(fieldKey(field), {
      ...field,
      updatedAt: outcome.processedAt,
      sourceId: outcome.input.source.sourceId,
    });
  }

  return Array.from(merged.values());
}

function createRecentInput(outcome: ReceiveBatchOutcome): ReceiveRecentInputSnapshot | undefined {
  if (!outcome.input) {
    return undefined;
  }

  return {
    id: outcome.id,
    sourceId: outcome.input.source.sourceId,
    sourceLabel: outcome.input.source.label,
    kind: outcome.kind,
    byteLength: outcome.input.bytes.length,
    hex: createRecentInputHex(outcome.input.bytes),
    occurredAt: outcome.processedAt,
    ...(outcome.matchedFrame ? { matchedFrameId: outcome.matchedFrame.frameId } : {}),
    issueCodes: outcome.issues.map((issue) => issue.code),
  };
}

function createEvent(outcome: ReceiveBatchOutcome): ReceiveEventSnapshot {
  return {
    id: outcome.id,
    kind: outcome.kind,
    occurredAt: outcome.processedAt,
    ...(outcome.input ? { sourceId: outcome.input.source.sourceId } : {}),
    ...(outcome.matchedFrame ? { frameId: outcome.matchedFrame.frameId } : {}),
    ...(outcome.input ? { byteLength: outcome.input.bytes.length } : {}),
    issueCodes: outcome.issues.map((issue) => issue.code),
  };
}

function bounded<T>(items: readonly T[], limit: number): T[] {
  return items.slice(0, Math.max(0, limit));
}

function lifecycleForOutcome(outcome: ReceiveBatchOutcome): ReceiveLifecycleStatus {
  return outcome.kind === 'matched' || outcome.kind === 'unmatched' ? 'receiving' : 'error';
}

export function createReceiveState(
  initialValue: ReceiveStateInitialValue = {},
): ReceiveStateContainer {
  const recentInputLimit = initialValue.recentInputLimit ?? 20;
  const eventLimit = initialValue.eventLimit ?? 50;
  let snapshot: ReceiveStateSnapshot = {
    schemaVersion: RECEIVE_SCHEMA_VERSION,
    lifecycle: initialValue.lifecycle ?? 'idle',
    referenceVersion: initialValue.referenceVersion ?? 0,
    counters: cloneCounterSnapshot(EMPTY_COUNTERS),
    frameStats: [],
    sourceStats: [],
    fieldValues: [],
    recentInputs: [],
    events: [],
  };

  function replace(next: ReceiveStateSnapshot): ReceiveStateSnapshot {
    snapshot = cloneStateSnapshot(next);
    return cloneStateSnapshot(snapshot);
  }

  return {
    getSnapshot() {
      return cloneStateSnapshot(snapshot);
    },

    setReferenceVersion(referenceVersion) {
      return replace({
        ...snapshot,
        lifecycle: 'ready',
        referenceVersion,
        currentFrame: undefined,
        fieldValues: [],
        lastIssue: undefined,
      });
    },

    applyOutcome(rawOutcome) {
      const applied = cloneBatchOutcome(rawOutcome);
      const recentInput = createRecentInput(applied);
      const lastIssue = applied.issues.find((issue) => issue.severity === 'error') ?? applied.issues[0];

      return replace({
        ...snapshot,
        lifecycle: lifecycleForOutcome(applied),
        counters: addCounters(snapshot.counters, applied.statsDelta),
        frameStats: mergeFrameStats(snapshot.frameStats, applied.statsDelta.frameHits),
        sourceStats: mergeSourceStats(snapshot.sourceStats, applied.statsDelta.sourceHits),
        fieldValues: mergeFieldValues(snapshot.fieldValues, applied),
        recentInputs: bounded(
          recentInput ? [recentInput, ...snapshot.recentInputs.map(cloneRecentInput)] : snapshot.recentInputs,
          recentInputLimit,
        ),
        events: bounded([createEvent(applied), ...snapshot.events.map(cloneEvent)], eventLimit),
        ...(applied.kind === 'matched' && applied.matchedFrame
          ? { currentFrame: cloneMatchedFrame(applied.matchedFrame) }
          : {}),
        ...(lastIssue ? { lastIssue: cloneIssue(lastIssue) } : {}),
      });
    },

    reset(scope = 'all') {
      if (scope === 'statistics') {
        return replace({
          ...snapshot,
          counters: cloneCounterSnapshot(EMPTY_COUNTERS),
          frameStats: [],
          sourceStats: [],
          fieldValues: [],
          recentInputs: [],
          events: [],
          currentFrame: undefined,
          lastIssue: undefined,
        });
      }

      if (scope === 'runtime') {
        return replace({
          ...snapshot,
          lifecycle: snapshot.referenceVersion > 0 ? 'ready' : 'idle',
          fieldValues: [],
          recentInputs: [],
          events: [],
          currentFrame: undefined,
          lastIssue: undefined,
        });
      }

      return replace({
        schemaVersion: RECEIVE_SCHEMA_VERSION,
        lifecycle: 'idle',
        referenceVersion: 0,
        counters: cloneCounterSnapshot(EMPTY_COUNTERS),
        frameStats: [],
        sourceStats: [],
        fieldValues: [],
        recentInputs: [],
        events: [],
      });
    },
  };
}
