export const SEND_SOURCES = ['user', 'task', 'scoe', 'test'] as const;
export type SendSource = (typeof SEND_SOURCES)[number];

export const CHECKSUM_KINDS = ['none', 'sum8', 'xor8', 'crc16', 'crc16-modbus', 'crc32'] as const;
export type ChecksumKind = (typeof CHECKSUM_KINDS)[number];

export const SEND_RESULT_KINDS = [
  'sent',
  'build-error',
  'target-unavailable',
  'transport-error',
  'timeout',
  'cancelled',
] as const;
export type SendResultKind = (typeof SEND_RESULT_KINDS)[number];

export type SendFieldValue = string | number | boolean;

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

// --- Context ---

export interface SendContext {
  readonly source: SendSource;
  readonly taskId?: string;
  readonly stepIndex?: number;
}

// --- Request ---

export interface SendRequest {
  readonly frameId: string;
  readonly fieldValues?: Readonly<Record<string, SendFieldValue>>;
  readonly userFieldValues?: Readonly<Record<string, SendFieldValue>>;
  readonly targetId: string;
  readonly options?: SendOptions;
  readonly context: SendContext;
}

export interface SendRequestRef {
  readonly frameId: string;
  readonly targetId: string;
  readonly context: SendContext;
}

export interface SendOptions {
  readonly checksumKind?: ChecksumKind;
  readonly autoChecksum?: boolean;
  readonly includeLengthField?: boolean;
  readonly lengthFieldId?: string;
  readonly bigEndian?: boolean;
}

// --- Encoding input (service translates frame snapshot to this) ---

export interface FrameChecksumOption {
  readonly isChecksum: boolean;
  readonly startFieldIndex: number;
  readonly endFieldIndex: number;
  readonly checksumMethod?: string;
}

export interface ExpressionBranch {
  readonly condition: string;
  readonly expression: string;
}

export interface ExpressionConfig {
  readonly expressions: readonly ExpressionBranch[];
  readonly variables: readonly { readonly identifier: string; readonly sourceType: string; readonly sourceId?: string }[];
}

export interface SendFieldEncodingDef {
  readonly id: string;
  readonly dataType: string;
  readonly length: number;
  readonly bigEndian: boolean;
  readonly isASCII: boolean;
  readonly offset: number;
  readonly factor?: number;
  readonly defaultValue?: string;
  readonly configurable?: boolean;
  readonly expressionConfig?: ExpressionConfig;
  readonly validOption?: FrameChecksumOption;
}

export interface SendBuildInput {
  readonly fields: readonly SendFieldEncodingDef[];
  readonly totalByteLength: number;
  readonly fieldValues: Readonly<Record<string, SendFieldValue>>;
}

// --- Build output ---

export interface ResolvedFieldValue {
  readonly fieldId: string;
  readonly rawValue: SendFieldValue;
  readonly encodedBytes: readonly number[];
  readonly offset: number;
  readonly length: number;
}

export interface SendBuildIssue {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly fieldId?: string;
  readonly message: string;
}

export interface FrameBuildOutput {
  readonly bytes: Uint8Array;
  readonly resolvedFields: Readonly<Record<string, ResolvedFieldValue>>;
  readonly issues: readonly SendBuildIssue[];
}

// --- Result ---

export interface SendError {
  readonly kind: string;
  readonly message: string;
}

export interface SendResult {
  readonly kind: SendResultKind;
  readonly requestRef: SendRequestRef;
  readonly bytesBuilt: number;
  readonly bytesSent: number;
  readonly timestamp: string;
  readonly error?: SendError;
  readonly buildIssues: readonly SendBuildIssue[];
  readonly resolvedFieldValues?: Readonly<Record<string, SendFieldValue>>;
}

// --- Statistics ---

export interface SendCategoryStats {
  readonly sent: number;
  readonly errors: number;
}

export interface SendStatisticsSnapshot {
  readonly totalRequests: number;
  readonly totalSent: number;
  readonly totalErrors: number;
  readonly totalBytesSent: number;
  readonly byFrame: Readonly<Record<string, Readonly<SendCategoryStats>>>;
  readonly byTarget: Readonly<Record<string, Readonly<SendCategoryStats>>>;
  readonly byResultKind: Readonly<Partial<Record<SendResultKind, number>>>;
  readonly lastSendAt?: string;
}

export interface SendStatsDelta {
  readonly frameId: string;
  readonly targetId: string;
  readonly resultKind: SendResultKind;
  readonly bytesSent: number;
  readonly timestamp: string;
}

// --- State ---

export type SendServiceStatus = 'idle' | 'sending' | 'error';

export interface SendStateSnapshot {
  readonly status: SendServiceStatus;
  readonly statistics: SendStatisticsSnapshot;
  readonly recentResults: readonly SendResult[];
  readonly lastError?: SendError;
}

export type ReadonlySendStateSnapshot = ReadonlyDeep<SendStateSnapshot>;

// --- SendFrameInstance (readiness) ---

export interface SendFrameInstance {
  readonly instanceId: string;
  readonly frameId: string;
  readonly name: string;
  readonly description?: string;
  readonly userFieldValues: Record<string, SendFieldValue>;
  readonly sendCount: number;
  readonly lastSendAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
