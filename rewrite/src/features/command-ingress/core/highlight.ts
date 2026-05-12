export type HighlightSeverity = 'info' | 'warning' | 'error';

export interface HighlightRule {
  readonly id: string;
  readonly match: (value: unknown) => boolean;
  readonly severity: HighlightSeverity;
}

export interface Highlight {
  readonly ruleId: string;
  readonly severity: HighlightSeverity;
  readonly matched: true;
}

export function calculateHighlights(
  data: Record<string, unknown>,
  rules: readonly HighlightRule[],
): Highlight[] {
  const results: Highlight[] = [];

  for (const rule of rules) {
    for (const value of Object.values(data)) {
      if (rule.match(value)) {
        results.push({ ruleId: rule.id, severity: rule.severity, matched: true });
        break;
      }
    }
  }

  return results;
}
