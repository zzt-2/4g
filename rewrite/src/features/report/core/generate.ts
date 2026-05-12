import type { TaskInstanceState } from '@/features/task';
import type { CaseVerdict } from '@/features/result';
import { isStepFailed } from '@/features/result';
import type { ReportJson, ReportStepEntry } from './types';

export function mapSteps(instance: TaskInstanceState): readonly ReportStepEntry[] {
  return instance.stepResults.map((step) => ({
    index: step.stepIndex,
    kind: step.kind,
    passed: !isStepFailed(step),
  }));
}

export function generateReport(instance: TaskInstanceState, verdict: CaseVerdict): ReportJson {
  return {
    reportId: `report-${verdict.instanceId}`,
    taskDefinitionId: verdict.taskDefinitionId,
    taskDefinitionName: instance.definitionRef.name,
    verdict: verdict.verdict,
    startedAt: verdict.startedAt,
    finishedAt: verdict.finishedAt,
    steps: mapSteps(instance),
  };
}
