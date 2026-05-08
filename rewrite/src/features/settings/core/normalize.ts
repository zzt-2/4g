import { cloneSettingsSnapshot } from './clone';
import { DEFAULT_SETTINGS } from './defaults';
import {
  SETTINGS_SCHEMA_VERSION,
  type SettingsGeneralConfig,
  type SettingsNormalizationResult,
  type SettingsRecordingConfig,
  type SettingsSnapshot,
  type SettingsStorageConfig,
  type SettingsValidationIssue,
} from './types';
import { createSettingsIssue, toSettingsValidationResult } from './validation';

type UnknownRecord = Record<string, unknown>;

const LEGACY_TOP_LEVEL_KEYS = new Set([
  'settings.autoStartRecording',
  'settings.csvDefaultOutputPath',
  'settings.csvSaveInterval',
  'maxHistoryHours',
  'enableAutoSave',
  'enableHistoryStorage',
  'updateInterval',
]);

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'recording',
  'storage',
  'general',
  'autoStartRecording',
  'csvDefaultOutputPath',
  'csvSaveIntervalMinutes',
  'csvSaveInterval',
  'maxHistoryHours',
  'enableAutoSave',
  'enableHistoryStorage',
  'updateInterval',
  ...LEGACY_TOP_LEVEL_KEYS,
]);

const RECORDING_KEYS = new Set([
  'autoStartRecording',
  'csvDefaultOutputPath',
  'csvSaveIntervalMinutes',
  'csvSaveInterval',
]);

const STORAGE_KEYS = new Set([
  'maxHistoryHours',
  'enableAutoSave',
  'enableHistoryStorage',
]);

const GENERAL_KEYS = new Set([
  'updateInterval',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function warnUnknownFields(
  value: UnknownRecord,
  knownKeys: ReadonlySet<string>,
  path: string,
  issues: SettingsValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!knownKeys.has(key)) {
      issues.push(
        createSettingsIssue(
          'settings.unknownFieldIgnored',
          path ? `${path}.${key}` : key,
          `Unknown settings field ignored: ${key}.`,
        ),
      );
    }
  }
}

function booleanValue(
  value: unknown,
  fallback: boolean,
  path: string,
  issues: SettingsValidationIssue[],
): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  issues.push(
    createSettingsIssue(
      `settings.${path}.invalidBoolean`,
      path,
      `Invalid boolean at ${path} defaulted.`,
    ),
  );
  return fallback;
}

function stringValue(
  value: unknown,
  fallback: string,
  path: string,
  issues: SettingsValidationIssue[],
): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value;
  }

  issues.push(
    createSettingsIssue(
      `settings.${path}.invalidString`,
      path,
      `Invalid string at ${path} defaulted.`,
    ),
  );
  return fallback;
}

