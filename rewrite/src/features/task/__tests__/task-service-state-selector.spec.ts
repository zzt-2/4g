import { describe, it, expect, beforeEach } from 'vitest';
import type { SendResult } from '@/features/send';
import type { TaskDefinition } from '../core';
import { timedTaskDef, triggerTaskDef, sequenceTaskDef, scoeModeTaskDef, errorPolicies, makeSendResult } from '../fixtures/task-fixtures';
import { createFakeSendService } from '../adapters/test-exports';
import { createFakeReceiveEventSource } from '../adapters/test-exports';
import { createTaskService, type TaskService } from '../services/task-service';
import { createTaskState, type TaskStateContainer } from '../state/task-state';
import { selectTaskSnapshot, selectTaskStatistics, selectTaskProgress, selectTaskInstance, selectTaskHistory } from '../selectors/task-selectors';

// --- Helpers ---

function makeSentResult(): SendResult {
  return makeSendResult();
}

function makeErrorResult(kind: 'transport-error' | 'timeout' | 'target-unavailable' | 'build-error' = 'transport-error'): SendResult {
  return makeSendResult({ kind }) as SendResult;
}

function createTestSetup(overrides: { definition?: TaskDefinition; sendResults?: readonly SendResult[] } = {}) {
  const fakeSend = createFakeSendService({ results: overrides.sendResults ?? [makeSentResult()] });
  const fakeReceive = createFakeReceiveEventSource();
  const service = createTaskService({
    sendService: fakeSend,
    receiveEventSource: fakeReceive,
    now: () => '2026-05-06T12:00:00.000Z',
  });
  const definition = overrides.definition ?? timedTaskDef();
  const instance = service.createTask(definition);
  return { service, fakeSend, fakeReceive, definition, instance };
}

async function settle(service: TaskService, instanceId: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inst = service.getInstance(instanceId);
    if (!inst || inst.lifecycle === 'completed' || inst.lifecycle === 'stopped' || inst.lifecycle === 'failed' || inst.lifecycle === 'paused') {
      return;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ========================================================================
// Timed task
// ========================================================================

describe('TaskService - timed scheduling', () => {
  it('executes N iterations then completes', async () => {
    const maxCount = 3;
    const def: TaskDefinition = { ...timedTaskDef(), stopCondition: { maxIterations: maxCount }, intervalMs: 10 };
    const results = Array.from({ length: maxCount * def.steps.length }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(maxCount * def.steps.length);
  });

  it('tracks iterations in step results', async () => {
    const maxCount = 2;
    const def: TaskDefinition = { ...timedTaskDef(), stopCondition: { maxIterations: maxCount }, intervalMs: 10 };
    const results = Array.from({ length: maxCount * def.steps.length }, () => makeSentResult());
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    const iterations = new Set(final!.stepResults.map((r) => r.iteration));
    expect(iterations.size).toBe(maxCount);
  });
});

// ========================================================================
// Trigger task
// ========================================================================

describe('TaskService - trigger scheduling', () => {
  it('fires on matching receive event', async () => {
    const def = triggerTaskDef();
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: [makeSentResult()],
    });

    service.startTask(instance.instanceId);

    // Allow subscription to establish
    await new Promise((r) => setTimeout(r, 10));

    // Emit matching event
    fakeReceive.emit({
      frameId: def.triggerCondition!.frameId,
      fieldId: def.triggerCondition!.fieldId,
      value: def.triggerCondition!.threshold,
    });

    await settle(service, instance.instanceId, 500);

    // Task should have executed at least one step
    expect(fakeSend.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('respects maxTriggerCount', async () => {
    const maxTriggerCount = 2;
    const def: TaskDefinition = { ...triggerTaskDef(), stopCondition: { maxIterations: maxTriggerCount }, cooldownMs: 0 };
    const results = Array.from({ length: maxTriggerCount + 2 }, () => makeSentResult());
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: results,
    });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 10));

    for (let i = 0; i < maxTriggerCount + 2; i++) {
      fakeReceive.emit({
        frameId: def.triggerCondition!.frameId,
        fieldId: def.triggerCondition!.fieldId,
        value: def.triggerCondition!.threshold,
      });
      await new Promise((r) => setTimeout(r, 20));
    }

    await settle(service, instance.instanceId, 500);

    expect(fakeSend.calls.length).toBe(maxTriggerCount * def.steps.length);
  });

  it('ignores non-matching events', async () => {
    const def = triggerTaskDef();
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: [makeSentResult()],
    });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 10));

    // Emit non-matching event
    fakeReceive.emit({
      frameId: 'frame-1',
      fieldId: 'field-1',
      value: 999, // doesn't match threshold 100
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(fakeSend.calls.length).toBe(0);

    service.stopTask(instance.instanceId);
    await settle(service, instance.instanceId, 100);
  });

  it('step failure does not reset trigger count', async () => {
    const maxTriggerCount = 3;
    const def: TaskDefinition = {
      ...triggerTaskDef(),
      stopCondition: { maxIterations: maxTriggerCount },
      cooldownMs: 0,
      errorPolicy: { onFailure: 'skip-step' },
    };
    // First call fails, rest succeed
    const results = [makeErrorResult(), ...Array.from({ length: 10 }, () => makeSentResult())];
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: results,
    });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 10));

    for (let i = 0; i < maxTriggerCount; i++) {
      fakeReceive.emit({
        frameId: def.triggerCondition!.frameId,
        fieldId: def.triggerCondition!.fieldId,
        value: def.triggerCondition!.threshold,
      });
      await new Promise((r) => setTimeout(r, 30));
    }

    await settle(service, instance.instanceId, 500);

    // Should have attempted maxTriggerCount triggers (not more)
    expect(fakeSend.calls.length).toBe(maxTriggerCount * def.steps.length);
  });
});

