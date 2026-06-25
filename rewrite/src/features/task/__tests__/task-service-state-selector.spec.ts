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
    const def: TaskDefinition = { ...timedTaskDef(), stopCondition: { maxIterations: maxCount }, schedule: { kind: 'timer', intervalMs: 10 } };
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
    const def: TaskDefinition = { ...timedTaskDef(), stopCondition: { maxIterations: maxCount }, schedule: { kind: 'timer', intervalMs: 10 } };
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
    const cond = (def.schedule as { kind: 'event'; conditions: readonly { frameId: string; fieldId: string; threshold: number | string }[] }).conditions[0]!;
    fakeReceive.emit({
      frameId: cond.frameId,
      fieldValues: { [cond.fieldId]: cond.threshold as number | string },
    });

    await settle(service, instance.instanceId, 500);

    // Task should have executed at least one step
    expect(fakeSend.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('respects maxTriggerCount', async () => {
    const maxTriggerCount = 2;
    const def: TaskDefinition = {
      ...triggerTaskDef(),
      stopCondition: { maxIterations: maxTriggerCount },
      schedule: { kind: 'event', conditions: [{ frameId: 'frame-1', fieldId: 'field-1', operator: 'eq', threshold: 100 }], cooldownMs: 0 },
    };
    const results = Array.from({ length: maxTriggerCount + 2 }, () => makeSentResult());
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: results,
    });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 10));

    const cond = { frameId: 'frame-1', fieldId: 'field-1', operator: 'eq' as const, threshold: 100 };
    for (let i = 0; i < maxTriggerCount + 2; i++) {
      fakeReceive.emit({
        frameId: cond.frameId,
        fieldValues: { [cond.fieldId]: cond.threshold as number | string },
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
      fieldValues: { 'field-1': 999 }, // doesn't match threshold 100
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
      schedule: { kind: 'event', conditions: [{ frameId: 'frame-1', fieldId: 'field-1', operator: 'eq', threshold: 100 }], cooldownMs: 0 },
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

    const cond = { frameId: 'frame-1', fieldId: 'field-1', operator: 'eq' as const, threshold: 100 };
    for (let i = 0; i < maxTriggerCount; i++) {
      fakeReceive.emit({
        frameId: cond.frameId,
        fieldValues: { [cond.fieldId]: cond.threshold as number | string },
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
    expect(final!.stepResults[0]!.stepIndex).toBe(0);
    expect(final!.stepResults[0]!.kind).toBe('send');
    expect(final!.stepResults[1]!.stepIndex).toBe(1);
    expect(final!.stepResults[1]!.kind).toBe('delay');
    expect(final!.stepResults[2]!.stepIndex).toBe(2);
    expect(final!.stepResults[2]!.kind).toBe('send');
  });
});

// ========================================================================
// SCOE pattern
// ========================================================================

describe('TaskService - SCOE pattern', () => {
  it('send -> wait-condition -> send -> completed', async () => {
    const def = scoeModeTaskDef();
    const results = [makeSentResult(), makeSentResult()]; // 2 send steps
    const { service, fakeReceive, fakeSend, instance } = createTestSetup({
      definition: def,
      sendResults: results,
    });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 50));

    // First send step should have executed
    expect(fakeSend.calls.length).toBe(1);

    // Emit matching condition for wait-condition-step
    const waitStep = def.steps[1];
    if (waitStep.kind === 'wait-condition') {
      const cond = waitStep.config.conditions[0]!;
      fakeReceive.emit({
        frameId: cond.frameId,
        fieldValues: { [cond.fieldId]: cond.threshold as number | string },
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
        { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } },
        {
          id: 's2', kind: 'wait-condition',
          config: { conditions: [{ frameId: 'f1', fieldId: 'f1', operator: 'eq', threshold: 99 }], timeoutMs: 50, onTimeout: 'continue' },
        },
        { id: 's3', kind: 'send', config: { frameId: 'f2', targetId: 'target-1', userFieldValues: { f: 2 } } },
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
          config: { conditions: [{ frameId: 'f1', fieldId: 'f1', operator: 'eq', threshold: 99 }], timeoutMs: 50, onTimeout: 'fail' },
        },
      ],
    };
    const { service, instance } = createTestSetup({ definition: def });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    // S014: errorPolicy 'stop' 分支现在走 'fail' 终态(=failed), 与手动 stopTask(=stopped)区分
    expect(final?.lifecycle).toBe('failed');
  });

  it('onTimeout=skip skips the step', async () => {
    const def: TaskDefinition = {
      ...scoeModeTaskDef(),
      steps: [
        { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } },
        {
          id: 's2', kind: 'wait-condition',
          config: { conditions: [{ frameId: 'f1', fieldId: 'f1', operator: 'eq', threshold: 99 }], timeoutMs: 50, onTimeout: 'skip' },
        },
        { id: 's3', kind: 'send', config: { frameId: 'f2', targetId: 'target-1', userFieldValues: { f: 2 } } },
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
    const def: TaskDefinition = { ...timedTaskDef(), errorPolicy: errorPolicies.stopOnFailure(), stopCondition: { maxIterations: 5 }, schedule: { kind: 'timer', intervalMs: 10 } };
    const { service, instance } = createTestSetup({ definition: def, sendResults: [makeErrorResult()] });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 500);

    const final = service.getInstance(instance.instanceId);
    // S014: errorPolicy 'stop' 分支现在走 'fail' 终态(=failed), 与手动 stopTask(=stopped)区分
    expect(final?.lifecycle).toBe('failed');
  });

  it('skip-step policy continues to next step', async () => {
    const def: TaskDefinition = {
      id: 'skip-step-test',
      name: 'Skip Step Test',
      schedule: { kind: 'immediate' },
      steps: [
        { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: {} } },
        { id: 's2', kind: 'send', config: { frameId: 'f2', targetId: 'target-1', userFieldValues: {} } },
      ],
      errorPolicy: errorPolicies.skipStep(),
    };
    // First send fails, second succeeds
    const results = [makeErrorResult(), makeSentResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

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
      schedule: { kind: 'timer', intervalMs: 10 },
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
      schedule: { kind: 'immediate' },
      steps: [{ id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } }],
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
      schedule: { kind: 'immediate' },
      steps: [
        { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } },
        { id: 's2', kind: 'send', config: { frameId: 'f2', targetId: 'target-1', userFieldValues: { f: 2 } } },
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
      schedule: { kind: 'immediate' },
      steps: [
        { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } },
        { id: 's2', kind: 'delay', config: { durationMs: 100 } },
        { id: 's3', kind: 'send', config: { frameId: 'f2', targetId: 'target-1', userFieldValues: { f: 2 } } },
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
    // Sequence: send(1) -> delay(100ms) -> send(2)
    // Plan: start, let first send complete, pause during delay, then resume
    const def: TaskDefinition = {
      id: 'pause-resume-test',
      name: 'Pause Resume Test',
      schedule: { kind: 'immediate' },
      steps: [
        { id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } },
        { id: 's2', kind: 'delay', config: { durationMs: 100 } },
        { id: 's3', kind: 'send', config: { frameId: 'f2', targetId: 'target-1', userFieldValues: { f: 2 } } },
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    const results = [makeSentResult(), makeSentResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    // Wait for first send step to complete (delay step hasn't finished yet)
    await new Promise((r) => setTimeout(r, 20));

    const midExec = service.getInstance(instance.instanceId);
    // Pause during the delay step
    if (midExec?.lifecycle === 'running') {
      service.pauseTask(instance.instanceId);
    }

    const paused = service.getInstance(instance.instanceId);
    expect(paused?.lifecycle).toBe('paused');
    // Should have 1 step result (first send completed)
    expect(paused!.stepResults.length).toBeGreaterThanOrEqual(1);

    // Now resume -- small delay ensures the old execution loop has fully settled
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
    const def: TaskDefinition = { ...timedTaskDef(), schedule: { kind: 'timer', intervalMs: 100 }, stopCondition: { maxIterations: 100 } };
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
    const def: TaskDefinition = { ...sequenceTaskDef(), steps: [{ id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } }] };
    const { service, instance } = createTestSetup({ definition: def, sendResults: [makeSentResult()] });

    expect(service.getStatistics().totalCreated).toBe(1);

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId);

    expect(service.getStatistics().totalCompleted).toBe(1);
    expect(service.getStatistics().totalStepsExecuted).toBe(1);
    expect(service.getStatistics().totalStepsSucceeded).toBe(1);
  });

  it('getProgress returns progress snapshot', async () => {
    const def: TaskDefinition = { ...sequenceTaskDef(), steps: [{ id: 's1', kind: 'send', config: { frameId: 'f1', targetId: 'target-1', userFieldValues: { f: 1 } } }] };
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

// ========================================================================
// Step repeat
// ========================================================================

describe('TaskService - step repeat', () => {
  it('repeats send step up to maxCount', async () => {
    const def: TaskDefinition = {
      id: 'repeat-max',
      name: 'Repeat Max',
      schedule: { kind: 'immediate' },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          repeat: { maxCount: 3, intervalMs: 10 },
        },
      }],
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 5 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(3);
  });

  it('repeats until condition is met', async () => {
    let fieldValueCounter = 0;
    const fakeSendSvc = createFakeSendService({ results: Array.from({ length: 15 }, () => makeSentResult()) });
    const def: TaskDefinition = {
      id: 'repeat-until',
      name: 'Repeat Until',
      schedule: { kind: 'immediate' },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          repeat: {
            intervalMs: 10,
            maxCount: 10,
            until: [{ frameId: 'f1', fieldId: 'counter', operator: 'gte', threshold: 3 }],
          },
        },
      }],
      errorPolicy: { onFailure: 'stop' },
    };

    const svc = createTaskService({
      sendService: fakeSendSvc,
      receiveEventSource: createFakeReceiveEventSource(),
      fieldValueProvider: () => ({ counter: ++fieldValueCounter }),
      now: () => '2026-05-06T12:00:00.000Z',
    });
    const inst = svc.createTask(def);
    svc.startTask(inst.instanceId);
    await settle(svc, inst.instanceId, 2000);

    const final = svc.getInstance(inst.instanceId);
    expect(final?.lifecycle).toBe('completed');
    // Should stop repeating when counter >= 3 (after ~3 sends)
    expect(fakeSendSvc.calls.length).toBeGreaterThanOrEqual(3);
    expect(fakeSendSvc.calls.length).toBeLessThan(10);
  });

  it('repeat stops when send fails and breaks iteration', async () => {
    const def: TaskDefinition = {
      id: 'repeat-fail',
      name: 'Repeat Fail',
      schedule: { kind: 'immediate' },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          repeat: { maxCount: 5, intervalMs: 10 },
        },
      }],
      errorPolicy: { onFailure: 'stop' },
    };
    // First succeeds, second fails
    const results = [makeSentResult(), makeErrorResult()];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    // Repeat send failure breaks the iteration loop; task completes (repeat doesn't trigger error policy)
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(2);
  });

  it('repeat with infinite maxCount (no maxCount)', async () => {
    let callCount = 0;
    const fakeSendSvc = createFakeSendService({
      results: Array.from({ length: 50 }, () => makeSentResult()),
    });
    const def: TaskDefinition = {
      id: 'repeat-infinite',
      name: 'Repeat Infinite',
      schedule: { kind: 'immediate' },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          repeat: { intervalMs: 5, until: [{ frameId: 'f1', fieldId: 'x', operator: 'eq', threshold: 1 }] },
        },
      }],
      errorPolicy: { onFailure: 'stop' },
    };
    const svc = createTaskService({
      sendService: fakeSendSvc,
      receiveEventSource: createFakeReceiveEventSource(),
      fieldValueProvider: () => {
        callCount++;
        return callCount >= 4 ? { x: 1 } : { x: 0 };
      },
      now: () => '2026-05-06T12:00:00.000Z',
    });
    const inst = svc.createTask(def);
    svc.startTask(inst.instanceId);
    await settle(svc, inst.instanceId, 2000);

    const final = svc.getInstance(inst.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSendSvc.calls.length).toBeGreaterThanOrEqual(4);
  });
});

