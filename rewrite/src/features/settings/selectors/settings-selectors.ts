import {
  cloneGeneralConfig,
  cloneRecordingConfig,
  cloneSettingsSnapshot,
  cloneStorageConfig,
  type ReadonlySettingsGeneralConfig,
  type ReadonlySettingsRecordingConfig,
  type ReadonlySettingsSnapshot,
  type ReadonlySettingsStorageConfig,
} from '../core';

export type SettingsSource = ReadonlySettingsSnapshot;

export interface CsvExportPreference {
  readonly defaultOutputPath: string;
  readonly saveIntervalMinutes: number;
}

export function selectSettingsSnapshot(source: SettingsSource): ReadonlySettingsSnapshot {
  return cloneSettingsSnapshot(source);
}

export function selectRecordingSettings(
  source: SettingsSource,
): ReadonlySettingsRecordingConfig {
  return cloneRecordingConfig(source.recording);
}

export function selectAutoStartRecording(source: SettingsSource): boolean {
  return source.recording.autoStartRecording;
}

export function selectCsvExportPreference(source: SettingsSource): CsvExportPreference {
  return {
    defaultOutputPath: source.recording.csvDefaultOutputPath,
    saveIntervalMinutes: source.recording.csvSaveIntervalMinutes,
  };
}

export function selectStorageSettings(source: SettingsSource): ReadonlySettingsStorageConfig {
  return cloneStorageConfig(source.storage);
}

export function selectGeneralSettings(source: SettingsSource): ReadonlySettingsGeneralConfig {
  return cloneGeneralConfig(source.general);
}

export function selectUpdateInterval(source: SettingsSource): number {
  return source.general.updateInterval;
}

export function selectMaxHistoryHours(source: SettingsSource): number {
  return source.storage.maxHistoryHours;
}

export function isAutoSaveEnabled(source: SettingsSource): boolean {
  return source.storage.enableAutoSave;
}
