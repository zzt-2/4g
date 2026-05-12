import type { TaskInstanceState, TaskStepResult } from '@/features/task';
import type { CaseVerdictKind } from './types';

export function isStepFailed(step: TaskStepResult): boolean {
  switch (step.kind) {
    case 'send':
      return step.sendResult.kind !== 'sent';
    case 'wait-condition':
      return !step.matched;
    case 'delay':
      return !step.completed;
  }
}

export function judgeCaseVerdict(instance: TaskInstanceState): CaseVerdictKind {
  if (instance.lifecycle === 'stopped') return 'stopped';
  if (instance.lifecycle === 'failed') return 'failed';
  const hasFailure = instance.stepResults.some(isStepFailed);
  return hasFailure ? 'failed' : 'passed';
}
