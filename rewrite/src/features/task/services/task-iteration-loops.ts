import type { TaskDefinition, TaskStepResult, ScheduleDriver, FieldVariation, ResolvedStopCondition } from '../core';
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
//   供 fieldVariations 按 counter 索引取值。
// lastValues:上次发送的 resolvedFieldValues 回写(step 级临时,不进 TaskInstanceState)。
//   accumulation 不是用户声明的 resolver——只要帧有自引用表达式,task 发送后无条件把
//   resolvedFieldValues 写回 lastValues,下次 buildSendRequest 合进 userFieldValues 喂帧侧 seed,
//   帧侧 isSelfReferencing + Phase2/4 完成递推。用户零配置。

export interface StepExecutionContext {
  counter: number;
  lastValues: Map<string, string | number | boolean>;
}

function createStepExecutionContext(): StepExecutionContext {
  return { counter: 0, lastValues: new Map() };
}

// --- fieldVariations 取值注入 ---

function resolveFieldValues(
  baseValues: Readonly<Record<string, string | number | boolean>> | undefined,
  variations: readonly FieldVariation[] | undefined,
  counter: number,
): Readonly<Record<string, string | number | boolean>> {
  if (!variations || variations.length === 0) return { ...(baseValues ?? {}) };

  const result: Record<string, string | number | boolean> = { ...(baseValues ?? {}) };
  for (const v of variations) {
    // clamp 到最后一个值:counter 超过 values.length 时保留最后一个
    if (v.values.length === 0) continue;
    const idx = Math.min(counter - 1, v.values.length - 1);
    result[v.fieldId] = v.values[idx]!;
  }
  return result;
}

// writeback:发送成功后无条件把 resolvedFieldValues 回写 stepContext.lastValues。
// accumulation 是自动行为——无需 step 声明 accumulation resolver,只要帧侧算出
// resolvedFieldValues(含自引用表达式字段结果)就回写,下次喂回帧侧 seed 完成递推。
// 非自引用字段回写也无害:它们下次还是被用户值/variation 覆盖。
function writebackResolvedValues(
  sendResult: SendResult,
  stepExecCtx: StepExecutionContext,
): void {
  const resolved = sendResult.resolvedFieldValues;
  if (!resolved) return;
  for (const fid in resolved) {
    stepExecCtx.lastValues.set(fid, resolved[fid]!);
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

  // 关键语义区分(用户原话:"各重复5次迭代2次每次加1 → 迭代1=1-5,迭代2=6-10"):
  // - repeat.maxCount 是【每 iteration】的发送次数(per-iteration limit)。
  // - stepExecCtx.counter 是 step 内【跨 iteration 累积】的全局序号(1-based),供 fieldVariations 取值。
  //   即:iter0 发 maxCount 次(counter 1..maxCount),iter1 接着发 maxCount 次(counter maxCount+1..2*maxCount)。
  // - stepExecCtx.counter 在 step 边界(切到下一个 step / task 结束)重置。
  //
  // 所以 repeat 循环用 per-iteration 局部计数,counter(variation 取值用)单独累积。
  // 所有 send step 都走这条路径(含单发),统一处理 counter + writeback:
  // 单发 step(帧有自引用表达式)跨 iteration 也通过 writeback 自动累积。
  const limit = repeat ? (repeat.maxCount ?? Infinity) : 1;  // per-iteration 发送次数

  let iterSent = 0;  // 本 iteration 已发次数(per-iteration,进 executeRepeatableSend 时从 0 开始)
  while (iterSent < limit) {
    iterSent += 1;
    stepExecCtx.counter += 1;  // 全局序号跨 iteration 累积(variation 取值用)
    const result = await ctx.stepExecutors.executeSendStep(
      instanceId, step, iteration, stepIndex, definition, stepExecCtx.counter, stepExecCtx.lastValues,
    );
    ctx.state.addStepResult(instanceId, result);

    if (result.sendResult.kind !== 'sent') return false;

    // writeback:无条件回写 resolvedFieldValues。accumulation 自动行为——
    // 帧侧有自引用表达式时,回写的值下次喂回 seed 完成递推;无则无害(被覆盖)。
    writebackResolvedValues(result.sendResult, stepExecCtx);

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

    if (step.kind === 'send' && step.config.repeat) {
      // 有 repeat 的 send step → 走 executeRepeatableSend(step 级 counter 骨架 + writeback)。
      // repeat 失败直接停(repeat 不重试,不走 error-policy)。
      // stepExecCtx 跨 iteration 持久(runTask 内 map),step 边界由不同 stepIndex 天然隔离。
      const stepExecCtx = stepContexts.get(i) ?? createStepExecutionContext();
      const success = await executeRepeatableSend(ctx, instanceId, step, iteration, i, ctx.definition, signal, stepExecCtx);
      stepContexts.set(i, stepExecCtx);  // 保存累积的 counter + lastValues
      if (!success) return false;
    } else if (step.kind === 'send') {
      // 单发 send step(无 repeat)→ 走 executeStepCore(带 error-policy)。
      // 但仍需 stepExecCtx 做 writeback(accumulation 自动行为:帧有自引用表达式时跨 iteration 累积)
      // + counter(fieldVariations 取值)。单发 counter 每 iteration 推进 1。
      const stepExecCtx = stepContexts.get(i) ?? createStepExecutionContext();
      stepExecCtx.counter += 1;
      const outcome = await executeStepCore(instanceId, step, iteration, i, ctx, signal, stepExecCtx);
      stepContexts.set(i, stepExecCtx);
      if (outcome === null) return false;
      ctx.state.addStepResult(instanceId, outcome.result);
      if (outcome.shouldStop) return false;
    } else {
      const outcome = await executeStepCore(instanceId, step, iteration, i, ctx, signal, undefined);
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
// stepExecCtx 仅 send step 用(counter 已由调用方推进,lastValues 做 writeback);
// wait-condition / delay 传 undefined。

async function executeStepCore(
  instanceId: string,
  step: TaskDefinition['steps'][number],
  iteration: number,
  stepIndex: number,
  ctx: TaskExecutionContext,
  signal: Promise<void>,
  stepExecCtx: StepExecutionContext | undefined,
): Promise<{ result: TaskStepResult; shouldStop: boolean } | null> {
  switch (step.kind) {
    case 'send': {
      // 单发 send step(无 repeat):counter 由 executeSteps 调用前推进,lastValues 做 writeback。
      const counter = stepExecCtx?.counter ?? 1;
      const lastValues = stepExecCtx?.lastValues ?? new Map();
      const result = await ctx.stepExecutors.executeSendStep(
        instanceId, step, iteration, stepIndex, ctx.definition, counter, lastValues,
      );
      // writeback(发送成功才有 resolvedFieldValues,但失败结果也可能带,统一回写)
      if (stepExecCtx && result.sendResult.kind === 'sent') {
        writebackResolvedValues(result.sendResult, stepExecCtx);
      }
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
