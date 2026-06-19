import type { TaskInstanceState, TaskProgress, TaskStepResult } from './types';
import { resolveStopCondition } from './types';

export function calculateProgress(instance: TaskInstanceState): TaskProgress {
  const stepsPerIteration = instance.definitionRef.steps.length;
  const { currentIteration, stepResults } = instance;

  const currentIterResults = stepResults.filter((r) => r.iteration === currentIteration);

  // 按 stepIndex 去重:repeat 会让单个 step 产生多个 stepResult,
  // 进度按"完成的 step 数"计,而非"stepResult 数"。一个 step 多次 repeat 只算一次。
  // 一个 step 的多次 repeat 结果取"最差"状态:有失败算失败,有 skip 算 skip,否则成功。
  const stepIndexToResult = new Map<number, TaskStepResult>();
  for (const result of currentIterResults) {
    const existing = stepIndexToResult.get(result.stepIndex);
    if (!existing) {
      stepIndexToResult.set(result.stepIndex, result);
    } else {
      // 已有结果:取最差状态(失败 > skip > 成功)
      const existingFailed = isStepResultFailed(existing);
      const existingSkipped = existing.appliedPolicy === 'skip-step';
      if (!existingFailed && !existingSkipped) {
        // 现有是成功,可能被新结果覆盖成失败/skip
        stepIndexToResult.set(result.stepIndex, result);
      }
    }
  }

  let stepsCompleted = 0;
  let stepsFailed = 0;
  let stepsSkipped = 0;
  for (const result of stepIndexToResult.values()) {
    if (result.appliedPolicy === 'skip-step') {
      stepsSkipped++;
    } else if (isStepResultFailed(result)) {
      stepsFailed++;
    } else {
      stepsCompleted++;
    }
  }

  const iterationsCompleted = countCompletedIterations(instance, stepsPerIteration);
  const iterationsTotal = resolveIterationsTotal(instance);
  const elapsedMs = calculateElapsedMs(instance);

  const estimatedRemainingMs = estimateRemainingMs(instance, iterationsCompleted, iterationsTotal, elapsedMs);
  const lastStepResult = stepResults.length > 0 ? stepResults[stepResults.length - 1] : null;

  // sends 维度:按"实际发送次数"计,反映 repeat 细粒度。
  // sendsCompleted = stepResults 中 send 且成功的行数(repeat 每次都是独立行,直接计数,不去重)。
  const sendsCompleted = stepResults.filter(
    (r) => r.kind === 'send' && r.sendResult.kind === 'sent',
  ).length;
  const sendsTotal = resolveSendsTotal(instance, iterationsTotal);

  return {
    stepsTotal: stepsPerIteration,
    stepsCompleted,
    stepsFailed,
    stepsSkipped,
    iterationsCompleted,
    iterationsTotal,
    elapsedMs,
    estimatedRemainingMs,
    lastStepResult,
    sendsCompleted,
    sendsTotal,
  };
}

export function isStepResultFailed(result: TaskStepResult): boolean {
  switch (result.kind) {
    case 'send':
      return result.sendResult.kind !== 'sent';
    case 'wait-condition':
      return !result.matched && result.timedOut;
    case 'delay':
      return !result.completed;
  }
}

function countCompletedIterations(instance: TaskInstanceState, stepsPerIteration: number): number {
  // 按 iteration 分组,每组按 stepIndex 去重(repeat 会让单 step 产生多个 result),
  // 去重后 stepIndex 数 >= stepsPerIteration 才算该 iteration 完成。
  const iterationIndices = new Set(instance.stepResults.map((r) => r.iteration));
  let count = 0;
  for (const iter of iterationIndices) {
    const iterStepIndices = new Set(
      instance.stepResults.filter((r) => r.iteration === iter).map((r) => r.stepIndex),
    );
    if (iterStepIndices.size >= stepsPerIteration) {
      count++;
    }
  }
  return count;
}

function resolveIterationsTotal(instance: TaskInstanceState): number | null {
  const resolved = resolveStopCondition(instance.definitionRef);
  const { schedule } = instance.definitionRef;

  if (resolved.maxIterations !== undefined) {
    return resolved.maxIterations;
  }
  if (schedule.kind === 'immediate') {
    return 1;
  }
  return null;
}

/**
 * 总发送次数预算 = iteration 总数 × Σ(各 send step 每迭代发送次数)。
 * 各 send step 每迭代发送次数:无 repeat 的单发=1;repeat 有 maxCount=maxCount;
 * repeat 无 maxCount(until 条件/unbounded)= 无法预算 → 整个 sendsTotal 返回 null。
 * iteration 总数为 null(无限)或任一 send step 贡献 null 时,返回 null。
 *
 * 用户语义(D001 原话:"各重复5次迭代2次每次加1 → 共15次"):
 * sendsTotal = iteration 总数 × Σ 各 step maxCount。
 */
function resolveSendsTotal(instance: TaskInstanceState, iterationsTotal: number | null): number | null {
  if (iterationsTotal === null) return null;
  let sumPerIteration = 0;
  for (const step of instance.definitionRef.steps) {
    if (step.kind !== 'send') continue;
    const { repeat } = step.config;
    const perIter = repeat ? (repeat.maxCount ?? null) : 1;
    if (perIter === null) return null;  // until 条件/unbounded,无法预算
    sumPerIteration += perIter;
  }
  return iterationsTotal * sumPerIteration;
}

function calculateElapsedMs(instance: TaskInstanceState): number {
  if (!instance.startedAt) return 0;
  const start = new Date(instance.startedAt).getTime();
  const endRef = instance.completedAt ?? instance.stoppedAt ?? instance.failedAt;
  const end = endRef ? new Date(endRef).getTime() : Date.now();
  return Math.max(0, end - start);
}

function estimateRemainingMs(
  instance: TaskInstanceState,
  iterationsCompleted: number,
  iterationsTotal: number | null,
  elapsedMs: number,
): number | null {
  if (instance.definitionRef.schedule.kind !== 'timer' || iterationsTotal === null) {
    return null;
  }
  if (iterationsCompleted <= 0 || iterationsTotal <= iterationsCompleted) {
    return null;
  }
  const avgIterMs = elapsedMs / iterationsCompleted;
  return Math.round(avgIterMs * (iterationsTotal - iterationsCompleted));
}
