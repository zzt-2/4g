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

// --- FieldVariation (step 级离散值列表) ---
// 按步骤内 counter 索引取值(step 内 repeat×iteration 全局递增),取完 clamp 到最后一个。
// 连续累积(accumulation)不是用户声明的 resolver——只要帧有自引用表达式 expressionConfig,
// task 链路发送后自动把 resolvedFieldValues writeback 回 step 级 lastValues,下次喂回帧侧 seed,
// 帧侧 isSelfReferencing + Phase2/4 完成递推。用户零配置。

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
  readonly targetId?: string; // optional; falls back to definition.defaultTargetId at runtime
  readonly userFieldValues?: Readonly<Record<string, string | number | boolean>>;
  readonly variables?: VariableMap;
  readonly intervalAfterMs?: number;
  readonly repeat?: StepRepeat;
  readonly fieldVariations?: readonly FieldVariation[]; // step 级离散值列表
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
  readonly errorPolicy: TaskErrorPolicy;
  readonly defaultTargetId?: string; // task-wide fallback for send steps that omit targetId
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
  readonly currentStepStartedAt?: string;
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
  // fieldVariations 已下沉到 step 级(fieldResolvers),不再在任务级推导 maxIterations。
  // 用户设的 stopCondition.maxIterations 被尊重,不再被静默覆盖。
  // Immediate schedule defaults to 1 iteration
  if (def.schedule.kind === 'immediate' && !def.stopCondition?.maxIterations) {
    return { ...def.stopCondition, maxIterations: 1 };
  }
  return def.stopCondition ?? {};
}
