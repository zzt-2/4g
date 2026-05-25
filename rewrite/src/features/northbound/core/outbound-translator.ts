import type { TaskInstanceState, TaskStepResult } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';
import type { TestCaseResultReport, MsgReport, StepInfo } from './types';

export function translateTaskResult(
  instance: TaskInstanceState,
  verdict: CaseVerdict,
  testCaseId: string,
): TestCaseResultReport {
  return {
    testCaseId,
    result: verdictMap[verdict.verdict],
    startTime: verdict.startedAt,
    endTime: verdict.finishedAt,
    stepInfoList: instance.stepResults.map((sr, i) => stepResultToStepInfo(instance, sr, i)),
  };
}

export function translateStepResult(
  instance: TaskInstanceState,
  stepResult: TaskStepResult,
  testCaseId: string,
): MsgReport {
  const stepInfo = stepResultToStepInfo(instance, stepResult, stepResult.stepIndex);
  return { testCaseId, stepInfo };
}

function stepResultToStepInfo(
  instance: TaskInstanceState,
  stepResult: TaskStepResult,
  index: number,
): StepInfo {
  const stepDef = instance.definitionRef.steps[stepResult.stepIndex];
  const isSuccess = isStepSuccess(stepResult);

  return {
    stepNo: stepResult.stepIndex,
    stepName: stepDef?.name,
    stepResult: isSuccess ? 'success' : 'fail',
    stepStartTime: '', // TODO: extract from stepResult timestamps when available
    stepEndTime: '',
  };
}

function isStepSuccess(stepResult: TaskStepResult): boolean {
  switch (stepResult.kind) {
    case 'send':
      return stepResult.sendResult.kind === 'sent';
    case 'wait-condition':
      return stepResult.matched;
    case 'delay':
      return stepResult.completed;
  }
}

const verdictMap: Record<string, 'success' | 'fail' | 'tbd'> = {
  passed: 'success',
  failed: 'fail',
  stopped: 'tbd',
};