// ========================================================================
// Sequence task
// ========================================================================

describe('TaskService - sequence scheduling', () => {
  it('executes steps in order then completes', async () => {
    const def = sequenceTaskDef();
    const results = Array.from({ length: def.steps.length }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(2); // 2 send steps (delay step doesn't call send)
    expect(final!.stepResults.length).toBe(3); // 3 steps total
  });

  it('respects step ordering', async () => {
    const def = sequenceTaskDef();
    const results = [makeSentResult(), makeSentResult()];
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    const final = service.getInstance(instance.instanceId);
    // Steps: send(0), delay(1), send(2)
    expect(final!.stepResults[0].stepIndex).toBe(0);
    expect(final!.stepResults[0].kind).toBe('send');
    expect(final!.stepResults[1].stepIndex).toBe(1);
    expect(final!.stepResults[1].kind).toBe('delay');
    expect(final!.stepResults[2].stepIndex).toBe(2);
    expect(final!.stepResults[2].kind).toBe('send');
  });
});

// ========================================================================
// SCOE pattern
// ========================================================================

describe('TaskService - SCOE pattern', () => {
  it('send → wait-condition → send → completed', async () => {
    const def = scoeModeTaskDef();
    const results = [makeSentResult(), makeSentResult()]; // 2 send steps
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: results,
    });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 20));

    // First send step should have executed
    expect(fakeSend.calls.length).toBe(1);

    // Emit matching condition for wait-condition-step
    const waitStep = def.steps[1];
    if (waitStep.kind === 'wait-condition') {
      fakeReceive.emit({
        frameId: waitStep.waitConfig.condition.frameId,
        fieldId: waitStep.waitConfig.condition.fieldId,
        value: waitStep.waitConfig.condition.threshold,
      });
    }

    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(2); // command + ack
    expect(final!.stepResults.length).toBe(3);
    expect(final!.stepResults[0].kind).toBe('send');
    expect(final!.stepResults[1].kind).toBe('wait-condition');
    expect(final!.stepResults[1].matched).toBe(true);
    expect(final!.stepResults[2].kind).toBe('send');
  });
});

// ========================================================================
// Wait-condition timeout
// ========================================================================

