/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { isStepFailed, judgeCaseVerdict } from '../core/judge';
import type { TaskInstanceState, TaskStepResult } from '@/features/task';

function makeStep(override: Partial<TaskStepResult> & { kind: TaskStepResult['kind'] }): TaskStepResult {
  return {
    stepIndex: 0,
    iteration: 0,
    ...override,
  } as TaskStepResult;
}

function makeInstance(override: Partial<TaskInstanceState> = {}): TaskInstanceState {
  return {
    instanceId: 'inst-1',
    definitionRef: { id: 'task-1', name: 'Test Task', steps: [], errorPolicy: { action: 'stop' } } as any,
    lifecycle: 'completed',
    currentStepIndex: 0,
    currentIteration: 0,
    stepResults: [],
    startedAt: '2026-05-12T10:00:00Z',
    completedAt: '2026-05-12T10:00:10Z',
    ...override,
  };
}

describe('isStepFailed', () => {
  it('send step: sent → not failed', () => {
    const step = makeStep({
      kind: 'send',
      sendResult: { kind: 'sent' } as any,
    });
    expect(isStepFailed(step)).toBe(false);
  });

  it('send step: build-error → failed', () => {
    const step = makeStep({
      kind: 'send',
      sendResult: { kind: 'build-error' } as any,
    });
    expect(isStepFailed(step)).toBe(true);
  });

  it('send step: timeout → failed', () => {
    const step = makeStep({
      kind: 'send',
      sendResult: { kind: 'timeout' } as any,
    });
    expect(isStepFailed(step)).toBe(true);
  });

  it('wait-condition step: matched → not failed', () => {
    const step = makeStep({
      kind: 'wait-condition',
      matched: true,
      timedOut: false,
    } as any);
    expect(isStepFailed(step)).toBe(false);
  });

  it('wait-condition step: not matched → failed', () => {
    const step = makeStep({
      kind: 'wait-condition',
      matched: false,
      timedOut: true,
    } as any);
    expect(isStepFailed(step)).toBe(true);
  });

  it('delay step: completed → not failed', () => {
    const step = makeStep({
      kind: 'delay',
      completed: true,
    } as any);
    expect(isStepFailed(step)).toBe(false);
  });

  it('delay step: not completed → failed', () => {
    const step = makeStep({
      kind: 'delay',
      completed: false,
    } as any);
    expect(isStepFailed(step)).toBe(true);
  });
});

describe('judgeCaseVerdict', () => {
  it('stopped task → stopped', () => {
    const instance = makeInstance({ lifecycle: 'stopped' });
    expect(judgeCaseVerdict(instance)).toBe('stopped');
  });

  it('failed task → failed', () => {
    const instance = makeInstance({ lifecycle: 'failed' });
    expect(judgeCaseVerdict(instance)).toBe('failed');
  });

  it('completed task with no step results → passed', () => {
    const instance = makeInstance({ lifecycle: 'completed', stepResults: [] });
    expect(judgeCaseVerdict(instance)).toBe('passed');
  });

  it('completed task with all steps passing → passed', () => {
    const steps = [
      makeStep({ kind: 'send', sendResult: { kind: 'sent' } as any }),
      makeStep({ kind: 'wait-condition', matched: true, timedOut: false } as any),
    ];
    const instance = makeInstance({ lifecycle: 'completed', stepResults: steps });
    expect(judgeCaseVerdict(instance)).toBe('passed');
  });

  it('completed task with a failed step → failed', () => {
    const steps = [
      makeStep({ kind: 'send', sendResult: { kind: 'sent' } as any }),
      makeStep({ kind: 'send', sendResult: { kind: 'timeout' } as any }),
    ];
    const instance = makeInstance({ lifecycle: 'completed', stepResults: steps });
    expect(judgeCaseVerdict(instance)).toBe('failed');
  });

  it('completed task with wait-condition not matched → failed', () => {
    const steps = [
      makeStep({ kind: 'wait-condition', matched: false, timedOut: true } as any),
    ];
    const instance = makeInstance({ lifecycle: 'completed', stepResults: steps });
    expect(judgeCaseVerdict(instance)).toBe('failed');
  });
});
