import type { TaskDefinition, TaskStepResult } from '../core';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';
import type { UpdateLifecycleFn } from './task-lifecycle-manager';
import type { createStepExecutors } from './task-step-executors';
import { sleep } from './task-step-executors';
import type { createErrorPolicyHandler } from './task-error-policy';

// --- Iteration loop context ---

export interface IterationLoopContext {
  state: TaskStateContainer;
  conditionRegistry: ConditionRegistry;
  updateLifecycle: UpdateLifecycleFn;
  stepExecutors: ReturnType<typeof createStepExecutors>;
  errorPolicy: ReturnType<typeof createErrorPolicyHandler>;
  now: () => string;
}

export function createIterationLoops(ctx: IterationLoopContext) {
  // --- executeStepCore ---

  async function executeStepCore(
    instanceId: string,
    step: TaskDefinition['steps'][number],
    iteration: number,
    stepIndex: number,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<{ result: TaskStepResult; shouldStop: boolean } | null> {
    switch (step.kind) {
      case 'send': {
        const result = await ctx.stepExecutors.executeSendStep(instanceId, step, iteration, stepIndex, definition);
        if (result.sendResult.kind !== 'sent') {
          return ctx.errorPolicy.applyErrorPolicy(instanceId, result, definition.errorPolicy, step, iteration, stepIndex, definition, signal);
        }
        return { result, shouldStop: false };
      }

      case 'wait-condition': {
        const { result, interrupted } = await ctx.stepExecutors.executeWaitConditionStep(
          instanceId, step, iteration, stepIndex, signal,
        );
        if (interrupted) return null;

        if (!result.matched && result.timedOut) {
          switch (step.waitConfig.onTimeout) {
            case 'continue':
              return { result, shouldStop: false };
            case 'skip':
              return { result: { ...result, appliedPolicy: 'skip-step' }, shouldStop: false };
            case 'fail':
              return ctx.errorPolicy.applyErrorPolicy(instanceId, result, definition.errorPolicy, step, iteration, stepIndex, definition, signal);
          }
        }
        return { result, shouldStop: false };
      }

      case 'delay': {
        const { result, interrupted } = await ctx.stepExecutors.executeDelayStep(
          iteration, stepIndex, step.delayConfig.durationMs, signal,
        );
        if (interrupted) return null;
        return { result, shouldStop: false };
      }
    }
  }

  // --- executeSteps ---

  async function executeSteps(
    instanceId: string,
    iteration: number,
    steps: readonly TaskDefinition['steps'],
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<boolean> {
    const inst = ctx.state.getInstance(instanceId);
    if (!inst) return false;
    const completedInIter = inst.stepResults
      .filter((r) => r.iteration === iteration)
      .map((r) => r.stepIndex);
    const startIndex = completedInIter.length;

    for (let i = startIndex; i < steps.length; i++) {
      const current = ctx.state.getInstance(instanceId);
      if (!current || current.lifecycle !== 'running') return false;

      ctx.state.updateInstance(instanceId, { currentStepIndex: i });

      const outcome = await executeStepCore(
        instanceId, steps[i], iteration, i, definition, signal,
      );

      if (outcome === null) return false;

      ctx.state.addStepResult(instanceId, outcome.result);

      if (outcome.shouldStop) return false;
    }
    return true;
  }

  // --- Scheduling loops ---

  async function runTimedLoop(
    instanceId: string,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<void> {
    const { intervalMs, delayBeforeStartMs } = definition;
    const maxIter = definition.stopCondition?.maxIterations ?? Infinity;
    const maxDurationMs = definition.stopCondition?.maxDurationMs;
    const startTime = Date.now();
    const inst = ctx.state.getInstance(instanceId);
    const startIteration = inst?.currentIteration ?? 0;

    if (delayBeforeStartMs && delayBeforeStartMs > 0 && startIteration === 0) {
      const startDelay = sleep(delayBeforeStartMs);
      const race = await Promise.race([
        startDelay.promise.then(() => 'done' as const),
        signal.then(() => 'interrupted' as const),
      ]);
      if (race === 'interrupted') {
        startDelay.cancel();
        return;
      }
    }

    for (let iter = startIteration; iter < maxIter; iter++) {
      if (maxDurationMs && Date.now() - startTime >= maxDurationMs) break;

      const current = ctx.state.getInstance(instanceId);
      if (!current || current.lifecycle !== 'running') return;

      const completed = await executeSteps(
        instanceId, iter, definition.steps, definition, signal,
      );

      if (!completed) return;

      const afterExec = ctx.state.getInstance(instanceId);
      if (!afterExec || afterExec.lifecycle !== 'running') return;

      // Not last iteration → wait for interval
      if (iter + 1 < maxIter) {
        const intervalDelay = sleep(intervalMs ?? 1000);
        const race = await Promise.race([
          intervalDelay.promise.then(() => 'done' as const),
          signal.then(() => 'interrupted' as const),
        ]);
        if (race === 'interrupted') {
          intervalDelay.cancel();
          return;
        }
      }
    }
  }

  async function runTriggerLoop(
    instanceId: string,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<void> {
    const triggerCondition = definition.triggerCondition;
    if (!triggerCondition) return;

    const maxTriggerCount = definition.stopCondition?.maxIterations ?? Infinity;
    const maxDurationMs = definition.stopCondition?.maxDurationMs;
    const startTime = Date.now();
    const cooldownMs = definition.cooldownMs ?? 0;
    let triggerCount = 0;
    let lastTriggerTime = 0;
    const triggerQueue: (number | string)[] = [];
    let queueNotify: (() => void) | null = null;

    const handler = (_value: number | string) => {
      const currentTime = Date.now();
      if (cooldownMs > 0 && lastTriggerTime > 0 && currentTime - lastTriggerTime < cooldownMs) return;
      if (triggerCount + triggerQueue.length >= maxTriggerCount) return;

      lastTriggerTime = currentTime;
      triggerQueue.push(_value);
      if (queueNotify) {
        queueNotify();
        queueNotify = null;
      }
    };

    const entry = ctx.conditionRegistry.register(triggerCondition, handler);

    try {
      while (triggerCount < maxTriggerCount) {
        if (maxDurationMs && Date.now() - startTime >= maxDurationMs) break;

        const current = ctx.state.getInstance(instanceId);
        if (!current || current.lifecycle !== 'running') break;

        // Wait for queued trigger
        if (triggerQueue.length === 0) {
          const notified = await Promise.race([
            new Promise<boolean>((resolve) => {
              queueNotify = () => resolve(true);
            }),
            signal.then(() => false),
          ]);
          if (!notified) break;
        }

        triggerQueue.shift();
        triggerCount++;

        await executeSteps(
          instanceId, triggerCount - 1, definition.steps, definition, signal,
        );

        const afterExec = ctx.state.getInstance(instanceId);
        if (!afterExec || afterExec.lifecycle !== 'running') break;
      }
    } finally {
      ctx.conditionRegistry.unregister(entry);
    }
  }

  async function runSequenceLoop(
    instanceId: string,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<void> {
    await executeSteps(instanceId, 0, definition.steps, definition, signal);
  }

  return { runTimedLoop, runTriggerLoop, runSequenceLoop };
}
