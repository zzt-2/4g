import type { TaskStepKind, TaskErrorAction, ComparisonOperator, TaskStepDefinition } from '../core';
import { createSendStep, createDelayStep, createWaitConditionStep } from '../core';

export const STEP_KIND_LABELS: Record<TaskStepKind, { label: string; icon: string }> = {
  send: { label: '发送', icon: 'o_send' },
  'wait-condition': { label: '等待条件', icon: 'o_hourglass_empty' },
  delay: { label: '延时', icon: 'o_timer' },
};

export const COMPARISON_OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  eq: '等于',
  neq: '不等于',
  gt: '大于',
  lt: '小于',
  gte: '大于等于',
  lte: '小于等于',
  contains: '包含',
  change: '变化',
  any: '任意',
} as const;

export const LOGIC_OPERATOR_OPTIONS = [
  { value: 'and', label: '且' },
  { value: 'or', label: '或' },
] as const;

export const ERROR_ACTION_LABELS: Record<TaskErrorAction, string> = {
  retry: '重试',
  'skip-step': '跳过',
  stop: '停止',
  pause: '暂停',
};

export const ERROR_ACTION_OPTIONS = [
  { value: 'retry', label: '重试' },
  { value: 'skip-step', label: '跳过步骤' },
  { value: 'stop', label: '停止' },
  { value: 'pause', label: '暂停' },
] as const;

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

/**
 * 按种类创建空白步骤定义。集中在这里避免页面之间重复 switch + nextStepId 计数器。
 * id 由 createSendStep/createDelayStep/createWaitConditionStep 内部生成。
 */
export function createBlankStepByKind(kind: TaskStepKind): TaskStepDefinition {
  switch (kind) {
    case 'send':
      return createSendStep({ frameId: '', targetId: '' }, { name: '发送步骤' });
    case 'wait-condition':
      return createWaitConditionStep(
        { conditions: [], onTimeout: 'fail' },
        { name: '等待条件' },
      );
    case 'delay':
      return createDelayStep(1000, { name: '延时' });
  }
}
