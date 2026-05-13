import { describe, it, expect, vi } from 'vitest';
import {
  evaluateConditionGroup,
  evaluateSingleCondition,
} from '../core/condition-matcher';
import type { ConditionTerm } from '../core/types';
import { ConditionRegistry } from '../services/condition-registry';
import type { ConditionMatchInput } from '../core';

// --- evaluateSingleCondition ---

describe('evaluateSingleCondition', () => {
  const cond = (overrides: Partial<ConditionTerm> = {}): ConditionTerm => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 100,
    ...overrides,
  });

  it('returns true when value matches threshold with eq', () => {
    expect(evaluateSingleCondition(cond(), { 'field-1': 100 })).toBe(true);
  });

  it('returns false when value does not match', () => {
    expect(evaluateSingleCondition(cond(), { 'field-1': 50 })).toBe(false);
  });

  it('returns false when field is null', () => {
    expect(evaluateSingleCondition(cond(), { 'field-1': null })).toBe(false);
  });

  it('returns false when field is missing', () => {
    expect(evaluateSingleCondition(cond(), {})).toBe(false);
  });

  it('supports gt operator', () => {
    expect(evaluateSingleCondition(cond({ operator: 'gt' }), { 'field-1': 101 })).toBe(true);
    expect(evaluateSingleCondition(cond({ operator: 'gt' }), { 'field-1': 99 })).toBe(false);
  });

  it('supports string comparison', () => {
    expect(evaluateSingleCondition(cond({ threshold: 'OK' }), { 'field-1': 'OK' })).toBe(true);
    expect(evaluateSingleCondition(cond({ threshold: 'OK' }), { 'field-1': 'FAIL' })).toBe(false);
  });
});

// --- evaluateConditionGroup ---

describe('evaluateConditionGroup', () => {
  const cond = (overrides: Partial<ConditionTerm> = {}): ConditionTerm => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 100,
    ...overrides,
  });

  it('returns true for empty conditions', () => {
    expect(evaluateConditionGroup([], {})).toBe(true);
  });

  it('returns result of single condition', () => {
    expect(evaluateConditionGroup([cond()], { 'field-1': 100 })).toBe(true);
    expect(evaluateConditionGroup([cond()], { 'field-1': 50 })).toBe(false);
  });

  it('AND: all must match (default logicOperator)', () => {
    const conditions = [
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2 }),
    ];
    expect(evaluateConditionGroup(conditions, { a: 1, b: 2 })).toBe(true);
    expect(evaluateConditionGroup(conditions, { a: 1, b: 0 })).toBe(false);
    expect(evaluateConditionGroup(conditions, { a: 0, b: 2 })).toBe(false);
  });

  it('AND: short-circuits on first false', () => {
    const conditions = [
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2 }),
      cond({ fieldId: 'c', threshold: 3 }),
    ];
    expect(evaluateConditionGroup(conditions, { a: 0, b: 2, c: 3 })).toBe(false);
  });

  it('OR: any match is enough', () => {
    const conditions = [
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2, logicOperator: 'or' }),
    ];
    expect(evaluateConditionGroup(conditions, { a: 1, b: 0 })).toBe(true);
    expect(evaluateConditionGroup(conditions, { a: 0, b: 2 })).toBe(true);
    expect(evaluateConditionGroup(conditions, { a: 0, b: 0 })).toBe(false);
  });

  it('OR: short-circuits on true', () => {
    const conditions = [
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2, logicOperator: 'or' }),
      cond({ fieldId: 'c', threshold: 3, logicOperator: 'or' }),
    ];
    expect(evaluateConditionGroup(conditions, { a: 1, b: 0, c: 0 })).toBe(true);
    expect(evaluateConditionGroup(conditions, { a: 0, b: 2, c: 0 })).toBe(true);
  });

  it('mixed AND/OR', () => {
    const conditions = [
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2 }),
      cond({ fieldId: 'c', threshold: 3, logicOperator: 'or' }),
    ];
    // a=1, b=2 → true AND true = true; OR c=0 → true OR false = true
    expect(evaluateConditionGroup(conditions, { a: 1, b: 2, c: 0 })).toBe(true);
    // a=1, b=0 → true AND false = false; AND short-circuits, never reaches OR
    expect(evaluateConditionGroup(conditions, { a: 1, b: 0, c: 3 })).toBe(false);
    expect(evaluateConditionGroup(conditions, { a: 1, b: 0, c: 0 })).toBe(false);
  });

  it('ignores logicOperator on first condition', () => {
    const conditions = [
      cond({ fieldId: 'a', threshold: 1, logicOperator: 'or' }),
      cond({ fieldId: 'b', threshold: 2 }),
    ];
    expect(evaluateConditionGroup(conditions, { a: 1, b: 2 })).toBe(true);
    expect(evaluateConditionGroup(conditions, { a: 1, b: 0 })).toBe(false);
  });
});

