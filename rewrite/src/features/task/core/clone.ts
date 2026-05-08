import type { SendResult } from '@/features/send';
import type {
  TaskInstanceState,
  TaskStepResult,
  TaskProgress,
  TaskExecutionSummary,
} from './types';

export function cloneStepResult(result: Readonly<TaskStepResult>): TaskStepResult {
  const base = {
    stepIndex: result.stepIndex,
    iteration: result.iteration,
    ...(result.appliedPolicy ? { appliedPolicy: result.appliedPolicy } : {}),
  };
  switch (result.kind) {
    case 'send':
      return { ...base, kind: 'send', sendResult: cloneSendResultRef(result.sendResult) };
    case 'wait-condition':
      return {
        ...base,
        kind: 'wait-condition',
        matched: result.matched,
        timedOut: result.timedOut,
        ...(result.matchedValue !== undefined ? { matchedValue: result.matchedValue } : {}),
      };
    case 'delay':
      return { ...base, kind: 'delay', completed: result.completed };
  }
}

function cloneSendResultRef(result: Readonly<SendResult>): SendResult {
  return {
    kind: result.kind,
    requestRef: {
      frameId: result.requestRef.frameId,
      targetId: result.requestRef.targetId,
      context: { ...result.requestRef.context },
    },
    bytesBuilt: result.bytesBuilt,
    bytesSent: result.bytesSent,
    timestamp: result.timestamp,
    ...(result.error ? { error: { kind: result.error.kind, message: result.error.message } } : {}),
    buildIssues: result.buildIssues.map((i) => ({
      severity: i.severity,
      code: i.code,
      message: i.message,
      ...(i.fieldId ? { fieldId: i.fieldId } : {}),
    })),
  };
}

export function cloneInstanceState(instance: Readonly<TaskInstanceState>): TaskInstanceState {
  return {
    instanceId: instance.instanceId,
    definitionRef: instance.definitionRef,
    lifecycle: instance.lifecycle,
    ...(instance.startedAt ? { startedAt: instance.startedAt } : {}),
    ...(instance.pausedAt ? { pausedAt: instance.pausedAt } : {}),
    ...(instance.stoppedAt ? { stoppedAt: instance.stoppedAt } : {}),
    ...(instance.completedAt ? { completedAt: instance.completedAt } : {}),
    ...(instance.failedAt ? { failedAt: instance.failedAt } : {}),
    currentStepIndex: instance.currentStepIndex,
    currentIteration: instance.currentIteration,
    stepResults: instance.stepResults.map(cloneStepResult),
    ...(instance.error ? { error: instance.error } : {}),
  };
}

export function cloneProgress(progress: Readonly<TaskProgress>): TaskProgress {
  return {
    stepsTotal: progress.stepsTotal,
    stepsCompleted: progress.stepsCompleted,
    stepsFailed: progress.stepsFailed,
    stepsSkipped: progress.stepsSkipped,
    iterationsCompleted: progress.iterationsCompleted,
    iterationsTotal: progress.iterationsTotal,
    elapsedMs: progress.elapsedMs,
  };
}

export function cloneExecutionSummary(summary: Readonly<TaskExecutionSummary>): TaskExecutionSummary {
  return {
    kind: summary.kind,
    summary: { ...summary.summary },
    durationMs: summary.durationMs,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
  };
}
