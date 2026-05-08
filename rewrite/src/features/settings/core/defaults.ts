import { SETTINGS_SCHEMA_VERSION, type SettingsSnapshot } from './types';
import { cloneSettingsSnapshot } from './clone';

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  recording: {
    autoStartRecording: true,
    csvDefaultOutputPath: '',
    csvSaveIntervalMinutes: 5,
  },
  storage: {
    maxHistoryHours: 24,
    enableAutoSave: true,
    enableHistoryStorage: true,
  },
  general: {
    updateInterval: 1000,
  },
};

export function createDefaultSettingsSnapshot(): SettingsSnapshot {
  return cloneSettingsSnapshot(DEFAULT_SETTINGS);
}
