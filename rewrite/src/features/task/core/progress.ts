import type { TaskInstanceState, TaskProgress, TaskStepResult } from './types';
import { resolveStopCondition } from './types';

export function calculateProgress(instance: TaskInstanceState): TaskProgress {
  const stepsPerIteration = instance.definitionRef.steps.length;
  const { currentIteration, stepResults } = instance;

  const currentIterResults = stepResults.filter((r) => r.iteration === currentIteration);

  let stepsCompleted = 0;
  let stepsFailed = 0;
  let stepsSkipped = 0;

  for (const result of currentIterResults) {
    if (result.appliedPolicy === 'skip-step') {
      stepsSkipped++;
    } else if (isStepResultFailed(result)) {
      stepsFailed++;
    } else {
      stepsCompleted++;
    }
  }

  const iterationsCompleted = countCompletedIterations(instance, stepsPerIteration);
  const iterationsTotal = resolveIterationsTotal(instance);
  const elapsedMs = calculateElapsedMs(instance);

  const estimatedRemainingMs = estimateRemainingMs(instance, iterationsCompleted, iterationsTotal, elapsedMs);
  const lastStepResult = stepResults.length > 0 ? stepResults[stepResults.length - 1] : null;

  return {
    stepsTotal: stepsPerIteration,
    stepsCompleted,
    stepsFailed,
    stepsSkipped,
    iterationsCompleted,
    iterationsTotal,
    elapsedMs,
    estimatedRemainingMs,
    lastStepResult,
  };
}

export function isStepResultFailed(result: TaskStepResult): boolean {
  switch (result.kind) {
    case 'send':
      return result.sendResult.kind !== 'sent';
    case 'wait-condition':
      return !result.matched && result.timedOut;
    case 'delay':
      return !result.completed;
  }
}

function countCompletedIterations(instance: TaskInstanceState, stepsPerIteration: number): number {
  const iterationIndices = new Set(instance.stepResults.map((r) => r.iteration));
  let count = 0;
  for (const iter of iterationIndices) {
    const iterResults = instance.stepResults.filter((r) => r.iteration === iter);
    if (iterResults.length >= stepsPerIteration) {
      count++;
    }
  }
  return count;
}

function resolveIterationsTotal(instance: TaskInstanceState): number | null {
  const resolved = resolveStopCondition(instance.definitionRef);
  const { schedule } = instance.definitionRef;

  if (resolved.maxIterations !== undefined) {
    return resolved.maxIterations;
  }
  if (schedule.kind === 'immediate') {
    return 1;
  }
  return null;
}

function calculateElapsedMs(instance: TaskInstanceState): number {
  if (!instance.startedAt) return 0;
  const start = new Date(instance.startedAt).getTime();
  const endRef = instance.completedAt ?? instance.stoppedAt ?? instance.failedAt;
  const end = endRef ? new Date(endRef).getTime() : Date.now();
  return Math.max(0, end - start);
}

function estimateRemainingMs(
  instance: TaskInstanceState,
  iterationsCompleted: number,
  iterationsTotal: number | null,
  elapsedMs: number,
): number | null {
  if (instance.definitionRef.schedule.kind !== 'timer' || iterationsTotal === null) {
    return null;
  }
  if (iterationsCompleted <= 0 || iterationsTotal <= iterationsCompleted) {
    return null;
  }
  const avgIterMs = elapsedMs / iterationsCompleted;
  return Math.round(avgIterMs * (iterationsTotal - iterationsCompleted));
}
