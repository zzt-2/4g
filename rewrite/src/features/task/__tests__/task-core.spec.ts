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

  it('returns stopCondition as-is when present', () => {
    const def = timedTaskDef();
    const result = resolveStopCondition(def);
    expect(result.maxIterations).toBe(5);
  });

  it('respects user-set stopCondition.maxIterations (fieldVariations removed, no auto-derive)', () => {
    // fieldVariations 已下沉到 step 级(fieldResolvers),不再在任务级推导 maxIterations。
    // 用户设的 stopCondition.maxIterations 必须被尊重(修复原 maxIterations 静默覆盖 bug)。
    const def: TaskDefinition = {
      ...sequenceTaskDef(),
      stopCondition: { maxIterations: 7 },
    };
    const result = resolveStopCondition(def);
    expect(result.maxIterations).toBe(7);
  });

  it('preserves stopCondition fields other than maxIterations', () => {
    const def: TaskDefinition = {
      ...sequenceTaskDef(),
      stopCondition: { maxDurationMs: 60000 },
    };
    const result = resolveStopCondition(def);
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
  // 新签名:resolveFieldValues(baseValues, resolvers, counter, lastValues)
  // counter 是 step 内第几次发送(1-based),跨 iteration 持久。
  // variation 按 counter 索引取值(counter-1),clamp 到最后一个。
  // accumulation 从 lastValues 取上次值,无则用 initial(递推由帧侧完成,这里不测公式)。

  it('returns shallow copy of base values when no resolvers', () => {
    expect(resolveFieldValues(undefined, undefined, 1, new Map())).toEqual({});
    const base = { field1: 100 };
    expect(resolveFieldValues(base, undefined, 1, new Map())).toEqual(base);
    expect(resolveFieldValues(base, [], 1, new Map())).toEqual(base);
  });

  it('variation: takes value at counter index (counter=1 → values[0])', () => {
    const base = { field1: 100 };
    const resolvers = [{ kind: 'variation' as const, fieldId: 'field1', values: [10, 20, 30] as const }];
    expect(resolveFieldValues(base, resolvers, 1, new Map())).toEqual({ field1: 10 });
    expect(resolveFieldValues(base, resolvers, 2, new Map())).toEqual({ field1: 20 });
    expect(resolveFieldValues(base, resolvers, 3, new Map())).toEqual({ field1: 30 });
  });

  it('variation: clamps to last value when counter exceeds length', () => {
    // 用户语义:取完保留最后一个值(不停止、不报错、不回退到 base)
    const base = { field1: 100 };
    const resolvers = [{ kind: 'variation' as const, fieldId: 'field1', values: [10, 20] as const }];
    expect(resolveFieldValues(base, resolvers, 1, new Map())).toEqual({ field1: 10 });
    expect(resolveFieldValues(base, resolvers, 2, new Map())).toEqual({ field1: 20 });
    // counter=5 超过 length=2 → clamp 到 values[1]=20(不是 base 的 100)
    expect(resolveFieldValues(base, resolvers, 5, new Map())).toEqual({ field1: 20 });
  });

  it('variation: cross-field length mismatch clamps per-field', () => {
    // 字段A 15 值、字段B 3 值,counter=10 时 A 取 values[9]、B clamp 到 values[2]
    const base = { a: 0, b: 0 };
    const resolvers = [
      { kind: 'variation' as const, fieldId: 'a', values: Array.from({ length: 15 }, (_, i) => i + 1) },
      { kind: 'variation' as const, fieldId: 'b', values: [100, 200, 300] as const },
    ];
    expect(resolveFieldValues(base, resolvers, 10, new Map())).toEqual({ a: 10, b: 300 });
  });

  it('variation: preserves non-varied base fields', () => {
    const base = { field1: 100, field2: 200, field3: true };
    const resolvers = [{ kind: 'variation' as const, fieldId: 'field1', values: [10] as const }];
    expect(resolveFieldValues(base, resolvers, 1, new Map())).toEqual({ field1: 10, field2: 200, field3: true });
  });

  it('accumulation: uses initial when lastValues empty', () => {
    const resolvers = [{ kind: 'accumulation' as const, fieldId: 'speed', initial: 0 }];
    expect(resolveFieldValues({}, resolvers, 1, new Map())).toEqual({ speed: 0 });
  });

  it('accumulation: uses lastValues when present (writeback feeds next)', () => {
    // 模拟 writeback 后:帧侧算出 speed=5 回写 lastValues,下次 resolveFieldValues 取 5
    const resolvers = [{ kind: 'accumulation' as const, fieldId: 'speed', initial: 0 }];
    const lastValues = new Map<string, string | number | boolean>([['speed', 5]]);
    expect(resolveFieldValues({}, resolvers, 2, lastValues)).toEqual({ speed: 5 });
  });

  it('accumulation + variation coexist (different fields)', () => {
    // step 级字段混用:字段A variation、字段B accumulation 合法
    const resolvers = [
      { kind: 'variation' as const, fieldId: 'a', values: [1, 2, 3] as const },
      { kind: 'accumulation' as const, fieldId: 'b', initial: 10 },
    ];
    const lastValues = new Map<string, string | number | boolean>([['b', 25]]);
    expect(resolveFieldValues({}, resolvers, 2, lastValues)).toEqual({ a: 2, b: 25 });
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
  const emptyLastValues = new Map<string, string | number | boolean>();

  it('maps frameId, targetId, userFieldValues', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'frame-X', targetId: 'target-Y', userFieldValues: { f: 42 } },
    };
    const req = buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues);
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
    const req = buildSendRequest(step, baseDef, 2, 3, 1, emptyLastValues);
    expect(req.variables).toBe(vars);
  });

  it('includes context with source=task, taskId and stepIndex', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1' },
    };
    const req = buildSendRequest(step, baseDef, 5, 3, 1, emptyLastValues);
    expect(req.context).toEqual({ source: 'task', taskId: 'build-test', stepIndex: 5 });
  });

  it('does not include options field', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1' },
    };
    const req = buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues);
    expect((req as Record<string, unknown>).options).toBeUndefined();
  });

  it('uses step.targetId when present', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 'explicit-target' },
    };
    const req = buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues);
    expect(req.targetId).toBe('explicit-target');
  });

  it('falls back to definition.defaultTargetId when step.targetId is absent', () => {
    const def: TaskDefinition = { ...baseDef, defaultTargetId: 'task-default-target' };
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1' },
    };
    const req = buildSendRequest(step, def, 0, 0, 1, emptyLastValues);
    expect(req.targetId).toBe('task-default-target');
  });

  it('step.targetId overrides definition.defaultTargetId', () => {
    const def: TaskDefinition = { ...baseDef, defaultTargetId: 'task-default-target' };
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 'step-override' },
    };
    const req = buildSendRequest(step, def, 0, 0, 1, emptyLastValues);
    expect(req.targetId).toBe('step-override');
  });

  it('returns empty string when neither step nor definition provides targetId', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1' },
    };
    const req = buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues);
    expect(req.targetId).toBe('');
  });

  it('merges step-level fieldResolvers (variation) into userFieldValues by counter', () => {
    // fieldResolvers 下沉到 step 级,按 counter 取值,clamp 到最后一个
    const step = {
      id: 's1', kind: 'send' as const,
      config: {
        frameId: 'f1', targetId: 't1',
        userFieldValues: { other: 99 },
        fieldResolvers: [{ kind: 'variation' as const, fieldId: 'v', values: [10, 20, 30] }],
      },
    };
    expect(buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues).userFieldValues).toEqual({ v: 10, other: 99 });
    expect(buildSendRequest(step, baseDef, 0, 1, 2, emptyLastValues).userFieldValues).toEqual({ v: 20, other: 99 });
    expect(buildSendRequest(step, baseDef, 0, 2, 3, emptyLastValues).userFieldValues).toEqual({ v: 30, other: 99 });
    // counter=5 超过 length=3 → clamp 到 30
    expect(buildSendRequest(step, baseDef, 0, 3, 5, emptyLastValues).userFieldValues).toEqual({ v: 30, other: 99 });
  });

  it('uses accumulation initial/lastValues from step-level resolver', () => {
    const step = {
      id: 's1', kind: 'send' as const,
      config: {
        frameId: 'f1', targetId: 't1',
        fieldResolvers: [{ kind: 'accumulation' as const, fieldId: 'speed', initial: 0 }],
      },
    };
    // 首次:lastValues 空 → initial=0
    expect(buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues).userFieldValues).toEqual({ speed: 0 });
    // writeback 后:lastValues 有 speed=5 → 取 5(帧侧递推结果的回写)
    const lastValues = new Map<string, string | number | boolean>([['speed', 5]]);
    expect(buildSendRequest(step, baseDef, 0, 1, 2, lastValues).userFieldValues).toEqual({ speed: 5 });
  });
});
