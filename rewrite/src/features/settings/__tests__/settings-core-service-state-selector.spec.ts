import { describe, expect, it } from 'vitest';
import * as settingsPublicApi from '../index';
import {
  applySettingsPatch,
  cloneSettingsSnapshot,
  createDefaultSettingsSnapshot,
  normalizeSettingsInput,
  type SettingsSnapshot,
} from '../core';
import { createSettingsReader, createSettingsService } from '../services';
import { createSettingsState } from '../state';
import {
  defaultSettingsFixture,
  invalidSettingsInputSample,
  legacyLikeSettingsInputSample,
  partialSettingsInputSample,
  updateSettingsPatchSample,
} from '../fixtures/settings-fixtures';

type MutableRecordingForTest = {
  csvDefaultOutputPath: string;
};

type MutableStorageForTest = {
  maxHistoryHours: number;
};

type MutableGeneralForTest = {
  updateInterval: number;
};

type MutableCsvPreferenceForTest = {
  defaultOutputPath: string;
};

function mutableRecordingForTest(value: unknown): MutableRecordingForTest {
  return value as MutableRecordingForTest;
}

function mutableStorageForTest(value: unknown): MutableStorageForTest {
  return value as MutableStorageForTest;
}

function mutableGeneralForTest(value: unknown): MutableGeneralForTest {
  return value as MutableGeneralForTest;
}

function mutableCsvPreferenceForTest(value: unknown): MutableCsvPreferenceForTest {
  return value as MutableCsvPreferenceForTest;
}

describe('settings core pilot', () => {
  it('creates default settings snapshots as copies', () => {
    const defaults = createDefaultSettingsSnapshot();
    expect(defaults).toEqual(defaultSettingsFixture);

    mutableRecordingForTest(defaults.recording).csvDefaultOutputPath = 'mutated outside core';
    expect(createDefaultSettingsSnapshot().recording.csvDefaultOutputPath).toBe('');
  });

  it('normalizes partial settings input with default fallback', () => {
    const result = normalizeSettingsInput(partialSettingsInputSample);

    expect(result.valid).toBe(true);
    expect(result.snapshot).toEqual({
      schemaVersion: 1,
      recording: {
        autoStartRecording: true,
        csvDefaultOutputPath: 'D:/dongfanghong/csv',
        csvSaveIntervalMinutes: 5,
      },
      storage: {
        maxHistoryHours: 48,
        enableAutoSave: true,
        enableHistoryStorage: true,
      },
      general: {
        updateInterval: 1000,
      },
    });
  });

  it('normalizes legacy-like input without adopting other feature runtime semantics', () => {
    const result = normalizeSettingsInput(legacyLikeSettingsInputSample);

    expect(result.snapshot).toEqual({
      schemaVersion: 1,
      recording: {
        autoStartRecording: false,
        csvDefaultOutputPath: 'D:/legacy/csv',
        csvSaveIntervalMinutes: 0.5,
      },
      storage: {
        maxHistoryHours: 12,
        enableAutoSave: false,
        enableHistoryStorage: true,
      },
      general: {
        updateInterval: 500,
      },
    });
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'statusIndicatorSettings',
        'chart-performance-config',
        'historyAnalysis_chartSettings',
        'default-serial-options',
        'last-used-port',
      ]),
    );
    expect(result.snapshot).not.toHaveProperty('statusIndicatorSettings');
    expect(result.snapshot).not.toHaveProperty('chart-performance-config');
    expect(result.snapshot).not.toHaveProperty('default-serial-options');
  });

  it('downgrades invalid values to defaults during normalization', () => {
    const result = normalizeSettingsInput(invalidSettingsInputSample);

    expect(result.snapshot.recording).toEqual(defaultSettingsFixture.recording);
    expect(result.snapshot.storage).toEqual(defaultSettingsFixture.storage);
    expect(result.snapshot.general).toEqual(defaultSettingsFixture.general);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'settings.recording.autoStartRecording.invalidBoolean',
        'settings.recording.csvDefaultOutputPath.invalidString',
        'settings.recording.csvSaveIntervalMinutes.invalidPositiveNumber',
        'settings.storage.maxHistoryHours.invalidPositiveNumber',
        'settings.storage.enableAutoSave.invalidBoolean',
        'settings.storage.enableHistoryStorage.invalidBoolean',
        'settings.general.updateInterval.invalidPositiveNumber',
        'settings.unknownFieldIgnored',
      ]),
    );
  });

  it('applies update patches through the same normalize boundary', () => {
    const result = applySettingsPatch(defaultSettingsFixture, updateSettingsPatchSample);

    expect(result.snapshot.recording).toEqual({
      autoStartRecording: false,
      csvDefaultOutputPath: 'E:/exports',
      csvSaveIntervalMinutes: 2.5,
    });
    expect(result.snapshot.storage).toEqual({
      maxHistoryHours: 72,
      enableAutoSave: false,
      enableHistoryStorage: true,
    });
    expect(result.snapshot.general).toEqual({
      updateInterval: 200,
    });
  });
});

