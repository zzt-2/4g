import { describe, it, expect } from 'vitest';
import { calculateHighlights } from '../core/highlight';
import type { HighlightRuleConfig } from '../core/highlight';

describe('calculateHighlights with HighlightRuleConfig', () => {
  const rules: HighlightRuleConfig[] = [
    { id: 'header-match', offset: 0, length: 2, pattern: 'BBAA', severity: 'info' },
    { id: 'any-range', offset: 4, length: 3, severity: 'warning' },
    { id: 'out-of-bounds', offset: 100, length: 2, severity: 'error' },
  ];

  it('matches pattern at offset', () => {
    const data = new Uint8Array([0xBB, 0xAA, 0x00, 0x00, 0x01, 0x02, 0x03]);
    const result = calculateHighlights(data, rules);
    expect(result).toHaveLength(2);
    expect(result.map((h) => h.ruleId)).toContain('header-match');
    expect(result.map((h) => h.ruleId)).toContain('any-range');
  });

  it('skips rule when pattern does not match', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03]);
    const result = calculateHighlights(data, rules);
    expect(result).toHaveLength(1);
    expect(result[0]?.ruleId).toBe('any-range');
  });

  it('skips out-of-bounds rules', () => {
    const data = new Uint8Array([0xBB, 0xAA, 0x00, 0x00, 0x01, 0x02, 0x03]);
    const result = calculateHighlights(data, rules);
    const oob = result.find((h) => h.ruleId === 'out-of-bounds');
    expect(oob).toBeUndefined();
  });

  it('returns empty for empty rules', () => {
    const data = new Uint8Array([0x01, 0x02]);
    expect(calculateHighlights(data, [])).toHaveLength(0);
  });
});
