import type { SendRequest } from '@/features/send';
import type { TaskDefinition, TaskStepResult } from '../core';
import type { SendServiceProvider } from '../adapters';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';
import { resolveFieldValues } from './task-iteration-loops';
import { resolveSendTargetId } from '../core';

// --- Standalone helpers ---

export function sleep(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export function buildSendRequest(
  stepConfig: TaskDefinition['steps'][number] & { kind: 'send' },
  definition: TaskDefinition,
  stepIndex: number,
  iteration: number,
  counter: number,
  lastValues: Map<string, string | number | boolean>,
): SendRequest {
  const resolvedTargetId = resolveSendTargetId(stepConfig.config, definition);
  // baseValues = 用户原始值 ← writeback 回写的上次结果(累积自动行为:帧有自引用表达式时
  // 上次 resolvedFieldValues 喂回这里当 seed,帧侧 Phase2 取用)。variation 取值会覆盖 baseValues。
  const baseValues: Record<string, string | number | boolean> = { ...(stepConfig.config.userFieldValues ?? {}) };
  for (const [k, v] of lastValues) {
    baseValues[k] = v;
  }
  return {
    frameId: stepConfig.config.frameId,
    targetId: resolvedTargetId ?? '',
    userFieldValues: resolveFieldValues(
      baseValues,
      stepConfig.config.fieldVariations,  // step 级离散值列表
      counter,
    ),
    variables: stepConfig.config.variables,
    context: { source: 'task', taskId: definition.id, stepIndex },
  };
}

// --- Step executor context ---

export interface StepExecutorContext {
  state: TaskStateContainer;
  sendService: SendServiceProvider;
  conditionRegistry: ConditionRegistry;
  fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;
  now: () => string;
}

export function createStepExecutors(ctx: StepExecutorContext) {
  async function executeSendStep(
    instanceId: string,
    step: Extract<TaskDefinition['steps'][number], { kind: 'send' }>,
    iteration: number,
    stepIndex: number,
    definition: TaskDefinition,
    counter: number,
    lastValues: Map<string, string | number | boolean>,
  ): Promise<TaskStepResult> {
    const request = buildSendRequest(step, definition, stepIndex, iteration, counter, lastValues);
    const sendResult = await ctx.sendService.execute(request);
    return { kind: 'send', stepIndex, iteration, sendResult };
  }

  async function executeWaitConditionStep(
    instanceId: string,
    step: Extract<TaskDefinition['steps'][number], { kind: 'wait-condition' }>,
    iteration: number,
    stepIndex: number,
    signal: Promise<void>,
  ): Promise<{ result: TaskStepResult; interrupted: boolean }> {
    const { conditions, timeoutMs, onTimeout: _onTimeout } = step.config;
    void _onTimeout;

    return new Promise((resolve) => {
      let settled = false;

      const group = ctx.conditionRegistry.registerGroup(conditions, () => {
        if (settled) return;
        settled = true;
        ctx.conditionRegistry.unregisterGroup(group);
        if (timer !== undefined) clearTimeout(timer);
        resolve({
          result: {
            kind: 'wait-condition',
            stepIndex,
            iteration,
            matched: true,
            timedOut: false,
          },
          interrupted: false,
        });
      });

      const timer = timeoutMs !== undefined
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            ctx.conditionRegistry.unregisterGroup(group);
            resolve({
              result: {
                kind: 'wait-condition',
                stepIndex,
                iteration,
                matched: false,
                timedOut: true,
              },
              interrupted: false,
            });
          }, timeoutMs)
        : undefined;

      signal.then(() => {
        if (settled) return;
        settled = true;
        ctx.conditionRegistry.unregisterGroup(group);
        if (timer !== undefined) clearTimeout(timer);
        resolve({
          result: {
            kind: 'wait-condition',
            stepIndex,
            iteration,
            matched: false,
            timedOut: false,
          },
          interrupted: true,
        });
      });
    });
  }

  async function executeDelayStep(
    iteration: number,
    stepIndex: number,
    durationMs: number,
    signal: Promise<void>,
  ): Promise<{ result: TaskStepResult; interrupted: boolean }> {
    const delay = sleep(durationMs);
    const race = await Promise.race([
      delay.promise.then(() => 'done' as const),
      signal.then(() => 'interrupted' as const),
    ]);
    if (race === 'interrupted') {
      delay.cancel();
    }
    return {
      result: { kind: 'delay', stepIndex, iteration, completed: race === 'done' },
      interrupted: race === 'interrupted',
    };
  }

  return { executeSendStep, executeWaitConditionStep, executeDelayStep };
}
