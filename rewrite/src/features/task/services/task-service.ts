import type {
  TaskDefinition,
  TaskInstanceState,
  TaskProgress,
  TaskTemplate,
  TemplateUpdates,
  TaskEventHandlers,
  Unsubscribe,
} from '../core';
import { isTerminal } from '../core';
import type { SendServiceProvider, ReceiveEventSource } from '../adapters';
import type { TaskStateSnapshot, TaskStatisticsSnapshot } from '../state';
import { createTaskState, emptyStatistics, type TaskStateContainer } from '../state/task-state';
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
import type { TaskTemplateStorage } from './task-template-storage';
import type { TaskHistoryStorage } from './task-history-storage';
import { debounce } from '@/shared/utils/debounce';

function generateTemplateId(): string {
  // Electron 30+ renderer 必有 crypto.randomUUID；不需要 fallback
  return crypto.randomUUID();
}

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
  /** @deprecated 改用 subscribe({ onTaskSettled })。本 API 保留向后兼容。 */
  onSettled(instanceId: string): Promise<void>;
  createTemplate(name: string, definition: TaskDefinition, tags?: readonly string[]): TaskTemplate;
  listTemplates(): readonly TaskTemplate[];
  getTemplate(templateId: string): TaskTemplate | undefined;
  updateTemplate(templateId: string, updates: TemplateUpdates): TaskTemplate | undefined;
  deleteTemplate(templateId: string): boolean;
  instanciateTemplate(templateId: string): TaskInstanceState;
  clearHistory(): void;
  subscribe(handlers: TaskEventHandlers): Unsubscribe;
  /**
   * 运行时注入模板存储(S012 根因 D):wireFeatures 同步初始化时无 fileFacade,
   * bootstrap 异步创建文件后端后注入。注入后 debounce 写入走新 storage。
   */
  setTemplateStorage(storage: TaskTemplateStorage): void;
  /**
   * 批量灌入模板(S012 根因 D):bootstrap 从文件 hydrate 后调,替代构造时同步 loadAll。
   * 会清空当前 state 的模板再灌入(bootstrap 专用,正常 CRUD 不用)。
   */
  hydrateTemplates(templates: readonly TaskTemplate[]): void;
}

export interface CreateTaskServiceOptions {
  readonly sendService: SendServiceProvider;
  readonly receiveEventSource: ReceiveEventSource;
  readonly timerService?: unknown; // placeholder for future TimerService injection
  readonly fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;
  readonly state?: TaskStateContainer;
  readonly now?: () => string;
  readonly templateStorage?: TaskTemplateStorage;
  readonly historyStorage?: TaskHistoryStorage;
}

// --- Factory ---

let nextInstanceId = 1;

export function createTaskService(options: CreateTaskServiceOptions): TaskService {
  const sendService = options.sendService;
  const receiveSource = options.receiveEventSource;
  const historyStorage = options.historyStorage;
  const loadedHistory = historyStorage?.loadAll() ?? [];
  const state = options.state ?? createTaskState(
    loadedHistory.length > 0
      ? { snapshot: { instances: [], history: loadedHistory, statistics: emptyStatistics() } }
      : undefined,
  );
  const now = options.now ?? (() => new Date().toISOString());
  const fieldValueProvider = options.fieldValueProvider;
  // templateStorage 可运行时替换(S012 根因 D):wireFeatures 同步初始化时无 fileFacade,
  // 传 undefined;bootstrap 异步读到文件后端后调 setTemplateStorage 注入。
  let templateStorage = options.templateStorage;

  // 持久化：启动时 loadAll 灌进 state；变更后 debounce 500ms 写入
  if (templateStorage) {
    for (const tpl of templateStorage.loadAll()) {
      state.upsertTemplate(tpl);
    }
  }
  const schedulePersist = debounce((): void => {
    if (!templateStorage) return;
    try {
      templateStorage.saveAll(state.listTemplates());
    } catch (err) {
      console.error('[task] template persist failed', err);
    }
  }, 500);

  // 历史持久化：任务终态 / 删除 / 清空时 debounce 写入
  const scheduleHistoryPersist = debounce((): void => {
    if (!historyStorage) return;
    try {
      const snapshot = state.getSnapshot();
      const terminated = snapshot.instances.filter((i) => isTerminal(i.lifecycle));
      const historyIds = new Set(snapshot.history.map((i) => i.instanceId));
      const merged = [...snapshot.history, ...terminated.filter((i) => !historyIds.has(i.instanceId))];
      historyStorage.saveAll(merged);
    } catch (err) {
      console.error('[task] history persist failed', err);
    }
  }, 500);

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

  // --- Internal: auto-persist history when task settles ---
  state.subscribe({
    onTaskSettled() {
      scheduleHistoryPersist();
    },
  });

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

  function createTaskInternal(
    definition: TaskDefinition,
    opts?: { readonly templateId?: string },
  ): TaskInstanceState {
    const instanceId = `task-inst-${nextInstanceId++}`;
    return state.createInstance(instanceId, definition, opts?.templateId);
  }

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
      return createTaskInternal(definition);
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
      if (inst && !isTerminal(inst.lifecycle)) return;

      if (inst) {
        lifecycle.abortInstance(instanceId);
        state.removeInstance(instanceId);
      }
      state.removeFromHistory(instanceId);
      scheduleHistoryPersist();
    },

    retryTask(sourceInstanceId) {
      const source = state.getInstance(sourceInstanceId);
      if (!source || !isTerminal(source.lifecycle)) return undefined;

      const newInstanceId = `task-inst-${nextInstanceId++}`;
      state.createInstance(
        newInstanceId,
        source.definitionRef,
        source.templateId,
      );
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

    createTemplate(name, definition, tags = []) {
      const nowTs = now();
      const template: TaskTemplate = {
        templateId: generateTemplateId(),
        name,
        tags: [...tags],
        definition,
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      const result = state.upsertTemplate(template);
      schedulePersist();
      return result;
    },

    listTemplates() {
      return state.listTemplates();
    },

    getTemplate(templateId) {
      return state.getTemplate(templateId);
    },

    updateTemplate(templateId, updates) {
      const existing = state.getTemplate(templateId);
      if (!existing) return undefined;
      const updated: TaskTemplate = {
        ...existing,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.tags !== undefined ? { tags: [...updates.tags] } : {}),
        ...(updates.definition !== undefined ? { definition: updates.definition } : {}),
        updatedAt: now(),
      };
      const result = state.upsertTemplate(updated);
      schedulePersist();
      return result;
    },

    deleteTemplate(templateId) {
      const result = state.removeTemplate(templateId);
      schedulePersist();
      return result;
    },

    instanciateTemplate(templateId) {
      const template = state.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }
      return createTaskInternal(template.definition, { templateId });
    },

    clearHistory() {
      state.clearHistory();
      historyStorage?.clear();
    },

    subscribe(handlers) {
      return state.subscribe(handlers);
    },

    setTemplateStorage(storage) {
      templateStorage = storage;
    },

    hydrateTemplates(templates) {
      // 整体替换 state 的模板集(bootstrap hydrate 专用)。replaceTemplates 先清空再灌入,
      // 保证文件里的模板和 state 完全一致(避免构造时空 state 残留 + 旧模板混在一起)。
      // storage 已被 bootstrap 先 hydrate 过(读取文件),这里只灌 state。
      state.replaceTemplates(templates);
    },
  };
}
