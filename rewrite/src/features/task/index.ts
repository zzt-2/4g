// Core types
export {
  TASK_STEP_KINDS,
  COMPARISON_OPERATORS,
  TASK_TRIGGER_SOURCES,
  TASK_SCHEDULING_MODES,
  TASK_ERROR_ACTIONS,
  TASK_LIFECYCLE_STATUSES,
} from './core';
export type {
  TaskStepKind,
  ComparisonOperator,
  WaitCondition,
  SendStepConfig,
  WaitConditionStepConfig,
  DelayStepConfig,
  SendStepDefinition,
  WaitConditionStepDefinition,
  DelayStepDefinition,
  TaskStepDefinition,
  TaskTriggerSource,
  TaskSchedulingMode,
  TaskErrorAction,
  TaskErrorPolicy,
  TaskStopCondition,
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
export type { ReceiveEventSource, SendServiceProvider } from './adapters';

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