describe('settings pure state pilot', () => {
  it('returns snapshot copies instead of the internal settings object', () => {
    const state = createSettingsState({
      snapshot: normalizeSettingsInput(legacyLikeSettingsInputSample).snapshot,
    });

    const snapshot = state.getSnapshot();
    mutableRecordingForTest(snapshot.recording).csvDefaultOutputPath = 'external mutation';

    expect(state.getSnapshot().recording.csvDefaultOutputPath).toBe('D:/legacy/csv');
  });

  it('stores replaced snapshot copies instead of caller-owned objects', () => {
    const state = createSettingsState();
    const nextSnapshot = cloneSettingsSnapshot(defaultSettingsFixture);
    mutableRecordingForTest(nextSnapshot.recording).csvDefaultOutputPath = 'F:/initial';

    state.replaceSnapshot(nextSnapshot);
    mutableRecordingForTest(nextSnapshot.recording).csvDefaultOutputPath = 'caller mutation';

    expect(state.getSnapshot().recording.csvDefaultOutputPath).toBe('F:/initial');
  });
});

describe('settings service pilot', () => {
  it('updates and resets settings through the service entry', () => {
    const service = createSettingsService();

    const updateResult = service.update(updateSettingsPatchSample);
    expect(updateResult.ok).toBe(true);
    expect(service.getCsvExportPreference()).toEqual({
      defaultOutputPath: 'E:/exports',
      saveIntervalMinutes: 2.5,
    });
    expect(service.isAutoStartRecordingEnabled()).toBe(false);
    expect(service.getMaxHistoryHours()).toBe(72);
    expect(service.isAutoSaveEnabled()).toBe(false);
    expect(service.getUpdateInterval()).toBe(200);

    const resetResult = service.reset();
    expect(resetResult.ok).toBe(true);
    expect(service.getSnapshot()).toEqual(defaultSettingsFixture);
  });

  it('supports the explicit recording reset scope', () => {
    const service = createSettingsService();

    service.update(updateSettingsPatchSample);
    const result = service.reset('recording');

    expect(result.ok).toBe(true);
    expect(service.getRecordingSettings()).toEqual(defaultSettingsFixture.recording);
    expect(service.getMaxHistoryHours()).toBe(72);
    expect(service.getUpdateInterval()).toBe(200);
  });

  it('supports the explicit storage reset scope', () => {
    const service = createSettingsService();

    service.update(updateSettingsPatchSample);
    const result = service.reset('storage');

    expect(result.ok).toBe(true);
    expect(service.getStorageSettings()).toEqual(defaultSettingsFixture.storage);
    expect(service.isAutoStartRecordingEnabled()).toBe(false);
    expect(service.getUpdateInterval()).toBe(200);
  });

  it('supports the explicit general reset scope', () => {
    const service = createSettingsService();

    service.update(updateSettingsPatchSample);
    const result = service.reset('general');

    expect(result.ok).toBe(true);
    expect(service.getGeneralSettings()).toEqual(defaultSettingsFixture.general);
    expect(service.isAutoStartRecordingEnabled()).toBe(false);
    expect(service.getMaxHistoryHours()).toBe(72);
  });

  it('replaces from legacy-like input while keeping snapshots isolated', () => {
    const service = createSettingsService();
    const result = service.replace(legacyLikeSettingsInputSample);

    expect(result.ok).toBe(true);
    expect(result.validation.issues.map((issue) => issue.code)).toContain(
      'settings.unknownFieldIgnored',
    );

    const snapshot = service.getSnapshot() as SettingsSnapshot;
    mutableRecordingForTest(snapshot.recording).csvDefaultOutputPath = 'external mutation';
    expect(service.getSnapshot().recording.csvDefaultOutputPath).toBe('D:/legacy/csv');
  });
});

