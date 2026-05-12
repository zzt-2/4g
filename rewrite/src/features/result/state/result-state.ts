import type { CaseVerdict, ResultStateSnapshot } from '../core';

export interface ResultStateContainer {
  readonly getSnapshot: () => ResultStateSnapshot;
  readonly storeVerdict: (verdict: CaseVerdict) => void;
  readonly getVerdict: (instanceId: string) => CaseVerdict | undefined;
  readonly clear: () => void;
}

export function createResultState(): ResultStateContainer {
  const verdicts = new Map<string, CaseVerdict>();

  return {
    getSnapshot() {
      return { verdicts: new Map(verdicts) };
    },
    storeVerdict(verdict: CaseVerdict) {
      verdicts.set(verdict.instanceId, verdict);
    },
    getVerdict(instanceId: string) {
      return verdicts.get(instanceId);
    },
    clear() {
      verdicts.clear();
    },
  };
}
