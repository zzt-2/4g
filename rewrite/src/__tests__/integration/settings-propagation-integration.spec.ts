/**
 * T015: Settings propagation to downstream features
 *
 * End-to-end tests for settings state -> service -> selector pipeline:
 * - createSettingsState (state container with getSnapshot/replaceSnapshot/resetSnapshot)
 * - createSettingsService (update/patch/reset/replace)
 * - Selectors (selectStorageSettings, selectRecordingSettings, selectGeneralSettings, etc.)
 * - Immutability guarantees
 */
import { describe, it, expect } from 'vitest';
import { createSettingsService } from '@/features/settings/services/settings-service';
import { createSettingsState } from '@/features/settings/state/settings-state';
import {
  selectStorageSettings,
  selectRecordingSettings,
  selectGeneralSettings,
  selectSettingsSnapshot,
  selectAutoStartRecording,
  selectUpdateInterval,
  selectMaxHistoryHours,
  isAutoSaveEnabled,
} from '@/features/settings/selectors';
import { createDefaultSettingsSnapshot } from '@/features/settings/core';
import type { SettingsSnapshot } from '@/features/settings/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh service instance for each test (no shared state). */
function freshService() {
  return createSettingsService(createSettingsState());
}

// ---------------------------------------------------------------------------
// 1. Settings selector returns deep copy (immutability)
// ---------------------------------------------------------------------------

