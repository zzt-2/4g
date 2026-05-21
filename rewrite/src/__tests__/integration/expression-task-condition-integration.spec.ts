/**
 * T011: Expression engine -> task condition integration
 *
 * End-to-end tests for condition matching with the condition system:
 * - evaluateConditionGroup / evaluateSingleCondition (pure functions)
 * - ConditionRegistry (stateful service: register, processInput, unregister)
 * - compareValues (shared comparison operator)
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluateConditionGroup, evaluateSingleCondition } from '@/features/task/core/condition-matcher';
import { ConditionRegistry } from '@/features/task/services/condition-registry';
import { compareValues } from '@/shared/condition-operators';
import type { ConditionTerm } from '@/features/task/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand to build a ConditionTerm with sensible defaults. */
function term(
  overrides: Partial<ConditionTerm> & Pick<ConditionTerm, 'frameId' | 'fieldId' | 'operator' | 'threshold'>,
): ConditionTerm {
  return overrides;
}

// ---------------------------------------------------------------------------
// 1. evaluateConditionGroup AND combination
// ---------------------------------------------------------------------------

describe('evaluateConditionGroup AND combination', () => {
  it('returns true when both conditions match', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 }),
      term({ frameId: 'f1', fieldId: 'temp', operator: 'lt', threshold: 100, logicOperator: 'and' }),
    ];
    const fields = { temp: 75 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(true);
  });

  it('returns false (short-circuit) when first is true but second is false', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 1 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 2, logicOperator: 'and' }),
    ];
    const fields = { a: 1, b: 99 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(false);
  });

  it('returns false when first condition is false (short-circuit)', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'x', operator: 'gt', threshold: 100 }),
      term({ frameId: 'f1', fieldId: 'y', operator: 'gt', threshold: 0, logicOperator: 'and' }),
    ];
    const fields = { x: 10, y: 50 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. evaluateConditionGroup OR combination
// ---------------------------------------------------------------------------

describe('evaluateConditionGroup OR combination', () => {
  it('returns true when first is true (short-circuit)', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 1 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 99, logicOperator: 'or' }),
    ];
    const fields = { a: 1, b: 2 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(true);
  });

  it('returns true when first is false but second is true', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 0 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 2, logicOperator: 'or' }),
    ];
    const fields = { a: 1, b: 2 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(true);
  });

  it('returns false when both conditions are false', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 0 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 0, logicOperator: 'or' }),
    ];
    const fields = { a: 1, b: 2 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Mixed AND/OR: first AND second OR third
// ---------------------------------------------------------------------------

describe('evaluateConditionGroup mixed AND/OR', () => {
  // (A AND B) OR C — encoded as: [A, B(and), C(or)]
  // This evaluates left-to-right: result = A; result = A && B; result = (A&&B) || C
  it('returns true when A and B are both true', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 1 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 2, logicOperator: 'and' }),
      term({ frameId: 'f1', fieldId: 'c', operator: 'eq', threshold: 99, logicOperator: 'or' }),
    ];
    const fields = { a: 1, b: 2, c: 0 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(true);
  });

  it('returns false when A&&B short-circuits before OR can rescue (left-assoc)', () => {
    // Left-to-right evaluation: result = A; result = A && B (false → break).
    // The OR on C never gets evaluated because AND already short-circuited.
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 1 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 99, logicOperator: 'and' }),
      term({ frameId: 'f1', fieldId: 'c', operator: 'eq', threshold: 3, logicOperator: 'or' }),
    ];
    const fields = { a: 1, b: 0, c: 3 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(false);
  });

  it('returns false when all three are false', () => {
    const conditions: ConditionTerm[] = [
      term({ frameId: 'f1', fieldId: 'a', operator: 'eq', threshold: 0 }),
      term({ frameId: 'f1', fieldId: 'b', operator: 'eq', threshold: 0, logicOperator: 'and' }),
      term({ frameId: 'f1', fieldId: 'c', operator: 'eq', threshold: 0, logicOperator: 'or' }),
    ];
    const fields = { a: 1, b: 2, c: 3 };
    expect(evaluateConditionGroup(conditions, fields)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. ConditionRegistry processInput triggers onSatisfied
// ---------------------------------------------------------------------------

describe('ConditionRegistry processInput', () => {
  it('fires onSatisfied when input matches registered condition', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied,
    );

    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60 },
    });

    expect(onSatisfied).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onSatisfied when input does not match', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied,
    );

    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 30 },
    });

    expect(onSatisfied).not.toHaveBeenCalled();
  });

  it('does NOT fire for wrong frameId', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied,
    );

    registry.processInput({
      frameId: 'f2',
      fieldValues: { temp: 60 },
    });

    expect(onSatisfied).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. ConditionRegistry sourceId filter
// ---------------------------------------------------------------------------

