import type { TaskDefinition, TaskStepResult, ScheduleDriver, FieldVariation, ResolvedStopCondition } from '../core';
import { evaluateConditionGroup, resolveStopCondition } from '../core';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';
import type { UpdateLifecycleFn } from './task-lifecycle-manager';
import type { createStepExecutors } from './task-step-executors';
import { sleep } from './task-step-executors';
import type { createErrorPolicyHandler } from './task-error-policy';

// --- Task execution context ---

export interface TaskExecutionContext {
  readonly definition: TaskDefinition;
  readonly resolvedStop: ResolvedStopCondition;
  state: TaskStateContainer;
  stepExecutors: ReturnType<typeof createStepExecutors>;
  conditionRegistry: ConditionRegistry;
  updateLifecycle: UpdateLifecycleFn;
  errorPolicy: ReturnType<typeof createErrorPolicyHandler>;
  fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;
  now: () => string;
}

// --- ScheduleDriverAdapter ---

interface ScheduleDriverAdapter {
  waitForNext(instanceId: string, iteration: number, signal: Promise<void>): Promise<boolean>;
  dispose(): void;
}

function createDriver(
  schedule: ScheduleDriver,
  ctx: TaskExecutionContext,
  instanceId: string,
  signal: Promise<void>,
): ScheduleDriverAdapter {
  switch (schedule.kind) {
    case 'immediate':
      return { waitForNext: async () => true, dispose: () => {} };

    case 'timer':
      return createTimerDriver(schedule.intervalMs);

    case 'event':
      return createEventDriver(schedule, ctx, instanceId, signal);
  }
}

function createTimerDriver(intervalMs: number): ScheduleDriverAdapter {
  let firstCall = true;

  return {
    async waitForNext(_id, _iter, signal) {
      if (firstCall) { firstCall = false; return true; }

      const delay = sleep(intervalMs);
      const race = await Promise.race([
        delay.promise.then(() => true),
        signal.then(() => false),
      ]);
      if (!race) delay.cancel();
      return race;
    },
    dispose() {},
  };
}

function createEventDriver(
  schedule: Extract<ScheduleDriver, { kind: 'event' }>,
  ctx: TaskExecutionContext,
  _instanceId: string,
  signal: Promise<void>,
): ScheduleDriverAdapter {
  const { conditions, cooldownMs = 0 } = schedule;
  let lastTriggerTime = 0;
  let notifyResolve: ((value: boolean) => void) | null = null;
  let disposed = false;

  const group = ctx.conditionRegistry.registerGroup(conditions, () => {
    if (disposed) return;
    const now = Date.now();
    if (cooldownMs > 0 && lastTriggerTime > 0 && now - lastTriggerTime < cooldownMs) return;
    lastTriggerTime = now;
    if (notifyResolve) { notifyResolve(true); notifyResolve = null; }
  });

  return {
    async waitForNext() {
      if (disposed) return false;
      return Promise.race([
        new Promise<boolean>((resolve) => { notifyResolve = resolve; }),
        signal.then(() => false),
      ]);
    },
    dispose() {
      disposed = true;
      ctx.conditionRegistry.unregisterGroup(group);
      if (notifyResolve) { notifyResolve(false); notifyResolve = null; }
    },
  };
}

// --- StopGuard ---

interface StopGuard {
  shouldStop(instanceId: string, iteration: number): boolean;
  checkExitCondition(): boolean;
}

function createStopGuard(stop: ResolvedStopCondition, ctx: TaskExecutionContext): StopGuard {
  const startTime = Date.now();

  return {
    shouldStop(instanceId, iteration) {
      const inst = ctx.state.getInstance(instanceId);
      if (!inst || inst.lifecycle !== 'running') return true;
      if (stop.maxIterations !== undefined && iteration >= stop.maxIterations) return true;
      if (stop.maxDurationMs !== undefined && Date.now() - startTime >= stop.maxDurationMs) return true;
      return false;
    },

    checkExitCondition() {
      if (!stop.exitCondition) return false;
      if (!ctx.fieldValueProvider) return false;
      return evaluateConditionGroup(stop.exitCondition, ctx.fieldValueProvider());
    },
  };
}

