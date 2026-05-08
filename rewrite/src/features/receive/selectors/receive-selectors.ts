import type {
  ReceiveCounterSnapshot,
  ReceiveEventSnapshot,
  ReceiveFieldValueSnapshot,
  ReceiveFrameStatisticsSnapshot,
  ReceiveRecentInputSnapshot,
  ReceiveSourceStatisticsSnapshot,
  ReceiveStateSnapshot,
  ReceiveUiSnapshot,
} from '../core';
import {
  cloneCounterSnapshot,
  cloneEvent,
  cloneFieldValue,
  cloneFrameStatistic,
  cloneIssue,
  cloneMatchedFrame,
  cloneRecentInput,
  cloneSourceStatistic,
  cloneStateSnapshot,
  cloneUiSnapshot,
} from '../core/clone';

export interface ReceiveFrameStatsQuery {
  readonly frameId?: string;
}

export interface ReceiveFieldValueQuery {
  readonly frameId?: string;
  readonly fieldId?: string;
}

export interface ReceiveRecentInputQuery {
  readonly limit?: number;
  readonly sourceId?: string;
}

export function selectReceiveSnapshot(source: ReceiveStateSnapshot): ReceiveStateSnapshot {
  return cloneStateSnapshot(source);
}

export function selectReceiveCounters(source: ReceiveStateSnapshot): ReceiveCounterSnapshot {
  return cloneCounterSnapshot(source.counters);
}

export function selectReceiveFrameStats(
  source: ReceiveStateSnapshot,
  query: ReceiveFrameStatsQuery = {},
): ReceiveFrameStatisticsSnapshot[] {
  return source.frameStats
    .filter((item) => (query.frameId ? item.frameId === query.frameId : true))
    .map(cloneFrameStatistic);
}

export function selectReceiveSourceStats(
  source: ReceiveStateSnapshot,
): ReceiveSourceStatisticsSnapshot[] {
  return source.sourceStats.map(cloneSourceStatistic);
}

export function selectReceiveFieldValues(
  source: ReceiveStateSnapshot,
  query: ReceiveFieldValueQuery = {},
): ReceiveFieldValueSnapshot[] {
  return source.fieldValues
    .filter((item) => (query.frameId ? item.frameId === query.frameId : true))
    .filter((item) => (query.fieldId ? item.fieldId === query.fieldId : true))
    .map(cloneFieldValue);
}

export function selectReceiveRecentInputs(
  source: ReceiveStateSnapshot,
  query: ReceiveRecentInputQuery = {},
): ReceiveRecentInputSnapshot[] {
  const filtered = source.recentInputs.filter((item) =>
    query.sourceId ? item.sourceId === query.sourceId : true,
  );
  return filtered.slice(0, query.limit ?? filtered.length).map(cloneRecentInput);
}

export function selectReceiveEvents(source: ReceiveStateSnapshot): ReceiveEventSnapshot[] {
  return source.events.map(cloneEvent);
}

export function selectReceiveUiSnapshot(source: ReceiveStateSnapshot): ReceiveUiSnapshot {
  return cloneUiSnapshot({
    lifecycle: source.lifecycle,
    referenceVersion: source.referenceVersion,
    counters: cloneCounterSnapshot(source.counters),
    ...(source.currentFrame ? { currentFrame: cloneMatchedFrame(source.currentFrame) } : {}),
    frameStats: source.frameStats.map(cloneFrameStatistic),
    fieldValues: source.fieldValues.map(cloneFieldValue),
    recentInputs: source.recentInputs.map(cloneRecentInput),
    ...(source.lastIssue ? { lastIssue: cloneIssue(source.lastIssue) } : {}),
  });
}
