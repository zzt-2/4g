export const SETTINGS_SCHEMA_VERSION = 1 as const;

export interface SettingsRecordingConfig {
  readonly autoStartRecording: boolean;
  readonly csvDefaultOutputPath: string;
  readonly csvSaveIntervalMinutes: number;
}

export interface SettingsStorageConfig {
  readonly maxHistoryHours: number;
  readonly enableAutoSave: boolean;
  readonly enableHistoryStorage: boolean;
}

export interface SettingsGeneralConfig {
  readonly updateInterval: number;
}

export interface SettingsSnapshot {
  readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  readonly recording: SettingsRecordingConfig;
  readonly storage: SettingsStorageConfig;
  readonly general: SettingsGeneralConfig;
}

export interface SettingsRecordingPatch {
  readonly autoStartRecording?: unknown;
  readonly csvDefaultOutputPath?: unknown;
  readonly csvSaveIntervalMinutes?: unknown;
  readonly csvSaveInterval?: unknown;
}

export interface SettingsStoragePatch {
  readonly maxHistoryHours?: unknown;
  readonly enableAutoSave?: unknown;
  readonly enableHistoryStorage?: unknown;
}

export interface SettingsGeneralPatch {
  readonly updateInterval?: unknown;
}

export interface SettingsPatch {
  readonly recording?: SettingsRecordingPatch;
  readonly storage?: SettingsStoragePatch;
  readonly general?: SettingsGeneralPatch;
  readonly autoStartRecording?: unknown;
  readonly csvDefaultOutputPath?: unknown;
  readonly csvSaveIntervalMinutes?: unknown;
  readonly csvSaveInterval?: unknown;
  readonly maxHistoryHours?: unknown;
  readonly enableAutoSave?: unknown;
  readonly enableHistoryStorage?: unknown;
  readonly updateInterval?: unknown;
}

export type SettingsResetScope = 'all' | 'recording' | 'storage' | 'general';
export type SettingsValidationSeverity = 'error' | 'warning';

export interface SettingsValidationIssue {
  readonly severity: SettingsValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface SettingsValidationResult {
  readonly valid: boolean;
  readonly issues: readonly SettingsValidationIssue[];
}

export interface SettingsNormalizationResult extends SettingsValidationResult {
  readonly snapshot: SettingsSnapshot;
}

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlySettingsSnapshot = ReadonlyDeep<SettingsSnapshot>;
export type ReadonlySettingsRecordingConfig = ReadonlyDeep<SettingsRecordingConfig>;
export type ReadonlySettingsStorageConfig = ReadonlyDeep<SettingsStorageConfig>;
export type ReadonlySettingsGeneralConfig = ReadonlyDeep<SettingsGeneralConfig>;
