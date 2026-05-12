import { describe, it, expect } from 'vitest';
import { calculateHighlights } from '../core/highlight';
import type { HighlightRule } from '../core/highlight';

describe('calculateHighlights', () => {
  const rules: HighlightRule[] = [
    {
      id: 'high-error-count',
      match: (v) => typeof v === 'number' && v > 10,
      severity: 'error',
    },
    {
      id: 'stale-runtime',
      match: (v) => typeof v === 'number' && v > 3600,
      severity: 'warning',
    },
    {
      id: 'has-satellite',
      match: (v) => typeof v === 'string' && v.length > 0,
      severity: 'info',
    },
  ];

  it('returns empty array when no rules match', () => {
    const result = calculateHighlights({ count: 1, elapsed: 5 }, rules);
    expect(result).toHaveLength(0);
  });

  it('matches single rule', () => {
    const result = calculateHighlights({ errorCount: 15 }, rules);
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('high-error-count');
    expect(result[0].severity).toBe('error');
  });

  it('matches multiple rules', () => {
    const result = calculateHighlights(
      { errorCount: 20, runtimeSeconds: 5000, satelliteId: 'SAT-01' },
      rules,
    );
    expect(result).toHaveLength(3);
    expect(result.map((h) => h.ruleId)).toEqual([
      'high-error-count',
      'stale-runtime',
      'has-satellite',
    ]);
  });

  it('each rule matches at most once even if multiple values match', () => {
    const result = calculateHighlights(
      { a: 20, b: 30, c: 40 },
      rules,
    );
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('high-error-count');
  });

  it('returns empty for empty data', () => {
    const result = calculateHighlights({}, rules);
    expect(result).toHaveLength(0);
  });

  it('returns empty for empty rules', () => {
    const result = calculateHighlights({ errorCount: 99 }, []);
    expect(result).toHaveLength(0);
  });
});
