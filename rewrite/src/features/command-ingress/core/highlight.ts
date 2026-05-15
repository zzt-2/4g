export type HighlightSeverity = 'info' | 'warning' | 'error';

/**
 * Data-driven highlight rule — fully serializable (no functions).
 */
export interface HighlightRuleConfig {
  readonly id: string;
  readonly offset: number;
  readonly length: number;
  readonly pattern?: string;
  readonly severity: HighlightSeverity;
}

/**
 * @deprecated Use HighlightRuleConfig instead. The `match` function prevents serialization.
 */
export interface HighlightRule {
  readonly id: string;
  match: (value: unknown) => boolean;
  readonly severity: HighlightSeverity;
}

export interface Highlight {
  readonly ruleId: string;
  readonly severity: HighlightSeverity;
  readonly matched: true;
}

export function calculateHighlights(
  data: Uint8Array,
  rules: readonly HighlightRuleConfig[],
): Highlight[];

/** @deprecated Use the Uint8Array + HighlightRuleConfig overload */
export function calculateHighlights(
  data: Record<string, unknown>,
  rules: readonly HighlightRule[],
): Highlight[];

export function calculateHighlights(
  data: Uint8Array | Record<string, unknown>,
  rules: readonly (HighlightRuleConfig | HighlightRule)[],
): Highlight[] {
  const results: Highlight[] = [];

  if (data instanceof Uint8Array) {
    for (const rule of rules) {
      if (!('offset' in rule)) continue;
      const cfg = rule as HighlightRuleConfig;
      if (cfg.offset + cfg.length > data.length) continue;

      if (!cfg.pattern) {
        results.push({ ruleId: cfg.id, severity: cfg.severity, matched: true });
        continue;
      }

      const patternBytes = hexToBytes(cfg.pattern);
      let match = true;
      for (let i = 0; i < patternBytes.length && i < cfg.length; i++) {
        if (data[cfg.offset + i] !== patternBytes[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        results.push({ ruleId: cfg.id, severity: cfg.severity, matched: true });
      }
    }
  } else {
    for (const rule of rules) {
      if (!('match' in rule)) continue;
      const legacy = rule as HighlightRule;
      for (const value of Object.values(data)) {
        if (legacy.match(value)) {
          results.push({ ruleId: legacy.id, severity: legacy.severity, matched: true });
          break;
        }
      }
    }
  }

  return results;
}

import { hexToBytes } from './utils';
