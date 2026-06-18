import type {
  SendStepConfig,
  WaitConditionConfig,
  TaskStepDefinition,
  TaskDefinition,
  ScheduleDriver,
  TaskErrorPolicy,
  TaskStopCondition,
} from './types';

let nextStepId = 1;

export function createSendStep(
  config: SendStepConfig,
  options?: { readonly id?: string; readonly name?: string },
): TaskStepDefinition {
  return {
    id: options?.id ?? `step-${nextStepId++}`,
    name: options?.name,
    kind: 'send',
    config,
  };
}

export function createDelayStep(
  durationMs: number,
  options?: { readonly id?: string; readonly name?: string },
): TaskStepDefinition {
  return {
    id: options?.id ?? `step-${nextStepId++}`,
    name: options?.name,
    kind: 'delay',
    config: { durationMs },
  };
}

export function createWaitConditionStep(
  config: WaitConditionConfig,
  options?: { readonly id?: string; readonly name?: string },
): TaskStepDefinition {
  return {
    id: options?.id ?? `step-${nextStepId++}`,
    name: options?.name,
    kind: 'wait-condition',
    config,
  };
}

export function createTaskDefinition(
  options: {
    readonly id: string;
    readonly name: string;
    readonly schedule: ScheduleDriver;
    readonly steps: readonly TaskStepDefinition[];
    readonly errorPolicy: TaskErrorPolicy;
    readonly stopCondition?: TaskStopCondition;
    readonly defaultTargetId?: string;
  },
): TaskDefinition {
  return options as TaskDefinition;
}

export function cloneStepDefinition(step: Readonly<TaskStepDefinition>): TaskStepDefinition {
  return structuredClone(step);
}
