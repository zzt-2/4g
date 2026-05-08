import {
  cloneSendResult,
  cloneSendStatistics,
  type ReadonlySendStateSnapshot,
  type SendResult,
  type SendServiceStatus,
  type SendStateSnapshot,
  type SendStatisticsSnapshot,
} from '../core';

export function selectSendStatistics(snapshot: ReadonlySendStateSnapshot): SendStatisticsSnapshot {
  return cloneSendStatistics(snapshot.statistics);
}

export function selectSendResults(snapshot: ReadonlySendStateSnapshot): SendResult[] {
  return snapshot.recentResults.map(cloneSendResult);
}

export function selectSendSnapshot(snapshot: ReadonlySendStateSnapshot): SendStateSnapshot {
  return {
    status: snapshot.status,
    statistics: cloneSendStatistics(snapshot.statistics),
    recentResults: snapshot.recentResults.map(cloneSendResult),
    ...(snapshot.lastError ? { lastError: { ...snapshot.lastError } } : {}),
  };
}

export function selectSendStatus(snapshot: ReadonlySendStateSnapshot): SendServiceStatus {
  return snapshot.status;
}
