export interface ReportStepEntry {
  readonly index: number;
  readonly kind: string;
  readonly passed: boolean;
}

export interface ReportJson {
  readonly reportId: string;
  readonly taskDefinitionId: string;
  readonly taskDefinitionName: string;
  readonly verdict: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly steps: readonly ReportStepEntry[];
}
