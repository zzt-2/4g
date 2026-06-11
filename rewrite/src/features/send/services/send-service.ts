import { defaultNow } from '@/shared';
import { buildFrame, applyBuildPostPatch } from '../core';
import { frameToBuildInput, resolveFieldValues, applyFactor } from '../core/frame-resolver';
import type {
  ReadonlySendStateSnapshot,
  SendBuildIssue,
  SendError,
  SendRequest,
  SendRequestRef,
  SendResult,
  SendResultKind,
  SendServiceStatus,
  SendStateSnapshot,
  SendStatisticsSnapshot,
} from '../core';
import type {
  SendFrameReader,
  SendResultEmitter,
  SendTargetResolver,
  SendTransportWriteOutcome,
  SendTransportWriter,
  SendVariableProvider,
} from '../adapters';
import { NOOP_VARIABLE_PROVIDER } from '../adapters';
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
  readonly variableProvider?: SendVariableProvider;
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
  resolvedFieldValues?: Readonly<Record<string, SendFieldValue>>,
): SendResult {
  return {
    kind,
    requestRef,
    bytesBuilt,
    bytesSent,
    timestamp,
    ...(error ? { error } : {}),
    buildIssues,
    ...(resolvedFieldValues ? { resolvedFieldValues } : {}),
  };
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
  const variableProvider = options.variableProvider ?? NOOP_VARIABLE_PROVIDER;

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

      // 3. Direction check
      if (frame.direction === 'receive') {
        const result = makeResult(
          'build-error', requestRef, timestamp, 0, 0,
          { kind: 'wrong-direction', message: `Frame "${request.frameId}" is receive-only.` },
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 4. Convert frame to encoding defs and resolve field values
      const { fields, totalByteLength } = frameToBuildInput(frame);
      const userValues = request.userFieldValues ?? request.fieldValues ?? {};
      const resolved = resolveFieldValues(fields, userValues, variableProvider);
      const factored = applyFactor(fields, resolved.values);
      const allIssues = [...resolved.issues, ...factored.issues];
      const resolvedValues = resolved.values;

      // 5. Build frame bytes
      const buildOutput = buildFrame({
        fields,
        totalByteLength,
        fieldValues: factored.values,
      });
      allIssues.push(...buildOutput.issues);

      const buildErrors = allIssues.filter((i) => i.severity === 'error');
      if (buildErrors.length > 0) {
        const result = makeResult('build-error', requestRef, timestamp, 0, 0, undefined, allIssues, resolvedValues);
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      let bytes = buildOutput.bytes;

      // 6. Apply post-build patch (checksum, length)
      const frameOptions = frame.options;
      const patchOptions = request.options ?? (frameOptions ? {
        autoChecksum: frameOptions.autoChecksum,
        bigEndian: frameOptions.bigEndian,
        includeLengthField: frameOptions.includeLengthField,
      } : undefined);
      const patched = applyBuildPostPatch(bytes, fields, patchOptions);
      allIssues.push(...patched.issues);

      const patchErrors = allIssues.filter((i) => i.severity === 'error');
      if (patchErrors.length > 0) {
        const result = makeResult('build-error', requestRef, timestamp, 0, 0, undefined, allIssues, resolvedValues);
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      bytes = patched.buffer;
      const bytesArr = [...bytes];

      // 7. Resolve target
      const target = options.targetResolver.resolveTarget(request.targetId);
      if (!target) {
        const result = makeResult(
          'target-unavailable', requestRef, timestamp, bytesArr.length, 0,
          { kind: 'target-not-found', message: `Target not found: ${request.targetId}` },
          [], resolvedValues,
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      if (!target.available) {
        const result = makeResult(
          'target-unavailable', requestRef, timestamp, bytesArr.length, 0,
          { kind: 'target-not-available', message: `Target not available: ${request.targetId}` },
          [], resolvedValues,
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 8. Transport write
      let writeOutcome: SendTransportWriteOutcome;
      try {
        writeOutcome = await options.transportWriter.writeBytes(target.connectionId, bytesArr);
      } catch (err) {
        const result = makeResult(
          'transport-error', requestRef, timestamp, bytesArr.length, 0,
          { kind: 'write-exception', message: err instanceof Error ? err.message : 'Unknown write error' },
          allIssues, resolvedValues,
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
          bytesArr.length,
          writeOutcome.bytesWritten,
          writeOutcome.error,
          allIssues, resolvedValues,
        );
        state.addResult(result);
        options.resultEmitter?.emit(result);
        return result;
      }

      // 9. Success
      const result = makeResult(
        'sent',
        requestRef,
        timestamp,
        bytesArr.length,
        writeOutcome.bytesWritten,
        undefined,
        allIssues, resolvedValues,
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
