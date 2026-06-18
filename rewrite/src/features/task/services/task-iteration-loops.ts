import type { TaskDefinition, TaskStepResult, ScheduleDriver, FieldValueResolver, ResolvedStopCondition } from '../core';
import { evaluateConditionGroup, resolveStopCondition } from '../core';
import type { TaskStateContainer } from '../state/task-state';
import type { ConditionRegistry } from './condition-registry';
import type { UpdateLifecycleFn } from './task-lifecycle-manager';
import type { createStepExecutors } from './task-step-executors';
import { sleep } from './task-step-executors';
import type { createErrorPolicyHandler } from './task-error-policy';
import type { SendResult } from '@/features/send';

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

// --- Step execution context (step 级临时,跨 iteration 持久,step 边界重置) ---
// counter:step 内第几次发送,1-based,跨 iteration 在同一 step 内递增,step 边界(切到下一个 step)重置。
// lastValues:accumulation 字段的上次值(step 级临时,不进 TaskInstanceState)。
//   由 send 链路 resolvedFieldValues writeback 写入,下次 resolveFieldValues 取出注入 userFieldValues,
//   帧侧 self-referencing 表达式(isSelfReferencing + Phase2 seed + Phase4 evaluate)完成实际递推。

export interface StepExecutionContext {
  counter: number;
  lastValues: Map<string, string | number | boolean>;
}

function createStepExecutionContext(): StepExecutionContext {
  return { counter: 0, lastValues: new Map() };
}

// --- fieldResolvers 取值注入 ---

function resolveFieldValues(
  baseValues: Readonly<Record<string, string | number | boolean>> | undefined,
  resolvers: readonly FieldValueResolver[] | undefined,
  counter: number,
  lastValues: Map<string, string | number | boolean>,
): Readonly<Record<string, string | number | boolean>> {
  if (!resolvers || resolvers.length === 0) return { ...(baseValues ?? {}) };

  const result: Record<string, string | number | boolean> = { ...(baseValues ?? {}) };
  for (const r of resolvers) {
    if (r.kind === 'variation') {
      // clamp 到最后一个值:counter 超过 values.length 时保留最后一个
      if (r.values.length === 0) continue;
      const idx = Math.min(counter - 1, r.values.length - 1);
      result[r.fieldId] = r.values[idx]!;
    } else {
      // accumulation:从 lastValues 取上次值(若无则用 initial)。
      // 公式递推不在 task 层——由 send 链路帧侧 expressionConfig 完成,
      // task 层 writeback 把帧侧算出的 resolvedFieldValues 喂回 lastValues。
      const prev = lastValues.get(r.fieldId);
      result[r.fieldId] = prev ?? r.initial;
    }
  }
  return result;
}

