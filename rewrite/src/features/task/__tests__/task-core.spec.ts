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

  describe('sends dimension (发送次数,反映 repeat 细粒度)', () => {
    // 构建 1 个 send step 带 repeat 的 immediate task(默认单 iteration)
    function repeatTaskDef(maxCount?: number, until?: unknown): TaskDefinition {
      return {
        id: 'repeat-task',
        name: 'Repeat Task',
        schedule: { kind: 'immediate' },
        steps: [{
          id: 'step-1',
          kind: 'send',
          config: {
            frameId: 'frame-1',
            targetId: 'target-1',
            ...(maxCount !== undefined || until
              ? { repeat: { intervalMs: 10, ...(maxCount !== undefined ? { maxCount } : {}), ...(until ? { until: until as never } : {}) } }
              : {}),
          },
        }],
        errorPolicy: { onFailure: 'stop' },
      };
    }

    it('单发 step(immediate,1 iteration):sendsTotal=1, sendsCompleted 随发送递增', () => {
      const instance = makeInstance({
        lifecycle: 'running',
        startedAt: '2026-05-06T12:00:00.000Z',
        currentIteration: 0,
        definitionRef: repeatTaskDef(),
        stepResults: [],
      });
      const before = calculateProgress(instance);
      expect(before.sendsTotal).toBe(1);
      expect(before.sendsCompleted).toBe(0);

      const after = makeInstance({
        lifecycle: 'completed',
        startedAt: '2026-05-06T12:00:00.000Z',
        completedAt: '2026-05-06T12:00:01.000Z',
        currentIteration: 0,
        definitionRef: repeatTaskDef(),
        stepResults: [makeSendStepResult({ stepIndex: 0, iteration: 0 })],
      });
      const afterProg = calculateProgress(after);
      expect(afterProg.sendsCompleted).toBe(1);
      expect(afterProg.sendsTotal).toBe(1);
    });

    it('repeat maxCount=5 iteration=3:sendsTotal=15(用户 D001 语义)', () => {
      const def: TaskDefinition = {
        ...repeatTaskDef(5),
        schedule: { kind: 'timer', intervalMs: 10 },
        stopCondition: { maxIterations: 3 },
      };
      const instance = makeInstance({ definitionRef: def });
      const progress = calculateProgress(instance);
      expect(progress.sendsTotal).toBe(15);
      expect(progress.sendsCompleted).toBe(0);
    });

    it('repeat 已发 7 次(maxCount=5 iteration=3):sendsCompleted=7', () => {
      const def: TaskDefinition = {
        ...repeatTaskDef(5),
        schedule: { kind: 'timer', intervalMs: 10 },
        stopCondition: { maxIterations: 3 },
      };
      // iter0 发 5 次 + iter1 发 2 次 = 7 次成功
      const sent7 = Array.from({ length: 7 }, (_, i) =>
        makeSendStepResult({ stepIndex: 0, iteration: i < 5 ? 0 : 1 }),
      );
      const instance = makeInstance({
        lifecycle: 'running',
        startedAt: '2026-05-06T12:00:00.000Z',
        currentIteration: 1,
        definitionRef: def,
        stepResults: sent7,
      });
      const progress = calculateProgress(instance);
      expect(progress.sendsCompleted).toBe(7);
      expect(progress.sendsTotal).toBe(15);
    });

    it('repeat 无 maxCount(until 条件):sendsTotal=null(无法预算)', () => {
      const instance = makeInstance({
        definitionRef: repeatTaskDef(undefined, [{ frameId: 'f', fieldId: 'x', operator: 'eq', threshold: 1 }]),
      });
      expect(calculateProgress(instance).sendsTotal).toBeNull();
    });

    it('timer 无 maxIterations(无限迭代):sendsTotal=null', () => {
      const def: TaskDefinition = {
        ...repeatTaskDef(5),
        schedule: { kind: 'timer', intervalMs: 10 },
      };
      const instance = makeInstance({ definitionRef: def });
      expect(calculateProgress(instance).sendsTotal).toBeNull();
    });

    it('多个 send step 累加 maxCount:sendsTotal = iteration × Σ maxCount', () => {
      const def: TaskDefinition = {
        id: 'multi-task',
        name: 'Multi',
        schedule: { kind: 'immediate' },
        steps: [
          { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 't', repeat: { intervalMs: 10, maxCount: 3 } } },
          { id: 's2', kind: 'send', config: { frameId: 'f2', targetId: 't', repeat: { intervalMs: 10, maxCount: 2 } } },
        ],
        errorPolicy: { onFailure: 'stop' },
      };
      const instance = makeInstance({ definitionRef: def });
      // immediate = 1 iteration, Σ maxCount = 3+2 = 5
      expect(calculateProgress(instance).sendsTotal).toBe(5);
    });

    it('failed send 不计入 sendsCompleted(只数 sent 成功)', () => {
      const def: TaskDefinition = {
        ...repeatTaskDef(5),
        schedule: { kind: 'timer', intervalMs: 10 },
        stopCondition: { maxIterations: 3 },
      };
      const sent2Fail1 = [
        makeSendStepResult({ stepIndex: 0, iteration: 0 }),
        makeSendStepResult({ stepIndex: 0, iteration: 0 }),
        {
          ...makeSendStepResult({ stepIndex: 0, iteration: 0 }),
          sendResult: { ...makeSendResult(), kind: 'transport-error' as never } as never,
        },
      ];
      const instance = makeInstance({
        lifecycle: 'stopped',
        startedAt: '2026-05-06T12:00:00.000Z',
        stoppedAt: '2026-05-06T12:00:01.000Z',
        currentIteration: 0,
        definitionRef: def,
        stepResults: sent2Fail1,
      });
      const progress = calculateProgress(instance);
      expect(progress.sendsCompleted).toBe(2);  // 只数 sent 成功,失败那 1 次不计
      expect(progress.sendsTotal).toBe(15);
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
  // 新签名:resolveFieldValues(baseValues, variations, counter)
  // variation 按 counter 索引取值(counter-1),clamp 到最后一个。
  // accumulation 不再是 resolver——帧有自引用表达式时 task 自动 writeback,用户零配置。

  it('returns shallow copy of base values when no variations', () => {
    expect(resolveFieldValues(undefined, undefined, 1)).toEqual({});
    const base = { field1: 100 };
    expect(resolveFieldValues(base, undefined, 1)).toEqual(base);
    expect(resolveFieldValues(base, [], 1)).toEqual(base);
  });

  it('variation: takes value at counter index (counter=1 → values[0])', () => {
    const base = { field1: 100 };
    const variations = [{ fieldId: 'field1', values: [10, 20, 30] as const }];
    expect(resolveFieldValues(base, variations, 1)).toEqual({ field1: 10 });
    expect(resolveFieldValues(base, variations, 2)).toEqual({ field1: 20 });
    expect(resolveFieldValues(base, variations, 3)).toEqual({ field1: 30 });
  });

  it('variation: clamps to last value when counter exceeds length', () => {
    const base = { field1: 100 };
    const variations = [{ fieldId: 'field1', values: [10, 20] as const }];
    expect(resolveFieldValues(base, variations, 1)).toEqual({ field1: 10 });
    expect(resolveFieldValues(base, variations, 2)).toEqual({ field1: 20 });
    expect(resolveFieldValues(base, variations, 5)).toEqual({ field1: 20 });
  });

  it('variation: cross-field length mismatch clamps per-field', () => {
    const base = { a: 0, b: 0 };
    const variations = [
      { fieldId: 'a', values: Array.from({ length: 15 }, (_, i) => i + 1) },
      { fieldId: 'b', values: [100, 200, 300] as const },
    ];
    expect(resolveFieldValues(base, variations, 10)).toEqual({ a: 10, b: 300 });
  });

  it('variation: preserves non-varied base fields', () => {
    const base = { field1: 100, field2: 200, field3: true };
    const variations = [{ fieldId: 'field1', values: [10] as const }];
    expect(resolveFieldValues(base, variations, 1)).toEqual({ field1: 10, field2: 200, field3: true });
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

  it('merges step-level fieldVariations into userFieldValues by counter', () => {
    // fieldVariations 下沉到 step 级,按 counter 取值,clamp 到最后一个
    const step = {
      id: 's1', kind: 'send' as const,
      config: {
        frameId: 'f1', targetId: 't1',
        userFieldValues: { other: 99 },
        fieldVariations: [{ fieldId: 'v', values: [10, 20, 30] }],
      },
    };
    expect(buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues).userFieldValues).toEqual({ v: 10, other: 99 });
    expect(buildSendRequest(step, baseDef, 0, 1, 2, emptyLastValues).userFieldValues).toEqual({ v: 20, other: 99 });
    expect(buildSendRequest(step, baseDef, 0, 2, 3, emptyLastValues).userFieldValues).toEqual({ v: 30, other: 99 });
    // counter=5 超过 length=3 → clamp 到 30
    expect(buildSendRequest(step, baseDef, 0, 3, 5, emptyLastValues).userFieldValues).toEqual({ v: 30, other: 99 });
  });

  it('writeback lastValues merged into baseValues (accumulation 自动行为)', () => {
    // accumulation 不是 resolver——帧有自引用表达式时,task writeback 把 resolvedFieldValues
    // 回写 lastValues,buildSendRequest 合进 baseValues 喂帧侧 seed。
    const step = {
      id: 's1', kind: 'send' as const,
      config: { frameId: 'f1', targetId: 't1' },
    };
    // 首次:lastValues 空 → userFieldValues 空
    expect(buildSendRequest(step, baseDef, 0, 0, 1, emptyLastValues).userFieldValues).toEqual({});
    // writeback 后:lastValues 有 speed=5 → 合进 baseValues,帧侧 Phase2 取 5 当 seed
    const lastValues = new Map<string, string | number | boolean>([['speed', 5]]);
    expect(buildSendRequest(step, baseDef, 0, 1, 2, lastValues).userFieldValues).toEqual({ speed: 5 });
  });
});
