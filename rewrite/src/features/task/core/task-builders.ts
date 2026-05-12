import type {
  SendStepDefinition,
  SendStepConfig,
  WaitConditionStepDefinition,
  WaitConditionStepConfig,
  DelayStepDefinition,
  TaskStepDefinition,
  TaskDefinition,
  TaskSchedulingMode,
  TaskTriggerSource,
  TaskErrorPolicy,
  TaskStopCondition,
  WaitCondition,
} from './types';

let nextStepId = 1;

export function createSendStep(
  sendConfig: SendStepConfig,
  options?: { readonly id?: string; readonly name?: string },
): SendStepDefinition {
  return {
    id: options?.id ?? `step-${nextStepId++}`,
    name: options?.name,
    kind: 'send',
    sendConfig,
  };
}

export function createDelayStep(
  durationMs: number,
  options?: { readonly id?: string; readonly name?: string },
): DelayStepDefinition {
  return {
    id: options?.id ?? `step-${nextStepId++}`,
    name: options?.name,
    kind: 'delay',
    delayConfig: { durationMs },
  };
}

export function createWaitConditionStep(
  waitConfig: WaitConditionStepConfig,
  options?: { readonly id?: string; readonly name?: string },
): WaitConditionStepDefinition {
  return {
    id: options?.id ?? `step-${nextStepId++}`,
    name: options?.name,
    kind: 'wait-condition',
    waitConfig,
  };
}

export function createTaskDefinition(
  options: {
    readonly id: string;
    readonly name: string;
    readonly schedulingMode: TaskSchedulingMode;
    readonly triggerSource: TaskTriggerSource;
    readonly steps: readonly TaskStepDefinition[];
    readonly errorPolicy: TaskErrorPolicy;
    readonly targetId?: string;
    readonly stopCondition?: TaskStopCondition;
    readonly intervalMs?: number;
    readonly delayBeforeStartMs?: number;
    readonly triggerCondition?: WaitCondition;
    readonly cooldownMs?: number;
  },
): TaskDefinition {
  return options as TaskDefinition;
}

export function cloneStepDefinition(step: Readonly<TaskStepDefinition>): TaskStepDefinition {
  return structuredClone(step);
}
