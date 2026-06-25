import type { TaskDefinition, TaskStepResult } from '../core';
import { isStepResultFailed } from '../core';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';
import type { UpdateLifecycleFn } from './task-lifecycle-manager';
import type { createStepExecutors } from './task-step-executors';
import { sleep } from './task-step-executors';

// --- Error policy context ---

export interface ErrorPolicyContext {
  state: TaskStateContainer;
  conditionRegistry: ConditionRegistry;
  updateLifecycle: UpdateLifecycleFn;
  stepExecutors: ReturnType<typeof createStepExecutors>;
  now: () => string;
}

export function createErrorPolicyHandler(ctx: ErrorPolicyContext) {
  async function applyErrorPolicy(
    instanceId: string,
    failedResult: TaskStepResult,
    policy: TaskDefinition['errorPolicy'],
    step: TaskDefinition['steps'][number],
    iteration: number,
    stepIndex: number,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<{ result: TaskStepResult; shouldStop: boolean } | null> {
    switch (policy.onFailure) {
      case 'stop':
        // S014: 错误策略触发的停止走 'fail' 终态(=failed), 与手动 stopTask(=stopped)区分。
        // 手动 stopTask 仍调 updateLifecycle('stop')→stopped; 此处错误停止→failed,
        // 让"超时/发送失败等错误终止"在 UI 显示为失败(红)并计入 KPI 失败数, 符合直觉。
        ctx.updateLifecycle(instanceId, 'fail', { error: 'Task stopped by error policy' });
        return { result: { ...failedResult, appliedPolicy: 'stop' }, shouldStop: true };

      case 'pause':
        ctx.updateLifecycle(instanceId, 'pause');
        return { result: { ...failedResult, appliedPolicy: 'pause' }, shouldStop: true };

      case 'skip-step':
        return { result: { ...failedResult, appliedPolicy: 'skip-step' }, shouldStop: false };

      case 'retry': {
        const maxRetries = policy.retryCount ?? 0;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (policy.retryDelayMs && policy.retryDelayMs > 0) {
            const retryDelay = sleep(policy.retryDelayMs);
            const race = await Promise.race([
              retryDelay.promise.then(() => false),
              signal.then(() => true),
            ]);
            if (race) {
              retryDelay.cancel();
              return null;
            }
          }

          const inst = ctx.state.getInstance(instanceId);
          if (!inst || inst.lifecycle !== 'running') return null;

          // Re-execute raw step without re-entering error policy
          // retry 是"重试同一次发送",counter 不推进(单发语义);lastValues 空(retry 不参与 accumulation 累积)
          let retryResult: TaskStepResult;
          switch (step.kind) {
            case 'send':
              retryResult = await ctx.stepExecutors.executeSendStep(
                instanceId, step, iteration, stepIndex, definition, 1, new Map(),
              );
              break;
            case 'wait-condition': {
              const wc = await ctx.stepExecutors.executeWaitConditionStep(instanceId, step, iteration, stepIndex, signal);
              if (wc.interrupted) return null;
              retryResult = wc.result;
              break;
            }
            case 'delay': {
              const d = await ctx.stepExecutors.executeDelayStep(iteration, stepIndex, step.config.durationMs, signal);
              if (d.interrupted) return null;
              retryResult = d.result;
              break;
            }
          }

          if (!isStepResultFailed(retryResult)) {
            return { result: retryResult, shouldStop: false };
          }
        }
        // Exhausted retries
        ctx.updateLifecycle(instanceId, 'fail', { error: 'Retry exhausted' });
        return { result: { ...failedResult, appliedPolicy: 'retry' }, shouldStop: true };
      }
    }
  }

  return { applyErrorPolicy };
}
