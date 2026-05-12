import { defaultNow } from '@/shared';
import { buildFrame } from '../core';
import type {
  ReadonlySendStateSnapshot,
  SendBuildIssue,
  SendError,
  SendFieldEncodingDef,
  SendRequest,
  SendRequestRef,
  SendResult,
  SendResultKind,
  SendServiceStatus,
  SendStateSnapshot,
  SendStatisticsSnapshot,
} from '../core';
import type { ReadonlyFrameAsset } from '@/features/frame';
import type {
  SendFrameReader,
  SendResultEmitter,
  SendTargetResolver,
  SendTransportWriteOutcome,
  SendTransportWriter,
} from '../adapters';
import { createSendState, type SendStateContainer } from '../state/send-state';

export interface SendReader {
  getSnapshot(): SendStateSnapshot;
  getStatistics(): SendStatisticsSnapshot;
  listResults(): SendResult[];
  getStatus(): SendServiceStatus;
}

export interface SendService extends SendReader {
  execute(request: SendRequest): Promise<SendResult>;
  resetStats(): SendStateSnapshot;
}

export interface CreateSendServiceOptions {
  readonly frameReader: SendFrameReader;
  readonly targetResolver: SendTargetResolver;
  readonly transportWriter: SendTransportWriter;
  readonly resultEmitter?: SendResultEmitter;
  readonly state?: SendStateContainer;
  readonly now?: () => string;
}

function validateSendRequest(request: SendRequest): SendBuildIssue[] {
  const issues: SendBuildIssue[] = [];
  if (!request.frameId) {
    issues.push({ severity: 'error', code: 'send.request.missingFrameId', message: 'frameId is required.' });
  }
  if (!request.targetId) {
    issues.push({ severity: 'error', code: 'send.request.missingTargetId', message: 'targetId is required.' });
  }
  if (!request.context?.source) {
    issues.push({ severity: 'error', code: 'send.request.missingSource', message: 'context.source is required.' });
  }
  return issues;
}

function toRequestRef(request: SendRequest): SendRequestRef {
  return {
    frameId: request.frameId,
    targetId: request.targetId,
    context: { ...request.context },
  };
}

function makeResult(
  kind: SendResultKind,
  requestRef: SendRequestRef,
  timestamp: string,
  bytesBuilt: number,
  bytesSent: number,
  error?: SendError,
  buildIssues: readonly SendBuildIssue[] = [],
): SendResult {
  return {
    kind,
    requestRef,
    bytesBuilt,
    bytesSent,
    timestamp,
    ...(error ? { error } : {}),
    buildIssues,
  };
}

function frameToBuildInput(
  frame: ReadonlyFrameAsset,
): { fields: SendFieldEncodingDef[]; totalByteLength: number } {
  const fields: SendFieldEncodingDef[] = [];
  let offset = 0;
  const frameEndian = frame.options?.bigEndian ?? false;

  for (const field of frame.fields) {
    fields.push({
      id: field.id,
      dataType: field.dataType,
      length: field.length,
      bigEndian: field.bigEndian ?? frameEndian,
      isASCII: field.isASCII ?? false,
      offset,
    });
    offset += field.length;
  }

  return { fields, totalByteLength: offset };
}

export function createSendReader(
  snapshotProvider: () => ReadonlySendStateSnapshot,
): SendReader {
  return {
    getSnapshot() {
      return structuredClone(snapshotProvider());
    },
    getStatistics() {
      return structuredClone(snapshotProvider().statistics);
    },
    listResults() {
      return structuredClone(snapshotProvider().recentResults);
    },
    getStatus() {
      return snapshotProvider().status;
    },
  };
}

export function createSendService(options: CreateSendServiceOptions): SendService {
  const state = options.state ?? createSendState();
  const now = options.now ?? defaultNow;
  const reader = createSendReader(() => state.getSnapshot());

  return {
    ...reader,

    async execute(request) {
      const requestRef = toRequestRef(request);
      const timestamp = now();

      state.setStatus('sending');

      // 1. Validate request
      const validationIssues = validateSendRequest(request);
      const hasErrors = validationIssues.some((i) => i.severity === 'error');
      if (hasErrors) {
        const result = makeResult('build-error', requestRef, timestamp, 0, 0, undefined, validationIssues);
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 2. Resolve frame snapshot
      const frame = options.frameReader.getFrame(request.frameId);
      if (!frame) {
        const result = makeResult(
          'build-error', requestRef, timestamp, 0, 0,
          { kind: 'frame-not-found', message: `Frame not found: ${request.frameId}` },
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 3. Build frame bytes
      const { fields, totalByteLength } = frameToBuildInput(frame);
      const buildOutput = buildFrame({
        fields,
        totalByteLength,
        fieldValues: request.fieldValues,
      });

      const buildErrors = buildOutput.issues.filter((i) => i.severity === 'error');
      if (buildErrors.length > 0) {
        const result = makeResult('build-error', requestRef, timestamp, 0, 0, undefined, buildOutput.issues);
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      const bytes = [...buildOutput.bytes];

      // 4. Resolve target
      const target = options.targetResolver.resolveTarget(request.targetId);
      if (!target) {
        const result = makeResult(
          'target-unavailable', requestRef, timestamp, bytes.length, 0,
          { kind: 'target-not-found', message: `Target not found: ${request.targetId}` },
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      if (!target.available) {
        const result = makeResult(
          'target-unavailable', requestRef, timestamp, bytes.length, 0,
          { kind: 'target-not-available', message: `Target not available: ${request.targetId}` },
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 5. Transport write
      let writeOutcome: SendTransportWriteOutcome;
      try {
        writeOutcome = await options.transportWriter.writeBytes(target.connectionId, bytes);
      } catch (err) {
        const result = makeResult(
          'transport-error', requestRef, timestamp, bytes.length, 0,
          { kind: 'write-exception', message: err instanceof Error ? err.message : 'Unknown write error' },
          buildOutput.issues,
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      if (!writeOutcome.ok) {
        const result = makeResult(
          writeOutcome.error?.kind === 'timeout' ? 'timeout' : 'transport-error',
          requestRef,
          timestamp,
          bytes.length,
          writeOutcome.bytesWritten,
          writeOutcome.error,
          buildOutput.issues,
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 6. Success
      const result = makeResult(
        'sent',
        requestRef,
        timestamp,
        bytes.length,
        writeOutcome.bytesWritten,
        undefined,
        buildOutput.issues,
      );
      state.addResult(result);
      options.resultEmitter?.emit(result);
      return result;
    },

    resetStats() {
      return state.resetStats();
    },
  };
}