// writeback:把 send 链路算出的 accumulation 字段结果回写 stepContext.lastValues,
// 供下次 resolveFieldValues 取出注入 userFieldValues 当帧侧 seed。
function writebackAccumulation(
  step: Extract<TaskDefinition['steps'][number], { kind: 'send' }>,
  sendResult: SendResult,
  stepExecCtx: StepExecutionContext,
): void {
  const accFieldIds = (step.config.fieldResolvers ?? [])
    .filter((r): r is Extract<FieldValueResolver, { kind: 'accumulation' }> => r.kind === 'accumulation')
    .map((r) => r.fieldId);
  if (accFieldIds.length === 0) return;
  const resolved = sendResult.resolvedFieldValues;
  if (!resolved) return;
  for (const fid of accFieldIds) {
    if (fid in resolved) {
      stepExecCtx.lastValues.set(fid, resolved[fid]!);
    }
  }
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
  stepExecCtx: StepExecutionContext,
): Promise<boolean> {
  const { repeat } = step.config;
  const hasResolvers = (step.config.fieldResolvers?.length ?? 0) > 0;
  if (!repeat && !hasResolvers) {
    // 纯单发,无 resolver:走单发路径
    stepExecCtx.counter = 1;
    const result = await ctx.stepExecutors.executeSendStep(
      instanceId, step, iteration, stepIndex, definition, stepExecCtx.counter, stepExecCtx.lastValues,
    );
    ctx.state.addStepResult(instanceId, result);
    return result.sendResult.kind === 'sent';
  }

  // 关键语义区分(用户原话:"各重复5次迭代2次每次加1 → 迭代1=1-5,迭代2=6-10"):
  // - repeat.maxCount 是【每 iteration】的发送次数(per-iteration limit)。
  // - stepExecCtx.counter 是 step 内【跨 iteration 累积】的全局序号(1-based),用于 resolver 取值。
  //   即:iter0 发 maxCount 次(counter 1..maxCount),iter1 接着发 maxCount 次(counter maxCount+1..2*maxCount)。
  // - stepExecCtx.counter 在 step 边界(切到下一个 step / task 结束)重置。
  //
  // 所以 repeat 循环用 per-iteration 局部计数,counter(resolver 用)单独累积。
  const limit = repeat ? (repeat.maxCount ?? Infinity) : 1;  // per-iteration 发送次数

  let iterSent = 0;  // 本 iteration 已发次数(per-iteration,进 executeRepeatableSend 时从 0 开始)
  while (iterSent < limit) {
    iterSent += 1;
    stepExecCtx.counter += 1;  // 全局序号跨 iteration 累积(resolver 用)
    const result = await ctx.stepExecutors.executeSendStep(
      instanceId, step, iteration, stepIndex, definition, stepExecCtx.counter, stepExecCtx.lastValues,
    );
    ctx.state.addStepResult(instanceId, result);

    if (result.sendResult.kind !== 'sent') return false;

    // accumulation writeback:把帧侧算出的累积字段结果回写,供下次(下一 counter 或下一 iteration)取用
    writebackAccumulation(step, result.sendResult, stepExecCtx);

    if (repeat?.until && ctx.fieldValueProvider) {
      if (evaluateConditionGroup(repeat.until, ctx.fieldValueProvider())) break;
    }

    if (iterSent < limit) {
      const delay = sleep(repeat?.intervalMs ?? 0);
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
  stepContexts: Map<number, StepExecutionContext>,
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

    // send step 有 repeat 或 fieldResolvers → 走 executeRepeatableSend(step 级 counter 骨架)
    const hasRepeatOrResolvers = step.kind === 'send' && (
      !!step.config.repeat || (step.config.fieldResolvers?.length ?? 0) > 0
    );
    if (step.kind === 'send' && hasRepeatOrResolvers) {
      // stepExecCtx 跨 iteration 持久(runTask 内 map),step 边界(切到下一个 step)由不同 stepIndex 天然隔离
      const stepExecCtx = stepContexts.get(i) ?? createStepExecutionContext();
      const success = await executeRepeatableSend(ctx, instanceId, step, iteration, i, ctx.definition, signal, stepExecCtx);
      stepContexts.set(i, stepExecCtx);  // 保存累积的 counter + lastValues
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
      // 单发 send step(无 repeat 无 fieldResolvers):counter=1,空 lastValues(无累积)
      const result = await ctx.stepExecutors.executeSendStep(
        instanceId, step, iteration, stepIndex, ctx.definition, 1, new Map(),
      );
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
  // stepContexts:跨 iteration 持久(同 step counter 累积),step 边界(不同 stepIndex)天然隔离,
  // task 结束(runTask 退出)即丢弃(单 step 边界重置 + 不污染 TaskInstanceState)。
  const stepContexts = new Map<number, StepExecutionContext>();

  let iteration = ctx.state.getInstance(instanceId)?.currentIteration ?? 0;

  while (!stopGuard.shouldStop(instanceId, iteration)) {
    const triggered = await driver.waitForNext(instanceId, iteration, signal);
    if (!triggered) break;

    const completed = await executeSteps(instanceId, iteration, ctx, signal, stepContexts);
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
