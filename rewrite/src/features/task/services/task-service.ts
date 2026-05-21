import type {
  TaskDefinition,
  TaskInstanceState,
  TaskProgress,
} from '../core';
import { isTerminal } from '../core';
import type { SendServiceProvider, ReceiveEventSource } from '../adapters';
import type { TaskStateSnapshot, TaskStatisticsSnapshot } from '../state';
import { createTaskState, type TaskStateContainer } from '../state/task-state';
import {
  selectTaskInstance,
  selectTaskProgress,
  selectTaskSnapshot,
  selectTaskStatistics,
} from '../selectors';
import { ConditionRegistry } from './condition-registry';
import { createStepExecutors } from './task-step-executors';
import { createLifecycleManager } from './task-lifecycle-manager';
import { createErrorPolicyHandler } from './task-error-policy';
import { createIterationLoops } from './task-iteration-loops';

// --- Public interfaces ---

export interface TaskReader {
  getSnapshot(): TaskStateSnapshot;
  getInstance(instanceId: string): TaskInstanceState | undefined;
  getProgress(instanceId: string): TaskProgress | undefined;
  getStatistics(): TaskStatisticsSnapshot;
}

export interface TaskService extends TaskReader {
  createTask(definition: TaskDefinition): TaskInstanceState;
  startTask(instanceId: string): void;
  pauseTask(instanceId: string): void;
  resumeTask(instanceId: string): void;
  stopTask(instanceId: string): void;
  stopAll(): number;
  removeTask(instanceId: string): void;
  retryTask(sourceInstanceId: string): TaskInstanceState | undefined;
  updateTask(instanceId: string, definition: TaskDefinition): TaskInstanceState | undefined;
  onSettled(instanceId: string): Promise<void>;
}

export interface CreateTaskServiceOptions {
  readonly sendService: SendServiceProvider;
  readonly receiveEventSource: ReceiveEventSource;
  readonly timerService?: unknown; // placeholder for future TimerService injection
  readonly fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;
  readonly state?: TaskStateContainer;
  readonly now?: () => string;
}

// --- Factory ---

let nextInstanceId = 1;

