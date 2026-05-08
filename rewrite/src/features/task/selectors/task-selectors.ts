import type {
  TaskInstanceState,
  TaskProgress,
} from '../core';
import { calculateProgress, cloneInstanceState } from '../core';
import type { TaskStateSnapshot, TaskStatisticsSnapshot } from '../state';

export function selectTaskInstances(snapshot: TaskStateSnapshot): TaskInstanceState[] {
  return snapshot.instances.map(cloneInstanceState);
}

export function selectTaskInstance(
  snapshot: TaskStateSnapshot,
  instanceId: string,
): TaskInstanceState | undefined {
  const instance = snapshot.instances.find((i) => i.instanceId === instanceId);
  return instance ? cloneInstanceState(instance) : undefined;
}

export function selectTaskProgress(
  snapshot: TaskStateSnapshot,
  instanceId: string,
): TaskProgress | undefined {
  const instance = snapshot.instances.find((i) => i.instanceId === instanceId);
  return instance ? calculateProgress(instance) : undefined;
}

export function selectTaskHistory(snapshot: TaskStateSnapshot): TaskInstanceState[] {
  return snapshot.history.map(cloneInstanceState);
}

export function selectTaskStatistics(snapshot: TaskStateSnapshot): TaskStatisticsSnapshot {
  return { ...snapshot.statistics };
}

export interface TaskUiSnapshot {
  readonly instances: readonly TaskInstanceState[];
  readonly history: readonly TaskInstanceState[];
  readonly statistics: TaskStatisticsSnapshot;
}

export function selectTaskSnapshot(snapshot: TaskStateSnapshot): TaskUiSnapshot {
  return {
    instances: snapshot.instances.map(cloneInstanceState),
    history: snapshot.history.map(cloneInstanceState),
    statistics: { ...snapshot.statistics },
  };
}