// --- ConditionRegistry ---

describe('ConditionRegistry', () => {
  const cond = (overrides: Partial<ConditionTerm> = {}): ConditionTerm => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 100,
    ...overrides,
  });

  function input(frameId: string, fieldValues: Record<string, number | string | null>, sourceId?: string): ConditionMatchInput {
    return { frameId, fieldValues, ...(sourceId !== undefined ? { sourceId } : {}) };
  }

  it('registerGroup and processInput triggers on match', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    registry.registerGroup([cond()], cb);

    registry.processInput(input('frame-1', { 'field-1': 100 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not trigger when condition not met', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    registry.registerGroup([cond()], cb);

    registry.processInput(input('frame-1', { 'field-1': 50 }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('unregisterGroup removes group', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    const group = registry.registerGroup([cond()], cb);

    registry.unregisterGroup(group);
    registry.processInput(input('frame-1', { 'field-1': 100 }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('frameId index: only evaluates groups matching the frame', () => {
    const registry = new ConditionRegistry();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    registry.registerGroup([cond({ frameId: 'frame-1' })], cb1);
    registry.registerGroup([cond({ frameId: 'frame-2' })], cb2);

    registry.processInput(input('frame-1', { 'field-1': 100 }));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();
  });

  it('AND group: all conditions must match', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    registry.registerGroup([
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2 }),
    ], cb);

    registry.processInput(input('frame-1', { a: 1, b: 2 }));
    expect(cb).toHaveBeenCalledTimes(1);

    registry.processInput(input('frame-1', { a: 1, b: 0 }));
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });

  it('OR group: any condition match triggers', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    registry.registerGroup([
      cond({ fieldId: 'a', threshold: 1 }),
      cond({ fieldId: 'b', threshold: 2, logicOperator: 'or' }),
    ], cb);

    registry.processInput(input('frame-1', { a: 0, b: 2 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('sourceId filter: skips group when no source match', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    registry.registerGroup([cond({ sourceId: 'source-A' })], cb);

    registry.processInput(input('frame-1', { 'field-1': 100 }, 'source-B'));
    expect(cb).not.toHaveBeenCalled();

    registry.processInput(input('frame-1', { 'field-1': 100 }, 'source-A'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('sourceId filter: input without sourceId still triggers (filter skipped)', () => {
    const registry = new ConditionRegistry();
    const cb = vi.fn();
    registry.registerGroup([cond({ sourceId: 'source-A' })], cb);

    registry.processInput(input('frame-1', { 'field-1': 100 }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('clear removes all groups', () => {
    const registry = new ConditionRegistry();
    registry.registerGroup([cond()], vi.fn());
    registry.registerGroup([cond({ fieldId: 'other' })], vi.fn());
    expect(registry.size).toBe(2);

    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('size returns number of registered groups', () => {
    const registry = new ConditionRegistry();
    expect(registry.size).toBe(0);

    const g1 = registry.registerGroup([cond()], vi.fn());
    expect(registry.size).toBe(1);

    registry.registerGroup([cond({ fieldId: 'other' })], vi.fn());
    expect(registry.size).toBe(2);

    registry.unregisterGroup(g1);
    expect(registry.size).toBe(1);
  });
});
