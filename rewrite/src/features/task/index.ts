// Core types
export {
  TASK_STEP_KINDS,
  COMPARISON_OPERATORS,
  TASK_ERROR_ACTIONS,
  TASK_LIFECYCLE_STATUSES,
} from './core';
export type {
  TaskStepKind,
  ComparisonOperator,
  ConditionTerm,
  ScheduleDriver,
  FieldVariation,
  StepRepeat,
  SendStepConfig,
  WaitConditionConfig,
  DelayStepConfig,
  TaskStepDefinition,
  TaskErrorAction,
  TaskErrorPolicy,
  TaskStopCondition,
  ResolvedStopCondition,
  TaskDefinition,
  TaskLifecycleStatus,
  LifecycleAction,
  SendStepResult,
  WaitConditionStepResult,
  DelayStepResult,
  TaskStepResultPayload,
  TaskStepResult,
  TaskInstanceState,
  ReadonlyTaskInstanceState,
  TaskProgress,
  TaskExecutionSummary,
  ConditionMatchInput,
} from './core';
export { resolveStopCondition, isStepResultFailed, calculateProgress, isTerminal } from './core';

// Core validation & builders
export { validateTaskDefinition } from './core';
export type { TaskValidationIssue } from './core';
export {
  createSendStep,
  createDelayStep,
  createWaitConditionStep,
  createTaskDefinition,
  cloneStepDefinition,
} from './core';
export {
  serializeTaskDefinition,
  deserializeTaskDefinition,
} from './core';
export type { SerializedTaskDefinition } from './core';

// Services
export { createTaskService } from './services';
export type { TaskService, TaskReader, CreateTaskServiceOptions } from './services';

// Adapter ports
export type { ReceiveEventSource, SendServiceProvider, TimerService } from './adapters';

// State types (read-only surface)
export type { TaskStatisticsSnapshot, TaskStateSnapshot } from './state';

// Selectors
export {
  selectTaskInstances,
  selectTaskInstance,
  selectTaskProgress,
  selectTaskHistory,
  selectTaskStatistics,
  selectTaskSnapshot,
  selectActiveInstances,
} from './selectors';
export type { TaskUiSnapshot } from './selectors';
