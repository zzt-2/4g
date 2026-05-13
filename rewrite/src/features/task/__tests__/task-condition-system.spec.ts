import { describe, it, expect } from 'vitest';
import {
  validateTaskDefinition,
  createSendStep,
  createDelayStep,
  createWaitConditionStep,
  createTaskDefinition,
  cloneStepDefinition,
  serializeTaskDefinition,
  deserializeTaskDefinition,
} from '../core';
import type {
  TaskDefinition,
  TaskStepDefinition,
  ConditionTerm,
} from '../core';
import { selectActiveInstances } from '../selectors';
import { createTaskService } from '../services';
import { createTaskState } from '../state';
import {
  timedTaskDef,
  sequenceTaskDef,
  waitConditions,
  makeInstance,
} from '../fixtures/task-fixtures';
import { createFakeSendService, createFakeReceiveEventSource } from '../adapters/test-exports';

// ============================================================
// validateTaskDefinition
// ============================================================

describe('validateTaskDefinition', () => {
  it('valid definition passes', () => {
    const def = timedTaskDef();
    const issues = validateTaskDefinition(def);
    expect(issues).toHaveLength(0);
  });

  it('missing id -> error', () => {
    const def = timedTaskDef();
    const { id, ...withoutId } = def;
    void id;
    const issues = validateTaskDefinition(withoutId as TaskDefinition);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toBe('task.definition.missingId');
  });

  it('missing name -> error', () => {
    const def = timedTaskDef();
    const { name, ...withoutName } = def;
    void name;
    const issues = validateTaskDefinition(withoutName as TaskDefinition);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toBe('task.definition.missingName');
  });

  it('empty steps -> error', () => {
    const def = { ...timedTaskDef(), steps: [] as readonly TaskStepDefinition[] };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.definition.emptySteps')).toBe(true);
    expect(issues.find((i) => i.code === 'task.definition.emptySteps')!.severity).toBe('error');
  });

  it('duplicate step ids -> error', () => {
    const def = {
      ...timedTaskDef(),
      steps: [
        { id: 'dup-step', kind: 'send' as const, config: { frameId: 'f1', targetId: 't1', userFieldValues: {} } },
        { id: 'dup-step', kind: 'send' as const, config: { frameId: 'f2', targetId: 't2', userFieldValues: {} } },
      ],
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.step.duplicateId')).toBe(true);
    expect(issues.find((i) => i.code === 'task.step.duplicateId')!.severity).toBe('error');
  });

  it('send step missing frameId -> error', () => {
    const def = {
      ...timedTaskDef(),
      steps: [
        { id: 's1', kind: 'send' as const, config: { frameId: '', targetId: 't1', userFieldValues: {} } },
      ],
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.step.send.missingFrameId')).toBe(true);
    expect(issues.find((i) => i.code === 'task.step.send.missingFrameId')!.severity).toBe('error');
  });

  it('send step missing targetId -> error', () => {
    const def = {
      ...timedTaskDef(),
      steps: [
        { id: 's1', kind: 'send' as const, config: { frameId: 'f1', targetId: '', userFieldValues: {} } },
      ],
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.step.send.missingTargetId')).toBe(true);
  });

  it('wait-condition step missing conditions -> error', () => {
    const def: TaskDefinition = {
      ...timedTaskDef(),
      steps: [
        {
          id: 'w1',
          kind: 'wait-condition' as const,
          config: { conditions: [] as readonly ConditionTerm[], timeoutMs: 50, onTimeout: 'fail' as const },
        },
      ],
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.step.wait.emptyConditions')).toBe(true);
    expect(issues.find((i) => i.code === 'task.step.wait.emptyConditions')!.severity).toBe('error');
  });

  it('delay step invalid duration -> error', () => {
    const def = {
      ...timedTaskDef(),
      steps: [
        { id: 'd1', kind: 'delay' as const, config: { durationMs: 0 } },
      ],
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.step.invalidDelay')).toBe(true);
    expect(issues.find((i) => i.code === 'task.step.invalidDelay')!.severity).toBe('error');
  });

  it('maxIterations <= 0 -> warning', () => {
    const def = {
      ...timedTaskDef(),
      stopCondition: { maxIterations: 0 },
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.stop.invalidMaxIterations')).toBe(true);
    expect(issues.find((i) => i.code === 'task.stop.invalidMaxIterations')!.severity).toBe('warning');
  });

  it('maxDurationMs <= 0 -> warning', () => {
    const def = {
      ...timedTaskDef(),
      stopCondition: { maxDurationMs: -1 },
    };
    const issues = validateTaskDefinition(def);
    expect(issues.some((i) => i.code === 'task.stop.invalidMaxDuration')).toBe(true);
    expect(issues.find((i) => i.code === 'task.stop.invalidMaxDuration')!.severity).toBe('warning');
  });
});

// ============================================================
// Step builders
// ============================================================

describe('Step builders', () => {
  it('createSendStep creates correct structure', () => {
    const step = createSendStep(
      { frameId: 'frame-A', targetId: 'target-B', userFieldValues: { v: 42 } },
      { id: 'my-send', name: 'My Send' },
    );
    expect(step.kind).toBe('send');
    expect(step.id).toBe('my-send');
    expect(step.name).toBe('My Send');
    if (step.kind === 'send') {
      expect(step.config.frameId).toBe('frame-A');
      expect(step.config.targetId).toBe('target-B');
    }
  });

  it('createDelayStep creates correct structure', () => {
    const step = createDelayStep(2000, { id: 'my-delay', name: 'Wait 2s' });
    expect(step.kind).toBe('delay');
    expect(step.id).toBe('my-delay');
    expect(step.name).toBe('Wait 2s');
    if (step.kind === 'delay') {
      expect(step.config.durationMs).toBe(2000);
    }
  });

  it('createWaitConditionStep creates correct structure', () => {
    const cond = waitConditions.eqNumeric();
    const step = createWaitConditionStep(
      { conditions: [cond], timeoutMs: 50, onTimeout: 'fail' },
      { id: 'my-wait' },
    );
    expect(step.kind).toBe('wait-condition');
    expect(step.id).toBe('my-wait');
    if (step.kind === 'wait-condition') {
      expect(step.config.conditions[0]).toEqual(cond);
      expect(step.config.timeoutMs).toBe(50);
      expect(step.config.onTimeout).toBe('fail');
    }
  });

  it('createTaskDefinition creates valid definition', () => {
    const step = createSendStep({ frameId: 'f1', targetId: 't1' }, { id: 's1' });
    const def = createTaskDefinition({
      id: 'builder-task',
      name: 'Builder Task',
      schedule: { kind: 'immediate' },
      steps: [step],
      errorPolicy: { onFailure: 'stop' },
    });
    expect(def.id).toBe('builder-task');
    expect(def.name).toBe('Builder Task');
    expect(def.steps).toHaveLength(1);
    expect(def.schedule.kind).toBe('immediate');
  });

  it('cloneStepDefinition returns independent copy', () => {
    const step = createSendStep(
      { frameId: 'f1', targetId: 't1', userFieldValues: { x: 10 } },
      { id: 'orig' },
    );
    const cloned = cloneStepDefinition(step);
    expect(cloned).toEqual(step);
    expect(cloned).not.toBe(step);
    // Mutating clone should not affect original
    const mutable = cloned as { config: { frameId: string } };
    mutable.config.frameId = 'MUTATED';
    expect((step as { config: { frameId: string } }).config.frameId).toBe('f1');
  });
});

// ============================================================
// serializeTaskDefinition / deserializeTaskDefinition
// ============================================================

describe('serializeTaskDefinition / deserializeTaskDefinition', () => {
  it('round-trip preserves definition', () => {
    const original = sequenceTaskDef();
    const json = serializeTaskDefinition(original);
    const restored = deserializeTaskDefinition(json);
    expect(restored).toEqual(original);
  });

  it('deserialize invalid JSON throws', () => {
    expect(() => deserializeTaskDefinition('not-json')).toThrow();
  });

  it('deserialize future version throws', () => {
    const futureJson = JSON.stringify({ _version: 999, definition: timedTaskDef() });
    expect(() => deserializeTaskDefinition(futureJson)).toThrow(/Unsupported task definition version/);
  });

  it('deserialize missing _version throws', () => {
    const badJson = JSON.stringify({ definition: timedTaskDef() });
    expect(() => deserializeTaskDefinition(badJson)).toThrow(/missing _version or definition/);
  });

  it('deserialize missing definition throws', () => {
    const badJson = JSON.stringify({ _version: 1 });
    expect(() => deserializeTaskDefinition(badJson)).toThrow(/missing _version or definition/);
  });
});

// ============================================================
// selectActiveInstances
// ============================================================

describe('selectActiveInstances', () => {
  it('filters to created/running/paused only', () => {
    const snapshot = {
      instances: [
        makeInstance({ instanceId: 'inst-created', lifecycle: 'created' }),
        makeInstance({ instanceId: 'inst-running', lifecycle: 'running' }),
        makeInstance({ instanceId: 'inst-paused', lifecycle: 'paused' }),
        makeInstance({ instanceId: 'inst-stopped', lifecycle: 'stopped' }),
        makeInstance({ instanceId: 'inst-completed', lifecycle: 'completed' }),
        makeInstance({ instanceId: 'inst-failed', lifecycle: 'failed' }),
      ],
      history: [],
      statistics: {
        totalCreated: 0, totalCompleted: 0, totalStopped: 0, totalFailed: 0,
        totalStepsExecuted: 0, totalStepsSucceeded: 0, totalStepsFailed: 0, totalStepsSkipped: 0,
      },
    };
    const active = selectActiveInstances(snapshot);
    expect(active).toHaveLength(3);
    const ids = active.map((i) => i.instanceId);
    expect(ids).toContain('inst-created');
    expect(ids).toContain('inst-running');
    expect(ids).toContain('inst-paused');
  });

  it('returns empty for all-terminal instances', () => {
    const snapshot = {
      instances: [
        makeInstance({ instanceId: 'inst-stopped', lifecycle: 'stopped' }),
        makeInstance({ instanceId: 'inst-completed', lifecycle: 'completed' }),
        makeInstance({ instanceId: 'inst-failed', lifecycle: 'failed' }),
      ],
      history: [],
      statistics: {
        totalCreated: 0, totalCompleted: 0, totalStopped: 0, totalFailed: 0,
        totalStepsExecuted: 0, totalStepsSucceeded: 0, totalStepsFailed: 0, totalStepsSkipped: 0,
      },
    };
    const active = selectActiveInstances(snapshot);
    expect(active).toHaveLength(0);
  });
});

// ============================================================
// TaskService.retryTask / stopAll
// ============================================================

describe('TaskService.retryTask / stopAll', () => {
  function createTestService() {
    const sendService = createFakeSendService();
    const receiveSource = createFakeReceiveEventSource();
    const state = createTaskState();
    const service = createTaskService({
      sendService,
      receiveEventSource: receiveSource,
      state,
    });
    return { service, state, sendService, receiveSource };
  }

  describe('retryTask', () => {
    it('creates new instance and starts it for terminal source', () => {
      const { service, state } = createTestService();
      const def = sequenceTaskDef();
      const original = service.createTask(def);

      // Force to terminal state by stopping
      state.updateInstance(original.instanceId, { lifecycle: 'running', startedAt: '2026-05-12T00:00:00.000Z' });
      state.updateInstance(original.instanceId, { lifecycle: 'stopped', stoppedAt: '2026-05-12T00:00:01.000Z' });

      const retried = service.retryTask(original.instanceId);
      expect(retried).toBeDefined();
      expect(retried!.instanceId).not.toBe(original.instanceId);
      // retryTask starts immediately, so lifecycle transitions to 'running'
      expect(retried!.definitionRef).toEqual(def);
      // Clean up the running retried task to prevent async leaks
      try { service.stopTask(retried!.instanceId); } catch { /* already settled */ }
    });

    it('returns undefined for non-terminal source', () => {
      const { service } = createTestService();
      const def = sequenceTaskDef();
      const original = service.createTask(def);
      // Still in 'created' state, not terminal
      const result = service.retryTask(original.instanceId);
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-existent instance', () => {
      const { service } = createTestService();
      const result = service.retryTask('does-not-exist');
      expect(result).toBeUndefined();
    });
  });

  describe('stopAll', () => {
    it('stops all running instances', () => {
      const { service, state } = createTestService();
      const def = sequenceTaskDef();

      const inst1 = service.createTask(def);
      const inst2 = service.createTask(def);

      // Transition both to running
      state.updateInstance(inst1.instanceId, { lifecycle: 'running', startedAt: '2026-05-12T00:00:00.000Z' });
      state.updateInstance(inst2.instanceId, { lifecycle: 'running', startedAt: '2026-05-12T00:00:00.000Z' });

      const stoppedCount = service.stopAll();
      expect(stoppedCount).toBe(2);

      const snap = state.getSnapshot();
      for (const inst of snap.instances) {
        expect(inst.lifecycle).toBe('stopped');
      }
    });

    it('does not affect terminal instances', () => {
      const { service, state } = createTestService();
      const def = sequenceTaskDef();

      const inst = service.createTask(def);
      state.updateInstance(inst.instanceId, { lifecycle: 'running', startedAt: '2026-05-12T00:00:00.000Z' });
      state.updateInstance(inst.instanceId, { lifecycle: 'completed', completedAt: '2026-05-12T00:00:01.000Z' });

      const stoppedCount = service.stopAll();
      expect(stoppedCount).toBe(0);

      const snap = state.getSnapshot();
      const found = snap.instances.find((i) => i.instanceId === inst.instanceId);
      expect(found!.lifecycle).toBe('completed');
    });
  });

  describe('updateTask (G1)', () => {
    it('updates definition when lifecycle is created', () => {
      const { service } = createTestService();
      const def = sequenceTaskDef();
      const inst = service.createTask(def);

      const newDef: TaskDefinition = { ...def, name: 'Updated Name' };
      const result = service.updateTask(inst.instanceId, newDef);
      expect(result).toBeDefined();
      expect(result!.definitionRef.name).toBe('Updated Name');
    });

    it('rejects update when lifecycle is not created', () => {
      const { service, state } = createTestService();
      const def = sequenceTaskDef();
      const inst = service.createTask(def);

      state.updateInstance(inst.instanceId, { lifecycle: 'running', startedAt: '2026-05-12T00:00:00.000Z' });

      const newDef: TaskDefinition = { ...def, name: 'Updated Name' };
      const result = service.updateTask(inst.instanceId, newDef);
      expect(result).toBeUndefined();
    });

    it('rejects update for non-existent instance', () => {
      const { service } = createTestService();
      const result = service.updateTask('does-not-exist', sequenceTaskDef());
      expect(result).toBeUndefined();
    });
  });
});
