import type {
  FrameAsset,
  IdentifierRule,
  ReadonlyDeep,
  ReadonlyFrameAsset,
} from '@/features/frame';
import { cloneFrameField } from '@/features/frame';
import type {
  ReceiveBatchOutcome,
  ReceiveCounterSnapshot,
  ReceiveEventSnapshot,
  ReceiveFieldValueSnapshot,
  ReceiveFrameReferenceSnapshot,
  ReceiveFrameStatisticsSnapshot,
  ReceiveInputBatch,
  ReceiveInputError,
  ReceiveIssue,
  ReceiveMatchedFrameSummary,
  ReceiveParsedFieldValue,
  ReceiveRecentInputSnapshot,
  ReceiveSourceSnapshot,
  ReceiveSourceStatisticsSnapshot,
  ReceiveStateSnapshot,
  ReceiveStatsDelta,
  ReceiveUiSnapshot,
} from './types';

function cloneIdentifierRules(rules: readonly ReadonlyDeep<IdentifierRule>[]): IdentifierRule[] {
  return rules.map((rule) => ({ ...rule }));
}

export function cloneFrameReference(frame: ReadonlyFrameAsset): FrameAsset {
  return {
    ...frame,
    fields: frame.fields.map(cloneFrameField),
    ...(frame.options ? { options: { ...frame.options } } : {}),
    ...(frame.identifierRules ? { identifierRules: cloneIdentifierRules(frame.identifierRules) } : {}),
  };
}

export function cloneFrameReferences(frames: readonly ReadonlyFrameAsset[]): FrameAsset[] {
  return frames.map(cloneFrameReference);
}

export function cloneIssue(issue: ReceiveIssue): ReceiveIssue {
  return { ...issue };
}

export function cloneSource(source: ReceiveSourceSnapshot): ReceiveSourceSnapshot {
  return { ...source };
}

export function cloneInputBatch(batch: ReceiveInputBatch): ReceiveInputBatch {
  return {
    id: batch.id,
    bytes: [...batch.bytes],
    receivedAt: batch.receivedAt,
    source: cloneSource(batch.source),
    ...(batch.sequence !== undefined ? { sequence: batch.sequence } : {}),
    ...(batch.referenceVersion !== undefined ? { referenceVersion: batch.referenceVersion } : {}),
  };
}

export function cloneInputError(error: ReceiveInputError): ReceiveInputError {
  return {
    id: error.id,
    occurredAt: error.occurredAt,
    kind: error.kind,
    message: error.message,
    ...(error.source ? { source: cloneSource(error.source) } : {}),
    ...(error.recoverable !== undefined ? { recoverable: error.recoverable } : {}),
    ...(error.referenceVersion !== undefined ? { referenceVersion: error.referenceVersion } : {}),
  };
}

export function cloneMatchedFrame(
  frame: ReceiveMatchedFrameSummary,
): ReceiveMatchedFrameSummary {
  return { ...frame };
}

export function cloneParsedField(field: ReceiveParsedFieldValue): ReceiveParsedFieldValue {
  return {
    ...field,
    ...(field.label ? { label: field.label } : {}),
  };
}

export function cloneCounterSnapshot(counters: ReceiveCounterSnapshot): ReceiveCounterSnapshot {
  return { ...counters };
}

export function cloneFrameStatistic(
  stat: ReceiveFrameStatisticsSnapshot,
): ReceiveFrameStatisticsSnapshot {
  return { ...stat };
}

export function cloneSourceStatistic(
  stat: ReceiveSourceStatisticsSnapshot,
): ReceiveSourceStatisticsSnapshot {
  return { ...stat };
}

export function cloneFieldValue(field: ReceiveFieldValueSnapshot): ReceiveFieldValueSnapshot {
  return {
    ...field,
    ...(field.label ? { label: field.label } : {}),
  };
}

export function cloneRecentInput(input: ReceiveRecentInputSnapshot): ReceiveRecentInputSnapshot {
  return {
    ...input,
    issueCodes: [...input.issueCodes],
  };
}

export function cloneEvent(event: ReceiveEventSnapshot): ReceiveEventSnapshot {
  return {
    ...event,
    issueCodes: [...event.issueCodes],
  };
}

export function cloneStatsDelta(delta: ReceiveStatsDelta): ReceiveStatsDelta {
  return {
    batchCount: delta.batchCount,
    byteCount: delta.byteCount,
    matchedCount: delta.matchedCount,
    unmatchedCount: delta.unmatchedCount,
    configErrorCount: delta.configErrorCount,
    parseErrorCount: delta.parseErrorCount,
    inputErrorCount: delta.inputErrorCount,
    staleInputCount: delta.staleInputCount,
    frameHits: delta.frameHits.map(cloneFrameStatistic),
    sourceHits: delta.sourceHits.map(cloneSourceStatistic),
  };
}

export function cloneBatchOutcome(outcome: ReceiveBatchOutcome): ReceiveBatchOutcome {
  return {
    id: outcome.id,
    kind: outcome.kind,
    processedAt: outcome.processedAt,
    ...(outcome.input ? { input: cloneInputBatch(outcome.input) } : {}),
    ...(outcome.matchedFrame ? { matchedFrame: cloneMatchedFrame(outcome.matchedFrame) } : {}),
    fields: outcome.fields.map(cloneParsedField),
    issues: outcome.issues.map(cloneIssue),
    statsDelta: cloneStatsDelta(outcome.statsDelta),
  };
}

export function cloneReferenceSnapshot(
  snapshot: ReceiveFrameReferenceSnapshot,
): ReceiveFrameReferenceSnapshot {
  return {
    referenceVersion: snapshot.referenceVersion,
    refreshedAt: snapshot.refreshedAt,
    frames: cloneFrameReferences(snapshot.frames),
  };
}

export function cloneStateSnapshot(snapshot: ReceiveStateSnapshot): ReceiveStateSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    lifecycle: snapshot.lifecycle,
    referenceVersion: snapshot.referenceVersion,
    counters: cloneCounterSnapshot(snapshot.counters),
    frameStats: snapshot.frameStats.map(cloneFrameStatistic),
    sourceStats: snapshot.sourceStats.map(cloneSourceStatistic),
    fieldValues: snapshot.fieldValues.map(cloneFieldValue),
    recentInputs: snapshot.recentInputs.map(cloneRecentInput),
    events: snapshot.events.map(cloneEvent),
    ...(snapshot.currentFrame ? { currentFrame: cloneMatchedFrame(snapshot.currentFrame) } : {}),
    ...(snapshot.lastIssue ? { lastIssue: cloneIssue(snapshot.lastIssue) } : {}),
  };
}

export function cloneUiSnapshot(snapshot: ReceiveUiSnapshot): ReceiveUiSnapshot {
  return {
    lifecycle: snapshot.lifecycle,
    referenceVersion: snapshot.referenceVersion,
    counters: cloneCounterSnapshot(snapshot.counters),
    ...(snapshot.currentFrame ? { currentFrame: cloneMatchedFrame(snapshot.currentFrame) } : {}),
    frameStats: snapshot.frameStats.map(cloneFrameStatistic),
    fieldValues: snapshot.fieldValues.map(cloneFieldValue),
    recentInputs: snapshot.recentInputs.map(cloneRecentInput),
    ...(snapshot.lastIssue ? { lastIssue: cloneIssue(snapshot.lastIssue) } : {}),
  };
}
