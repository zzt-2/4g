import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transition,
  isTerminal,
  evaluateCondition,
  calculateProgress,
} from '../core';
import type { TaskLifecycleStatus, TaskStepResult } from '../core';
import {
  waitConditions,
  matchInputs,
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
// ConditionMatcher
// ============================================================

describe('ConditionMatcher', () => {
  describe('eq operator', () => {
    it('matches equal numeric value', () => {
      expect(evaluateCondition(waitConditions.eqNumeric(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('does not match different numeric value', () => {
      expect(evaluateCondition(waitConditions.eqNumeric(), matchInputs.nonMatchingNumeric())).toBe(false);
    });

    it('matches equal string value', () => {
      expect(evaluateCondition(waitConditions.eqString(), matchInputs.matchingString())).toBe(true);
    });

    it('does not match null value', () => {
      expect(evaluateCondition(waitConditions.eqNumeric(), matchInputs.nullValue())).toBe(false);
    });
  });

  describe('neq operator', () => {
    it('matches different value', () => {
      expect(evaluateCondition(waitConditions.neq(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('does not match equal value', () => {
      expect(evaluateCondition(waitConditions.neq(), matchInputs.nonMatchingNumeric())).toBe(false);
    });
  });

  describe('gt operator', () => {
    it('matches when value > threshold', () => {
      expect(evaluateCondition(waitConditions.gt(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('does not match when value <= threshold', () => {
      expect(evaluateCondition(waitConditions.gt(), matchInputs.nonMatchingNumeric())).toBe(false);
    });
  });

  describe('lt operator', () => {
    it('matches when value < threshold', () => {
      const input = { frameId: 'frame-1', fieldValues: { 'field-1': 25 } };
      expect(evaluateCondition(waitConditions.lt(), input)).toBe(true);
    });

    it('does not match when value == threshold', () => {
      expect(evaluateCondition(waitConditions.lt(), matchInputs.nonMatchingNumeric())).toBe(false);
    });

    it('does not match when value > threshold', () => {
      expect(evaluateCondition(waitConditions.lt(), matchInputs.matchingNumeric())).toBe(false);
    });
  });

  describe('gte operator', () => {
    it('matches when value == threshold', () => {
      expect(evaluateCondition(waitConditions.gte(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('matches when value > threshold', () => {
      const cond = waitConditions.gte();
      const input = { frameId: 'frame-1', fieldValues: { 'field-1': 200 } };
      expect(evaluateCondition(cond, input)).toBe(true);
    });

    it('does not match when value < threshold', () => {
      expect(evaluateCondition(waitConditions.gte(), matchInputs.nonMatchingNumeric())).toBe(false);
    });
  });

  describe('lte operator', () => {
    it('matches when value == threshold', () => {
      expect(evaluateCondition(waitConditions.lte(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('matches when value < threshold', () => {
      expect(evaluateCondition(waitConditions.lte(), matchInputs.nonMatchingNumeric())).toBe(true);
    });

    it('does not match when value > threshold', () => {
      const cond = waitConditions.lte();
      const input = { frameId: 'frame-1', fieldValues: { 'field-1': 200 } };
      expect(evaluateCondition(cond, input)).toBe(false);
    });
  });

  describe('change operator', () => {
    it('matches non-null value', () => {
      expect(evaluateCondition(waitConditions.change(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('does not match null value', () => {
      expect(evaluateCondition(waitConditions.change(), matchInputs.nullValue())).toBe(false);
    });
  });

  describe('any operator', () => {
    it('matches any non-null value', () => {
      expect(evaluateCondition(waitConditions.any(), matchInputs.matchingNumeric())).toBe(true);
    });

    it('does not match null value', () => {
      expect(evaluateCondition(waitConditions.any(), matchInputs.nullValue())).toBe(false);
    });
  });

  describe('frameId / fieldId filtering', () => {
    it('does not match when frameId differs', () => {
      expect(evaluateCondition(waitConditions.eqNumeric(), matchInputs.differentFrame())).toBe(false);
    });
  });

  describe('sourceId filtering', () => {
    it('matches when sourceId matches', () => {
      expect(evaluateCondition(waitConditions.withSourceFilter(), matchInputs.withSourceA())).toBe(true);
    });

    it('does not match when sourceId differs', () => {
      expect(evaluateCondition(waitConditions.withSourceFilter(), matchInputs.withSourceB())).toBe(false);
    });

    it('matches when condition has no sourceId filter', () => {
      expect(evaluateCondition(waitConditions.eqNumeric(), matchInputs.withSourceA())).toBe(true);
    });

    it('matches when input has no sourceId and condition has no sourceId', () => {
      expect(evaluateCondition(waitConditions.eqNumeric(), matchInputs.matchingNumeric())).toBe(true);
    });
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
        sendResult: { ...makeSendResult(), kind: 'transport-error' },
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
      const skippedResult: TaskStepResult = {
        kind: 'send',
        stepIndex: 1,
        iteration: 0,
        sendResult: makeSendResult(),
        appliedPolicy: 'skip-step',
      };
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
          makeWaitStepResult({ stepIndex: 0, iteration: 0, matched: false, timedOut: true }),
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

  describe('iterationsTotal by scheduling mode', () => {
    it('returns maxCount for timed mode', () => {
      const instance = makeInstance({ definitionRef: timedTaskDef() });
      expect(calculateProgress(instance).iterationsTotal).toBe(5);
    });

    it('returns 1 for sequence mode', () => {
      const instance = makeInstance({ definitionRef: sequenceTaskDef() });
      expect(calculateProgress(instance).iterationsTotal).toBe(1);
    });

    it('returns null for trigger mode', () => {
      const instance = makeInstance({ definitionRef: triggerTaskDef() });
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
    expect(def.schedulingMode).toBe('timed');
    expect(def.steps).toHaveLength(2);
    expect(def.intervalMs).toBe(1000);
    expect(def.stopCondition?.maxIterations).toBe(5);
  });

  it('triggerTaskDef has correct structure', () => {
    const def = triggerTaskDef();
    expect(def.schedulingMode).toBe('trigger');
    expect(def.triggerCondition).toBeDefined();
    expect(def.cooldownMs).toBe(500);
  });

  it('sequenceTaskDef has correct structure', () => {
    const def = sequenceTaskDef();
    expect(def.schedulingMode).toBe('sequence');
    expect(def.steps).toHaveLength(3);
    expect(def.steps[1].kind).toBe('delay');
  });

  it('scoeModeTaskDef has send-wait-send pattern', () => {
    const def = scoeModeTaskDef();
    expect(def.triggerSource).toBe('scoe-command');
    expect(def.steps).toHaveLength(3);
    expect(def.steps[0].kind).toBe('send');
    expect(def.steps[1].kind).toBe('wait-condition');
    expect(def.steps[2].kind).toBe('send');
  });

  it('errorPolicies cover all action types', () => {
    expect(errorPolicies.stopOnFailure().onFailure).toBe('stop');
    expect(errorPolicies.retryTwice().onFailure).toBe('retry');
    expect(errorPolicies.retryTwice().retryCount).toBe(2);
    expect(errorPolicies.skipStep().onFailure).toBe('skip-step');
    expect(errorPolicies.pauseOnFailure().onFailure).toBe('pause');
  });
});