describe('TaskService - wait-condition timeout', () => {
  it('onTimeout=continue continues execution', async () => {
    const def: TaskDefinition = {
      ...scoeModeTaskDef(),
      steps: [
        { id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } },
        {
          id: 's2', kind: 'wait-condition',
          waitConfig: { condition: { frameId: 'f1', fieldId: 'f1', operator: 'eq', threshold: 99 }, timeoutMs: 50, onTimeout: 'continue' },
        },
        { id: 's3', kind: 'send', sendConfig: { frameId: 'f2', fieldValues: { f: 2 } } },
      ],
    };
    const results = [makeSentResult(), makeSentResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(2);
    const waitResult = final!.stepResults.find((r) => r.kind === 'wait-condition');
    expect(waitResult).toBeDefined();
    if (waitResult?.kind === 'wait-condition') {
      expect(waitResult.matched).toBe(false);
      expect(waitResult.timedOut).toBe(true);
    }
  });

  it('onTimeout=fail triggers error policy', async () => {
    const def: TaskDefinition = {
      ...scoeModeTaskDef(),
      errorPolicy: { onFailure: 'stop' },
      steps: [
        {
          id: 's1', kind: 'wait-condition',
          waitConfig: { condition: { frameId: 'f1', fieldId: 'f1', operator: 'eq', threshold: 99 }, timeoutMs: 50, onTimeout: 'fail' },
        },
      ],
    };
    const { service, instance } = createTestSetup({ definition: def });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('stopped');
  });

  it('onTimeout=skip skips the step', async () => {
    const def: TaskDefinition = {
      ...scoeModeTaskDef(),
      steps: [
        { id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } },
        {
          id: 's2', kind: 'wait-condition',
          waitConfig: { condition: { frameId: 'f1', fieldId: 'f1', operator: 'eq', threshold: 99 }, timeoutMs: 50, onTimeout: 'skip' },
        },
        { id: 's3', kind: 'send', sendConfig: { frameId: 'f2', fieldValues: { f: 2 } } },
      ],
    };
    const results = [makeSentResult(), makeSentResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(2);
    const waitResult = final!.stepResults.find((r) => r.kind === 'wait-condition');
    expect(waitResult?.appliedPolicy).toBe('skip-step');
  });
});

// ========================================================================
// Error policy
// ========================================================================

describe('TaskService - error policies', () => {
  it('stop policy stops task on send failure', async () => {
    const def: TaskDefinition = { ...timedTaskDef(), errorPolicy: errorPolicies.stopOnFailure(), stopCondition: { maxIterations: 5 }, intervalMs: 10 };
    const { service, instance } = createTestSetup({ definition: def, sendResults: [makeErrorResult()] });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('stopped');
  });

  it('skip-step policy continues to next step', async () => {
    const def: TaskDefinition = {
      ...sequenceTaskDef(),
      errorPolicy: errorPolicies.skipStep(),
    };
    // First send fails, second succeeds
    const results = [makeErrorResult(), makeSentResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(2);
    const failedResult = final!.stepResults.find((r) => r.appliedPolicy === 'skip-step');
    expect(failedResult).toBeDefined();
  });

  it('pause policy pauses task on failure', async () => {
    const def: TaskDefinition = {
      ...timedTaskDef(),
      errorPolicy: errorPolicies.pauseOnFailure(),
      stopCondition: { maxIterations: 5 },
      intervalMs: 10,
    };
    const { service, instance } = createTestSetup({ definition: def, sendResults: [makeErrorResult()] });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('paused');
  });

  it('retry policy retries then fails on exhaustion', async () => {
    const def: TaskDefinition = {
      id: 'retry-exhaust',
      name: 'Retry Exhaust',
      schedulingMode: 'sequence',
      triggerSource: 'user-ui',
      steps: [{ id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } }],
      errorPolicy: errorPolicies.retryTwice(),
    };
    const results = Array.from({ length: 10 }, () => makeErrorResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('failed');
    // 1 original + 2 retries = 3 calls
    expect(fakeSend.calls.length).toBe(3);
  });

  it('retry policy succeeds on retry', async () => {
    const def: TaskDefinition = {
      id: 'retry-succeed',
      name: 'Retry Succeed',
      schedulingMode: 'sequence',
      triggerSource: 'user-ui',
      steps: [
        { id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } },
        { id: 's2', kind: 'send', sendConfig: { frameId: 'f2', fieldValues: { f: 2 } } },
      ],
      errorPolicy: { onFailure: 'retry', retryCount: 2, retryDelayMs: 10 },
    };
    // First call fails, second succeeds, third succeeds
    const results = [makeErrorResult(), makeSentResult(), makeSentResult()];
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
  });
});

