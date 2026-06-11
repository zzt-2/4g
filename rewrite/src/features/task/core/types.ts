import type { SendResult } from '@/features/send';
import type { ReadonlyDeep } from '@/shared/types/readonly-deep';
import type { VariableMap } from '@/shared/expression/types';

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

// --- ConditionTerm (replaces WaitCondition, adds logicOperator) ---

export interface ConditionTerm {
  readonly frameId: string;
  readonly fieldId: string;
  readonly operator: ComparisonOperator;
  readonly threshold: string | number;
  readonly sourceId?: string;
  readonly logicOperator?: 'and' | 'or'; // default 'and'; first term's logicOperator is ignored
}

// --- ScheduleDriver (replaces TaskSchedulingMode + flat scheduling fields) ---

export type ScheduleDriver =
  | { readonly kind: 'immediate' }
  | { readonly kind: 'timer'; readonly intervalMs: number }
  | { readonly kind: 'event'; readonly conditions: readonly ConditionTerm[]; readonly cooldownMs?: number };

// --- FieldVariation ---

export interface FieldVariation {
  readonly fieldId: string;
  readonly values: readonly (string | number)[];
}

// --- StepRepeat ---

export interface StepRepeat {
  readonly intervalMs: number;
  readonly until?: readonly ConditionTerm[];
  readonly maxCount?: number;
}

// --- Step definitions ---

export interface SendStepConfig {
  readonly frameId: string;
  readonly targetId: string; // required (was optional + fallback to definition.targetId)
  readonly userFieldValues?: Readonly<Record<string, string | number | boolean>>;
  readonly variables?: VariableMap;
  readonly intervalAfterMs?: number;
  readonly repeat?: StepRepeat;
}

export interface WaitConditionConfig {
  readonly conditions: readonly ConditionTerm[]; // single condition -> condition array
  readonly timeoutMs?: number; // optional (undefined = wait indefinitely until signal interrupt)
  readonly onTimeout: 'continue' | 'skip' | 'fail';
}

export interface DelayStepConfig {
  readonly durationMs: number;
}

// --- Unified TaskStepDefinition (config field name unified) ---

export type TaskStepDefinition =
  | { readonly kind: 'send'; readonly id: string; readonly name?: string; readonly config: SendStepConfig }
  | { readonly kind: 'wait-condition'; readonly id: string; readonly name?: string; readonly config: WaitConditionConfig }
  | { readonly kind: 'delay'; readonly id: string; readonly name?: string; readonly config: DelayStepConfig };

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
  readonly exitCondition?: readonly ConditionTerm[]; // new: early exit when condition met
}

// --- TaskDefinition (restructured) ---

export interface TaskDefinition {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly TaskStepDefinition[];
  readonly schedule: ScheduleDriver; // replaces schedulingMode + flat scheduling fields
  readonly stopCondition?: TaskStopCondition;
  readonly fieldVariations?: readonly FieldVariation[];
  readonly errorPolicy: TaskErrorPolicy;
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
  /** 实例追溯：若从模板创建，记录 templateId，不影响运行。 */
  readonly templateId?: string;
}

// --- Template (template / instance 分离) ---

export interface TaskTemplate {
  readonly templateId: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly definition: TaskDefinition;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TemplateUpdates {
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly definition?: TaskDefinition;
}

// --- Event subscription (hook mechanism) ---

export interface TaskEventHandlers {
  onStepResult?: (instanceId: string, result: TaskStepResult) => void;
  onTaskSettled?: (instanceId: string, lifecycle: TaskLifecycleStatus) => void;
  /**
   * Reserved for future UI/debug consumers. 当前无生产消费者；保留以避免后续 subscriber
   * 想监听 lifecycle 转移时再回头扩接口。
   */
  onTaskLifecycleChange?: (
    instanceId: string,
    from: TaskLifecycleStatus,
    to: TaskLifecycleStatus,
  ) => void;
}

export type Unsubscribe = () => void;

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

// --- Condition match input ---
// Decoupled from receive internals. Service layer maps from receive public API outputs.

export interface ConditionMatchInput {
  readonly frameId: string;
  readonly fieldValues: Readonly<Record<string, number | string | null>>;
  readonly sourceId?: string;
}

// --- ResolvedStopCondition & resolveStopCondition ---

export type ResolvedStopCondition = TaskStopCondition;

export function resolveStopCondition(def: TaskDefinition): ResolvedStopCondition {
  if (def.fieldVariations && def.fieldVariations.length > 0) {
    const maxLen = Math.max(...def.fieldVariations.map(v => v.values.length));
    return { ...def.stopCondition, maxIterations: maxLen };
  }
  // Immediate schedule defaults to 1 iteration
  if (def.schedule.kind === 'immediate' && !def.stopCondition?.maxIterations) {
    return { ...def.stopCondition, maxIterations: 1 };
  }
  return def.stopCondition ?? {};
}
