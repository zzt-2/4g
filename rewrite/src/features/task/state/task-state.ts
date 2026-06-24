import type { ReadonlyDeep } from '@/shared/types/readonly-deep';
import type {
  TaskDefinition,
  TaskInstanceState,
  TaskStepResult,
  TaskTemplate,
  TaskEventHandlers,
  TaskLifecycleStatus,
  Unsubscribe,
} from '../core';
import { isStepResultFailed, isTerminal } from '../core';
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
  createInstance(
    instanceId: string,
    definition: TaskDefinition,
    templateId?: string,
  ): TaskInstanceState;
  updateInstance(
    instanceId: string,
    updates: Partial<Omit<TaskInstanceState, 'instanceId'>>,
  ): TaskInstanceState | undefined;
  removeInstance(instanceId: string): TaskInstanceState | undefined;
  addStepResult(instanceId: string, result: TaskStepResult): TaskInstanceState | undefined;
  getInstance(instanceId: string): TaskInstanceState | undefined;
  moveToHistory(instanceId: string): TaskInstanceState | undefined;
  removeFromHistory(instanceId: string): boolean;
  clearHistory(): void;
  resetStats(): TaskStateSnapshot;
  listTemplates(): readonly TaskTemplate[];
  getTemplate(templateId: string): TaskTemplate | undefined;
  upsertTemplate(template: TaskTemplate): TaskTemplate;
  removeTemplate(templateId: string): boolean;
  /**
   * 用给定模板列表整体替换当前模板集(S012 根因 D bootstrap hydrate 用)。
   * 先清空再灌入,语义不同于 upsertTemplate 的逐个合并。
   */
  replaceTemplates(templates: readonly TaskTemplate[]): void;
  subscribe(handlers: TaskEventHandlers): Unsubscribe;
}

export function emptyStatistics(): TaskStatisticsSnapshot {
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
  const templates = new Map<string, TaskTemplate>();
  const subscribers = new Set<TaskEventHandlers>();
  let history: TaskInstanceState[] = [];
  let statistics = emptyStatistics();

  if (initialValue?.snapshot) {
    for (const inst of initialValue.snapshot.instances) {
      instances.set(inst.instanceId, deepClone(inst));
    }
    history = initialValue.snapshot.history.map(deepClone);
    statistics = { ...initialValue.snapshot.statistics };
  }

  // --- Event dispatch (错误隔离：单个 subscriber 失败不影响其他) ---

  function emitStepResult(instanceId: string, result: TaskStepResult): void {
    for (const handlers of subscribers) {
      try {
        handlers.onStepResult?.(instanceId, result);
      } catch (err) {
        console.error('[task] onStepResult subscriber error', err);
      }
    }
  }

  function emitTaskLifecycleChange(
    instanceId: string,
    from: TaskLifecycleStatus,
    to: TaskLifecycleStatus,
  ): void {
    for (const handlers of subscribers) {
      try {
        handlers.onTaskLifecycleChange?.(instanceId, from, to);
      } catch (err) {
        console.error('[task] onTaskLifecycleChange subscriber error', err);
      }
    }
  }

  function emitTaskSettled(instanceId: string, lifecycle: TaskLifecycleStatus): void {
    for (const handlers of subscribers) {
      try {
        handlers.onTaskSettled?.(instanceId, lifecycle);
      } catch (err) {
        console.error('[task] onTaskSettled subscriber error', err);
      }
    }
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

    createInstance(instanceId, definition, templateId) {
      const instance: TaskInstanceState = {
        instanceId,
        definitionRef: definition,
        lifecycle: 'created',
        currentStepIndex: 0,
        currentIteration: 0,
        stepResults: [],
        ...(templateId ? { templateId } : {}),
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

      // 事件分发：lifecycle 变化触发 onTaskLifecycleChange + 终态 onTaskSettled
      if (
        updates.lifecycle !== undefined &&
        updates.lifecycle !== existing.lifecycle
      ) {
        emitTaskLifecycleChange(instanceId, existing.lifecycle, updated.lifecycle);
        if (isTerminal(updated.lifecycle)) {
          emitTaskSettled(instanceId, updated.lifecycle);
        }
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

      const snapshot = deepClone(updated);
      emitStepResult(instanceId, deepClone(result));
      return snapshot;
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

    removeFromHistory(instanceId) {
      const before = history.length;
      history = history.filter((h) => h.instanceId !== instanceId);
      return history.length < before;
    },

    clearHistory() {
      history = [];
    },

    resetStats() {
      statistics = emptyStatistics();
      return getSnapshot();
    },

    listTemplates() {
      return [...templates.values()].map(deepClone);
    },

    getTemplate(templateId) {
      const existing = templates.get(templateId);
      return existing ? deepClone(existing) : undefined;
    },

    upsertTemplate(template) {
      templates.set(template.templateId, deepClone(template));
      return deepClone(template);
    },

    removeTemplate(templateId) {
      return templates.delete(templateId);
    },

    replaceTemplates(next) {
      templates.clear();
      for (const tpl of next) {
        templates.set(tpl.templateId, deepClone(tpl));
      }
    },

    subscribe(handlers) {
      subscribers.add(handlers);
      return () => {
        subscribers.delete(handlers);
      };
    },
  };
}
