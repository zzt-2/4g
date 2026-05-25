import { describe, it, expect } from 'vitest';
import { translateTaskResult, translateStepResult } from '../core/outbound-translator';
import type { TaskInstanceState, TaskStepResult, TaskDefinition } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskDefinition(overrides?: Partial<TaskDefinition>): TaskDefinition {
  return {
    id: 'def-001',
    name: 'Test def',
    steps: [
      { kind: 'send', id: 'step-0', name: 'Send frame-001', config: { frameId: 'frame-001', targetId: 'target-1' } },
      { kind: 'wait-condition', id: 'step-1', name: 'Wait voltage', config: { conditions: [], timeoutMs: 5000, onTimeout: 'fail' } },
    ],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
    ...overrides,
  };
}

function makeInstance(overrides?: Partial<TaskInstanceState>): TaskInstanceState {
  return {
    instanceId: 'inst-001',
    definitionRef: makeTaskDefinition(),
    lifecycle: 'completed',
    currentStepIndex: 2,
    currentIteration: 0,
    stepResults: [],
    startedAt: '2026-05-25T10:00:00.000Z',
    completedAt: '2026-05-25T10:00:05.000Z',
    ...overrides,
  };
}

function makeVerdict(overrides?: Partial<CaseVerdict>): CaseVerdict {
  return {
    instanceId: 'inst-001',
    taskDefinitionId: 'def-001',
    verdict: 'passed',
    judgedAt: '2026-05-25T10:00:05.000Z',
    startedAt: '2026-05-25T10:00:00.000Z',
    finishedAt: '2026-05-25T10:00:05.000Z',
    ...overrides,
  };
}

function makeSendStepResult(
  overrides?: Partial<TaskStepResult>,
  sendKind: 'sent' | 'error' = 'sent',
): TaskStepResult {
  return {
    kind: 'send',
    stepIndex: 0,
    iteration: 0,
    sendResult: {
      kind: sendKind,
      requestRef: { frameId: 'frame-001', targetId: 'target-1', context: { source: 'task' } },
      bytesBuilt: 10,
      bytesSent: sendKind === 'sent' ? 10 : 0,
      timestamp: '2026-05-25T10:00:01.000Z',
      ...(sendKind === 'error' ? { error: { kind: 'transport-error', message: 'connection lost' } } : {}),
      buildIssues: [],
    },
    ...overrides,
  };
}

function makeWaitConditionStepResult(matched: boolean, overrides?: Partial<TaskStepResult>): TaskStepResult {
  return {
    kind: 'wait-condition',
    stepIndex: 1,
    iteration: 0,
    matched,
    timedOut: !matched,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// translateTaskResult
// ---------------------------------------------------------------------------

describe('translateTaskResult', () => {
  it('maps verdict "passed" to result "success"', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({ verdict: 'passed' });

    const report = translateTaskResult(instance, verdict, 'tc-001');

    expect(report.testCaseId).toBe('tc-001');
    expect(report.result).toBe('success');
  });

  it('maps verdict "failed" to result "fail"', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({ verdict: 'failed' });

    const report = translateTaskResult(instance, verdict, 'tc-002');

    expect(report.testCaseId).toBe('tc-002');
    expect(report.result).toBe('fail');
  });

  it('maps verdict "stopped" to result "tbd"', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({ verdict: 'stopped' });

    const report = translateTaskResult(instance, verdict, 'tc-003');

    expect(report.testCaseId).toBe('tc-003');
    expect(report.result).toBe('tbd');
  });

  it('includes startTime and endTime from the verdict', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({
      startedAt: '2026-05-25T10:00:00.000Z',
      finishedAt: '2026-05-25T10:00:05.000Z',
    });

    const report = translateTaskResult(instance, verdict, 'tc-004');

    expect(report.startTime).toBe('2026-05-25T10:00:00.000Z');
    expect(report.endTime).toBe('2026-05-25T10:00:05.000Z');
  });

  it('maps stepResults from instance to stepInfoList', () => {
    const sendResult = makeSendStepResult();
    const waitResult = makeWaitConditionStepResult(true);
    const instance = makeInstance({
      stepResults: [sendResult, waitResult],
    });
    const verdict = makeVerdict({ verdict: 'passed' });

    const report = translateTaskResult(instance, verdict, 'tc-005');

    expect(report.stepInfoList).toHaveLength(2);
    expect(report.stepInfoList![0]!.stepResult).toBe('success');
    expect(report.stepInfoList![1]!.stepResult).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// translateStepResult
// ---------------------------------------------------------------------------

describe('translateStepResult', () => {
  // 4. send step with kind='sent' -> success
  it('maps send step result (kind=sent) to stepResult "success"', () => {
    const instance = makeInstance();
    const stepResult = makeSendStepResult(undefined, 'sent');

    const msg = translateStepResult(instance, stepResult, 'tc-010');

    expect(msg.testCaseId).toBe('tc-010');
    expect(msg.stepInfo.stepResult).toBe('success');
  });

  // 5. send step with kind='error' (non-'sent') -> fail
  it('maps send step result (non-sent sendResult) to stepResult "fail"', () => {
    const instance = makeInstance();
    const stepResult = makeSendStepResult(undefined, 'transport-error');

    const msg = translateStepResult(instance, stepResult, 'tc-011');

    expect(msg.stepInfo.stepResult).toBe('fail');
  });

  // 6. wait-condition matched -> success
  it('maps wait-condition matched=true to stepResult "success"', () => {
    const instance = makeInstance();
    const stepResult = makeWaitConditionStepResult(true);

    const msg = translateStepResult(instance, stepResult, 'tc-012');

    expect(msg.stepInfo.stepResult).toBe('success');
  });

  // 7. wait-condition not matched -> fail
  it('maps wait-condition matched=false to stepResult "fail"', () => {
    const instance = makeInstance();
    const stepResult = makeWaitConditionStepResult(false);

    const msg = translateStepResult(instance, stepResult, 'tc-013');

    expect(msg.stepInfo.stepResult).toBe('fail');
  });

  // 8. stepName comes from definitionRef.steps[stepIndex].name
  it('uses step name from definitionRef.steps[stepIndex].name', () => {
    const instance = makeInstance();
    const stepResult = makeSendStepResult({ stepIndex: 0 });

    const msg = translateStepResult(instance, stepResult, 'tc-014');

    expect(msg.stepInfo.stepName).toBe('Send frame-001');
  });

  it('uses the correct step name for wait-condition step', () => {
    const instance = makeInstance();
    const stepResult = makeWaitConditionStepResult(true, { stepIndex: 1 });

    const msg = translateStepResult(instance, stepResult, 'tc-015');

    expect(msg.stepInfo.stepName).toBe('Wait voltage');
  });

  it('sets stepNo to the stepResult.stepIndex', () => {
    const instance = makeInstance();
    const stepResult = makeWaitConditionStepResult(true, { stepIndex: 1 });

    const msg = translateStepResult(instance, stepResult, 'tc-016');

    expect(msg.stepInfo.stepNo).toBe(1);
  });
});
