import type { ReadonlyDeep } from '@/shared/types/readonly-deep';
import type {
  TaskDefinition,
  TaskInstanceState,
  TaskStepResult,
} from '../core';
import { isStepResultFailed } from '../core';
import { deepClone } from '@/shared/utils/deep-clone';

const MAX_HISTORY = 50;
const DEFAULT_MAX_STEP_RESULT_ITERATIONS = 100;

// --- Helpers ---

// --- Statistics ---

export interface TaskStatisticsSnapshot {
  readonly totalCreated: number;
  readonly totalCompleted: number;
  readonly totalStopped: number;
  readonly totalFailed: number;
  readonly totalStepsExecuted: number;
  readonly totalStepsSucceeded: number;
  readonly totalStepsFailed: number;
  readonly totalStepsSkipped: number;
}

// --- State snapshot ---

export interface TaskStateSnapshot {
  readonly instances: readonly TaskInstanceState[];
  readonly history: readonly TaskInstanceState[];
  readonly statistics: TaskStatisticsSnapshot;
}

export type ReadonlyTaskStateSnapshot = ReadonlyDeep<TaskStateSnapshot>;

// --- Container ---

export interface TaskStateContainer {
  getSnapshot(): TaskStateSnapshot;
  createInstance(instanceId: string, definition: TaskDefinition): TaskInstanceState;
  updateInstance(
    instanceId: string,
    updates: Partial<Omit<TaskInstanceState, 'instanceId'>>,
  ): TaskInstanceState | undefined;
  removeInstance(instanceId: string): TaskInstanceState | undefined;
  addStepResult(instanceId: string, result: TaskStepResult): TaskInstanceState | undefined;
  getInstance(instanceId: string): TaskInstanceState | undefined;
  moveToHistory(instanceId: string): TaskInstanceState | undefined;
  resetStats(): TaskStateSnapshot;
}

function emptyStatistics(): TaskStatisticsSnapshot {
  return {
    totalCreated: 0,
    totalCompleted: 0,
    totalStopped: 0,
    totalFailed: 0,
    totalStepsExecuted: 0,
    totalStepsSucceeded: 0,
    totalStepsFailed: 0,
    totalStepsSkipped: 0,
  };
}

// --- Factory ---

export function createTaskState(
  initialValue?: { readonly snapshot?: ReadonlyTaskStateSnapshot },
): TaskStateContainer {
  const instances = new Map<string, TaskInstanceState>();
  let history: TaskInstanceState[] = [];
  let statistics = emptyStatistics();

  if (initialValue?.snapshot) {
    for (const inst of initialValue.snapshot.instances) {
      instances.set(inst.instanceId, deepClone(inst));
    }
    history = initialValue.snapshot.history.map(deepClone);
    statistics = { ...initialValue.snapshot.statistics };
  }

  function getSnapshot(): TaskStateSnapshot {
    return {
      instances: [...instances.values()].map(deepClone),
      history: history.map(deepClone),
      statistics: { ...statistics },
    };
  }

  return {
    getSnapshot,

    createInstance(instanceId, definition) {
      const instance: TaskInstanceState = {
        instanceId,
        definitionRef: definition,
        lifecycle: 'created',
        currentStepIndex: 0,
        currentIteration: 0,
        stepResults: [],
      };
      instances.set(instanceId, instance);
      statistics = { ...statistics, totalCreated: statistics.totalCreated + 1 };
      return deepClone(instance);
    },

    updateInstance(instanceId, updates) {
      const existing = instances.get(instanceId);
      if (!existing) return undefined;
      const updated: TaskInstanceState = {
        ...existing,
        ...updates,
        instanceId: existing.instanceId,
      };
      instances.set(instanceId, updated);

      if (updates.lifecycle === 'completed') {
        statistics = { ...statistics, totalCompleted: statistics.totalCompleted + 1 };
      } else if (updates.lifecycle === 'stopped') {
        statistics = { ...statistics, totalStopped: statistics.totalStopped + 1 };
      } else if (updates.lifecycle === 'failed') {
        statistics = { ...statistics, totalFailed: statistics.totalFailed + 1 };
      }

      return deepClone(updated);
    },

    removeInstance(instanceId) {
      const existing = instances.get(instanceId);
      if (!existing) return undefined;
      instances.delete(instanceId);
      return deepClone(existing);
    },

    addStepResult(instanceId, result) {
      const existing = instances.get(instanceId);
      if (!existing) return undefined;

      const newResults = [...existing.stepResults, deepClone(result)];
      const maxIter = Math.max(existing.currentIteration, result.iteration);
      const minIteration = Math.max(0, maxIter - DEFAULT_MAX_STEP_RESULT_ITERATIONS + 1);
      const boundedResults = newResults.filter((r) => r.iteration >= minIteration);

      const updated: TaskInstanceState = {
        ...existing,
        stepResults: boundedResults,
        currentStepIndex: result.stepIndex,
        currentIteration: Math.max(existing.currentIteration, result.iteration),
      };
      instances.set(instanceId, updated);

      const isSkipped = result.appliedPolicy === 'skip-step';
      const isFailed = !isSkipped && isStepResultFailed(result);
      statistics = {
        ...statistics,
        totalStepsExecuted: statistics.totalStepsExecuted + 1,
        totalStepsSucceeded: statistics.totalStepsSucceeded + (isSkipped || isFailed ? 0 : 1),
        totalStepsFailed: statistics.totalStepsFailed + (isFailed ? 1 : 0),
        totalStepsSkipped: statistics.totalStepsSkipped + (isSkipped ? 1 : 0),
      };

      return deepClone(updated);
    },

    getInstance(instanceId) {
      const existing = instances.get(instanceId);
      return existing ? deepClone(existing) : undefined;
    },

    moveToHistory(instanceId) {
      const existing = instances.get(instanceId);
      if (!existing) return undefined;
      instances.delete(instanceId);
      history = [...history, deepClone(existing)].slice(-MAX_HISTORY);
      return deepClone(existing);
    },

    resetStats() {
      statistics = emptyStatistics();
      return getSnapshot();
    },
  };
}
