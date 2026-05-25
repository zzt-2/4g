export const DISPLAY_SCHEMA_VERSION = 1 as const;

// --- Display modes ---

export type DisplayMode = 'table' | 'chart' | 'special';

// --- Preference types ---

export interface TableDisplayPreference {
  readonly displayMode: DisplayMode;
  readonly selectedGroupId: string;
  readonly selectedItems: readonly string[];
}

export interface ChartPerformancePreference {
  readonly maxPoints: number;
  readonly refreshIntervalMs: number;
}

export interface YAxisPreference {
  readonly autoScale: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface ChartInstancePreference {
  readonly id: string;
  readonly title: string;
  readonly selectedItems: readonly string[];
  readonly yAxis: YAxisPreference;
  readonly performance: ChartPerformancePreference;
}

export interface ScatterSourceBinding {
  readonly groupId: string;
  readonly dataItemId: string;
}

export interface ScatterDisplayPreference {
  readonly iSource: ScatterSourceBinding;
  readonly qSource: ScatterSourceBinding;
  readonly sampleCount: number;
  readonly bitWidth: number;
  readonly refreshIntervalMs: number;
}

export interface DisplayPreferences {
  readonly table1: TableDisplayPreference;
  readonly table2: TableDisplayPreference;
  readonly charts: readonly ChartInstancePreference[];
  readonly scatter: ScatterDisplayPreference;
  readonly refreshCadenceMs: number;
}

// --- Source material (display defines what it consumes) ---

export interface DisplayFieldMaterial {
  readonly groupId: string;
  readonly dataItemId: string;
  readonly fieldName: string;
  readonly value: unknown;
  readonly displayValue: string;
  readonly updatedAt?: string;
}

export interface DisplaySourceAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

export interface DisplaySourceMaterial {
  readonly fields?: readonly DisplayFieldMaterial[];
  readonly availability?: DisplaySourceAvailability;
}

// --- Projection types (UI-safe read models) ---

export interface TableRowProjection {
  readonly groupId: string;
  readonly dataItemId: string;
  readonly fieldName: string;
  readonly value: unknown;
  readonly displayValue: string;
  readonly updatedAt?: string;
}

export interface ChartPoint {
  readonly timestamp: string;
  readonly value: number;
}

export interface ChartSeriesProjection {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly points: readonly ChartPoint[];
}

export interface ScatterPoint {
  readonly i: number;
  readonly q: number;
}

export interface ScatterProjection {
  readonly points: readonly ScatterPoint[];
  readonly sampleCount: number;
}

export interface ChartInstanceProjection {
  readonly id: string;
  readonly series: readonly ChartSeriesProjection[];
}

export interface DisplayProjection {
  readonly table1Rows: readonly TableRowProjection[];
  readonly table2Rows: readonly TableRowProjection[];
  readonly charts: readonly ChartInstanceProjection[];
  readonly scatter: ScatterProjection;
}

// --- Snapshot ---

export interface DisplaySnapshot {
  readonly schemaVersion: typeof DISPLAY_SCHEMA_VERSION;
  readonly preferences: DisplayPreferences;
  readonly projection: DisplayProjection;
  readonly availability: DisplaySourceAvailability;
  readonly lastUpdatedAt?: string;
}

// --- Patch types ---

export interface ChartInstancePatch {
  readonly title?: string;
  readonly selectedItems?: readonly string[];
  readonly yAxis?: Partial<YAxisPreference>;
  readonly performance?: Partial<ChartPerformancePreference>;
}

export interface DisplayPreferencesPatch {
  readonly table1?: Partial<TableDisplayPreference>;
  readonly table2?: Partial<TableDisplayPreference>;
  readonly charts?: readonly ChartInstancePatch[];
  readonly scatter?: Partial<ScatterDisplayPreference>;
  readonly refreshCadenceMs?: unknown;
}

// --- Validation ---

export type DisplayValidationSeverity = 'error' | 'warning';

export interface DisplayValidationIssue {
  readonly severity: DisplayValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface DisplayValidationResult {
  readonly valid: boolean;
  readonly issues: readonly DisplayValidationIssue[];
}

export interface DisplayNormalizationResult extends DisplayValidationResult {
  readonly snapshot: DisplaySnapshot;
}

// --- Readonly deep ---

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlyDisplaySnapshot = ReadonlyDeep<DisplaySnapshot>;
export type ReadonlyDisplayPreferences = ReadonlyDeep<DisplayPreferences>;
export type ReadonlyDisplayProjection = ReadonlyDeep<DisplayProjection>;
