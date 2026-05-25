// --- Inbound request types ---

export interface SetTestTaskRequest {
  readonly executionPlan: {
    readonly layers: readonly ExecutionPlanLayer[];
  };
}

export interface ExecutionPlanLayer {
  readonly layerNo: number;
  readonly parallel: boolean;
  readonly testCaseInfoList: readonly TestCaseInfo[];
}

export interface TestCaseInfo {
  readonly testCaseId: string;
  readonly testCaseName: string;
  readonly testCaseParams?: Readonly<Record<string, unknown>>;
  readonly steps: readonly TestCaseStep[];
  readonly timeout?: number;
}

export type TestCaseStep =
  | { readonly kind: 'send'; readonly frameId: string; readonly targetId: string; readonly fieldValues?: Readonly<Record<string, unknown>> }
  | { readonly kind: 'wait-condition'; readonly conditions: readonly WaitConditionDef[]; readonly timeoutMs?: number };

export interface WaitConditionDef {
  readonly fieldId: string;
  readonly operator: string;
  readonly value: unknown;
}

export interface ControlTestTaskRequest {
  readonly testCaseIdList: readonly string[];
  readonly controlType: 'abort' | 'pause' | 'continue' | 'stop';
}

export interface HeartbeatRequest {}

export interface GetSubSysStateRequest {}

export type CustomerRequest =
  | { readonly kind: 'setTestTask'; readonly body: SetTestTaskRequest }
  | { readonly kind: 'controlTestTask'; readonly body: ControlTestTaskRequest }
  | { readonly kind: 'heartbeat'; readonly body: HeartbeatRequest }
  | { readonly kind: 'getSubSysState'; readonly body: GetSubSysStateRequest };

// --- Outbound response types ---

export interface TestCaseResultReport {
  readonly testCaseId: string;
  readonly result: 'success' | 'fail' | 'tbd';
  readonly startTime: string;
  readonly endTime: string;
  readonly stepInfoList?: readonly StepInfo[];
}

export interface MsgReport {
  readonly testCaseId: string;
  readonly stepInfo: StepInfo;
}

export interface StepInfo {
  readonly stepNo: number;
  readonly stepName?: string;
  readonly stepResult: 'success' | 'fail' | 'running';
  readonly stepStartTime: string;
  readonly stepEndTime?: string;
}

// --- Generic response ---

export interface CustomerResponse {
  readonly code: number;
  readonly msg: string;
  readonly data?: unknown;
}
