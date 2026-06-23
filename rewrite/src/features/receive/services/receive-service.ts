import { defaultNow } from '@/shared';
import {
  createFrameAssetReader,
  type FrameAssetReader,
  type ReadonlyFrameAsset,
} from '@/features/frame';
import {
  createReceiveInputErrorOutcome,
  createStaleReceiveInputOutcome,
  processReceiveBatch,
  type ReceiveBatchOutcome,
  type ReceiveEventSnapshot,
  type ReceiveFieldValueSnapshot,
  type ReceiveFrameReferenceSnapshot,
  type ReceiveFrameStatisticsSnapshot,
  type ReceiveInputBatch,
  type ReceiveInputError,
  type ReceiveIssue,
  type ReceiveRecentInputSnapshot,
  type ReceiveSourceStatisticsSnapshot,
  type ReceiveStateSnapshot,
  type ReceiveUiSnapshot,
} from '../core';
import {
  cloneBatchOutcome,
  cloneFrameReferences,
  cloneIssue,
  cloneReferenceSnapshot,
  cloneStateSnapshot,
} from '../core/clone';
import {
  selectReceiveCounters,
  selectReceiveEvents,
  selectReceiveFieldValues,
  selectReceiveFrameStats,
  selectReceiveRecentInputs,
  selectReceiveSnapshot,
  selectReceiveSourceStats,
  selectReceiveUiSnapshot,
  type ReceiveFieldValueQuery,
  type ReceiveFrameStatsQuery,
  type ReceiveRecentInputQuery,
} from '../selectors';
import {
  createReceiveState,
  type ReceiveResetScope,
  type ReceiveStateContainer,
} from '../state';

export type ReceiveInputEvent =
  | {
      readonly kind: 'batch';
      readonly batch: ReceiveInputBatch;
    }
  | {
      readonly kind: 'error';
      readonly error: ReceiveInputError;
    };

export interface ReceiveInputSource {
  drainEvents(): Promise<readonly ReceiveInputEvent[]>;
}

export interface ReceiveReader {
  getSnapshot(): ReceiveStateSnapshot;
  getUiSnapshot(): ReceiveUiSnapshot;
  getCounters(): ReturnType<typeof selectReceiveCounters>;
  listFrameStats(query?: ReceiveFrameStatsQuery): ReceiveFrameStatisticsSnapshot[];
  listSourceStats(): ReceiveSourceStatisticsSnapshot[];
  listFieldValues(query?: ReceiveFieldValueQuery): ReceiveFieldValueSnapshot[];
  listRecentInputs(query?: ReceiveRecentInputQuery): ReceiveRecentInputSnapshot[];
  listEvents(): ReceiveEventSnapshot[];
}

export interface ReceiveService extends ReceiveReader {
  refreshFrameReferences(frames?: readonly ReadonlyFrameAsset[]): ReceiveServiceOutcome;
  ingestBatch(batch: ReceiveInputBatch): ReceiveServiceOutcome;
  recordInputError(error: ReceiveInputError): ReceiveServiceOutcome;
  drainInputSource(source: ReceiveInputSource): Promise<ReceiveServiceOutcome>;
  reset(scope?: ReceiveResetScope): ReceiveServiceOutcome;
}

export interface ReceiveServiceOutcome {
  readonly ok: boolean;
  readonly outcomes: readonly ReceiveBatchOutcome[];
  readonly snapshot: ReceiveStateSnapshot;
  readonly issues: readonly ReceiveIssue[];
  readonly reference?: ReceiveFrameReferenceSnapshot;
}

export interface CreateReceiveServiceOptions {
  readonly frameReader?: Pick<FrameAssetReader, 'findFrames'>;
  readonly state?: ReceiveStateContainer;
  readonly now?: () => string;
}


const INITIAL_REFERENCE_REFRESHED_AT = '1970-01-01T00:00:00.000Z';

function createDefaultFrameReader(): FrameAssetReader {
  return createFrameAssetReader(() => ({
    frames: [],
  }));
}

function outcomeIsOk(outcome: ReceiveBatchOutcome): boolean {
  return outcome.kind === 'matched' || outcome.kind === 'unmatched';
}

