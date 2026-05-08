import type {
  SendBuildIssue,
  SendCategoryStats,
  SendError,
  SendResult,
  SendStatisticsSnapshot,
  SendStateSnapshot,
  ReadonlySendStateSnapshot,
} from './types';

export function cloneSendError(error: Readonly<SendError>): SendError {
  return { kind: error.kind, message: error.message };
}

export function cloneSendBuildIssue(issue: Readonly<SendBuildIssue>): SendBuildIssue {
  return {
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    ...(issue.fieldId ? { fieldId: issue.fieldId } : {}),
  };
}

export function cloneSendResult(result: Readonly<SendResult>): SendResult {
  return {
    kind: result.kind,
    requestRef: {
      frameId: result.requestRef.frameId,
      targetId: result.requestRef.targetId,
      context: { ...result.requestRef.context },
    },
    bytesBuilt: result.bytesBuilt,
    bytesSent: result.bytesSent,
    timestamp: result.timestamp,
    ...(result.error ? { error: cloneSendError(result.error) } : {}),
    buildIssues: result.buildIssues.map(cloneSendBuildIssue),
  };
}

export function cloneSendStatistics(stats: Readonly<SendStatisticsSnapshot>): SendStatisticsSnapshot {
  const byFrame: Record<string, SendCategoryStats> = {};
  for (const [key, value] of Object.entries(stats.byFrame)) {
    byFrame[key] = { sent: value.sent, errors: value.errors };
  }
  const byTarget: Record<string, SendCategoryStats> = {};
  for (const [key, value] of Object.entries(stats.byTarget)) {
    byTarget[key] = { sent: value.sent, errors: value.errors };
  }
  return {
    totalRequests: stats.totalRequests,
    totalSent: stats.totalSent,
    totalErrors: stats.totalErrors,
    totalBytesSent: stats.totalBytesSent,
    byFrame,
    byTarget,
    byResultKind: { ...stats.byResultKind },
    ...(stats.lastSendAt ? { lastSendAt: stats.lastSendAt } : {}),
  };
}

export function cloneSendStateSnapshot(snapshot: ReadonlySendStateSnapshot): SendStateSnapshot {
  return {
    status: snapshot.status,
    statistics: cloneSendStatistics(snapshot.statistics),
    recentResults: snapshot.recentResults.map(cloneSendResult),
    ...(snapshot.lastError ? { lastError: cloneSendError(snapshot.lastError) } : {}),
  };
}
