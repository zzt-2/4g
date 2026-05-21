import type { TaskInstanceState } from '../core';
import { transition } from '../core';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';

// --- Lifecycle context ---

export interface LifecycleContext {
  state: TaskStateContainer;
  conditionRegistry: ConditionRegistry;
  abortResolvers: Map<string, () => void>;
  settleResolvers: Map<string, Set<() => void>>;
  now: () => string;
}

export type UpdateLifecycleFn = (
  instanceId: string,
  action: 'start' | 'pause' | 'resume' | 'stop' | 'complete' | 'fail',
  extra?: Partial<TaskInstanceState>,
) => TaskInstanceState | undefined;

export function createLifecycleManager(ctx: LifecycleContext) {
  // --- Abort / settle ---

  function createAbortSignal(instanceId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      ctx.abortResolvers.set(instanceId, resolve);
    });
  }

  function abortInstance(instanceId: string): void {
    const resolve = ctx.abortResolvers.get(instanceId);
    if (resolve) {
      ctx.abortResolvers.delete(instanceId);
      resolve();
    }
  }

  function resolveSettle(instanceId: string): void {
    const resolvers = ctx.settleResolvers.get(instanceId);
    if (resolvers) {
      ctx.settleResolvers.delete(instanceId);
      for (const resolve of resolvers) resolve();
    }
  }

  // --- Lifecycle helpers ---

  const updateLifecycle: UpdateLifecycleFn = (
    instanceId,
    action,
    extra?,
  ): TaskInstanceState | undefined => {
    const instance = ctx.state.getInstance(instanceId);
    if (!instance) return undefined;
    const newStatus = transition(instance.lifecycle, action);
    const timestampField =
      action === 'start' ? 'startedAt' :
      action === 'pause' ? 'pausedAt' :
      action === 'stop' ? 'stoppedAt' :
      action === 'complete' ? 'completedAt' :
      action === 'fail' ? 'failedAt' : undefined;
    return ctx.state.updateInstance(instanceId, {
      lifecycle: newStatus,
      ...(timestampField ? { [timestampField]: ctx.now() } : {}),
      ...extra,
    });
  };

  function completeTask(instanceId: string): void {
    updateLifecycle(instanceId, 'complete');
    ctx.conditionRegistry.clear();
    resolveSettle(instanceId);
  }

  function failTask(instanceId: string, error: string): void {
    updateLifecycle(instanceId, 'fail', { error });
    ctx.conditionRegistry.clear();
    resolveSettle(instanceId);
  }

  return { createAbortSignal, abortInstance, resolveSettle, updateLifecycle, completeTask, failTask };
}