// --- fieldVariations injection ---

function resolveFieldValues(
  baseValues: Readonly<Record<string, string | number | boolean>> | undefined,
  fieldVariations: readonly FieldVariation[] | undefined,
  iteration: number,
): Readonly<Record<string, string | number | boolean>> {
  if (!fieldVariations || fieldVariations.length === 0) return baseValues ?? {};

  const result: Record<string, string | number | boolean> = { ...(baseValues ?? {}) };
  for (const variation of fieldVariations) {
    if (iteration < variation.values.length) {
      result[variation.fieldId] = variation.values[iteration]!;
    }
  }
  return result;
}

// --- executeRepeatableSend ---

async function executeRepeatableSend(
  ctx: TaskExecutionContext,
  instanceId: string,
  step: Extract<TaskDefinition['steps'][number], { kind: 'send' }>,
  iteration: number,
  stepIndex: number,
  definition: TaskDefinition,
  signal: Promise<void>,
): Promise<boolean> {
  const { repeat } = step.config;
  if (!repeat) {
    const result = await ctx.stepExecutors.executeSendStep(instanceId, step, iteration, stepIndex, definition);
    ctx.state.addStepResult(instanceId, result);
    return result.sendResult.kind === 'sent';
  }

  let count = 0;
  const maxCount = repeat.maxCount ?? Infinity;

  while (count < maxCount) {
    const result = await ctx.stepExecutors.executeSendStep(instanceId, step, iteration, stepIndex, definition);
    ctx.state.addStepResult(instanceId, result);

    if (result.sendResult.kind !== 'sent') return false;

    count++;

    if (repeat.until && ctx.fieldValueProvider) {
      if (evaluateConditionGroup(repeat.until, ctx.fieldValueProvider())) break;
    }

    if (count < maxCount) {
      const delay = sleep(repeat.intervalMs);
      const race = await Promise.race([delay.promise.then(() => true), signal.then(() => false)]);
      if (!race) { delay.cancel(); return false; }
    }
  }

  return true;
}

// --- executeSteps (within an iteration) ---

async function executeSteps(
  instanceId: string,
  iteration: number,
  ctx: TaskExecutionContext,
  signal: Promise<void>,
): Promise<boolean> {
  const { steps } = ctx.definition;
  const inst = ctx.state.getInstance(instanceId);
  if (!inst) return false;
  const completedInIter = inst.stepResults
    .filter((r) => r.iteration === iteration)
    .map((r) => r.stepIndex);
  const startIndex = completedInIter.length;

  for (let i = startIndex; i < steps.length; i++) {
    const current = ctx.state.getInstance(instanceId);
    if (!current || current.lifecycle !== 'running') return false;

    ctx.state.updateInstance(instanceId, { currentStepIndex: i, currentStepStartedAt: ctx.now() });

    const step = steps[i]!;

    // For send steps with repeat, use executeRepeatableSend
    if (step.kind === 'send' && step.config.repeat) {
      const success = await executeRepeatableSend(ctx, instanceId, step, iteration, i, ctx.definition, signal);
      if (!success) return false;
    } else {
      const outcome = await executeStepCore(instanceId, step, iteration, i, ctx, signal);
      if (outcome === null) return false;
      ctx.state.addStepResult(instanceId, outcome.result);
      if (outcome.shouldStop) return false;
    }

    // intervalAfterMs for send steps
    if (step.kind === 'send' && step.config.intervalAfterMs) {
      const delay = sleep(step.config.intervalAfterMs);
      const race = await Promise.race([
        delay.promise.then(() => 'done' as const),
        signal.then(() => 'interrupted' as const),
      ]);
      if (race === 'interrupted') {
        delay.cancel();
        return false;
      }
    }
  }
  return true;
}

// --- executeStepCore ---

