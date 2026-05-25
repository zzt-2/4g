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

  const charts = snapshot.preferences.charts;
  if (!Array.isArray(charts) || charts.length === 0) {
    issues.push(
      createDisplayIssue(
        'display.chart.emptyOrMissing',
        'preferences.charts',
        'Charts array is missing or empty.',
        'error',
      ),
    );
  } else {
    if (charts.length > 4) {
      issues.push(
        createDisplayIssue(
          'display.chart.countExceeded',
          'preferences.charts',
          `Chart count ${charts.length} exceeds maximum 4.`,
        ),
      );
    }

    const seenIds = new Set<string>();
    charts.forEach((chart, i) => {
      const path = `preferences.charts[${i}] (id=${chart.id})`;
      if (seenIds.has(chart.id)) {
        issues.push(createDisplayIssue('display.chart.duplicateId', path, `Duplicate chart id "${chart.id}".`, 'error'));
      }
      seenIds.add(chart.id);

      if (chart.performance.maxPoints <= 0) {
        issues.push(
          createDisplayIssue(
            'display.chart.maxPointsInvalid',
            `${path}.performance.maxPoints`,
            'Chart max points must be positive.',
          ),
        );
      }
    });
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
