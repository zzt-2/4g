export type CaseVerdictKind = 'passed' | 'failed' | 'stopped';

export interface CaseVerdict {
  readonly instanceId: string;
  readonly taskDefinitionId: string;
  readonly verdict: CaseVerdictKind;
  readonly judgedAt: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface ResultStateSnapshot {
  readonly verdicts: ReadonlyMap<string, CaseVerdict>;
}