function serviceOutcome(
  snapshot: ReceiveStateSnapshot,
  outcomes: readonly ReceiveBatchOutcome[] = [],
  reference?: ReceiveFrameReferenceSnapshot,
): ReceiveServiceOutcome {
  const issues = outcomes.flatMap((item) => item.issues.map(cloneIssue));
  return {
    ok: outcomes.every(outcomeIsOk),
    outcomes: outcomes.map(cloneBatchOutcome),
    snapshot: cloneStateSnapshot(snapshot),
    issues,
    ...(reference ? { reference: cloneReferenceSnapshot(reference) } : {}),
  };
}

export function createReceiveReader(
  snapshotProvider: () => ReceiveStateSnapshot,
): ReceiveReader {
  return {
    getSnapshot() {
      return selectReceiveSnapshot(snapshotProvider());
    },

    getUiSnapshot() {
      return selectReceiveUiSnapshot(snapshotProvider());
    },

    getCounters() {
      return selectReceiveCounters(snapshotProvider());
    },

    listFrameStats(query) {
      return selectReceiveFrameStats(snapshotProvider(), query);
    },

    listSourceStats() {
      return selectReceiveSourceStats(snapshotProvider());
    },

    listFieldValues(query) {
      return selectReceiveFieldValues(snapshotProvider(), query);
    },

    listRecentInputs(query) {
      return selectReceiveRecentInputs(snapshotProvider(), query);
    },

    listEvents() {
      return selectReceiveEvents(snapshotProvider());
    },
  };
}

export function createReceiveService(
  options: CreateReceiveServiceOptions = {},
): ReceiveService {
  const state = options.state ?? createReceiveState();
  const now = options.now ?? defaultNow;
  const frameReader = options.frameReader ?? createDefaultFrameReader();
  const reader = createReceiveReader(() => state.getSnapshot());
  let reference: ReceiveFrameReferenceSnapshot = {
    frames: [],
    referenceVersion: state.getSnapshot().referenceVersion,
    refreshedAt: INITIAL_REFERENCE_REFRESHED_AT,
  };

  function apply(outcome: ReceiveBatchOutcome): ReceiveServiceOutcome {
    const snapshot = state.applyOutcome(outcome);
    return serviceOutcome(snapshot, [outcome]);
  }

  function refresh(frames: readonly ReadonlyFrameAsset[]): ReceiveServiceOutcome {
    reference = {
      frames: cloneFrameReferences(frames),
      referenceVersion: reference.referenceVersion + 1,
      refreshedAt: now(),
    };
    const snapshot = state.setReferenceVersion(reference.referenceVersion);
    return serviceOutcome(snapshot, [], reference);
  }

  function ingest(batch: ReceiveInputBatch): ReceiveServiceOutcome {
    if (
      batch.referenceVersion !== undefined &&
      batch.referenceVersion !== reference.referenceVersion
    ) {
      return apply(
        createStaleReceiveInputOutcome(
          batch.id,
          batch,
          reference.referenceVersion,
          now(),
        ),
      );
    }

    return apply(
      processReceiveBatch({
        batch,
        reference,
        processedAt: now(),
      }),
    );
  }

  function recordInputError(error: ReceiveInputError): ReceiveServiceOutcome {
    return apply(createReceiveInputErrorOutcome(error, now()));
  }

  return {
    ...reader,

    refreshFrameReferences(frames) {
      return refresh(frames ?? frameReader.findFrames({ direction: 'receive' }));
    },

    ingestBatch: ingest,

    recordInputError,

    async drainInputSource(source) {
      const outcomes: ReceiveBatchOutcome[] = [];
      const events = await source.drainEvents();
      for (const event of events) {
        const serviceCall = event.kind === 'batch' ? ingest(event.batch) : recordInputError(event.error);
        outcomes.push(...serviceCall.outcomes);
      }
      const errorKinds = outcomes.filter(o => o.kind !== 'matched' && o.kind !== 'unmatched');
      if (errorKinds.length > 0) {
        // 非 matched/unmatched 的结果(config/parse/input-error/stale)是异常信号,保留计数级 warn;
        // 去掉每个 outcome 的 issues.map 格式化(高频批下无谓开销),只报数量。
        console.warn('[receive] error outcomes:', errorKinds.length);
      }

      return serviceOutcome(state.getSnapshot(), outcomes);
    },

    reset(scope = 'all') {
      const snapshot = state.reset(scope);
      if (scope === 'all') {
        reference = {
          frames: [],
          referenceVersion: 0,
          refreshedAt: INITIAL_REFERENCE_REFRESHED_AT,
        };
      }
      return serviceOutcome(snapshot);
    },
  };
}