// ========================================================================
// Pause / Resume
// ========================================================================

describe('TaskService - pause/resume', () => {
  it('pause preserves progress', async () => {
    // Sequence with 3 steps, pause after first send
    const def: TaskDefinition = {
      id: 'pause-test',
      name: 'Pause Test',
      schedulingMode: 'sequence',
      triggerSource: 'user-ui',
      steps: [
        { id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } },
        { id: 's2', kind: 'delay', delayConfig: { durationMs: 500 } },
        { id: 's3', kind: 'send', sendConfig: { frameId: 'f2', fieldValues: { f: 2 } } },
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    const results = [makeSentResult(), makeSentResult()];
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);

    // Poll until at least 1 step result exists and task is still running
    await new Promise<void>((resolve) => {
      const check = () => {
        const inst = service.getInstance(instance.instanceId);
        if (inst && inst.stepResults.length >= 1 && inst.lifecycle === 'running') {
          resolve();
        } else {
          setTimeout(check, 5);
        }
      };
      setTimeout(check, 5);
    });

    service.pauseTask(instance.instanceId);

    const paused = service.getInstance(instance.instanceId);
    expect(paused?.lifecycle).toBe('paused');
    // Should have at least 1 step result
    expect(paused!.stepResults.length).toBeGreaterThanOrEqual(1);

    service.stopTask(instance.instanceId);
    await settle(service, instance.instanceId, 100);
  });

  it('resume continues execution from paused point', async () => {
    // Sequence: send(1) → delay(500ms) → send(2)
    // Plan: start, let first send complete, pause during delay, then resume
    const def: TaskDefinition = {
      id: 'pause-resume-test',
      name: 'Pause Resume Test',
      schedulingMode: 'sequence',
      triggerSource: 'user-ui',
      steps: [
        { id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } },
        { id: 's2', kind: 'delay', delayConfig: { durationMs: 500 } },
        { id: 's3', kind: 'send', sendConfig: { frameId: 'f2', fieldValues: { f: 2 } } },
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    const results = [makeSentResult(), makeSentResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    // Wait for first send step to complete (delay step hasn't finished yet)
    await new Promise((r) => setTimeout(r, 30));

    const midExec = service.getInstance(instance.instanceId);
    // Pause during the delay step
    if (midExec?.lifecycle === 'running') {
      service.pauseTask(instance.instanceId);
    }

    const paused = service.getInstance(instance.instanceId);
    expect(paused?.lifecycle).toBe('paused');
    // Should have 1 step result (first send completed)
    expect(paused!.stepResults.length).toBeGreaterThanOrEqual(1);

    // Now resume — small delay ensures the old execution loop has fully settled
    await new Promise((r) => setTimeout(r, 50));
    service.resumeTask(instance.instanceId);
    await settle(service, instance.instanceId, 1500);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    // Both sends should have been executed (1 before pause + 1 after resume)
    expect(fakeSend.calls.length).toBe(2);
    // All 3 steps should have results
    expect(final!.stepResults.length).toBe(3);
  });
});

// ========================================================================
// Stop
// ========================================================================

describe('TaskService - stop', () => {
  it('stop results in lifecycle=stopped (not completed)', async () => {
    const def: TaskDefinition = { ...timedTaskDef(), intervalMs: 100, stopCondition: { maxIterations: 100 } };
    const results = Array.from({ length: 200 }, () => makeSentResult());
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 50));

    service.stopTask(instance.instanceId);
    await settle(service, instance.instanceId, 200);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('stopped');
    expect(final?.lifecycle).not.toBe('completed');
  });
});

// ========================================================================
// State / Selectors
// ========================================================================

