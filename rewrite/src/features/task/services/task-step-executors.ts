import type { SendRequest } from '@/features/send';
import type { TaskDefinition, TaskStepResult } from '../core';
import type { SendServiceProvider } from '../adapters';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';

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
): SendRequest {
  return {
    frameId: stepConfig.sendConfig.frameId,
    fieldValues: stepConfig.sendConfig.fieldValues,
    targetId: stepConfig.sendConfig.targetId ?? definition.targetId ?? '',
    options: stepConfig.sendConfig.options ?? {},
    context: { source: 'task', taskId: definition.id, stepIndex },
  };
}

// --- Step executor context ---

export interface StepExecutorContext {
  state: TaskStateContainer;
  sendService: SendServiceProvider;
  conditionRegistry: ConditionRegistry;
  now: () => string;
}

export function createStepExecutors(ctx: StepExecutorContext) {
  async function executeSendStep(
    instanceId: string,
    step: Extract<TaskDefinition['steps'][number], { kind: 'send' }>,
    iteration: number,
    stepIndex: number,
    definition: TaskDefinition,
  ): Promise<TaskStepResult> {
    const request = buildSendRequest(step, definition, stepIndex);
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
    const { condition, timeoutMs } = step.waitConfig;

    return new Promise((resolve) => {
      let settled = false;

      const entry = ctx.conditionRegistry.register(condition, (value) => {
        if (settled) return;
        settled = true;
        ctx.conditionRegistry.unregister(entry);
        resolve({
          result: {
            kind: 'wait-condition',
            stepIndex,
            iteration,
            matched: true,
            matchedValue: value,
            timedOut: false,
          },
          interrupted: false,
        });
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ctx.conditionRegistry.unregister(entry);
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
      }, timeoutMs);

      signal.then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ctx.conditionRegistry.unregister(entry);
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
