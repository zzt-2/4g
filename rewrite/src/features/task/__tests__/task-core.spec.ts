import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transition,
  isTerminal,
  calculateProgress,
  evaluateConditionGroup,
  evaluateSingleCondition,
  resolveStopCondition,
} from '../core';
import type { TaskLifecycleStatus, TaskStepResult, ConditionTerm, TaskDefinition } from '../core';
import { resolveFieldValues } from '../services/task-iteration-loops';
import { buildSendRequest } from '../services/task-step-executors';
import {
  timedTaskDef,
  triggerTaskDef,
  sequenceTaskDef,
  scoeModeTaskDef,
  errorPolicies,
  makeSendResult,
  makeInstance,
  makeSendStepResult,
  makeWaitStepResult,
} from '../fixtures/task-fixtures';

// ============================================================
// Lifecycle
// ============================================================

describe('Task lifecycle', () => {
  describe('canTransition', () => {
    it('allows created -> running', () => {
      expect(canTransition('created', 'running')).toBe(true);
    });

    it('allows running -> paused', () => {
      expect(canTransition('running', 'paused')).toBe(true);
    });

    it('allows running -> stopped', () => {
      expect(canTransition('running', 'stopped')).toBe(true);
    });

    it('allows running -> completed', () => {
      expect(canTransition('running', 'completed')).toBe(true);
    });

    it('allows running -> failed', () => {
      expect(canTransition('running', 'failed')).toBe(true);
    });

    it('allows paused -> running', () => {
      expect(canTransition('paused', 'running')).toBe(true);
    });

    it('allows paused -> stopped', () => {
      expect(canTransition('paused', 'stopped')).toBe(true);
    });

    it('rejects created -> paused', () => {
      expect(canTransition('created', 'paused')).toBe(false);
    });

    it('rejects created -> completed', () => {
      expect(canTransition('created', 'completed')).toBe(false);
    });

    it('rejects created -> stopped', () => {
      expect(canTransition('created', 'stopped')).toBe(false);
    });

    it('rejects stopped -> running', () => {
      expect(canTransition('stopped', 'running')).toBe(false);
    });

    it('rejects completed -> running', () => {
      expect(canTransition('completed', 'running')).toBe(false);
    });

    it('rejects failed -> running', () => {
      expect(canTransition('failed', 'running')).toBe(false);
    });

    it('rejects running -> created', () => {
      expect(canTransition('running', 'created')).toBe(false);
    });
  });

  describe('transition', () => {
    it('transitions created -> running on start', () => {
      expect(transition('created', 'start')).toBe('running');
    });

    it('transitions running -> paused on pause', () => {
      expect(transition('running', 'pause')).toBe('paused');
    });

    it('transitions paused -> running on resume', () => {
      expect(transition('paused', 'resume')).toBe('running');
    });

    it('transitions running -> stopped on stop', () => {
      expect(transition('running', 'stop')).toBe('stopped');
    });

    it('transitions running -> completed on complete', () => {
      expect(transition('running', 'complete')).toBe('completed');
    });

    it('transitions running -> failed on fail', () => {
      expect(transition('running', 'fail')).toBe('failed');
    });

    it('transitions paused -> stopped on stop', () => {
      expect(transition('paused', 'stop')).toBe('stopped');
    });

    it('throws on created -> pause (illegal)', () => {
      expect(() => transition('created', 'pause')).toThrow(/Invalid lifecycle transition/);
    });

    it('throws on stopped -> resume (illegal)', () => {
      expect(() => transition('stopped', 'resume')).toThrow(/Invalid lifecycle transition/);
    });

    it('throws on completed -> start (illegal)', () => {
      expect(() => transition('completed', 'start')).toThrow(/Invalid lifecycle transition/);
    });

    it('throws on failed -> resume (illegal)', () => {
      expect(() => transition('failed', 'resume')).toThrow(/Invalid lifecycle transition/);
    });
  });

  describe('isTerminal', () => {
    it.each(['stopped', 'completed', 'failed'] satisfies TaskLifecycleStatus[])(
      'returns true for %s',
      (status) => {
        expect(isTerminal(status)).toBe(true);
      },
    );

    it.each(['created', 'running', 'paused'] satisfies TaskLifecycleStatus[])(
      'returns false for %s',
      (status) => {
        expect(isTerminal(status)).toBe(false);
      },
    );
  });
});

