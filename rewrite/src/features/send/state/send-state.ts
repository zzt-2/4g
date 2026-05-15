import type {
  ReadonlySendStateSnapshot,
  SendResult,
  SendServiceStatus,
  SendStateSnapshot,
  SendStatisticsSnapshot,
  SendStatsDelta,
} from '../core';
import { deepClone } from '@/shared/utils/deep-clone';

const MAX_RECENT_RESULTS = 100;

function emptyStatistics(): SendStatisticsSnapshot {
  return {
    totalRequests: 0,
    totalSent: 0,
    totalErrors: 0,
    totalBytesSent: 0,
    byFrame: {},
    byTarget: {},
    byResultKind: {},
  };
}

function emptySnapshot(): SendStateSnapshot {
  return {
    status: 'idle',
    statistics: emptyStatistics(),
    recentResults: [],
  };
}

function applyStatsDelta(stats: SendStatisticsSnapshot, delta: SendStatsDelta): SendStatisticsSnapshot {
  const isSent = delta.resultKind === 'sent';
  const byFrame = { ...stats.byFrame };
  const prevFrame = byFrame[delta.frameId] ?? { sent: 0, errors: 0 };
  byFrame[delta.frameId] = {
    sent: prevFrame.sent + (isSent ? 1 : 0),
    errors: prevFrame.errors + (isSent ? 0 : 1),
  };

  const byTarget = { ...stats.byTarget };
  const prevTarget = byTarget[delta.targetId] ?? { sent: 0, errors: 0 };
  byTarget[delta.targetId] = {
    sent: prevTarget.sent + (isSent ? 1 : 0),
    errors: prevTarget.errors + (isSent ? 0 : 1),
  };

  const byResultKind = { ...stats.byResultKind };
  byResultKind[delta.resultKind] = (byResultKind[delta.resultKind] ?? 0) + 1;

  return {
    totalRequests: stats.totalRequests + 1,
    totalSent: stats.totalSent + (isSent ? 1 : 0),
    totalErrors: stats.totalErrors + (isSent ? 0 : 1),
    totalBytesSent: stats.totalBytesSent + delta.bytesSent,
    byFrame,
    byTarget,
    byResultKind,
    lastSendAt: delta.timestamp,
  };
}

export interface SendStateContainer {
  getSnapshot(): SendStateSnapshot;
  setStatus(status: SendServiceStatus): SendStateSnapshot;
  addResult(result: SendResult): SendStateSnapshot;
  resetStats(): SendStateSnapshot;
  resetSnapshot(snapshot?: ReadonlySendStateSnapshot): SendStateSnapshot;
}

export function createSendState(
  initialValue: { readonly snapshot?: ReadonlySendStateSnapshot } = {},
): SendStateContainer {
  let snapshot = initialValue.snapshot
    ? deepClone(initialValue.snapshot)
    : emptySnapshot();

  return {
    getSnapshot() {
      return deepClone(snapshot);
    },

    setStatus(status) {
      snapshot = { ...deepClone(snapshot), status };
      return deepClone(snapshot);
    },

    addResult(result) {
      const cloned = deepClone(snapshot);
      const delta: SendStatsDelta = {
        frameId: result.requestRef.frameId,
        targetId: result.requestRef.targetId,
        resultKind: result.kind,
        bytesSent: result.bytesSent,
        timestamp: result.timestamp,
      };
      const recentResults = [...cloned.recentResults, result].slice(-MAX_RECENT_RESULTS);
      snapshot = {
        ...cloned,
        statistics: applyStatsDelta(cloned.statistics, delta),
        recentResults,
        status: result.kind === 'sent' ? 'idle' : 'error',
        ...(result.error ? { lastError: result.error } : {}),
      };
      return deepClone(snapshot);
    },

    resetStats() {
      snapshot = { ...deepClone(snapshot), statistics: emptyStatistics() };
      return deepClone(snapshot);
    },

    resetSnapshot(next = emptySnapshot()) {
      snapshot = deepClone(next);
      return deepClone(snapshot);
    },
  };
}
