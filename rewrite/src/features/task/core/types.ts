import type { SendResult } from '@/features/send';
import type { ReadonlyDeep } from '@/shared/types/readonly-deep';

// --- Step kinds ---

export const TASK_STEP_KINDS = ['send', 'wait-condition', 'delay'] as const;
export type TaskStepKind = (typeof TASK_STEP_KINDS)[number];

// --- Comparison ---

export const COMPARISON_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'contains',
  'change',
  'any',
] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

// --- WaitCondition ---

export interface WaitCondition {
  readonly frameId: string;
  readonly fieldId: string;
  readonly operator: ComparisonOperator;
  readonly threshold: number | string;
  readonly sourceId?: string;
}

// --- Step definitions ---

export interface SendStepConfig {
  readonly frameId: string;
  readonly fieldValues: Readonly<Record<string, string | number | boolean>>;
  readonly targetId?: string;
  readonly options?: { readonly checksumKind?: string; readonly autoChecksum?: boolean };
}

export interface WaitConditionStepConfig {
  readonly condition: WaitCondition;
  readonly timeoutMs: number;
  readonly onTimeout: 'continue' | 'skip' | 'fail';
}

export interface DelayStepConfig {
  readonly durationMs: number;
}

export interface SendStepDefinition {
  readonly id: string;
  readonly name?: string;
  readonly kind: 'send';
  readonly sendConfig: SendStepConfig;
}

export interface WaitConditionStepDefinition {
  readonly id: string;
  readonly name?: string;
  readonly kind: 'wait-condition';
  readonly waitConfig: WaitConditionStepConfig;
}

export interface DelayStepDefinition {
  readonly id: string;
  readonly name?: string;
  readonly kind: 'delay';
  readonly delayConfig: DelayStepConfig;
}

export type TaskStepDefinition =
  | SendStepDefinition
  | WaitConditionStepDefinition
  | DelayStepDefinition;

// --- Trigger / Scheduling ---

export const TASK_TRIGGER_SOURCES = [
  'user-ui',
  'timer',
  'receive-trigger',
  'scoe-command',
  'northbound-command',
] as const;
export type TaskTriggerSource = (typeof TASK_TRIGGER_SOURCES)[number];

export const TASK_SCHEDULING_MODES = ['timed', 'trigger', 'sequence'] as const;
export type TaskSchedulingMode = (typeof TASK_SCHEDULING_MODES)[number];

// --- Error policy ---

export const TASK_ERROR_ACTIONS = ['retry', 'skip-step', 'stop', 'pause'] as const;
export type TaskErrorAction = (typeof TASK_ERROR_ACTIONS)[number];

export interface TaskErrorPolicy {
  readonly onFailure: TaskErrorAction;
  readonly retryCount?: number;
  readonly retryDelayMs?: number;
}

// --- Stop condition ---

export interface TaskStopCondition {
  readonly maxDurationMs?: number;
  readonly maxIterations?: number;
}

// --- TaskDefinition ---

export interface TaskDefinition {
  readonly id: string;
  readonly name: string;
  readonly schedulingMode: TaskSchedulingMode;
  readonly triggerSource: TaskTriggerSource;
  readonly steps: readonly TaskStepDefinition[];
  readonly targetId?: string;
  readonly errorPolicy: TaskErrorPolicy;
  readonly stopCondition?: TaskStopCondition;
  readonly intervalMs?: number;
  readonly delayBeforeStartMs?: number;
  readonly triggerCondition?: WaitCondition;
  readonly cooldownMs?: number;
}

// --- Lifecycle ---

export const TASK_LIFECYCLE_STATUSES = [
  'created',
  'running',
  'paused',
  'stopped',
  'completed',
  'failed',
] as const;
export type TaskLifecycleStatus = (typeof TASK_LIFECYCLE_STATUSES)[number];

export type LifecycleAction = 'start' | 'pause' | 'resume' | 'stop' | 'complete' | 'fail';

// --- Step results ---

export interface SendStepResult {
  readonly kind: 'send';
  readonly sendResult: SendResult;
}

export interface WaitConditionStepResult {
  readonly kind: 'wait-condition';
  readonly matched: boolean;
  readonly matchedValue?: number | string;
  readonly timedOut: boolean;
}

export interface DelayStepResult {
  readonly kind: 'delay';
  readonly completed: boolean;
}

export type TaskStepResultPayload =
  | SendStepResult
  | WaitConditionStepResult
  | DelayStepResult;

export interface TaskStepResult extends TaskStepResultPayload {
  readonly stepIndex: number;
  readonly iteration: number;
  readonly appliedPolicy?: TaskErrorAction;
}

// --- Instance state ---

export interface TaskInstanceState {
  readonly instanceId: string;
  readonly definitionRef: TaskDefinition;
  readonly lifecycle: TaskLifecycleStatus;
  readonly startedAt?: string;
  readonly pausedAt?: string;
  readonly stoppedAt?: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly currentStepIndex: number;
  readonly currentIteration: number;
  readonly stepResults: readonly TaskStepResult[];
  readonly error?: string;
}

export type ReadonlyTaskInstanceState = ReadonlyDeep<TaskInstanceState>;

// --- Progress ---

export interface TaskProgress {
  readonly stepsTotal: number;
  readonly stepsCompleted: number;
  readonly stepsFailed: number;
  readonly stepsSkipped: number;
  readonly iterationsCompleted: number;
  readonly iterationsTotal: number | null;
  readonly elapsedMs: number;
  readonly estimatedRemainingMs: number | null;
  readonly lastStepResult: TaskStepResult | null;
}

// --- Execution summary ---

export interface TaskExecutionSummary {
  readonly kind: 'completed' | 'stopped' | 'failed';
  readonly summary: {
    readonly stepsTotal: number;
    readonly stepsSucceeded: number;
    readonly stepsFailed: number;
    readonly stepsSkipped: number;
  };
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
}

// --- Condition term (extends WaitCondition with logic operator) ---

export interface ConditionTerm extends WaitCondition {
  readonly logicOperator?: 'and' | 'or';
}

// --- Condition match input ---
// Decoupled from receive internals. Service layer maps from receive public API outputs.

export interface ConditionMatchInput {
  readonly frameId: string;
  readonly fieldValues: Readonly<Record<string, number | string | null>>;
  readonly sourceId?: string;
}