describe('Task state and selectors', () => {
  let state: TaskStateContainer;

  beforeEach(() => {
    state = createTaskState();
  });

  it('createInstance adds to instances', () => {
    const def = timedTaskDef();
    const inst = state.createInstance('inst-1', def);
    expect(inst.instanceId).toBe('inst-1');
    expect(inst.lifecycle).toBe('created');

    const snapshot = state.getSnapshot();
    expect(snapshot.instances.length).toBe(1);
    expect(snapshot.instances[0].instanceId).toBe('inst-1');
  });

  it('updateInstance modifies lifecycle', () => {
    state.createInstance('inst-1', timedTaskDef());
    const updated = state.updateInstance('inst-1', { lifecycle: 'running', startedAt: '2026-05-06T12:00:00.000Z' });
    expect(updated?.lifecycle).toBe('running');
    expect(updated?.startedAt).toBe('2026-05-06T12:00:00.000Z');
  });

  it('addStepResult appends and bounds history', () => {
    state.createInstance('inst-1', timedTaskDef());
    for (let i = 0; i < 150; i++) {
      state.addStepResult('inst-1', {
        kind: 'send',
        stepIndex: 0,
        iteration: i,
        sendResult: makeSentResult(),
      });
    }
    const inst = state.getInstance('inst-1')!;
    // Should keep only results from iterations >= 50 (150 - 100 + 1)
    const minIter = Math.max(0, 149 - 100 + 1);
    expect(inst.stepResults.length).toBe(149 - minIter + 1);
    expect(inst.stepResults.every((r) => r.iteration >= minIter)).toBe(true);
  });

  it('moveToHistory moves terminal instances', () => {
    state.createInstance('inst-1', timedTaskDef());
    state.updateInstance('inst-1', { lifecycle: 'completed', completedAt: '2026-05-06T12:00:00.000Z' });
    state.moveToHistory('inst-1');

    const snapshot = state.getSnapshot();
    expect(snapshot.instances.length).toBe(0);
    expect(snapshot.history.length).toBe(1);
    expect(snapshot.history[0].instanceId).toBe('inst-1');
  });

  it('removeInstance removes from state', () => {
    state.createInstance('inst-1', timedTaskDef());
    state.removeInstance('inst-1');
    expect(state.getInstance('inst-1')).toBeUndefined();
  });

  it('getSnapshot returns independent clones', () => {
    state.createInstance('inst-1', timedTaskDef());
    const s1 = state.getSnapshot();
    const s2 = state.getSnapshot();
    expect(s1).toEqual(s2);
    expect(s1.instances).not.toBe(s2.instances);
  });

  it('statistics update correctly', () => {
    const def = timedTaskDef();
    state.createInstance('inst-1', def);
    expect(state.getSnapshot().statistics.totalCreated).toBe(1);

    state.updateInstance('inst-1', { lifecycle: 'running', startedAt: '2026-05-06T12:00:00.000Z' });
    state.updateInstance('inst-1', { lifecycle: 'completed', completedAt: '2026-05-06T12:00:01.000Z' });
    expect(state.getSnapshot().statistics.totalCompleted).toBe(1);

    state.createInstance('inst-2', def);
    state.updateInstance('inst-2', { lifecycle: 'running', startedAt: '2026-05-06T12:00:00.000Z' });
    state.updateInstance('inst-2', { lifecycle: 'stopped', stoppedAt: '2026-05-06T12:00:01.000Z' });
    expect(state.getSnapshot().statistics.totalStopped).toBe(1);
  });

  it('step statistics track succeeded/failed/skipped', () => {
    state.createInstance('inst-1', timedTaskDef());
    state.addStepResult('inst-1', { kind: 'send', stepIndex: 0, iteration: 0, sendResult: makeSentResult() });
    expect(state.getSnapshot().statistics.totalStepsSucceeded).toBe(1);

    state.addStepResult('inst-1', { kind: 'send', stepIndex: 1, iteration: 0, sendResult: makeErrorResult(), appliedPolicy: 'skip-step' });
    expect(state.getSnapshot().statistics.totalStepsSkipped).toBe(1);

    state.addStepResult('inst-1', { kind: 'send', stepIndex: 2, iteration: 0, sendResult: makeErrorResult() });
    expect(state.getSnapshot().statistics.totalStepsFailed).toBe(1);
  });

  it('resetStats clears statistics', () => {
    state.createInstance('inst-1', timedTaskDef());
    state.updateInstance('inst-1', { lifecycle: 'completed', completedAt: '2026-05-06T12:00:00.000Z' });
    expect(state.getSnapshot().statistics.totalCreated).toBe(1);

    state.resetStats();
    expect(state.getSnapshot().statistics.totalCreated).toBe(0);
  });
});

