import type {
  TaskInstanceState,
  TaskProgress,
} from '../core';
import { calculateProgress } from '../core';
import type { TaskStateSnapshot, TaskStatisticsSnapshot } from '../state';
import type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlyTaskInstanceState = ReadonlyDeep<TaskInstanceState>;

export function selectTaskInstances(snapshot: TaskStateSnapshot): readonly ReadonlyTaskInstanceState[] {
  return [...snapshot.instances] as readonly ReadonlyTaskInstanceState[];
}

export function selectTaskInstance(
  snapshot: TaskStateSnapshot,
  instanceId: string,
): ReadonlyTaskInstanceState | undefined {
  const instance = snapshot.instances.find((i) => i.instanceId === instanceId);
  return instance ? { ...instance } as ReadonlyTaskInstanceState : undefined;
}

export function selectTaskProgress(
  snapshot: TaskStateSnapshot,
  instanceId: string,
): TaskProgress | undefined {
  const instance = snapshot.instances.find((i) => i.instanceId === instanceId);
  return instance ? calculateProgress(instance) : undefined;
}

const TERMINATED_LIFECYCLES = new Set(['completed', 'failed', 'stopped']);

export function selectTaskHistory(snapshot: TaskStateSnapshot): readonly ReadonlyTaskInstanceState[] {
  const historyInstances = snapshot.instances.filter(
    (i) => TERMINATED_LIFECYCLES.has(i.lifecycle),
  );
  const historyIds = new Set(snapshot.history.map((i) => i.instanceId));
  const merged = [...snapshot.history, ...historyInstances.filter((i) => !historyIds.has(i.instanceId))];
  return merged as readonly ReadonlyTaskInstanceState[];
}

export function selectTaskStatistics(snapshot: TaskStateSnapshot): Readonly<TaskStatisticsSnapshot> {
  return { ...snapshot.statistics };
}

export function selectActiveInstances(snapshot: TaskStateSnapshot): readonly ReadonlyTaskInstanceState[] {
  return snapshot.instances.filter(
    (i) => i.lifecycle === 'created' || i.lifecycle === 'running' || i.lifecycle === 'paused',
  ) as readonly ReadonlyTaskInstanceState[];
}

export interface TaskUiSnapshot {
  readonly instances: readonly ReadonlyTaskInstanceState[];
  readonly history: readonly ReadonlyTaskInstanceState[];
  readonly statistics: Readonly<TaskStatisticsSnapshot>;
}

export function selectTaskSnapshot(snapshot: TaskStateSnapshot): TaskUiSnapshot {
  return {
    instances: [...snapshot.instances] as readonly ReadonlyTaskInstanceState[],
    history: [...snapshot.history] as readonly ReadonlyTaskInstanceState[],
    statistics: { ...snapshot.statistics },
  };
}