// ========================================================================
// step 级 fieldVariations(离散值列表)+ accumulation 自动 writeback
// ========================================================================

describe('TaskService - step-level fieldVariations + accumulation auto-writeback', () => {
  it('fieldVariations: injects values by step-internal counter (cross-iteration persistent)', async () => {
    // counter 跨 iteration 持久,每次发送取下一个值。
    // timer schedule,maxIterations=3,repeat.maxCount=1(每 iteration 发 1 次),
    // counter 在 step 内累积:iter0 counter=1→CMD_A,iter1 counter=2→CMD_B,iter2 counter=3→CMD_C。
    const def: TaskDefinition = {
      id: 'fv-timed',
      name: 'FieldVariation Timed',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          userFieldValues: { cmd: 'BASE' },
          fieldVariations: [{ fieldId: 'cmd', values: ['CMD_A', 'CMD_B', 'CMD_C'] }],
          repeat: { intervalMs: 10, maxCount: 1 },
        },
      }],
      stopCondition: { maxIterations: 3 },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 5 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    expect(fakeSend.calls.length).toBe(3);
    expect(fakeSend.calls[0]!.request.userFieldValues).toEqual({ cmd: 'CMD_A' });
    expect(fakeSend.calls[1]!.request.userFieldValues).toEqual({ cmd: 'CMD_B' });
    expect(fakeSend.calls[2]!.request.userFieldValues).toEqual({ cmd: 'CMD_C' });
  });

  it('fieldVariations: clamps to last value when counter exceeds length', async () => {
    // counter 超过 values.length 时保留最后一个值(不停止、不报错)。
    const def: TaskDefinition = {
      id: 'fv-clamp',
      name: 'FieldVariation Clamp',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          fieldVariations: [{ fieldId: 'cmd', values: ['CMD_A', 'CMD_B'] }],
          repeat: { intervalMs: 10, maxCount: 1 },
        },
      }],
      stopCondition: { maxIterations: 5 },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 8 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    expect(fakeSend.calls.length).toBe(5);
    expect(fakeSend.calls[0]!.request.userFieldValues).toEqual({ cmd: 'CMD_A' });
    expect(fakeSend.calls[1]!.request.userFieldValues).toEqual({ cmd: 'CMD_B' });
    expect(fakeSend.calls[2]!.request.userFieldValues).toEqual({ cmd: 'CMD_B' });
    expect(fakeSend.calls[3]!.request.userFieldValues).toEqual({ cmd: 'CMD_B' });
    expect(fakeSend.calls[4]!.request.userFieldValues).toEqual({ cmd: 'CMD_B' });
  });

  it('fieldVariations: preserves base values for non-varied fields', async () => {
    const def: TaskDefinition = {
      id: 'fv-preserve',
      name: 'FieldVariation Preserve',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          userFieldValues: { fixed: 99 },
          fieldVariations: [{ fieldId: 'varied', values: [10, 20] }],
          repeat: { intervalMs: 10, maxCount: 1 },
        },
      }],
      stopCondition: { maxIterations: 2 },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 5 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    expect(fakeSend.calls[0]!.request.userFieldValues).toEqual({ fixed: 99, varied: 10 });
    expect(fakeSend.calls[1]!.request.userFieldValues).toEqual({ fixed: 99, varied: 20 });
  });

  it('stopCondition.maxIterations is respected (no auto-derive from variations)', async () => {
    // 修复 maxIterations 静默覆盖 bug:fieldVariations 不自动推导 maxIterations,
    // 用户设的 stopCondition.maxIterations 被尊重。
    const def: TaskDefinition = {
      id: 'fv-stop',
      name: 'FieldVariation StopCondition',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          fieldVariations: [{ fieldId: 'v', values: [1, 2, 3] }],
          repeat: { intervalMs: 10, maxCount: 1 },
        },
      }],
      stopCondition: { maxIterations: 2 },  // 只迭代 2 次,即使 values 有 3 个
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 5 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    expect(fakeSend.calls.length).toBe(2);
  });

  it('accumulation auto-writeback: 帧有自引用表达式时 task 自动累积(无需声明 resolver)', async () => {
    // accumulation 不再是用户声明的 resolver——只要帧侧返回 resolvedFieldValues,
    // task 自动 writeback 到 stepContext.lastValues,下次合进 userFieldValues 喂帧侧 seed。
    // 这里 mock sendResult 带 resolvedFieldValues 模拟帧侧递推结果(真实递推见 e2e 测试)。
    const def: TaskDefinition = {
      id: 'acc-auto',
      name: 'Accumulation Auto',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          // 无 fieldResolvers/fieldVariations——accumulation 是 task 自动行为
          repeat: { intervalMs: 10, maxCount: 1 },
        },
      }],
      stopCondition: { maxIterations: 3 },
      errorPolicy: { onFailure: 'stop' },
    };
    // mock:每次发送返回 resolvedFieldValues.speed 递增(模拟帧侧 速度+步进 累加)
    const accResults = [
      { ...makeSentResult(), resolvedFieldValues: { speed: 1 } },
      { ...makeSentResult(), resolvedFieldValues: { speed: 2 } },
      { ...makeSentResult(), resolvedFieldValues: { speed: 3 } },
    ];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: accResults });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    expect(fakeSend.calls.length).toBe(3);
    // iter0(counter=1):lastValues 空 → userFieldValues 空(帧侧 Phase2 用 defaultValue 种子)
    expect(fakeSend.calls[0]!.request.userFieldValues).toEqual({});
    // iter1(counter=2):writeback 把 speed=1 合进 baseValues → 帧侧 seed=1
    expect(fakeSend.calls[1]!.request.userFieldValues).toEqual({ speed: 1 });
    // iter2(counter=3):writeback 把 speed=2 合进 → 帧侧 seed=2
    expect(fakeSend.calls[2]!.request.userFieldValues).toEqual({ speed: 2 });
  });

  // ===== 用户拍板的核心验收场景 =====

  it('USER CASE: variation counter 跨 iteration 全局递增 (maxCount=5+iter=3=15次)', async () => {
    // 用户原话数值驱动举例:maxCount=5 + iter=3 → 3 轮×5 次=15 次,counter 1-15 全局递增,刚好发完
    const fifteen = Array.from({ length: 15 }, (_, i) => i + 1);
    const def: TaskDefinition = {
      id: 'fv-user-15',
      name: 'User 15 values',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          fieldVariations: [{ fieldId: 'v', values: fifteen }],
          repeat: { intervalMs: 10, maxCount: 5 },  // 每 iteration 发 5 次
        },
      }],
      stopCondition: { maxIterations: 3 },  // 3 轮
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 20 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    // 3 iteration × 5 次 = 15 次,counter 1-15 全局递增,刚好发完 15 个值
    expect(fakeSend.calls.length).toBe(15);
    for (let i = 0; i < 15; i++) {
      expect(fakeSend.calls[i]!.request.userFieldValues).toEqual({ v: i + 1 });
    }
  });

  it('USER CASE: variation clamp when maxCount > values length (maxCount=20>15)', async () => {
    // 用户场景:重复改 20(>15)→ 发完 15 次后,剩 5 次重复用第 15 个值(clamp)
    const fifteen = Array.from({ length: 15 }, (_, i) => i + 1);
    const def: TaskDefinition = {
      id: 'fv-user-clamp20',
      name: 'User maxCount=20 > 15',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: {
          frameId: 'f1', targetId: 't1',
          fieldVariations: [{ fieldId: 'v', values: fifteen }],
          repeat: { intervalMs: 10, maxCount: 20 },
        },
      }],
      stopCondition: { maxIterations: 1 },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 25 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    expect(fakeSend.calls.length).toBe(20);
    for (let i = 0; i < 15; i++) {
      expect(fakeSend.calls[i]!.request.userFieldValues).toEqual({ v: i + 1 });
    }
    // 后 5 次(counter 16-20)clamp 到 values[14] = 15
    for (let i = 15; i < 20; i++) {
      expect(fakeSend.calls[i]!.request.userFieldValues).toEqual({ v: 15 });
    }
  });

  it('USER CASE: accumulation step-boundary reset (a-b-a, 自动 writeback, 无需声明)', async () => {
    // 用户原话核心场景:任务发 a-b-a,各重复5次,每次加1 →
    //   第一个 a:counter 1-5 递推 0→1→2→3→4
    //   第二个 a:counter 1-5 重新从 0 开始(重置!不接第一个 a 的 4)
    // 验证:writeback 的 lastValues 是 step 级临时,step 边界(step 切换)重置。
    // accumulation 自动行为——a1/a2 都不声明 resolver,只配 repeat。
    const makeAccStep = (id: string) => ({
      id, kind: 'send' as const,
      config: {
        frameId: 'f1', targetId: 't1',
        repeat: { intervalMs: 10, maxCount: 5 },
      },
    });
    const def: TaskDefinition = {
      id: 'acc-aba',
      name: 'A-B-A accumulation reset',
      schedule: { kind: 'immediate' },
      steps: [
        makeAccStep('a1'),
        { id: 'b', kind: 'send' as const, config: { frameId: 'f1', targetId: 't1' } },
        makeAccStep('a2'),
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    // mock:每个 accumulation step 独立递推(step 边界重置)。
    // a1 发送空 → 返回 speed=1;发送 speed=1 → 返回 2;...;发送 4 → 返回 5。
    // b 单发(无 resolvedFieldValues)。
    // a2(新 step,独立递推)发送空 → 返回 1;...
    const accResult = (speed: number) => ({ ...makeSentResult(), resolvedFieldValues: { speed } });
    const accResults = [
      // a1 的 5 次:帧侧递推结果 1,2,3,4,5
      accResult(1), accResult(2), accResult(3), accResult(4), accResult(5),
      // b 单发(无 resolvedFieldValues)
      makeSentResult(),
      // a2 的 5 次:独立递推结果 1,2,3,4,5(不接 a1 的 5)
      accResult(1), accResult(2), accResult(3), accResult(4), accResult(5),
    ];
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: accResults });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    // 发送顺序:a1×5, b×1, a2×5 = 11 次
    expect(fakeSend.calls.length).toBe(11);
    // a1(counter 1-5):首次空 seed → writeback 1/2/3/4 喂回
    const a1Speeds = fakeSend.calls.slice(0, 5).map((c) => (c.request.userFieldValues as { speed?: number }).speed);
    expect(a1Speeds).toEqual([undefined, 1, 2, 3, 4]);
    // b:单发,无 speed
    // a2(新 step,lastValues 空):首次空 seed → writeback 1/2/3/4 喂回
    const a2Speeds = fakeSend.calls.slice(6, 11).map((c) => (c.request.userFieldValues as { speed?: number }).speed);
    expect(a2Speeds).toEqual([undefined, 1, 2, 3, 4]);
  });
});

