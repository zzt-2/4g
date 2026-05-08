import {
  SETTINGS_SCHEMA_VERSION,
  type SettingsSnapshot,
  type SettingsValidationIssue,
  type SettingsValidationResult,
} from './types';

function issue(
  code: string,
  path: string,
  message: string,
  severity: SettingsValidationIssue['severity'] = 'error',
): SettingsValidationIssue {
  return { code, path, message, severity };
}

export function createSettingsIssue(
  code: string,
  path: string,
  message: string,
  severity: SettingsValidationIssue['severity'] = 'warning',
): SettingsValidationIssue {
  return issue(code, path, message, severity);
}

export function toSettingsValidationResult(
  issues: readonly SettingsValidationIssue[],
): SettingsValidationResult {
  return {
    valid: issues.every((item) => item.severity !== 'error'),
    issues,
  };
}

export function validateSettingsSnapshot(snapshot: SettingsSnapshot): SettingsValidationResult {
  const issues: SettingsValidationIssue[] = [];

  if (snapshot.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    issues.push(
      issue('settings.schemaVersionUnsupported', 'schemaVersion', 'Unsupported settings version.'),
    );
  }

  // Recording
  if (typeof snapshot.recording.autoStartRecording !== 'boolean') {
    issues.push(
      issue(
        'settings.recording.autoStartRecordingInvalid',
        'recording.autoStartRecording',
        'Auto-start recording must be a boolean.',
      ),
    );
  }

  if (typeof snapshot.recording.csvDefaultOutputPath !== 'string') {
    issues.push(
      issue(
        'settings.recording.csvDefaultOutputPathInvalid',
        'recording.csvDefaultOutputPath',
        'CSV default output path must be a string preference.',
      ),
    );
  }

  if (
    typeof snapshot.recording.csvSaveIntervalMinutes !== 'number' ||
    !Number.isFinite(snapshot.recording.csvSaveIntervalMinutes) ||
    snapshot.recording.csvSaveIntervalMinutes <= 0
  ) {
    issues.push(
      issue(
        'settings.recording.csvSaveIntervalMinutesInvalid',
        'recording.csvSaveIntervalMinutes',
        'CSV save interval must be a positive finite minute value.',
      ),
    );
  }

  // Storage
  if (
    typeof snapshot.storage.maxHistoryHours !== 'number' ||
    !Number.isFinite(snapshot.storage.maxHistoryHours) ||
    snapshot.storage.maxHistoryHours <= 0
  ) {
    issues.push(
      issue(
        'settings.storage.maxHistoryHoursInvalid',
        'storage.maxHistoryHours',
        'Max history hours must be a positive finite number.',
      ),
    );
  }

  if (typeof snapshot.storage.enableAutoSave !== 'boolean') {
    issues.push(
      issue(
        'settings.storage.enableAutoSaveInvalid',
        'storage.enableAutoSave',
        'Enable auto-save must be a boolean.',
      ),
    );
  }

  if (typeof snapshot.storage.enableHistoryStorage !== 'boolean') {
    issues.push(
      issue(
        'settings.storage.enableHistoryStorageInvalid',
        'storage.enableHistoryStorage',
        'Enable history storage must be a boolean.',
      ),
    );
  }

  // General
  if (
    typeof snapshot.general.updateInterval !== 'number' ||
    !Number.isFinite(snapshot.general.updateInterval) ||
    snapshot.general.updateInterval <= 0
  ) {
    issues.push(
      issue(
        'settings.general.updateIntervalInvalid',
        'general.updateInterval',
        'Update interval must be a positive finite millisecond value.',
      ),
    );
  }

  return toSettingsValidationResult(issues);
}