async function executeStepCore(
  instanceId: string,
  step: TaskDefinition['steps'][number],
  iteration: number,
  stepIndex: number,
  ctx: TaskExecutionContext,
  signal: Promise<void>,
): Promise<{ result: TaskStepResult; shouldStop: boolean } | null> {
  switch (step.kind) {
    case 'send': {
      const result = await ctx.stepExecutors.executeSendStep(instanceId, step, iteration, stepIndex, ctx.definition);
      if (result.sendResult.kind !== 'sent') {
        return ctx.errorPolicy.applyErrorPolicy(instanceId, result, ctx.definition.errorPolicy, step, iteration, stepIndex, ctx.definition, signal);
      }
      return { result, shouldStop: false };
    }

    case 'wait-condition': {
      const { result, interrupted } = await ctx.stepExecutors.executeWaitConditionStep(
        instanceId, step, iteration, stepIndex, signal,
      );
      if (interrupted) return null;

      if (!result.matched && result.timedOut) {
        switch (step.config.onTimeout) {
          case 'continue':
            return { result, shouldStop: false };
          case 'skip':
            return { result: { ...result, appliedPolicy: 'skip-step' }, shouldStop: false };
          case 'fail':
            return ctx.errorPolicy.applyErrorPolicy(instanceId, result, ctx.definition.errorPolicy, step, iteration, stepIndex, ctx.definition, signal);
        }
      }
      return { result, shouldStop: false };
    }

    case 'delay': {
      const { result, interrupted } = await ctx.stepExecutors.executeDelayStep(
        iteration, stepIndex, step.config.durationMs, signal,
      );
      if (interrupted) return null;
      return { result, shouldStop: false };
    }
  }
}

// --- runTask (unified loop) ---

export async function runTask(
  instanceId: string,
  ctx: TaskExecutionContext,
  signal: Promise<void>,
): Promise<void> {
  const driver = createDriver(ctx.definition.schedule, ctx, instanceId, signal);
  const stopGuard = createStopGuard(ctx.resolvedStop, ctx);

  let iteration = ctx.state.getInstance(instanceId)?.currentIteration ?? 0;

  while (!stopGuard.shouldStop(instanceId, iteration)) {
    const triggered = await driver.waitForNext(instanceId, iteration, signal);
    if (!triggered) break;

    const completed = await executeSteps(instanceId, iteration, ctx, signal);
    if (!completed) break;

    if (stopGuard.checkExitCondition()) break;

    iteration++;
    // Only update iteration if the next iteration might execute
    if (!stopGuard.shouldStop(instanceId, iteration)) {
      ctx.state.updateInstance(instanceId, { currentIteration: iteration });
    }
  }

  driver.dispose();
}

// --- Re-export resolveFieldValues for use in buildSendRequest ---

export { resolveFieldValues };

// --- Legacy interface for backward compatibility during transition ---

export interface IterationLoopContext {
  state: TaskStateContainer;
  conditionRegistry: ConditionRegistry;
  updateLifecycle: UpdateLifecycleFn;
  stepExecutors: ReturnType<typeof createStepExecutors>;
  errorPolicy: ReturnType<typeof createErrorPolicyHandler>;
  fieldValueProvider?: () => Readonly<Record<string, number | string | null>>;
  now: () => string;
}

export function createIterationLoops(ctx: IterationLoopContext) {
  function buildExecutionContext(definition: TaskDefinition): TaskExecutionContext {
    return {
      definition,
      resolvedStop: resolveStopCondition(definition),
      state: ctx.state,
      stepExecutors: ctx.stepExecutors,
      conditionRegistry: ctx.conditionRegistry,
      updateLifecycle: ctx.updateLifecycle,
      errorPolicy: ctx.errorPolicy,
      fieldValueProvider: ctx.fieldValueProvider,
      now: ctx.now,
    };
  }

  async function runTimedLoop(
    instanceId: string,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<void> {
    const execCtx = buildExecutionContext(definition);
    await runTask(instanceId, execCtx, signal);
  }

  async function runTriggerLoop(
    instanceId: string,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<void> {
    const execCtx = buildExecutionContext(definition);
    await runTask(instanceId, execCtx, signal);
  }

  async function runSequenceLoop(
    instanceId: string,
    definition: TaskDefinition,
    signal: Promise<void>,
  ): Promise<void> {
    const execCtx = buildExecutionContext(definition);
    await runTask(instanceId, execCtx, signal);
  }

  return { runTimedLoop, runTriggerLoop, runSequenceLoop };
}