// ========================================================================
// Selectors
// ========================================================================

describe('Task selectors', () => {
  it('selectTaskInstance returns undefined for unknown id', () => {
    const state = createTaskState();
    const snap = state.getSnapshot();
    expect(selectTaskInstance(snap, 'unknown')).toBeUndefined();
  });

  it('selectTaskProgress calculates from instance', () => {
    const state = createTaskState();
    const def = sequenceTaskDef();
    state.createInstance('inst-1', def);
    state.updateInstance('inst-1', { lifecycle: 'running', startedAt: '2026-05-06T12:00:00.000Z' });
    state.addStepResult('inst-1', { kind: 'send', stepIndex: 0, iteration: 0, sendResult: makeSentResult() });

    const snap = state.getSnapshot();
    const progress = selectTaskProgress(snap, 'inst-1');
    expect(progress).toBeDefined();
    expect(progress!.stepsTotal).toBe(def.steps.length);
    expect(progress!.stepsCompleted).toBe(1);
    expect(progress!.iterationsTotal).toBe(1);
  });

  it('selectTaskSnapshot returns immutable copy', () => {
    const state = createTaskState();
    state.createInstance('inst-1', timedTaskDef());
    const snap = state.getSnapshot();
    const s1 = selectTaskSnapshot(snap);
    const s2 = selectTaskSnapshot(snap);
    expect(s1).toEqual(s2);
    expect(s1.instances).not.toBe(s2.instances);
    expect(s1.statistics).not.toBe(s2.statistics);
  });

  it('selectTaskStatistics returns stats copy', () => {
    const state = createTaskState();
    state.createInstance('inst-1', timedTaskDef());
    const snap = state.getSnapshot();
    const s1 = selectTaskStatistics(snap);
    const s2 = selectTaskStatistics(snap);
    expect(s1).toEqual(s2);
    expect(s1).not.toBe(s2);
  });

  it('selectTaskHistory returns history', () => {
    const state = createTaskState();
    state.createInstance('inst-1', timedTaskDef());
    state.updateInstance('inst-1', { lifecycle: 'completed', completedAt: '2026-05-06T12:00:00.000Z' });
    state.moveToHistory('inst-1');

    const snap = state.getSnapshot();
    const history = selectTaskHistory(snap);
    expect(history.length).toBe(1);
    expect(history[0].instanceId).toBe('inst-1');
  });
});

// ========================================================================
// Service-level state/selector integration
// ========================================================================

describe('TaskService - state and selector integration', () => {
  it('getSnapshot reflects created tasks', () => {
    const { service } = createTestSetup();
    const snap = service.getSnapshot();
    expect(snap.instances.length).toBe(1);
  });

  it('getStatistics tracks task lifecycle', async () => {
    const def: TaskDefinition = { ...sequenceTaskDef(), steps: [{ id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } }] };
    const { service, instance } = createTestSetup({ definition: def, sendResults: [makeSentResult()] });

    expect(service.getStatistics().totalCreated).toBe(1);

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    expect(service.getStatistics().totalCompleted).toBe(1);
    expect(service.getStatistics().totalStepsExecuted).toBe(1);
    expect(service.getStatistics().totalStepsSucceeded).toBe(1);
  });

  it('getProgress returns progress snapshot', async () => {
    const def: TaskDefinition = { ...sequenceTaskDef(), steps: [{ id: 's1', kind: 'send', sendConfig: { frameId: 'f1', fieldValues: { f: 1 } } }] };
    const { service, instance } = createTestSetup({ definition: def, sendResults: [makeSentResult()] });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    const progress = service.getProgress(instance.instanceId);
    expect(progress).toBeDefined();
    expect(progress!.stepsTotal).toBe(1);
    expect(progress!.stepsCompleted).toBe(1);
  });

  it('createTask generates unique instance IDs', () => {
    const { service } = createTestSetup();
    service.createTask(timedTaskDef());
    service.createTask(timedTaskDef());
    const ids = service.getSnapshot().instances.map((i) => i.instanceId);
    expect(new Set(ids).size).toBe(3);
  });
});
