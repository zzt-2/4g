import type { TaskLifecycleStatus, TaskDefinition } from '../core';

export type TaskDisplayStatus =
  | TaskLifecycleStatus
  | 'waiting-trigger'
  | 'waiting-schedule';

export function resolveDisplayStatus(
  lifecycle: TaskLifecycleStatus,
  definition: TaskDefinition,
): string {
  if (lifecycle === 'running') {
    if (definition.schedule.kind === 'event') return 'waiting-trigger';
    if (definition.schedule.kind === 'timer') return 'waiting-schedule';
  }
  return lifecycle;
}

export const TASK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  created: { label: '待启动', color: 'grey' },
  running: { label: '运行中', color: 'positive' },
  waitingTrigger: { label: '等待触发', color: 'positive' },
  waitingSchedule: { label: '等待调度', color: 'positive' },
  paused: { label: '已暂停', color: 'warning' },
  completed: { label: '已完成', color: 'positive' },
  failed: { label: '失败', color: 'negative' },
  stopped: { label: '已停止', color: 'grey' },
} as const;