describe('settings selector and public api pilot', () => {
  it('returns selector projections that cannot mutate backing state', () => {
    const service = createSettingsService();
    service.update(updateSettingsPatchSample);

    const recording = mutableRecordingForTest(service.getRecordingSettings());
    const storage = mutableStorageForTest(service.getStorageSettings());
    const general = mutableGeneralForTest(service.getGeneralSettings());
    const csvPreference = service.getCsvExportPreference();

    recording.csvDefaultOutputPath = 'mutated recording selector';
    storage.maxHistoryHours = 999;
    general.updateInterval = 1;
    mutableCsvPreferenceForTest(csvPreference).defaultOutputPath = 'mutated csv selector';

    expect(service.getRecordingSettings().csvDefaultOutputPath).toBe('E:/exports');
    expect(service.getStorageSettings().maxHistoryHours).toBe(72);
    expect(service.getGeneralSettings().updateInterval).toBe(200);
    expect(service.getCsvExportPreference().defaultOutputPath).toBe('E:/exports');
  });

  it('keeps reader read-only and root public api free of internal mutable state', () => {
    const reader = createSettingsReader(() => defaultSettingsFixture);

    expect(reader.getSnapshot()).toEqual(defaultSettingsFixture);
    expect(reader.getStorageSettings()).toEqual(defaultSettingsFixture.storage);
    expect(reader.getGeneralSettings()).toEqual(defaultSettingsFixture.general);
    expect(reader.getUpdateInterval()).toBe(1000);
    expect(reader.getMaxHistoryHours()).toBe(24);
    expect(reader.isAutoSaveEnabled()).toBe(true);

    expect(settingsPublicApi).toHaveProperty('createSettingsReader');
    expect(settingsPublicApi).toHaveProperty('createSettingsService');
    expect(settingsPublicApi).toHaveProperty('selectCsvExportPreference');
    expect(settingsPublicApi).toHaveProperty('selectStorageSettings');
    expect(settingsPublicApi).toHaveProperty('selectGeneralSettings');
    expect(settingsPublicApi).toHaveProperty('selectUpdateInterval');
    expect(settingsPublicApi).toHaveProperty('selectMaxHistoryHours');
    expect(settingsPublicApi).toHaveProperty('isAutoSaveEnabled');
    expect(settingsPublicApi).not.toHaveProperty('createSettingsState');
    expect(settingsPublicApi).not.toHaveProperty('normalizeSettingsInput');
  });
});

describe('settings normalize edge cases', () => {
  it('handles empty input returning all defaults', () => {
    const result = normalizeSettingsInput(undefined);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.snapshot).toEqual(defaultSettingsFixture);
  });

  it('handles null input returning all defaults', () => {
    const result = normalizeSettingsInput(null);

    expect(result.valid).toBe(true);
    expect(result.snapshot).toEqual(defaultSettingsFixture);
  });

  it('handles non-object input returning all defaults with warning', () => {
    const result = normalizeSettingsInput('not an object');

    expect(result.valid).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('settings.inputInvalid');
    expect(result.snapshot).toEqual(defaultSettingsFixture);
  });

  it('preserves valid values when normalizing partial input with only storage', () => {
    const result = normalizeSettingsInput({
      storage: { maxHistoryHours: 48 },
    });

    expect(result.valid).toBe(true);
    expect(result.snapshot.storage.maxHistoryHours).toBe(48);
    expect(result.snapshot.storage.enableAutoSave).toBe(true);
    expect(result.snapshot.storage.enableHistoryStorage).toBe(true);
    expect(result.snapshot.recording).toEqual(defaultSettingsFixture.recording);
    expect(result.snapshot.general).toEqual(defaultSettingsFixture.general);
  });

  it('downgrades zero updateInterval to default', () => {
    const result = normalizeSettingsInput({
      general: { updateInterval: 0 },
    });

    expect(result.snapshot.general.updateInterval).toBe(1000);
    expect(result.issues.map((i) => i.code)).toContain('settings.general.updateInterval.invalidPositiveNumber');
  });

  it('downgrades negative maxHistoryHours to default', () => {
    const result = normalizeSettingsInput({
      storage: { maxHistoryHours: -1 },
    });

    expect(result.snapshot.storage.maxHistoryHours).toBe(24);
    expect(result.issues.map((i) => i.code)).toContain('settings.storage.maxHistoryHours.invalidPositiveNumber');
  });

  it('downgrades non-boolean enableAutoSave to default', () => {
    const result = normalizeSettingsInput({
      storage: { enableAutoSave: 'yes' },
    });

    expect(result.snapshot.storage.enableAutoSave).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('settings.storage.enableAutoSave.invalidBoolean');
  });

  it('downgrades non-boolean enableHistoryStorage to default', () => {
    const result = normalizeSettingsInput({
      storage: { enableHistoryStorage: 1 },
    });

    expect(result.snapshot.storage.enableHistoryStorage).toBe(true);
  });

  it('recognizes top-level storage legacy keys', () => {
    const result = normalizeSettingsInput({
      maxHistoryHours: 8,
      enableAutoSave: false,
      enableHistoryStorage: false,
      updateInterval: 250,
    });

    expect(result.snapshot.storage.maxHistoryHours).toBe(8);
    expect(result.snapshot.storage.enableAutoSave).toBe(false);
    expect(result.snapshot.storage.enableHistoryStorage).toBe(false);
    expect(result.snapshot.general.updateInterval).toBe(250);
  });
});
