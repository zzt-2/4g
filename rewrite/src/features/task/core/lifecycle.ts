import type { TaskLifecycleStatus, LifecycleAction } from './types';

const VALID_TRANSITIONS: Record<TaskLifecycleStatus, readonly TaskLifecycleStatus[]> = {
  created: ['running'],
  running: ['paused', 'stopped', 'completed', 'failed'],
  paused: ['running', 'stopped'],
  stopped: [],
  completed: [],
  failed: [],
};

const ACTION_TARGETS: Record<LifecycleAction, readonly { from: TaskLifecycleStatus; to: TaskLifecycleStatus }[]> = {
  start: [{ from: 'created', to: 'running' }],
  pause: [{ from: 'running', to: 'paused' }],
  resume: [{ from: 'paused', to: 'running' }],
  stop: [{ from: 'running', to: 'stopped' }, { from: 'paused', to: 'stopped' }],
  complete: [{ from: 'running', to: 'completed' }],
  fail: [{ from: 'running', to: 'failed' }],
};

export function canTransition(from: TaskLifecycleStatus, to: TaskLifecycleStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function transition(state: TaskLifecycleStatus, action: LifecycleAction): TaskLifecycleStatus {
  const targets = ACTION_TARGETS[action];
  const match = targets.find((t) => t.from === state);
  if (!match) {
    throw new Error(`Invalid lifecycle transition: cannot '${action}' from '${state}'`);
  }
  return match.to;
}

export function isTerminal(status: TaskLifecycleStatus): boolean {
  return status === 'stopped' || status === 'completed' || status === 'failed';
}
