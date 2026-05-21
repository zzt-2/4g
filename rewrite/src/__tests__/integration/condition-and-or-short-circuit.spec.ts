/**
 * T018: Condition AND/OR short-circuit evaluation.
 *
 * Verifies that evaluateConditionGroup processes conditions left-to-right
 * and short-circuits evaluation: AND stops on first false, OR stops on
 * first true. Remaining conditions after the short-circuit point are
 * NOT evaluated.
 *
 * Uses a Proxy-wrapped fieldValues to track which field IDs are actually
 * accessed, proving short-circuit behavior.
 *
 * Note on implementation: the current code evaluates conditions[i] before
 * checking the accumulated result for short-circuit. This means the
 * condition that *triggers* the short-circuit IS evaluated, but conditions
 * AFTER it are not. Tests reflect this exact behavior.
 *
 * Verification points:
 * 1. AND: first false short-circuits — conditions after trigger not evaluated
 * 2. OR: first true short-circuits — conditions after trigger not evaluated
 * 3. All AND true: no short-circuit, all conditions evaluated
 * 4. Mixed AND/OR: left-to-right without precedence
 * 5. Empty condition group returns true
 */
import { describe, it, expect } from 'vitest';
import { evaluateConditionGroup } from '@/features/task/core/condition-matcher';
import type { ConditionTerm, ComparisonOperator } from '@/features/task/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCondition(
  fieldId: string,
  operator: ComparisonOperator = 'gt',
  threshold: number = 5,
  logicOperator?: 'and' | 'or',
): ConditionTerm {
  return {
    frameId: 'test-frame',
    fieldId,
    operator,
    threshold,
    logicOperator,
  };
}

/**
 * Creates a Proxy-wrapped fieldValues that records every property access.
 * Values are determined by the valueMap parameter.
 */
function trackedFieldValues(
  valueMap: Record<string, number | string | null>,
): { values: Record<string, number | string | null>; accessed: string[] } {
  const accessed: string[] = [];
  const values = new Proxy(valueMap, {
    get(target, prop: string) {
      accessed.push(prop);
      return target[prop] ?? null;
    },
  });
  return { values, accessed };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T018: condition AND/OR short-circuit evaluation', () => {
  it('AND: false at second condition short-circuits, rest not evaluated', () => {
    // a=10 (>5 → true), b=0 (>5 → false), c=10 (>5 → would be true)
    // After evaluating a and b: result = true && false = false → break
    // c should NOT be accessed
    const { values, accessed } = trackedFieldValues({
      a: 10, // true: 10 > 5
      b: 0,  // false: 0 > 5
      c: 10, // true: 10 > 5 (but should not be accessed)
      d: 10, // true: (should not be accessed)
    });

    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),        // evaluated: 10 > 5 → true
        makeCondition('b', 'gt', 5),        // evaluated: 0 > 5 → false → break
        makeCondition('c', 'gt', 5),        // NOT evaluated
        makeCondition('d', 'gt', 5),        // NOT evaluated
      ],
      values,
    );

    expect(result).toBe(false);
    // a and b are evaluated; c and d are not
    expect(accessed).toEqual(['a', 'b']);
  });

  it('OR: true at second condition short-circuits, rest not evaluated', () => {
    // a=0 (>5 → false), b=10 (>5 → true with logicOp='or')
    // result = false || true = true → break
    // c should NOT be accessed
    const { values, accessed } = trackedFieldValues({
      a: 0,  // false: 0 > 5
      b: 10, // true: 10 > 5
      c: 0,  // would be false (should not be accessed)
      d: 0,  // would be false (should not be accessed)
    });

    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),         // evaluated: 0 > 5 → false
        makeCondition('b', 'gt', 5, 'or'),   // evaluated: 10 > 5 → true → break
        makeCondition('c', 'gt', 5, 'or'),   // NOT evaluated
        makeCondition('d', 'gt', 5, 'or'),   // NOT evaluated
      ],
      values,
    );

    expect(result).toBe(true);
    expect(accessed).toEqual(['a', 'b']);
  });

  it('all AND true: no short-circuit, all conditions evaluated', () => {
    const { values, accessed } = trackedFieldValues({
      a: 10, // true
      b: 20, // true
      c: 30, // true
    });

    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),
        makeCondition('b', 'gt', 5),
        makeCondition('c', 'gt', 5),
      ],
      values,
    );

    expect(result).toBe(true);
    expect(accessed).toEqual(['a', 'b', 'c']);
  });

  it('mixed AND/OR: left-to-right without precedence', () => {
    // [a=false, b(or)=true, c(and)=true]
    // result = eval(a) = false
    // b with 'or': result = false || eval(b) = false || true = true → break
    // c NOT evaluated (OR short-circuit on true)
    const { values, accessed } = trackedFieldValues({
      a: 0,  // false: 0 > 5
      b: 10, // true: 10 > 5
      c: 20, // true: would be 20 > 5 (should NOT be accessed)
    });

    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),          // false
        makeCondition('b', 'gt', 5, 'or'),    // true → result = true → break
        makeCondition('c', 'gt', 5, 'and'),   // NOT evaluated
      ],
      values,
    );

    expect(result).toBe(true);
    expect(accessed).toEqual(['a', 'b']);
  });

  it('empty condition group returns true', () => {
    const result = evaluateConditionGroup([], {});
    expect(result).toBe(true);
  });

  it('AND: true then true then false — third triggers short-circuit', () => {
    const { values, accessed } = trackedFieldValues({
      a: 10, // true
      b: 20, // true
      c: 0,  // false → break
      d: 30, // NOT accessed
    });

    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),
        makeCondition('b', 'gt', 5),
        makeCondition('c', 'gt', 5),  // false → break
        makeCondition('d', 'gt', 5),  // NOT evaluated
      ],
      values,
    );

    expect(result).toBe(false);
    expect(accessed).toEqual(['a', 'b', 'c']);
  });

  it('OR: false then false then true — third triggers short-circuit', () => {
    const { values, accessed } = trackedFieldValues({
      a: 0,  // false
      b: 0,  // false
      c: 10, // true → break
      d: 0,  // NOT accessed
    });

    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),
        makeCondition('b', 'gt', 5, 'or'),
        makeCondition('c', 'gt', 5, 'or'),   // true → break
        makeCondition('d', 'gt', 5, 'or'),   // NOT evaluated
      ],
      values,
    );

    expect(result).toBe(true);
    expect(accessed).toEqual(['a', 'b', 'c']);
  });

  it('single condition: no short-circuit, evaluated directly', () => {
    const { values, accessed } = trackedFieldValues({
      a: 10,
    });

    const result = evaluateConditionGroup(
      [makeCondition('a', 'gt', 5)],
      values,
    );

    expect(result).toBe(true);
    expect(accessed).toEqual(['a']);
  });

  it('null/undefined value returns false, does not crash', () => {
    const { values, accessed } = trackedFieldValues({
      a: null,
      b: 10,
    });

    // a is null → evaluateSingleCondition returns false
    // b with 'or': result = false || true = true → break
    const result = evaluateConditionGroup(
      [
        makeCondition('a', 'gt', 5),
        makeCondition('b', 'gt', 5, 'or'),
      ],
      values,
    );

    expect(result).toBe(true);
    expect(accessed).toEqual(['a', 'b']);
  });
});
