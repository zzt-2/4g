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

/**
 * 批量设置发送目标（任务级）：写 definition.defaultTargetId + 清空所有 send step 的
 * step 级 targetId 覆盖。不可变，返回新 definition。
 *
 * 语义：用户原话"设置所有的（直接改，不加属性）"——所有 send step 统一回退到任务级
 * defaultTargetId，所以同时清空 step 级覆盖，避免个别 step 仍走自己的旧 targetId。
 * 不引入额外的"是否启用"开关字段。
 *
 * - null / undefined / '' → 清空 defaultTargetId（移除）+ 清空所有 step 级 targetId
 * - 其它字符串 → 写入 defaultTargetId + 清空所有 step 级 targetId
 * 非 send step（delay / wait-condition）原样透传。其余字段（schedule/errorPolicy 等）不变。
 */
export function applyDefaultTargetOverride(
  definition: Readonly<TaskDefinition>,
  targetId: string | null | undefined,
): TaskDefinition {
  const resolved = targetId && targetId.trim().length > 0 ? targetId : undefined;
  const steps = definition.steps.map<TaskStepDefinition>((step) => {
    if (step.kind !== 'send') return step;
    const { targetId: _omit, ...rest } = step.config as SendStepConfig;
    void _omit;
    return { ...step, config: { ...rest } as SendStepConfig } as TaskStepDefinition;
  });
  const { defaultTargetId: _dropOld, ...rest } = definition;
  void _dropOld;
  return resolved
    ? { ...rest, steps, defaultTargetId: resolved }
    : { ...rest, steps };
}