// ============================================================
// evaluateConditionGroup / evaluateSingleCondition
// ============================================================

describe('evaluateConditionGroup / evaluateSingleCondition', () => {
  const cond = (overrides: Partial<ConditionTerm> = {}): ConditionTerm => ({
    frameId: 'frame-1',
    fieldId: 'field-1',
    operator: 'eq',
    threshold: 100,
    ...overrides,
  });

  describe('evaluateSingleCondition', () => {
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

  describe('evaluateConditionGroup', () => {
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
});

// ============================================================
// resolveStopCondition
// ============================================================

describe('resolveStopCondition', () => {
  it('returns { maxIterations: 1 } for immediate schedule without stopCondition', () => {
    const def: TaskDefinition = {
      id: 'test',
      name: 'test',
      schedule: { kind: 'immediate' },
      steps: [{ id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 't1' } }],
      errorPolicy: { onFailure: 'stop' },
    };
    expect(resolveStopCondition(def)).toEqual({ maxIterations: 1 });
  });

  it('returns stopCondition as-is when no fieldVariations', () => {
    const def = timedTaskDef();
    const result = resolveStopCondition(def);
    expect(result.maxIterations).toBe(5);
  });

  it('derives maxIterations from fieldVariations when present', () => {
    const def: TaskDefinition = {
      ...sequenceTaskDef(),
      fieldVariations: [
        { fieldId: 'v1', values: [1, 2, 3] },
        { fieldId: 'v2', values: [10, 20] },
      ],
    };
    const result = resolveStopCondition(def);
    expect(result.maxIterations).toBe(3);
  });

  it('merges fieldVariations-derived maxIterations with existing stopCondition', () => {
    const def: TaskDefinition = {
      ...sequenceTaskDef(),
      stopCondition: { maxDurationMs: 60000 },
      fieldVariations: [
        { fieldId: 'v1', values: [1, 2, 3, 4] },
      ],
    };
    const result = resolveStopCondition(def);
    expect(result.maxIterations).toBe(4);
    expect(result.maxDurationMs).toBe(60000);
  });
});

// ============================================================
// Progress
// ============================================================

describe('Progress', () => {
  describe('empty stepResults', () => {
    it('returns all zeros', () => {
      const instance = makeInstance();
      const progress = calculateProgress(instance);
      expect(progress.stepsTotal).toBe(2);
      expect(progress.stepsCompleted).toBe(0);
      expect(progress.stepsFailed).toBe(0);
      expect(progress.stepsSkipped).toBe(0);
      expect(progress.iterationsCompleted).toBe(0);
      expect(progress.iterationsTotal).toBe(5);
      expect(progress.elapsedMs).toBe(0);
    });
  });

  describe('partial completion', () => {
    it('counts completed steps in current iteration', () => {
      const instance = makeInstance({
        lifecycle: 'running',
        startedAt: '2026-05-06T12:00:00.000Z',
        currentStepIndex: 1,
        currentIteration: 0,
        stepResults: [
          makeSendStepResult({ stepIndex: 0, iteration: 0 }),
        ],
      });
      const progress = calculateProgress(instance);
      expect(progress.stepsTotal).toBe(2);
      expect(progress.stepsCompleted).toBe(1);
      expect(progress.stepsFailed).toBe(0);
      expect(progress.stepsSkipped).toBe(0);
    });
  });

  describe('full completion', () => {
    it('counts all steps completed in current iteration', () => {
      const instance = makeInstance({
        lifecycle: 'completed',
        startedAt: '2026-05-06T12:00:00.000Z',
        completedAt: '2026-05-06T12:00:05.000Z',
        currentStepIndex: 2,
        currentIteration: 0,
        stepResults: [
          makeSendStepResult({ stepIndex: 0, iteration: 0 }),
          makeSendStepResult({ stepIndex: 1, iteration: 0 }),
        ],
      });
      const progress = calculateProgress(instance);
      expect(progress.stepsTotal).toBe(2);
      expect(progress.stepsCompleted).toBe(2);
      expect(progress.stepsFailed).toBe(0);
      expect(progress.iterationsCompleted).toBe(1);
      expect(progress.elapsedMs).toBe(5000);
    });
  });

  describe('with failed and skipped steps', () => {
    it('counts failed send-step result', () => {
      const failedResult = makeSendStepResult({
        stepIndex: 1,
        iteration: 0,
        sendResult: { ...makeSendResult(), kind: 'transport-error' } as TaskStepResult['sendResult'] & { kind: 'transport-error' },
      });
      const instance = makeInstance({
        lifecycle: 'stopped',
        startedAt: '2026-05-06T12:00:00.000Z',
        stoppedAt: '2026-05-06T12:00:01.000Z',
        currentStepIndex: 2,
        currentIteration: 0,
        stepResults: [
          makeSendStepResult({ stepIndex: 0, iteration: 0 }),
          failedResult,
        ],
      });
      const progress = calculateProgress(instance);
      expect(progress.stepsCompleted).toBe(1);
      expect(progress.stepsFailed).toBe(1);
    });

    it('counts skipped step', () => {
      const skippedResult = {
        kind: 'send' as const,
        stepIndex: 1,
        iteration: 0,
        sendResult: makeSendResult(),
        appliedPolicy: 'skip-step' as const,
      } satisfies TaskStepResult;
      const instance = makeInstance({
        lifecycle: 'completed',
        startedAt: '2026-05-06T12:00:00.000Z',
        completedAt: '2026-05-06T12:00:01.000Z',
        currentIteration: 0,
        stepResults: [
          makeSendStepResult({ stepIndex: 0, iteration: 0 }),
          skippedResult,
        ],
      });
      const progress = calculateProgress(instance);
      expect(progress.stepsCompleted).toBe(1);
      expect(progress.stepsSkipped).toBe(1);
    });

    it('counts failed wait-condition (not matched)', () => {
      const instance = makeInstance({
        lifecycle: 'running',
        startedAt: '2026-05-06T12:00:00.000Z',
        currentIteration: 0,
        stepResults: [
          makeWaitStepResult({ stepIndex: 0, iteration: 0, matched: false as const, timedOut: true as const }),
        ],
      });
      const progress = calculateProgress(instance);
      expect(progress.stepsFailed).toBe(1);
      expect(progress.stepsCompleted).toBe(0);
    });
  });

  describe('multiple iterations', () => {
    it('counts iterationsCompleted correctly', () => {
      const instance = makeInstance({
        lifecycle: 'running',
        startedAt: '2026-05-06T12:00:00.000Z',
        currentIteration: 2,
        stepResults: [
          makeSendStepResult({ stepIndex: 0, iteration: 0 }),
          makeSendStepResult({ stepIndex: 1, iteration: 0 }),
          makeSendStepResult({ stepIndex: 0, iteration: 1 }),
          makeSendStepResult({ stepIndex: 1, iteration: 1 }),
          makeSendStepResult({ stepIndex: 0, iteration: 2 }),
        ],
      });
      const progress = calculateProgress(instance);
      expect(progress.iterationsCompleted).toBe(2);
      expect(progress.stepsTotal).toBe(2);
      expect(progress.stepsCompleted).toBe(1);
    });

    it('reports null iterationsTotal for infinite timed task', () => {
      const def = timedTaskDef();
      const { stopCondition, ...withoutStop } = def;
      void stopCondition;
      const instance = makeInstance({ definitionRef: withoutStop });
      const progress = calculateProgress(instance);
      expect(progress.iterationsTotal).toBeNull();
    });
  });

  describe('iterationsTotal by schedule kind', () => {
    it('returns maxCount for timer schedule with stopCondition', () => {
      const instance = makeInstance({ definitionRef: timedTaskDef() });
      expect(calculateProgress(instance).iterationsTotal).toBe(5);
    });

    it('returns 1 for immediate schedule', () => {
      const instance = makeInstance({ definitionRef: sequenceTaskDef() });
      expect(calculateProgress(instance).iterationsTotal).toBe(1);
    });

    it('returns maxIterations for event schedule with maxIterations', () => {
      const instance = makeInstance({ definitionRef: triggerTaskDef() });
      expect(calculateProgress(instance).iterationsTotal).toBe(10);
    });

    it('returns null for event schedule without maxIterations', () => {
      const def = triggerTaskDef();
      const { stopCondition, ...withoutStop } = def;
      void stopCondition;
      const instance = makeInstance({ definitionRef: withoutStop });
      expect(calculateProgress(instance).iterationsTotal).toBeNull();
    });
  });
});

// ============================================================
// Fixture validation
// ============================================================

describe('Fixtures', () => {
  it('timedTaskDef has correct structure', () => {
    const def = timedTaskDef();
    expect(def.schedule.kind).toBe('timer');
    expect(def.steps).toHaveLength(2);
    expect((def.schedule as { intervalMs: number }).intervalMs).toBe(10);
    expect(def.stopCondition?.maxIterations).toBe(5);
  });

  it('triggerTaskDef has correct structure', () => {
    const def = triggerTaskDef();
    expect(def.schedule.kind).toBe('event');
    const sched = def.schedule as { kind: 'event'; conditions: readonly unknown[]; cooldownMs: number };
    expect(sched.conditions.length).toBeGreaterThan(0);
    expect(sched.cooldownMs).toBe(10);
  });

  it('sequenceTaskDef has correct structure', () => {
    const def = sequenceTaskDef();
    expect(def.schedule.kind).toBe('immediate');
    expect(def.steps).toHaveLength(3);
    expect(def.steps[1]!.kind).toBe('delay');
  });

  it('scoeModeTaskDef has send-wait-send pattern', () => {
    const def = scoeModeTaskDef();
    expect(def.steps).toHaveLength(3);
    expect(def.steps[0]!.kind).toBe('send');
    expect(def.steps[1]!.kind).toBe('wait-condition');
    expect(def.steps[2]!.kind).toBe('send');
  });

  it('errorPolicies cover all action types', () => {
    expect(errorPolicies.stopOnFailure().onFailure).toBe('stop');
    expect(errorPolicies.retryTwice().onFailure).toBe('retry');
    expect(errorPolicies.retryTwice().retryCount).toBe(2);
    expect(errorPolicies.skipStep().onFailure).toBe('skip-step');
    expect(errorPolicies.pauseOnFailure().onFailure).toBe('pause');
  });
});

// ============================================================
// resolveFieldValues
// ============================================================

describe('resolveFieldValues', () => {
  it('returns empty object when no base and no variations', () => {
    expect(resolveFieldValues(undefined, undefined, 0)).toEqual({});
  });

  it('returns base values when no variations', () => {
    const base = { field1: 100, field2: 'hello' };
    expect(resolveFieldValues(base, undefined, 0)).toEqual(base);
  });

  it('returns base values when variations is empty', () => {
    const base = { field1: 100 };
    expect(resolveFieldValues(base, [], 0)).toEqual(base);
  });

  it('overrides base field with variation value at iteration 0', () => {
    const base = { field1: 100 };
    const variations = [{ fieldId: 'field1', values: [10, 20, 30] as const }];
    expect(resolveFieldValues(base, variations, 0)).toEqual({ field1: 10 });
  });

  it('uses different variation values per iteration', () => {
    const base = { field1: 100 };
    const variations = [{ fieldId: 'field1', values: [10, 20, 30] as const }];
    expect(resolveFieldValues(base, variations, 0)).toEqual({ field1: 10 });
    expect(resolveFieldValues(base, variations, 1)).toEqual({ field1: 20 });
    expect(resolveFieldValues(base, variations, 2)).toEqual({ field1: 30 });
  });

  it('keeps base value when iteration exceeds variation length', () => {
    const base = { field1: 100 };
    const variations = [{ fieldId: 'field1', values: [10, 20] as const }];
    expect(resolveFieldValues(base, variations, 5)).toEqual({ field1: 100 });
  });

  it('handles multiple field variations simultaneously', () => {
    const base = { f1: 0, f2: 0 };
    const variations = [
      { fieldId: 'f1', values: [1, 2, 3] as const },
      { fieldId: 'f2', values: ['a', 'b'] as const },
    ];
    expect(resolveFieldValues(base, variations, 0)).toEqual({ f1: 1, f2: 'a' });
    expect(resolveFieldValues(base, variations, 1)).toEqual({ f1: 2, f2: 'b' });
    // f2 exceeds its length, keeps base
    expect(resolveFieldValues(base, variations, 2)).toEqual({ f1: 3, f2: 0 });
  });

  it('preserves non-varied base fields', () => {
    const base = { field1: 100, field2: 200, field3: true };
    const variations = [{ fieldId: 'field1', values: [10] as const }];
    expect(resolveFieldValues(base, variations, 0)).toEqual({ field1: 10, field2: 200, field3: true });
  });
});

// ============================================================
// buildSendRequest alignment
// ============================================================

describe('buildSendRequest', () => {
  const baseDef: TaskDefinition = {
    id: 'build-test',
    name: 'Build Test',
    schedule: { kind: 'immediate' },
    steps: [],
    errorPolicy: { onFailure: 'stop' },
  };

  it('maps frameId, targetId, userFieldValues', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'frame-X', targetId: 'target-Y', userFieldValues: { f: 42 } },
    };
    const req = buildSendRequest(step, baseDef, 0, 0);
    expect(req.frameId).toBe('frame-X');
    expect(req.targetId).toBe('target-Y');
    expect(req.userFieldValues).toEqual({ f: 42 });
  });

  it('passes variables from step config', () => {
    const vars = new Map([['v1', { type: 'literal' as const, value: 1 }]]);
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1', variables: vars },
    };
    const req = buildSendRequest(step, baseDef, 2, 3);
    expect(req.variables).toBe(vars);
  });

  it('includes context with source=task, taskId and stepIndex', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1' },
    };
    const req = buildSendRequest(step, baseDef, 5, 3);
    expect(req.context).toEqual({ source: 'task', taskId: 'build-test', stepIndex: 5 });
  });

  it('does not include options field', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1' },
    };
    const req = buildSendRequest(step, baseDef, 0, 0);
    expect((req as Record<string, unknown>).options).toBeUndefined();
  });

  it('uses targetId from step config (no fallback to definition)', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 'explicit-target' },
    };
    const req = buildSendRequest(step, baseDef, 0, 0);
    expect(req.targetId).toBe('explicit-target');
  });

  it('merges fieldVariations into userFieldValues at given iteration', () => {
    const def: TaskDefinition = {
      ...baseDef,
      fieldVariations: [{ fieldId: 'v', values: [10, 20, 30] as const }],
    };
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1', userFieldValues: { v: 0, other: 99 } },
    };
    expect(buildSendRequest(step, def, 0, 0).userFieldValues).toEqual({ v: 10, other: 99 });
    expect(buildSendRequest(step, def, 0, 1).userFieldValues).toEqual({ v: 20, other: 99 });
    expect(buildSendRequest(step, def, 0, 2).userFieldValues).toEqual({ v: 30, other: 99 });
  });
});
