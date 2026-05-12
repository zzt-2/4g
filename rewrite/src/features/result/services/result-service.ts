import type { TaskInstanceState } from '@/features/task';
import { judgeCaseVerdict, type CaseVerdict } from '../core';
import type { ResultStateContainer } from '../state/result-state';

export interface ResultService {
  readonly collectResult: (instance: TaskInstanceState) => CaseVerdict;
  readonly getVerdict: (instanceId: string) => CaseVerdict | undefined;
  readonly getSnapshot: () => ReturnType<ResultStateContainer['getSnapshot']>;
  readonly clear: () => void;
}

export function createResultService(state: ResultStateContainer): ResultService {
  return {
    collectResult(instance: TaskInstanceState): CaseVerdict {
      const existing = state.getVerdict(instance.instanceId);
      if (existing) return existing;

      const verdict: CaseVerdict = {
        instanceId: instance.instanceId,
        taskDefinitionId: instance.definitionRef.id,
        verdict: judgeCaseVerdict(instance),
        judgedAt: new Date().toISOString(),
        startedAt: instance.startedAt ?? '',
        finishedAt: instance.completedAt ?? instance.stoppedAt ?? instance.failedAt ?? '',
      };
      state.storeVerdict(verdict);
      return verdict;
    },
    getVerdict: state.getVerdict,
    getSnapshot: state.getSnapshot,
    clear: state.clear,
  };
}
