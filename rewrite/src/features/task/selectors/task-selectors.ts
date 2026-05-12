import type {
  TaskInstanceState,
  TaskProgress,
} from '../core';
import { calculateProgress } from '../core';
import type { TaskStateSnapshot, TaskStatisticsSnapshot } from '../state';

export function selectTaskInstances(snapshot: TaskStateSnapshot): TaskInstanceState[] {
  return [...snapshot.instances];
}

export function selectTaskInstance(
  snapshot: TaskStateSnapshot,
  instanceId: string,
): TaskInstanceState | undefined {
  const instance = snapshot.instances.find((i) => i.instanceId === instanceId);
  return instance ? { ...instance } : undefined;
}

export function selectTaskProgress(
  snapshot: TaskStateSnapshot,
  instanceId: string,
): TaskProgress | undefined {
  const instance = snapshot.instances.find((i) => i.instanceId === instanceId);
  return instance ? calculateProgress(instance) : undefined;
}

export function selectTaskHistory(snapshot: TaskStateSnapshot): TaskInstanceState[] {
  return [...snapshot.history];
}

export function selectTaskStatistics(snapshot: TaskStateSnapshot): TaskStatisticsSnapshot {
  return { ...snapshot.statistics };
}

export function selectActiveInstances(snapshot: TaskStateSnapshot): TaskInstanceState[] {
  return snapshot.instances.filter(
    (i) => i.lifecycle === 'created' || i.lifecycle === 'running' || i.lifecycle === 'paused',
  );
}

export interface TaskUiSnapshot {
  readonly instances: readonly TaskInstanceState[];
  readonly history: readonly TaskInstanceState[];
  readonly statistics: TaskStatisticsSnapshot;
}

export function selectTaskSnapshot(snapshot: TaskStateSnapshot): TaskUiSnapshot {
  return {
    instances: [...snapshot.instances],
    history: [...snapshot.history],
    statistics: { ...snapshot.statistics },
  };
}