describe('Settings selector returns deep copy', () => {
  it('mutating getSnapshot result does not affect next read', () => {
    const service = freshService();

    const snap1 = service.getSnapshot();
    // Mutate nested property
    (snap1 as Mutable<typeof snap1>).recording.autoStartRecording = false;
    (snap1 as Mutable<typeof snap1>).storage.maxHistoryHours = 999;

    const snap2 = service.getSnapshot();
    // Original defaults must be unchanged
    expect(snap2.recording.autoStartRecording).toBe(true);
    expect(snap2.storage.maxHistoryHours).toBe(24);
  });

  it('mutating selectStorageSettings result does not affect next read', () => {
    const service = freshService();

    const storage1 = service.getStorageSettings();
    (storage1 as Mutable<typeof storage1>).maxHistoryHours = 0;

    const storage2 = service.getStorageSettings();
    expect(storage2.maxHistoryHours).toBe(24);
  });

  it('mutating selectRecordingSettings result does not affect next read', () => {
    const service = freshService();

    const rec1 = service.getRecordingSettings();
    (rec1 as Mutable<typeof rec1>).autoStartRecording = false;

    const rec2 = service.getRecordingSettings();
    expect(rec2.autoStartRecording).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Storage settings selector projection
// ---------------------------------------------------------------------------

describe('Storage settings selector projection', () => {
  it('reflects updated values after update()', () => {
    const service = freshService();

    const result = service.update({
      storage: { maxHistoryHours: 48, enableAutoSave: false, enableHistoryStorage: false },
    });

    expect(result.ok).toBe(true);

    const storage = service.getStorageSettings();
    expect(storage.maxHistoryHours).toBe(48);
    expect(storage.enableAutoSave).toBe(false);
    expect(storage.enableHistoryStorage).toBe(false);
  });

  it('does not alter storage when update only targets recording', () => {
    const service = freshService();

    service.update({ recording: { autoStartRecording: false } });

    const storage = service.getStorageSettings();
    // Should remain at defaults
    expect(storage.maxHistoryHours).toBe(24);
    expect(storage.enableAutoSave).toBe(true);
    expect(storage.enableHistoryStorage).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Recording settings selector
// ---------------------------------------------------------------------------

describe('Recording settings selector', () => {
  it('returns correct projection after update', () => {
    const service = freshService();

    service.update({
      recording: {
        autoStartRecording: false,
        csvDefaultOutputPath: '/tmp/records',
        csvSaveIntervalMinutes: 10,
      },
    });

    const recording = service.getRecordingSettings();
    expect(recording.autoStartRecording).toBe(false);
    expect(recording.csvDefaultOutputPath).toBe('/tmp/records');
    expect(recording.csvSaveIntervalMinutes).toBe(10);
  });

  it('selectAutoStartRecording reflects changes', () => {
    const service = freshService();
    expect(service.isAutoStartRecordingEnabled()).toBe(true);

    service.update({ recording: { autoStartRecording: false } });
    expect(service.isAutoStartRecordingEnabled()).toBe(false);
  });

  it('selectCsvExportPreference reflects changes', () => {
    const service = freshService();

    service.update({
      recording: {
        csvDefaultOutputPath: '/data/csv',
        csvSaveIntervalMinutes: 15,
      },
    });

    const pref = service.getCsvExportPreference();
    expect(pref.defaultOutputPath).toBe('/data/csv');
    expect(pref.saveIntervalMinutes).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 4. Multiple downstream reads consistent
// ---------------------------------------------------------------------------

describe('Multiple downstream reads consistent after single update', () => {
  it('all selectors see the same underlying change', () => {
    const service = freshService();

    service.update({
      recording: { autoStartRecording: false, csvSaveIntervalMinutes: 30 },
      storage: { maxHistoryHours: 72, enableAutoSave: false },
      general: { updateInterval: 500 },
    });

    const snapshot = service.getSnapshot();
    const recording = service.getRecordingSettings();
    const storage = service.getStorageSettings();
    const general = service.getGeneralSettings();

    // All reflect the same update consistently
    expect(recording.autoStartRecording).toBe(false);
    expect(snapshot.recording.autoStartRecording).toBe(false);

    expect(recording.csvSaveIntervalMinutes).toBe(30);
    expect(snapshot.recording.csvSaveIntervalMinutes).toBe(30);

    expect(storage.maxHistoryHours).toBe(72);
    expect(snapshot.storage.maxHistoryHours).toBe(72);

    expect(storage.enableAutoSave).toBe(false);
    expect(snapshot.storage.enableAutoSave).toBe(false);

    expect(general.updateInterval).toBe(500);
    expect(snapshot.general.updateInterval).toBe(500);

    // Scalar selectors too
    expect(service.getUpdateInterval()).toBe(500);
    expect(service.getMaxHistoryHours()).toBe(72);
    expect(service.isAutoSaveEnabled()).toBe(false);
    expect(service.isAutoStartRecordingEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Reset scope isolation
// ---------------------------------------------------------------------------

describe('Reset scope isolation', () => {
  it('resetting storage scope leaves recording unchanged', () => {
    const service = freshService();

    // Modify both
    service.update({
      recording: { autoStartRecording: false, csvSaveIntervalMinutes: 99 },
      storage: { maxHistoryHours: 100, enableAutoSave: false },
    });

    // Reset only storage
    const result = service.reset('storage');
    expect(result.ok).toBe(true);

    // Storage is back to defaults
    expect(service.getStorageSettings().maxHistoryHours).toBe(24);
    expect(service.getStorageSettings().enableAutoSave).toBe(true);

    // Recording is untouched
    expect(service.getRecordingSettings().autoStartRecording).toBe(false);
    expect(service.getRecordingSettings().csvSaveIntervalMinutes).toBe(99);
  });

  it('resetting recording scope leaves storage unchanged', () => {
    const service = freshService();

    service.update({
      recording: { autoStartRecording: false },
      storage: { maxHistoryHours: 50 },
    });

    service.reset('recording');

    expect(service.getRecordingSettings().autoStartRecording).toBe(true);
    expect(service.getStorageSettings().maxHistoryHours).toBe(50);
  });

  it('resetting general scope leaves recording and storage unchanged', () => {
    const service = freshService();

    service.update({
      general: { updateInterval: 200 },
      recording: { autoStartRecording: false },
      storage: { maxHistoryHours: 48 },
    });

    service.reset('general');

    expect(service.getUpdateInterval()).toBe(1000);
    expect(service.isAutoStartRecordingEnabled()).toBe(false);
    expect(service.getMaxHistoryHours()).toBe(48);
  });

  it('resetting all scope resets everything', () => {
    const service = freshService();

    service.update({
      general: { updateInterval: 200 },
      recording: { autoStartRecording: false },
      storage: { maxHistoryHours: 48 },
    });

    service.reset('all');

    const defaults = createDefaultSettingsSnapshot();
    expect(service.getUpdateInterval()).toBe(defaults.general.updateInterval);
    expect(service.isAutoStartRecordingEnabled()).toBe(defaults.recording.autoStartRecording);
    expect(service.getMaxHistoryHours()).toBe(defaults.storage.maxHistoryHours);
  });

  it('reset() with no argument defaults to all', () => {
    const service = freshService();

    service.update({ general: { updateInterval: 500 } });
    service.reset();

    expect(service.getUpdateInterval()).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// 6. Replace replaces everything
// ---------------------------------------------------------------------------

describe('Replace replaces everything', () => {
  it('replace with full new config — all selectors reflect new values', () => {
    const service = freshService();

    const newConfig: SettingsSnapshot = {
      schemaVersion: 1,
      recording: {
        autoStartRecording: false,
        csvDefaultOutputPath: '/custom/path',
        csvSaveIntervalMinutes: 20,
      },
      storage: {
        maxHistoryHours: 96,
        enableAutoSave: false,
        enableHistoryStorage: false,
      },
      general: {
        updateInterval: 250,
      },
    };

    const result = service.replace(newConfig);
    expect(result.ok).toBe(true);

    expect(service.getRecordingSettings().autoStartRecording).toBe(false);
    expect(service.getCsvExportPreference().defaultOutputPath).toBe('/custom/path');
    expect(service.getCsvExportPreference().saveIntervalMinutes).toBe(20);

    expect(service.getStorageSettings().maxHistoryHours).toBe(96);
    expect(service.getStorageSettings().enableAutoSave).toBe(false);
    expect(service.getStorageSettings().enableHistoryStorage).toBe(false);

    expect(service.getGeneralSettings().updateInterval).toBe(250);
    expect(service.getUpdateInterval()).toBe(250);
  });

  it('replace discards previous state entirely', () => {
    const service = freshService();

    // First update some values
    service.update({
      recording: { autoStartRecording: false },
      storage: { maxHistoryHours: 200 },
    });

    // Replace with a config that has different values
    service.replace({
      schemaVersion: 1,
      recording: {
        autoStartRecording: true,
        csvDefaultOutputPath: '/new',
        csvSaveIntervalMinutes: 1,
      },
      storage: {
        maxHistoryHours: 1,
        enableAutoSave: true,
        enableHistoryStorage: true,
      },
      general: { updateInterval: 2000 },
    });

    // The previous updates are gone
    expect(service.getMaxHistoryHours()).toBe(1);
    expect(service.getRecordingSettings().csvDefaultOutputPath).toBe('/new');
  });

  it('replace with null input falls back to defaults (graceful degradation)', () => {
    const service = freshService();

    // normalizeSettingsInput treats null as "use defaults" with no issues — graceful fallback.
    const result = service.replace(null);
    expect(result.ok).toBe(true);
    // Should fall back to defaults
    expect(service.getUpdateInterval()).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Bonus: Selector functions work directly on snapshot objects
// ---------------------------------------------------------------------------

describe('Selector functions work directly on snapshots', () => {
  it('selectStorageSettings extracts correct section', () => {
    const defaults = createDefaultSettingsSnapshot();
    const storage = selectStorageSettings(defaults);
    expect(storage.maxHistoryHours).toBe(24);
    expect(storage.enableAutoSave).toBe(true);
    expect(storage.enableHistoryStorage).toBe(true);
  });

  it('selectRecordingSettings extracts correct section', () => {
    const defaults = createDefaultSettingsSnapshot();
    const recording = selectRecordingSettings(defaults);
    expect(recording.autoStartRecording).toBe(true);
    expect(recording.csvDefaultOutputPath).toBe('');
    expect(recording.csvSaveIntervalMinutes).toBe(5);
  });

  it('selectGeneralSettings extracts correct section', () => {
    const defaults = createDefaultSettingsSnapshot();
    const general = selectGeneralSettings(defaults);
    expect(general.updateInterval).toBe(1000);
  });

  it('selectSettingsSnapshot returns a clone', () => {
    const defaults = createDefaultSettingsSnapshot();
    const cloned = selectSettingsSnapshot(defaults);
    expect(cloned).toEqual(defaults);
    expect(cloned).not.toBe(defaults);
  });

  it('scalar selectors return correct values', () => {
    const defaults = createDefaultSettingsSnapshot();
    expect(selectAutoStartRecording(defaults)).toBe(true);
    expect(selectUpdateInterval(defaults)).toBe(1000);
    expect(selectMaxHistoryHours(defaults)).toBe(24);
    expect(isAutoSaveEnabled(defaults)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Utility type for mutation assertions
// ---------------------------------------------------------------------------

type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends object ? Mutable<T[P]> : T[P];
};
