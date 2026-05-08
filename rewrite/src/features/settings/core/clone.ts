import type {
  ReadonlySettingsGeneralConfig,
  ReadonlySettingsRecordingConfig,
  ReadonlySettingsSnapshot,
  ReadonlySettingsStorageConfig,
  SettingsGeneralConfig,
  SettingsRecordingConfig,
  SettingsSnapshot,
  SettingsStorageConfig,
} from './types';

export function cloneRecordingConfig(
  recording: ReadonlySettingsRecordingConfig,
): SettingsRecordingConfig {
  return { ...recording };
}

export function cloneStorageConfig(
  storage: ReadonlySettingsStorageConfig,
): SettingsStorageConfig {
  return { ...storage };
}

export function cloneGeneralConfig(
  general: ReadonlySettingsGeneralConfig,
): SettingsGeneralConfig {
  return { ...general };
}

export function cloneSettingsSnapshot(snapshot: ReadonlySettingsSnapshot): SettingsSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    recording: cloneRecordingConfig(snapshot.recording),
    storage: cloneStorageConfig(snapshot.storage),
    general: cloneGeneralConfig(snapshot.general),
  };
}
