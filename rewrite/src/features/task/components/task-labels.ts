import type { TaskStepKind, TaskErrorAction } from '../core';

export const STEP_KIND_LABELS: Record<TaskStepKind, { label: string; icon: string }> = {
  send: { label: '发送', icon: 'send' },
  'wait-condition': { label: '等待条件', icon: 'hourglass_empty' },
  delay: { label: '延时', icon: 'timer' },
};

export const ERROR_ACTION_LABELS: Record<TaskErrorAction, string> = {
  retry: '重试',
  'skip-step': '跳过',
  stop: '停止',
  pause: '暂停',
};

export const ON_TIMEOUT_OPTIONS = [
  { value: 'continue', label: '继续' },
  { value: 'skip', label: '跳过' },
  { value: 'fail', label: '失败' },
] as const;

export const ADD_STEP_OPTIONS: readonly { value: TaskStepKind; label: string }[] = [
  { value: 'send', label: '发送步骤' },
  { value: 'wait-condition', label: '等待条件步骤' },
  { value: 'delay', label: '延时步骤' },
] as const;
