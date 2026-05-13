import { describe, it, expect } from 'vitest';
import { generateReport, mapSteps } from '../core/generate';
import type { TaskInstanceState } from '@/features/task';
import type { CaseVerdict } from '@/features/result';

function makeInstance(overrides: Partial<TaskInstanceState> = {}): TaskInstanceState {
  return {
    instanceId: 'inst-1',
    definitionRef: {
      id: 'task-1',
      name: 'Test Task',
      steps: [],
      schedule: { kind: 'immediate' },
      errorPolicy: { onFailure: 'stop' },
    },
    lifecycle: 'completed',
    currentIteration: 1,
    startedAt: '2026-05-13T00:00:00.000Z',
    completedAt: '2026-05-13T00:00:10.000Z',
    stepResults: [
      { kind: 'send', stepIndex: 0, iteration: 0, sendResult: { kind: 'sent' } },
      { kind: 'wait-condition', stepIndex: 1, iteration: 0, matched: true, timedOut: false },
      { kind: 'delay', stepIndex: 2, iteration: 0, completed: true, durationMs: 100 },
    ],
    ...overrides,
  } as TaskInstanceState;
}

function makeVerdict(overrides: Partial<CaseVerdict> = {}): CaseVerdict {
  return {
    instanceId: 'inst-1',
    taskDefinitionId: 'task-1',
    verdict: 'passed',
    judgedAt: '2026-05-13T00:00:10.000Z',
    startedAt: '2026-05-13T00:00:00.000Z',
    finishedAt: '2026-05-13T00:00:10.000Z',
    ...overrides,
  };
}

describe('mapSteps', () => {
  it('maps send step as passed when sent', () => {
    const instance = makeInstance();
    const steps = mapSteps(instance);
    expect(steps[0]).toEqual({ index: 0, kind: 'send', passed: true });
  });

  it('maps send step as failed when error', () => {
    const instance = makeInstance({
      stepResults: [
        { kind: 'send', stepIndex: 0, iteration: 0, sendResult: { kind: 'transport-error' } },
      ],
    } as Partial<TaskInstanceState>);
    const steps = mapSteps(instance);
    expect(steps[0]?.passed).toBe(false);
  });

  it('maps wait-condition step as passed when matched', () => {
    const instance = makeInstance();
    const steps = mapSteps(instance);
    expect(steps[1]).toEqual({ index: 1, kind: 'wait-condition', passed: true });
  });

  it('maps wait-condition step as failed when not matched', () => {
    const instance = makeInstance({
      stepResults: [
        { kind: 'wait-condition', stepIndex: 0, iteration: 0, matched: false, timedOut: true },
      ],
    } as Partial<TaskInstanceState>);
    const steps = mapSteps(instance);
    expect(steps[0]?.passed).toBe(false);
  });

  it('maps delay step as passed when completed', () => {
    const instance = makeInstance();
    const steps = mapSteps(instance);
    expect(steps[2]).toEqual({ index: 2, kind: 'delay', passed: true });
  });

  it('returns empty for no step results', () => {
    const instance = makeInstance({ stepResults: [] } as Partial<TaskInstanceState>);
    expect(mapSteps(instance)).toHaveLength(0);
  });
});

describe('generateReport', () => {
  it('generates report with all fields', () => {
    const instance = makeInstance();
    const verdict = makeVerdict();
    const report = generateReport(instance, verdict);

    expect(report.reportId).toBe('report-inst-1');
    expect(report.taskDefinitionId).toBe('task-1');
    expect(report.taskDefinitionName).toBe('Test Task');
    expect(report.verdict).toBe('passed');
    expect(report.steps).toHaveLength(3);
  });

  it('uses verdict instanceId for reportId', () => {
    const instance = makeInstance({ instanceId: 'inst-42' } as Partial<TaskInstanceState>);
    const verdict = makeVerdict({ instanceId: 'inst-42' });
    const report = generateReport(instance, verdict);
    expect(report.reportId).toBe('report-inst-42');
  });
});