export function createTaskService(options: CreateTaskServiceOptions): TaskService {
  const sendService = options.sendService;
  const receiveSource = options.receiveEventSource;
  const state = options.state ?? createTaskState();
  const now = options.now ?? (() => new Date().toISOString());
  const fieldValueProvider = options.fieldValueProvider;

  // Execution control
  const abortResolvers = new Map<string, () => void>();
  const settleResolvers = new Map<string, Set<() => void>>();

  // Condition matching
  const conditionRegistry = new ConditionRegistry();
  let receiveSubscription: (() => void) | null = null;
  let subscriptionRefCount = 0;

  // Wire sub-modules
  const lifecycle = createLifecycleManager({
    state,
    conditionRegistry,
    abortResolvers,
    settleResolvers,
    now,
  });

  const stepExecutors = createStepExecutors({
    state,
    sendService,
    conditionRegistry,
    fieldValueProvider,
    now,
  });

  const errorPolicy = createErrorPolicyHandler({
    state,
    conditionRegistry,
    updateLifecycle: lifecycle.updateLifecycle,
    stepExecutors,
    now,
  });

  const loops = createIterationLoops({
    state,
    conditionRegistry,
    updateLifecycle: lifecycle.updateLifecycle,
    stepExecutors,
    errorPolicy,
    fieldValueProvider,
    now,
  });

  // --- Subscription management ---

  function ensureSubscription(): void {
    if (receiveSubscription) {
      subscriptionRefCount++;
      return;
    }
    receiveSubscription = receiveSource.subscribe((input) => {
      conditionRegistry.processInput(input);
    });
    subscriptionRefCount = 1;
  }

  function releaseSubscription(): void {
    subscriptionRefCount--;
    if (subscriptionRefCount <= 0 && receiveSubscription) {
      receiveSubscription();
      receiveSubscription = null;
      subscriptionRefCount = 0;
    }
  }

  // --- Execution loop orchestration ---

  async function runExecutionLoop(
    instanceId: string,
    signal: Promise<void>,
  ): Promise<void> {
    const inst = state.getInstance(instanceId);
    if (!inst) return;

    try {
      ensureSubscription();

      // Use the unified runTask via the loops context
      await loops.runTimedLoop(instanceId, inst.definitionRef, signal);

      const current = state.getInstance(instanceId);
      if (current && current.lifecycle === 'running') {
        lifecycle.completeTask(instanceId);
      }
    } catch (err) {
      const current = state.getInstance(instanceId);
      if (current && current.lifecycle === 'running') {
        lifecycle.failTask(instanceId, err instanceof Error ? err.message : String(err));
      }
    } finally {
      releaseSubscription();
      abortResolvers.delete(instanceId);
      lifecycle.resolveSettle(instanceId);
    }
  }

  // --- Public API ---

  return {
    getSnapshot() {
      return selectTaskSnapshot(state.getSnapshot());
    },

    getInstance(instanceId) {
      return selectTaskInstance(state.getSnapshot(), instanceId);
    },

    getProgress(instanceId) {
      return selectTaskProgress(state.getSnapshot(), instanceId);
    },

    getStatistics() {
      return selectTaskStatistics(state.getSnapshot());
    },

    createTask(definition) {
      const instanceId = `task-inst-${nextInstanceId++}`;
      return state.createInstance(instanceId, definition);
    },

    startTask(instanceId) {
      const inst = state.getInstance(instanceId);
      if (!inst || inst.lifecycle !== 'created') return;

      lifecycle.updateLifecycle(instanceId, 'start');

      const signal = lifecycle.createAbortSignal(instanceId);

      // Fire-and-forget execution loop
      runExecutionLoop(instanceId, signal);
    },

    pauseTask(instanceId) {
      const inst = state.getInstance(instanceId);
      if (!inst || inst.lifecycle !== 'running') return;

      lifecycle.updateLifecycle(instanceId, 'pause');
      conditionRegistry.clear();
      lifecycle.abortInstance(instanceId);
    },

    resumeTask(instanceId) {
      const inst = state.getInstance(instanceId);
      if (!inst || inst.lifecycle !== 'paused') return;

      lifecycle.updateLifecycle(instanceId, 'resume');

      const signal = lifecycle.createAbortSignal(instanceId);
      runExecutionLoop(instanceId, signal);
    },

    stopTask(instanceId) {
      const inst = state.getInstance(instanceId);
      if (!inst) return;
      if (inst.lifecycle !== 'running' && inst.lifecycle !== 'paused') return;

      lifecycle.updateLifecycle(instanceId, 'stop');
      conditionRegistry.clear();
      lifecycle.abortInstance(instanceId);
      lifecycle.resolveSettle(instanceId);
    },

    stopAll(): number {
      const snapshot = state.getSnapshot();
      let stoppedCount = 0;
      for (const inst of snapshot.instances) {
        if (inst.lifecycle === 'running' || inst.lifecycle === 'paused') {
          lifecycle.updateLifecycle(inst.instanceId, 'stop');
          conditionRegistry.clear();
          lifecycle.abortInstance(inst.instanceId);
          lifecycle.resolveSettle(inst.instanceId);
          stoppedCount++;
        }
      }
      return stoppedCount;
    },

    removeTask(instanceId) {
      const inst = state.getInstance(instanceId);
      if (!inst) return;
      if (!isTerminal(inst.lifecycle)) return;

      lifecycle.abortInstance(instanceId);
      state.removeInstance(instanceId);
    },

    retryTask(sourceInstanceId) {
      const source = state.getInstance(sourceInstanceId);
      if (!source || !isTerminal(source.lifecycle)) return undefined;

      const newInstanceId = `task-inst-${nextInstanceId++}`;
      state.createInstance(newInstanceId, source.definitionRef);
      lifecycle.updateLifecycle(newInstanceId, 'start');
      const signal = lifecycle.createAbortSignal(newInstanceId);
      runExecutionLoop(newInstanceId, signal);
      return state.getInstance(newInstanceId);
    },

    updateTask(instanceId, definition) {
      const inst = state.getInstance(instanceId);
      if (!inst || inst.lifecycle !== 'created') return undefined;
      return state.updateInstance(instanceId, { definitionRef: definition });
    },

    async onSettled(instanceId) {
      const inst = state.getInstance(instanceId);
      if (!inst || isTerminal(inst.lifecycle)) return;

      await new Promise<void>((resolve) => {
        let resolvers = settleResolvers.get(instanceId);
        if (!resolvers) {
          resolvers = new Set();
          settleResolvers.set(instanceId, resolvers);
        }
        resolvers.add(resolve);
      });
    },
  };
}
