import {
  bytesToReadableHex,
  normalizeByteArray,
  receiveIssue,
} from './bytes';
import {
  cloneFrameReference,
  cloneInputBatch,
  cloneInputError,
  cloneIssue,
  cloneParsedField,
} from './clone';
import { parseReceiveFrameFields } from './field-parser';
import { matchReceiveFrame } from './frame-matcher';
import type {
  ReceiveBatchOutcome,
  ReceiveFrameStatisticsSnapshot,
  ReceiveInputBatch,
  ReceiveInputError,
  ReceiveIssue,
  ReceiveMatchedFrameSummary,
  ReceiveOutcomeKind,
  ReceiveParsedFieldValue,
  ReceiveProcessInput,
  ReceiveSourceSnapshot,
  ReceiveSourceStatisticsSnapshot,
  ReceiveStatsDelta,
} from './types';

function matchedFrameSummary(
  frameId: string,
  frameName: string,
  byteLength: number,
  fieldCount: number,
): ReceiveMatchedFrameSummary {
  return {
    frameId,
    frameName,
    byteLength,
    fieldCount,
  };
}

function sourceHit(
  source: ReceiveSourceSnapshot,
  kind: ReceiveOutcomeKind,
  byteLength: number,
  occurredAt: string,
): ReceiveSourceStatisticsSnapshot {
  return {
    sourceId: source.sourceId,
    connectionId: source.connectionId,
    kind: source.kind,
    label: source.label,
    batchCount: kind === 'input-error' ? 0 : 1,
    byteCount: kind === 'input-error' || kind === 'stale-input' ? 0 : byteLength,
    matchedCount: kind === 'matched' ? 1 : 0,
    unmatchedCount: kind === 'unmatched' ? 1 : 0,
    configErrorCount: kind === 'config-error' ? 1 : 0,
    inputErrorCount: kind === 'input-error' ? 1 : 0,
    staleInputCount: kind === 'stale-input' ? 1 : 0,
    lastInputAt: occurredAt,
  };
}

function frameHit(
  frame: ReceiveMatchedFrameSummary,
  source: ReceiveSourceSnapshot,
  occurredAt: string,
): ReceiveFrameStatisticsSnapshot {
  return {
    frameId: frame.frameId,
    frameName: frame.frameName,
    hitCount: 1,
    byteCount: frame.byteLength,
    lastMatchedAt: occurredAt,
    lastSourceId: source.sourceId,
  };
}

function statsDelta(
  kind: ReceiveOutcomeKind,
  source: ReceiveSourceSnapshot | undefined,
  byteLength: number,
  occurredAt: string,
  matchedFrame?: ReceiveMatchedFrameSummary,
): ReceiveStatsDelta {
  return {
    batchCount: kind === 'input-error' ? 0 : 1,
    byteCount: kind === 'input-error' || kind === 'stale-input' ? 0 : byteLength,
    matchedCount: kind === 'matched' ? 1 : 0,
    unmatchedCount: kind === 'unmatched' ? 1 : 0,
    configErrorCount: kind === 'config-error' ? 1 : 0,
    parseErrorCount: kind === 'parse-error' ? 1 : 0,
    inputErrorCount: kind === 'input-error' ? 1 : 0,
    staleInputCount: kind === 'stale-input' ? 1 : 0,
    frameHits: matchedFrame && kind === 'matched' && source ? [frameHit(matchedFrame, source, occurredAt)] : [],
    sourceHits: source ? [sourceHit(source, kind, byteLength, occurredAt)] : [],
  };
}

function outcome(
  id: string,
  kind: ReceiveOutcomeKind,
  processedAt: string,
  issues: readonly ReceiveIssue[],
  source: ReceiveSourceSnapshot | undefined,
  byteLength: number,
  input?: ReceiveInputBatch,
  matchedFrame?: ReceiveMatchedFrameSummary,
  fields: readonly ReceiveParsedFieldValue[] = [],
): ReceiveBatchOutcome {
  return {
    id,
    kind,
    processedAt,
    ...(input ? { input: cloneInputBatch(input) } : {}),
    ...(matchedFrame ? { matchedFrame: { ...matchedFrame } } : {}),
    fields: fields.map(cloneParsedField),
    issues: issues.map(cloneIssue),
    statsDelta: statsDelta(kind, source, byteLength, processedAt, matchedFrame),
  };
}

function matchIssuesAreConfigErrors(issues: readonly ReceiveIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.severity === 'error' &&
      (issue.code === 'receive.frame.none' || issue.code === 'receive.frame.ruleMissing'),
  );
}

export function createReceiveInputErrorOutcome(
  error: ReceiveInputError,
  processedAt: string,
): ReceiveBatchOutcome {
  const clonedError = cloneInputError(error);
  const issue = receiveIssue(
    `receive.input.${clonedError.kind}`,
    'input',
    clonedError.message,
  );

  return outcome(
    clonedError.id,
    clonedError.kind === 'stale-reference' ? 'stale-input' : 'input-error',
    processedAt,
    [issue],
    clonedError.source,
    0,
  );
}

export function createStaleReceiveInputOutcome(
  id: string,
  batch: ReceiveInputBatch,
  expectedReferenceVersion: number,
  processedAt: string,
): ReceiveBatchOutcome {
  return outcome(
    id,
    'stale-input',
    processedAt,
    [
      receiveIssue(
        'receive.input.staleReference',
        'batch.referenceVersion',
        `Input reference version does not match current receive reference version ${expectedReferenceVersion}.`,
      ),
    ],
    batch.source,
    batch.bytes.length,
    batch,
  );
}

export function processReceiveBatch(input: ReceiveProcessInput): ReceiveBatchOutcome {
  const batch = cloneInputBatch(input.batch);
  const normalizedBytes = normalizeByteArray(batch.bytes, 'batch.bytes');

  if (normalizedBytes.issues.length > 0) {
    return outcome(
      batch.id,
      'input-error',
      input.processedAt,
      normalizedBytes.issues,
      batch.source,
      0,
      batch,
    );
  }

  const match = matchReceiveFrame(normalizedBytes.bytes, input.reference.frames);
  if (!match.matchedFrame) {
    const kind: ReceiveOutcomeKind = matchIssuesAreConfigErrors(match.issues)
      ? 'config-error'
      : 'unmatched';

    return outcome(
      batch.id,
      kind,
      input.processedAt,
      match.issues,
      batch.source,
      normalizedBytes.bytes.length,
      batch,
    );
  }

  const frame = cloneFrameReference(match.matchedFrame);
  const matchedFrame = matchedFrameSummary(
    frame.id,
    frame.name,
    normalizedBytes.bytes.length,
    frame.fields.length,
  );
  const parsed = parseReceiveFrameFields({
    frame,
    bytes: normalizedBytes.bytes,
  });

  if (parsed.issues.some((issue) => issue.severity === 'error')) {
    return outcome(
      batch.id,
      'parse-error',
      input.processedAt,
      parsed.issues,
      batch.source,
      normalizedBytes.bytes.length,
      batch,
      matchedFrame,
      parsed.fields,
    );
  }

  return outcome(
    batch.id,
    'matched',
    input.processedAt,
    parsed.issues,
    batch.source,
    normalizedBytes.bytes.length,
    batch,
    matchedFrame,
    parsed.fields,
  );
}

export function createRecentInputHex(bytes: readonly number[]): string {
  return bytesToReadableHex(bytes);
}