describe('ConditionRegistry sourceId filter', () => {
  it('does NOT match when sourceId differs', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50, sourceId: 'src-A' })],
      onSatisfied,
    );

    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60 },
      sourceId: 'src-B',
    });

    expect(onSatisfied).not.toHaveBeenCalled();
  });

  it('matches when sourceId matches', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50, sourceId: 'src-A' })],
      onSatisfied,
    );

    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60 },
      sourceId: 'src-A',
    });

    expect(onSatisfied).toHaveBeenCalledTimes(1);
  });

  it('matches when condition has no sourceId (wildcard) regardless of input sourceId', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied,
    );

    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60 },
      sourceId: 'any-source',
    });

    expect(onSatisfied).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Multiple condition groups for same frameId
// ---------------------------------------------------------------------------

describe('ConditionRegistry multiple groups same frameId', () => {
  it('evaluates all registered groups for the matching frameId', () => {
    const registry = new ConditionRegistry();
    const onSatisfied1 = vi.fn();
    const onSatisfied2 = vi.fn();

    // Group 1: temp > 50
    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied1,
    );

    // Group 2: pressure > 100
    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'pressure', operator: 'gt', threshold: 100 })],
      onSatisfied2,
    );

    // Input satisfies both groups
    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60, pressure: 120 },
    });

    expect(onSatisfied1).toHaveBeenCalledTimes(1);
    expect(onSatisfied2).toHaveBeenCalledTimes(1);
  });

  it('evaluates independently — one matches, the other does not', () => {
    const registry = new ConditionRegistry();
    const onSatisfied1 = vi.fn();
    const onSatisfied2 = vi.fn();

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied1,
    );

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'pressure', operator: 'gt', threshold: 100 })],
      onSatisfied2,
    );

    // Only temp matches, pressure does not
    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60, pressure: 50 },
    });

    expect(onSatisfied1).toHaveBeenCalledTimes(1);
    expect(onSatisfied2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. unregisterGroup stops matching
// ---------------------------------------------------------------------------

describe('ConditionRegistry unregisterGroup', () => {
  it('stops matching after unregister', () => {
    const registry = new ConditionRegistry();
    const onSatisfied = vi.fn();

    const group = registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied,
    );

    // Verify it matches before unregister
    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60 },
    });
    expect(onSatisfied).toHaveBeenCalledTimes(1);

    // Unregister
    registry.unregisterGroup(group);

    // Verify it no longer matches after unregister
    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60 },
    });
    expect(onSatisfied).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('does not affect other groups after unregister', () => {
    const registry = new ConditionRegistry();
    const onSatisfied1 = vi.fn();
    const onSatisfied2 = vi.fn();

    const group1 = registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'temp', operator: 'gt', threshold: 50 })],
      onSatisfied1,
    );

    registry.registerGroup(
      [term({ frameId: 'f1', fieldId: 'pressure', operator: 'gt', threshold: 100 })],
      onSatisfied2,
    );

    registry.unregisterGroup(group1);

    // group2 should still work
    registry.processInput({
      frameId: 'f1',
      fieldValues: { temp: 60, pressure: 120 },
    });

    expect(onSatisfied1).not.toHaveBeenCalled();
    expect(onSatisfied2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Bonus: evaluateSingleCondition edge cases
// ---------------------------------------------------------------------------

describe('evaluateSingleCondition', () => {
  it('returns false when field is null', () => {
    const condition = term({ frameId: 'f1', fieldId: 'x', operator: 'gt', threshold: 0 });
    expect(evaluateSingleCondition(condition, { x: null })).toBe(false);
  });

  it('returns false when field is missing from fieldValues', () => {
    const condition = term({ frameId: 'f1', fieldId: 'missing', operator: 'eq', threshold: 1 });
    expect(evaluateSingleCondition(condition, {})).toBe(false);
  });

  it('delegates to compareValues for numeric comparison', () => {
    const condition = term({ frameId: 'f1', fieldId: 'v', operator: 'gte', threshold: 10 });
    expect(evaluateSingleCondition(condition, { v: 10 })).toBe(true);
    expect(evaluateSingleCondition(condition, { v: 9 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bonus: compareValues operators
// ---------------------------------------------------------------------------

describe('compareValues (shared operator)', () => {
  it('handles "any" operator — true when actual is non-null', () => {
    expect(compareValues(42, 0, 'any')).toBe(true);
    expect(compareValues(null, 0, 'any')).toBe(false);
  });

  it('handles "change" operator — true when actual differs from threshold', () => {
    expect(compareValues(10, 5, 'change')).toBe(true);
    expect(compareValues(5, 5, 'change')).toBe(false);
  });

  it('handles "contains" operator — string contains', () => {
    expect(compareValues('hello world', 'world', 'contains')).toBe(true);
    expect(compareValues('hello', 'world', 'contains')).toBe(false);
  });

  it('handles "neq" operator', () => {
    expect(compareValues(1, 2, 'neq')).toBe(true);
    expect(compareValues(2, 2, 'neq')).toBe(false);
  });

  it('returns false for null/undefined with numeric operators', () => {
    expect(compareValues(null, 10, 'gt')).toBe(false);
    expect(compareValues(10, null, 'gt')).toBe(false);
  });
});
