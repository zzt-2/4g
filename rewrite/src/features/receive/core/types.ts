import type {
  FrameAsset,
  FrameDataType,
  ReadonlyFrameAsset,
} from '@/features/frame';
import type {
  TransportErrorKind,
  TransportKind,
} from '@/features/connection';

export const RECEIVE_SCHEMA_VERSION = 1 as const;

export type ReceiveLifecycleStatus = 'idle' | 'ready' | 'receiving' | 'error';

export type ReceiveOutcomeKind =
  | 'matched'
  | 'unmatched'
  | 'config-error'
  | 'parse-error'
  | 'input-error'
  | 'stale-input';

export type ReceiveIssueSeverity = 'error' | 'warning';

export interface ReceiveIssue {
  readonly severity: ReceiveIssueSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ReceiveSourceSnapshot {
  readonly sourceId: string;
  readonly connectionId: string;
  readonly kind: TransportKind;
  readonly label: string;
  readonly targetId?: string;
  readonly routeLabel?: string;
  readonly available?: boolean;
}

export interface ReceiveInputBatch {
  readonly id: string;
  readonly bytes: readonly number[];
  readonly receivedAt: string;
  readonly source: ReceiveSourceSnapshot;
  readonly sequence?: number;
  readonly referenceVersion?: number;
}

export interface ReceiveInputError {
  readonly id: string;
  readonly occurredAt: string;
  readonly kind: TransportErrorKind | 'invalid-input' | 'stale-reference' | 'unknown';
  readonly message: string;
  readonly source?: ReceiveSourceSnapshot;
  readonly recoverable?: boolean;
  readonly referenceVersion?: number;
}

export interface ReceiveFrameReferenceSnapshot {
  readonly frames: readonly ReadonlyFrameAsset[];
  readonly referenceVersion: number;
  readonly refreshedAt: string;
}

export interface ReceiveIdentifierRule {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly operator: string;
  readonly value: unknown;
}

export interface ReceiveMatchedFrameSummary {
  readonly frameId: string;
  readonly frameName: string;
  readonly byteLength: number;
  readonly fieldCount: number;
}

export type ReceiveParsedFieldPrimitive = number | string | null;

export interface ReceiveParsedFieldValue {
  readonly frameId: string;
  readonly frameName: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly dataType: FrameDataType;
  readonly offset: number;
  readonly length: number;
  readonly rawHex: string;
  readonly value: ReceiveParsedFieldPrimitive;
  readonly displayValue: string;
  readonly label?: string;
}

export interface ReceiveFrameStatisticsSnapshot {
  readonly frameId: string;
  readonly frameName: string;
  readonly hitCount: number;
  readonly byteCount: number;
  readonly lastMatchedAt?: string;
  readonly lastSourceId?: string;
}

export interface ReceiveSourceStatisticsSnapshot {
  readonly sourceId: string;
  readonly connectionId: string;
  readonly kind: TransportKind;
  readonly label: string;
  readonly batchCount: number;
  readonly byteCount: number;
  readonly matchedCount: number;
  readonly unmatchedCount: number;
  readonly configErrorCount: number;
  readonly inputErrorCount: number;
  readonly staleInputCount: number;
  readonly lastInputAt?: string;
}

export interface ReceiveCounterSnapshot {
  readonly batchCount: number;
  readonly byteCount: number;
  readonly matchedCount: number;
  readonly unmatchedCount: number;
  readonly configErrorCount: number;
  readonly parseErrorCount: number;
  readonly inputErrorCount: number;
  readonly staleInputCount: number;
}

export interface ReceiveFieldValueSnapshot extends ReceiveParsedFieldValue {
  readonly updatedAt: string;
  readonly sourceId: string;
}

export interface ReceiveRecentInputSnapshot {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly kind: ReceiveOutcomeKind;
  readonly byteLength: number;
  readonly hex: string;
  readonly occurredAt: string;
  readonly matchedFrameId?: string;
  readonly issueCodes: readonly string[];
}

export interface ReceiveEventSnapshot {
  readonly id: string;
  readonly kind: ReceiveOutcomeKind;
  readonly occurredAt: string;
  readonly sourceId?: string;
  readonly frameId?: string;
  readonly byteLength?: number;
  readonly issueCodes: readonly string[];
}

export interface ReceiveStatsDelta {
  readonly batchCount: number;
  readonly byteCount: number;
  readonly matchedCount: number;
  readonly unmatchedCount: number;
  readonly configErrorCount: number;
  readonly parseErrorCount: number;
  readonly inputErrorCount: number;
  readonly staleInputCount: number;
  readonly frameHits: readonly ReceiveFrameStatisticsSnapshot[];
  readonly sourceHits: readonly ReceiveSourceStatisticsSnapshot[];
}

export interface ReceiveBatchOutcome {
  readonly id: string;
  readonly kind: ReceiveOutcomeKind;
  readonly processedAt: string;
  readonly input?: ReceiveInputBatch;
  readonly matchedFrame?: ReceiveMatchedFrameSummary;
  readonly fields: readonly ReceiveParsedFieldValue[];
  readonly issues: readonly ReceiveIssue[];
  readonly statsDelta: ReceiveStatsDelta;
}

export interface ReceiveStateSnapshot {
  readonly schemaVersion: typeof RECEIVE_SCHEMA_VERSION;
  readonly lifecycle: ReceiveLifecycleStatus;
  readonly referenceVersion: number;
  readonly counters: ReceiveCounterSnapshot;
  readonly frameStats: readonly ReceiveFrameStatisticsSnapshot[];
  readonly sourceStats: readonly ReceiveSourceStatisticsSnapshot[];
  readonly fieldValues: readonly ReceiveFieldValueSnapshot[];
  readonly recentInputs: readonly ReceiveRecentInputSnapshot[];
  readonly events: readonly ReceiveEventSnapshot[];
  readonly currentFrame?: ReceiveMatchedFrameSummary;
  readonly lastIssue?: ReceiveIssue;
}

export interface ReceiveUiSnapshot {
  readonly lifecycle: ReceiveLifecycleStatus;
  readonly referenceVersion: number;
  readonly counters: ReceiveCounterSnapshot;
  readonly currentFrame?: ReceiveMatchedFrameSummary;
  readonly frameStats: readonly ReceiveFrameStatisticsSnapshot[];
  readonly fieldValues: readonly ReceiveFieldValueSnapshot[];
  readonly recentInputs: readonly ReceiveRecentInputSnapshot[];
  readonly lastIssue?: ReceiveIssue;
}

export interface ReceiveProcessInput {
  readonly batch: ReceiveInputBatch;
  readonly reference: ReceiveFrameReferenceSnapshot;
  readonly processedAt: string;
}

export interface ReceiveFrameParseInput {
  readonly frame: FrameAsset;
  readonly bytes: readonly number[];
}
