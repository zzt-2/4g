export const STATUS_SCHEMA_VERSION = 1 as const;

export const HEALTH_LEVELS = ['healthy', 'degraded', 'error', 'unknown'] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const INDICATOR_STATUS_ROLES = [
  'normal',
  'warning',
  'error',
  'disabled',
  'no-data',
] as const;
export type IndicatorStatusRole = (typeof INDICATOR_STATUS_ROLES)[number];

// --- Input material types (status defines what it consumes) ---

export interface ConnectionStatusMaterial {
  readonly connectionId: string;
  readonly lifecycle: string;
  readonly errorCount: number;
  readonly lastError?: string;
  readonly available: boolean;
}

export interface ReceiveFieldMaterial {
  readonly groupId: string;
  readonly dataItemId: string;
  readonly value: unknown;
  readonly receivedAt?: string;
}

export interface ReceiveStatsMaterial {
  readonly matchedCount: number;
  readonly unmatchedCount: number;
  readonly errorCount: number;
}

export interface StatusInputMaterial {
  readonly connections?: readonly ConnectionStatusMaterial[];
  readonly receiveFields?: readonly ReceiveFieldMaterial[];
  readonly receiveStats?: ReceiveStatsMaterial;
}

// --- Indicator config (status owns runtime semantics) ---

export interface IndicatorConfig {
  readonly id: string;
  readonly label: string;
  readonly groupId: string;
  readonly dataItemId: string;
  readonly enabled: boolean;
  readonly warningThreshold?: number;
  readonly errorThreshold?: number;
  readonly rangeMin?: number;
  readonly rangeMax?: number;
}

// --- Read model types ---

export interface SourceHealthSummary {
  readonly source: string;
  readonly level: HealthLevel;
  readonly detail?: string;
}

export interface HealthSummary {
  readonly overallLevel: HealthLevel;
  readonly sources: readonly SourceHealthSummary[];
  readonly lastChangedAt?: string;
}

export interface IndicatorProjection {
  readonly id: string;
  readonly label: string;
  readonly groupId: string;
  readonly dataItemId: string;
  readonly role: IndicatorStatusRole;
  readonly currentValue: unknown;
  readonly lastUpdatedAt?: string;
}

export interface StatusSnapshot {
  readonly schemaVersion: typeof STATUS_SCHEMA_VERSION;
  readonly health: HealthSummary;
  readonly indicators: readonly IndicatorProjection[];
  readonly indicatorConfigs: readonly IndicatorConfig[];
  readonly lastUpdatedAt?: string;
}

// --- Readonly deep ---

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlyStatusSnapshot = ReadonlyDeep<StatusSnapshot>;
export type ReadonlyHealthSummary = ReadonlyDeep<HealthSummary>;
export type ReadonlyIndicatorProjection = ReadonlyDeep<IndicatorProjection>;
export type ReadonlyIndicatorConfig = ReadonlyDeep<IndicatorConfig>;

// --- Validation ---

export type StatusValidationSeverity = 'error' | 'warning';

export interface StatusValidationIssue {
  readonly severity: StatusValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface IndicatorConfigNormalization {
  readonly configs: IndicatorConfig[];
  readonly issues: StatusValidationIssue[];
}