// ========================================================================
// exitCondition
// ========================================================================

describe('TaskService - exitCondition', () => {
  it('stops task when exitCondition is met', async () => {
    let fieldValueCounter = 0;
    const def: TaskDefinition = {
      id: 'exit-cond',
      name: 'Exit Condition',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: { frameId: 'f1', targetId: 't1' },
      }],
      stopCondition: {
        maxIterations: 100,
        exitCondition: [{ frameId: 'f1', fieldId: 'done', operator: 'eq', threshold: 1 }],
      },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 100 }, () => makeSentResult());
    const svc = createTaskService({
      sendService: createFakeSendService({ results }),
      receiveEventSource: createFakeReceiveEventSource(),
      fieldValueProvider: () => {
        fieldValueCounter++;
        return fieldValueCounter >= 3 ? { done: 1 } : { done: 0 };
      },
      now: () => '2026-05-06T12:00:00.000Z',
    });
    const inst = svc.createTask(def);
    svc.startTask(inst.instanceId);
    await settle(svc, inst.instanceId, 2000);

    const final = svc.getInstance(inst.instanceId);
    expect(final?.lifecycle).toBe('completed');
    // Should have stopped early (around iteration 3), not 100
    expect(fieldValueCounter).toBeGreaterThanOrEqual(3);
    expect(fieldValueCounter).toBeLessThan(50);
  });

  it('ignores exitCondition when no fieldValueProvider', async () => {
    const def: TaskDefinition = {
      id: 'exit-no-provider',
      name: 'Exit No Provider',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: { frameId: 'f1', targetId: 't1' },
      }],
      stopCondition: {
        maxIterations: 3,
        exitCondition: [{ frameId: 'f1', fieldId: 'x', operator: 'eq', threshold: 1 }],
      },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 10 }, () => makeSentResult());
    const { service, fakeSend, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await settle(service, instance.instanceId, 2000);

    const final = service.getInstance(instance.instanceId);
    expect(final?.lifecycle).toBe('completed');
    // Without fieldValueProvider, exitCondition can't fire, runs all 3 iterations
    expect(fakeSend.calls.length).toBe(3);
  });

  it('exitCondition with maxDurationMs still works', async () => {
    let counter = 0;
    const def: TaskDefinition = {
      id: 'exit-duration',
      name: 'Exit Duration',
      schedule: { kind: 'timer', intervalMs: 10 },
      steps: [{
        id: 's1', kind: 'send',
        config: { frameId: 'f1', targetId: 't1' },
      }],
      stopCondition: {
        maxDurationMs: 5000,
        exitCondition: [{ frameId: 'f1', fieldId: 'flag', operator: 'eq', threshold: 'stop' }],
      },
      errorPolicy: { onFailure: 'stop' },
    };
    const results = Array.from({ length: 100 }, () => makeSentResult());
    const svc = createTaskService({
      sendService: createFakeSendService({ results }),
      receiveEventSource: createFakeReceiveEventSource(),
      fieldValueProvider: () => {
        counter++;
        return counter >= 2 ? { flag: 'stop' } : { flag: 'go' };
      },
      now: () => '2026-05-06T12:00:00.000Z',
    });
    const inst = svc.createTask(def);
    svc.startTask(inst.instanceId);
    await settle(svc, inst.instanceId, 2000);

    const final = svc.getInstance(inst.instanceId);
    expect(final?.lifecycle).toBe('completed');
    // Should stop on exitCondition, not maxDurationMs
    expect(counter).toBeLessThan(10);
  });
});
