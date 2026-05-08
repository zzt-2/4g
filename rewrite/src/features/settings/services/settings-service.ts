import {
  applySettingsPatch,
  createDefaultSettingsSnapshot,
  normalizeSettingsInput,
  type ReadonlySettingsRecordingConfig,
  type ReadonlySettingsSnapshot,
  type ReadonlySettingsGeneralConfig,
  type ReadonlySettingsStorageConfig,
  type SettingsNormalizationResult,
  type SettingsPatch,
  type SettingsResetScope,
  type SettingsSnapshot,
  type SettingsValidationResult,
} from '../core';
import {
  isAutoSaveEnabled,
  selectAutoStartRecording,
  selectCsvExportPreference,
  selectGeneralSettings,
  selectMaxHistoryHours,
  selectRecordingSettings,
  selectSettingsSnapshot,
  selectStorageSettings,
  selectUpdateInterval,
  type CsvExportPreference,
} from '../selectors';
import { createSettingsState, type SettingsStateContainer } from '../state';

export interface SettingsReader {
  getSnapshot(): ReadonlySettingsSnapshot;
  getRecordingSettings(): ReadonlySettingsRecordingConfig;
  getStorageSettings(): ReadonlySettingsStorageConfig;
  getGeneralSettings(): ReadonlySettingsGeneralConfig;
  getCsvExportPreference(): CsvExportPreference;
  isAutoStartRecordingEnabled(): boolean;
  getUpdateInterval(): number;
  getMaxHistoryHours(): number;
  isAutoSaveEnabled(): boolean;
}

export interface SettingsOperationResult {
  readonly ok: boolean;
  readonly validation: SettingsValidationResult;
  readonly snapshot: ReadonlySettingsSnapshot;
}

export interface SettingsService extends SettingsReader {
  replace(value: unknown): SettingsOperationResult;
  update(patch: SettingsPatch): SettingsOperationResult;
  reset(scope?: SettingsResetScope): SettingsOperationResult;
}

function toOperationResult(result: SettingsNormalizationResult): SettingsOperationResult {
  return {
    ok: result.valid,
    validation: {
      valid: result.valid,
      issues: result.issues,
    },
    snapshot: result.snapshot,
  };
}

function validOperation(snapshot: SettingsSnapshot): SettingsOperationResult {
  return {
    ok: true,
    validation: {
      valid: true,
      issues: [],
    },
    snapshot,
  };
}

export function createSettingsReader(
  snapshotProvider: () => ReadonlySettingsSnapshot,
): SettingsReader {
  return {
    getSnapshot() {
      return selectSettingsSnapshot(snapshotProvider());
    },

    getRecordingSettings() {
      return selectRecordingSettings(snapshotProvider());
    },

    getStorageSettings() {
      return selectStorageSettings(snapshotProvider());
    },

    getGeneralSettings() {
      return selectGeneralSettings(snapshotProvider());
    },

    getCsvExportPreference() {
      return selectCsvExportPreference(snapshotProvider());
    },

    isAutoStartRecordingEnabled() {
      return selectAutoStartRecording(snapshotProvider());
    },

    getUpdateInterval() {
      return selectUpdateInterval(snapshotProvider());
    },

    getMaxHistoryHours() {
      return selectMaxHistoryHours(snapshotProvider());
    },

    isAutoSaveEnabled() {
      return isAutoSaveEnabled(snapshotProvider());
    },
  };
}

export function createSettingsService(
  state: SettingsStateContainer = createSettingsState(),
): SettingsService {
  const reader = createSettingsReader(() => state.getSnapshot());

  return {
    ...reader,

    replace(value) {
      const result = normalizeSettingsInput(value);
      const snapshot = state.replaceSnapshot(result.snapshot);
      return toOperationResult({
        valid: result.valid,
        issues: result.issues,
        snapshot,
      });
    },

    update(patch) {
      const result = applySettingsPatch(state.getSnapshot(), patch);
      const snapshot = state.replaceSnapshot(result.snapshot);
      return toOperationResult({
        valid: result.valid,
        issues: result.issues,
        snapshot,
      });
    },

    reset(scope = 'all') {
      const current = state.getSnapshot();
      const defaults = createDefaultSettingsSnapshot();
      let snapshot: SettingsSnapshot;

      switch (scope) {
        case 'recording':
          snapshot = state.replaceSnapshot({ ...current, recording: defaults.recording });
          break;
        case 'storage':
          snapshot = state.replaceSnapshot({ ...current, storage: defaults.storage });
          break;
        case 'general':
          snapshot = state.replaceSnapshot({ ...current, general: defaults.general });
          break;
        default:
          snapshot = state.resetSnapshot(defaults);
      }

      return validOperation(snapshot);
    },
  };
}
