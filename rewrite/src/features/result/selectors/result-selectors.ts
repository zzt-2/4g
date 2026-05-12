import type { ResultStateSnapshot } from '../core';
import type { CaseVerdict } from '../core';

export function selectAllVerdicts(snapshot: ResultStateSnapshot): readonly CaseVerdict[] {
  return Array.from(snapshot.verdicts.values());
}

export function selectVerdict(snapshot: ResultStateSnapshot, instanceId: string): CaseVerdict | undefined {
  return snapshot.verdicts.get(instanceId);
}

export function selectVerdictsByDefinition(
  snapshot: ResultStateSnapshot,
  taskDefinitionId: string,
): readonly CaseVerdict[] {
  return Array.from(snapshot.verdicts.values())
    .filter((v) => v.taskDefinitionId === taskDefinitionId);
}
