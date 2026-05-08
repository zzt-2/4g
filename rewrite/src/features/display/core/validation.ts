import { DISPLAY_SCHEMA_VERSION, type DisplaySnapshot, type DisplayValidationIssue, type DisplayValidationResult } from './types';

export function createDisplayIssue(
  code: string,
  path: string,
  message: string,
  severity: DisplayValidationIssue['severity'] = 'warning',
): DisplayValidationIssue {
  return { severity, code, path, message };
}

export function toDisplayValidationResult(
  issues: readonly DisplayValidationIssue[],
): DisplayValidationResult {
  return {
    valid: issues.every((item) => item.severity !== 'error'),
    issues,
  };
}

export function validateDisplaySnapshot(snapshot: DisplaySnapshot): DisplayValidationResult {
  const issues: DisplayValidationIssue[] = [];

  if (snapshot.schemaVersion !== DISPLAY_SCHEMA_VERSION) {
    issues.push(
      createDisplayIssue(
        'display.schemaVersionUnsupported',
        'schemaVersion',
        'Unsupported display schema version.',
        'error',
      ),
    );
  }

  if (snapshot.preferences.refreshCadenceMs <= 0) {
    issues.push(
      createDisplayIssue(
        'display.refreshCadenceInvalid',
        'preferences.refreshCadenceMs',
        'Refresh cadence must be positive.',
      ),
    );
  }

  if (snapshot.preferences.chart.performance.maxPoints <= 0) {
    issues.push(
      createDisplayIssue(
        'display.chart.maxPointsInvalid',
        'preferences.chart.performance.maxPoints',
        'Chart max points must be positive.',
      ),
    );
  }

  if (snapshot.preferences.scatter.sampleCount <= 0) {
    issues.push(
      createDisplayIssue(
        'display.scatter.sampleCountInvalid',
        'preferences.scatter.sampleCount',
        'Scatter sample count must be positive.',
      ),
    );
  }

  return toDisplayValidationResult(issues);
}