function positiveNumberValue(
  value: unknown,
  fallback: number,
  path: string,
  issues: SettingsValidationIssue[],
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  issues.push(
    createSettingsIssue(
      `settings.${path}.invalidPositiveNumber`,
      path,
      `Invalid positive number at ${path} defaulted.`,
    ),
  );
  return fallback;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

function normalizeRecording(
  source: UnknownRecord,
  fallback: SettingsRecordingConfig,
  issues: SettingsValidationIssue[],
): SettingsRecordingConfig {
  const recording = isRecord(source.recording) ? source.recording : {};
  if (source.recording !== undefined && !isRecord(source.recording)) {
    issues.push(
      createSettingsIssue(
        'settings.recordingInvalid',
        'recording',
        'Invalid recording settings section defaulted.',
      ),
    );
  }

  warnUnknownFields(recording, RECORDING_KEYS, 'recording', issues);

  return {
    autoStartRecording: booleanValue(
      firstDefined(
        recording.autoStartRecording,
        source.autoStartRecording,
        source['settings.autoStartRecording'],
      ),
      fallback.autoStartRecording,
      'recording.autoStartRecording',
      issues,
    ),
    csvDefaultOutputPath: stringValue(
      firstDefined(
        recording.csvDefaultOutputPath,
        source.csvDefaultOutputPath,
        source['settings.csvDefaultOutputPath'],
      ),
      fallback.csvDefaultOutputPath,
      'recording.csvDefaultOutputPath',
      issues,
    ),
    csvSaveIntervalMinutes: positiveNumberValue(
      firstDefined(
        recording.csvSaveIntervalMinutes,
        recording.csvSaveInterval,
        source.csvSaveIntervalMinutes,
        source.csvSaveInterval,
        source['settings.csvSaveInterval'],
      ),
      fallback.csvSaveIntervalMinutes,
      'recording.csvSaveIntervalMinutes',
      issues,
    ),
  };
}

function normalizeStorage(
  source: UnknownRecord,
  fallback: SettingsStorageConfig,
  issues: SettingsValidationIssue[],
): SettingsStorageConfig {
  const storage = isRecord(source.storage) ? source.storage : {};
  if (source.storage !== undefined && !isRecord(source.storage)) {
    issues.push(
      createSettingsIssue(
        'settings.storageInvalid',
        'storage',
        'Invalid storage settings section defaulted.',
      ),
    );
  }

  warnUnknownFields(storage, STORAGE_KEYS, 'storage', issues);

  return {
    maxHistoryHours: positiveNumberValue(
      firstDefined(
        storage.maxHistoryHours,
        source.maxHistoryHours,
      ),
      fallback.maxHistoryHours,
      'storage.maxHistoryHours',
      issues,
    ),
    enableAutoSave: booleanValue(
      firstDefined(
        storage.enableAutoSave,
        source.enableAutoSave,
      ),
      fallback.enableAutoSave,
      'storage.enableAutoSave',
      issues,
    ),
    enableHistoryStorage: booleanValue(
      firstDefined(
        storage.enableHistoryStorage,
        source.enableHistoryStorage,
      ),
      fallback.enableHistoryStorage,
      'storage.enableHistoryStorage',
      issues,
    ),
  };
}

function normalizeGeneral(
  source: UnknownRecord,
  fallback: SettingsGeneralConfig,
  issues: SettingsValidationIssue[],
): SettingsGeneralConfig {
  const general = isRecord(source.general) ? source.general : {};
  if (source.general !== undefined && !isRecord(source.general)) {
    issues.push(
      createSettingsIssue(
        'settings.generalInvalid',
        'general',
        'Invalid general settings section defaulted.',
      ),
    );
  }

  warnUnknownFields(general, GENERAL_KEYS, 'general', issues);

  return {
    updateInterval: positiveNumberValue(
      firstDefined(
        general.updateInterval,
        source.updateInterval,
      ),
      fallback.updateInterval,
      'general.updateInterval',
      issues,
    ),
  };
}

export function normalizeSettingsInput(
  value: unknown,
  fallback: SettingsSnapshot = DEFAULT_SETTINGS,
): SettingsNormalizationResult {
  const issues: SettingsValidationIssue[] = [];
  const base = cloneSettingsSnapshot(fallback);

  if (value === undefined || value === null) {
    return {
      ...toSettingsValidationResult(issues),
      snapshot: base,
    };
  }

  if (!isRecord(value)) {
    issues.push(
      createSettingsIssue('settings.inputInvalid', 'settings', 'Settings input defaulted.'),
    );
    return {
      ...toSettingsValidationResult(issues),
      snapshot: base,
    };
  }

  warnUnknownFields(value, TOP_LEVEL_KEYS, '', issues);

  const snapshot: SettingsSnapshot = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    recording: normalizeRecording(value, base.recording, issues),
    storage: normalizeStorage(value, base.storage, issues),
    general: normalizeGeneral(value, base.general, issues),
  };

  return {
    ...toSettingsValidationResult(issues),
    snapshot,
  };
}

export function applySettingsPatch(
  current: SettingsSnapshot,
  patch: unknown,
): SettingsNormalizationResult {
  if (!isRecord(patch)) {
    return normalizeSettingsInput(current);
  }

  const nextInput: UnknownRecord = {
    ...cloneSettingsSnapshot(current),
    ...patch,
    recording: {
      ...current.recording,
      ...(isRecord(patch.recording) ? patch.recording : {}),
    },
    storage: {
      ...current.storage,
      ...(isRecord(patch.storage) ? patch.storage : {}),
    },
    general: {
      ...current.general,
      ...(isRecord(patch.general) ? patch.general : {}),
    },
  };

  return normalizeSettingsInput(nextInput, current);
}
