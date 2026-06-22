import { describe, it, expect } from 'vitest';
import {
  sequenceTaskDef,
  scoeModeTaskDef,
  timedTaskDef,
} from '../fixtures/task-fixtures';
import { applyDefaultTargetOverride } from '../core/task-builders';
import type { SendStepConfig, TaskDefinition, TaskStepDefinition } from '../core';

/** 给每个 send step 强制塞一个 step 级 targetId 覆盖，用来验证"清空 step 级"语义 */
function withStepTargetOverrides(
  def: TaskDefinition,
  perStepTargets: readonly (string | undefined)[],
): TaskDefinition {
  const steps = def.steps.map<TaskStepDefinition>((step, i) => {
    if (step.kind !== 'send') return step;
    const t = perStepTargets[i];
    const config = { ...(step.config as SendStepConfig) };
    if (t) config.targetId = t;
    else delete (config as { targetId?: string }).targetId;
    return { ...step, config };
  });
  return { ...def, steps };
}

function sendTargetIds(steps: readonly TaskStepDefinition[]): (string | undefined)[] {
  return steps.map((s) => (s.kind === 'send' ? (s.config as SendStepConfig).targetId : undefined));
}

describe('applyDefaultTargetOverride —— 批量设置发送目标（任务级 + 清空 step 级覆盖）', () => {
  it('写 definition.defaultTargetId，并清空所有 send step 的 step 级 targetId', () => {
    const def = withStepTargetOverrides(sequenceTaskDef(), ['step1-conn', undefined, 'step3-conn']);
    // 前置：原本两个 send step 各自带 step 级覆盖
    expect(sendTargetIds(def.steps)).toEqual(['step1-conn', undefined, 'step3-conn']);

    const result = applyDefaultTargetOverride(def, 'new-target');

    expect(result.defaultTargetId).toBe('new-target');
    // 所有 send step 的 step 级 targetId 被清空
    expect(sendTargetIds(result.steps)).toEqual([undefined, undefined, undefined]);
  });

  it('scoe 模式（send-wait-send）两端 send 的 step 级覆盖都清空', () => {
    const def = withStepTargetOverrides(scoeModeTaskDef(), ['cmd-conn', undefined, 'ack-conn']);
    const result = applyDefaultTargetOverride(def, 'conn-9');

    expect(result.defaultTargetId).toBe('conn-9');
    // step 级被清空（defaultTargetId 是任务级，不体现在 step 上）
    expect(sendTargetIds(result.steps)).toEqual([undefined, undefined, undefined]);
  });

  it('不改原 definition（不可变，返回新对象）', () => {
    const def = withStepTargetOverrides(timedTaskDef(), ['orig-step1', 'orig-step2']);
    const originalStepTargets = sendTargetIds(def.steps);
    const originalDefault = def.defaultTargetId;

    applyDefaultTargetOverride(def, 'override-x');

    expect(sendTargetIds(def.steps)).toEqual(originalStepTargets);
    expect(def.defaultTargetId).toBe(originalDefault);
  });

  it('targetId 为 null 时清空 defaultTargetId + 清空所有 step 级覆盖', () => {
    const def = {
      ...withStepTargetOverrides(timedTaskDef(), ['s1', 's2']),
      defaultTargetId: 'old-default',
    };
    const result = applyDefaultTargetOverride(def, null);

    expect(result.defaultTargetId).toBeUndefined();
    expect(sendTargetIds(result.steps)).toEqual([undefined, undefined]);
  });

  it('targetId 为 undefined / 空串也清空（避免空串入库）', () => {
    const def = {
      ...withStepTargetOverrides(timedTaskDef(), ['s1', 's2']),
      defaultTargetId: 'old-default',
    };
    const r1 = applyDefaultTargetOverride(def, undefined);
    expect(r1.defaultTargetId).toBeUndefined();
    expect(sendTargetIds(r1.steps)).toEqual([undefined, undefined]);

    const r2 = applyDefaultTargetOverride(def, '');
    expect(r2.defaultTargetId).toBeUndefined();
    expect(sendTargetIds(r2.steps)).toEqual([undefined, undefined]);
  });

  it('没有 send step 时仍写 defaultTargetId（无 step 可清）', () => {
    const def: TaskDefinition = {
      ...timedTaskDef(),
      steps: [
        { id: 'd1', kind: 'delay', config: { durationMs: 10 } },
      ],
    };
    const result = applyDefaultTargetOverride(def, 'x');
    expect(result.defaultTargetId).toBe('x');
    expect(result.steps).toEqual(def.steps);
  });

  it('definition 其他字段（schedule/errorPolicy/stopCondition/name/id）保持不变', () => {
    const def = timedTaskDef();
    const result = applyDefaultTargetOverride(def, 'override-y');
    expect(result.schedule).toEqual(def.schedule);
    expect(result.errorPolicy).toEqual(def.errorPolicy);
    expect(result.stopCondition).toEqual(def.stopCondition);
    expect(result.name).toBe(def.name);
    expect(result.id).toBe(def.id);
  });
});
