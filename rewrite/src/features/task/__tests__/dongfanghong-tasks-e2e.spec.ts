/**
 * E2E 验证 4 个东方红 task definition 与 47 条 frame 定义的引用一致性。
 *
 * 覆盖：
 *   1. 每个 task step 引用的 frameId 在 dongfanghongFrames 里存在
 *   2. 每个 send step 的 userFieldValues 字段 id 在对应 FrameAsset.fields 里存在
 *   3. 每个 wait-condition 引用的 (frameId, fieldId) 在对应 FrameAsset.fields 里存在
 *   4. validateTaskDefinition 对 4 个 task 全部通过（零 error）
 *   5. JSON 反向解析：public/frames/dongfanghong-tasks.json 反序列化后等于源 task
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { dongfanghongFrames } from '../../frame/fixtures/dongfanghong-frames';
import type { FrameAsset } from '../../frame/core';
import {
  dongfanghongTasks,
  fullResetTask,
  laserInitTask,
  commLinkCheckTask,
  rateSweepTask,
} from '../fixtures/dongfanghong-tasks';
import { validateTaskDefinition } from '../core';
import type { TaskDefinition, TaskStepDefinition } from '../core';
import { buildSendRequest } from '../services/task-step-executors';

// ---------------------------------------------------------------------------
// 工具：从 dongfanghongFrames 建立 id -> FrameAsset 索引
// ---------------------------------------------------------------------------

const frameById: ReadonlyMap<string, FrameAsset> = new Map(
  dongfanghongFrames.map((f) => [f.id, f]),
);

function getFieldIdsOf(frameId: string): ReadonlySet<string> {
  const frame = frameById.get(frameId);
  if (!frame) return new Set();
  return new Set(frame.fields.map((fld) => fld.id));
}

// ---------------------------------------------------------------------------
// 工具：从 task step 提取所有 (frameId, fieldId) 引用
// ---------------------------------------------------------------------------

interface FieldRef {
  readonly frameId: string;
  readonly fieldId: string;
  readonly stepId: string;
  readonly context: 'send-userFieldValues' | 'wait-condition';
}

function extractFieldRefs(task: TaskDefinition): readonly FieldRef[] {
  const refs: FieldRef[] = [];
  for (const step of task.steps as readonly TaskStepDefinition[]) {
    if (step.kind === 'send') {
      const ufv = step.config.userFieldValues;
      if (ufv) {
        for (const fieldId of Object.keys(ufv)) {
          refs.push({
            frameId: step.config.frameId,
            fieldId,
            stepId: step.id,
            context: 'send-userFieldValues',
          });
        }
      }
    } else if (step.kind === 'wait-condition') {
      for (const cond of step.config.conditions) {
        refs.push({
          frameId: cond.frameId,
          fieldId: cond.fieldId,
          stepId: step.id,
          context: 'wait-condition',
        });
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// 1. frameId 合法性
// ---------------------------------------------------------------------------

describe('[dongfanghong-tasks] frameId 引用合法性', () => {
  for (const task of dongfanghongTasks) {
    describe(`task: ${task.id}`, () => {
      it(`所有 step 的 frameId 都在 dongfanghongFrames 里存在`, () => {
        const referencedFrameIds: string[] = [];
        for (const step of task.steps as readonly TaskStepDefinition[]) {
          if (step.kind === 'send') {
            referencedFrameIds.push(step.config.frameId);
          } else if (step.kind === 'wait-condition') {
            for (const cond of step.config.conditions) {
              referencedFrameIds.push(cond.frameId);
            }
          }
        }
        // 没有引用就不用断言
        if (referencedFrameIds.length === 0) return;

        const missing = referencedFrameIds.filter((id) => !frameById.has(id));
        expect(missing, `task "${task.id}" 引用了不存在的 frameId: ${missing.join(', ')}`).toEqual([]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. fieldId 合法性
// ---------------------------------------------------------------------------

describe('[dongfanghong-tasks] fieldId 引用合法性', () => {
  for (const task of dongfanghongTasks) {
    describe(`task: ${task.id}`, () => {
      it(`所有 (frameId, fieldId) 引用都在对应 FrameAsset.fields 里存在`, () => {
        const refs = extractFieldRefs(task);
        if (refs.length === 0) return;

        const violations: string[] = [];
        for (const ref of refs) {
          const fieldIds = getFieldIdsOf(ref.frameId);
          if (!fieldIds.has(ref.fieldId)) {
            violations.push(
              `step="${ref.stepId}" context=${ref.context} frameId="${ref.frameId}" fieldId="${ref.fieldId}"`,
            );
          }
        }
        expect(violations, `task "${task.id}" 引用了不存在的 fieldId:\n  ${violations.join('\n  ')}`).toEqual([]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 3. validateTaskDefinition 通过
// ---------------------------------------------------------------------------

describe('[dongfanghong-tasks] validateTaskDefinition 通过', () => {
  const cases: ReadonlyArray<readonly [string, TaskDefinition]> = [
    ['fullResetTask', fullResetTask],
    ['laserInitTask', laserInitTask],
    ['commLinkCheckTask', commLinkCheckTask],
    ['rateSweepTask', rateSweepTask],
  ];

  for (const [label, task] of cases) {
    it(`${label} (${task.id}) 通过 validateTaskDefinition，零 error`, () => {
      const issues = validateTaskDefinition(task);
      const errors = issues.filter((i) => i.severity === 'error');
      expect(errors, errors.map((e) => e.message).join('\n')).toEqual([]);
    });
  }

  it('4 个 task id 唯一', () => {
    const ids = dongfanghongTasks.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 4. JSON round-trip
// ---------------------------------------------------------------------------

describe('[dongfanghong-tasks] JSON round-trip', () => {
  // 定位 public/frames/dongfanghong-tasks.json
  // 测试运行时 cwd 是 rewrite/，但用 import.meta.url 保证跨 cwd
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // __dirname = .../src/features/task/__tests__
  // 向上 4 层到 rewrite/，再进 public/frames
  const jsonPath = resolve(__dirname, '../../../../public/frames/dongfanghong-tasks.json');

  let parsed: { version: number; templates: readonly { templateId: string; definition: TaskDefinition }[] };

  it('能读取并解析 public/frames/dongfanghong-tasks.json', () => {
    const raw = readFileSync(jsonPath, 'utf8');
    parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.templates.length).toBe(4);
  });

  it('JSON 里的 task 集合等于 dongfanghongTasks 源', () => {
    if (!parsed) throw new Error('previous test must run first');
    const sourceIds = dongfanghongTasks.map((t) => t.id).sort();
    const jsonIds = parsed.templates.map((t) => t.definition.id).sort();
    expect(jsonIds).toEqual(sourceIds);
  });

  it('JSON 反序列化的每个 task 通过 validateTaskDefinition', () => {
    if (!parsed) throw new Error('previous test must run first');
    for (const tpl of parsed.templates) {
      const issues = validateTaskDefinition(tpl.definition);
      const errors = issues.filter((i) => i.severity === 'error');
      expect(errors, `task "${tpl.definition.id}" 反序列化后校验失败`).toEqual([]);
    }
  });

  it('JSON 反序列化的 task step 数等于源 task step 数', () => {
    if (!parsed) throw new Error('previous test must run first');
    const byIdSource = new Map(dongfanghongTasks.map((t) => [t.id, t] as const));
    for (const tpl of parsed.templates) {
      const source = byIdSource.get(tpl.definition.id);
      expect(source, `source missing for ${tpl.definition.id}`).toBeDefined();
      expect(tpl.definition.steps.length).toBe(source!.steps.length);
    }
  });

  it('JSON 反序列化的 task 反向引用的 frameId / fieldId 全部合法', () => {
    if (!parsed) throw new Error('previous test must run first');
    for (const tpl of parsed.templates) {
      const refs = extractFieldRefs(tpl.definition);
      for (const ref of refs) {
        const fieldIds = getFieldIdsOf(ref.frameId);
        expect(
          fieldIds.has(ref.fieldId),
          `task "${tpl.definition.id}" step "${ref.stepId}" 引用了不存在的 fieldId: frameId="${ref.frameId}" fieldId="${ref.fieldId}"`,
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. 业务语义快照（防止意外改变结构）
// ---------------------------------------------------------------------------

describe('[dongfanghong-tasks] 业务语义快照', () => {
  it('fullResetTask 有 12 个 send step（12 条脉冲）和 11 个 delay step（间隔）', () => {
    const sends = fullResetTask.steps.filter((s) => s.kind === 'send');
    const delays = fullResetTask.steps.filter((s) => s.kind === 'delay');
    expect(sends.length).toBe(12);
    expect(delays.length).toBe(11);
  });

  it('fullResetTask 的 errorPolicy 是 skip-step', () => {
    expect(fullResetTask.errorPolicy.onFailure).toBe('skip-step');
  });

  it('fullResetTask 是 immediate schedule 且无 stopCondition', () => {
    expect(fullResetTask.schedule.kind).toBe('immediate');
    expect(fullResetTask.stopCondition).toBeUndefined();
  });

  it('laserInitTask 最后一步是 wait-condition 等待 tm-laser-runtime', () => {
    const last = laserInitTask.steps[laserInitTask.steps.length - 1];
    expect(last.kind).toBe('wait-condition');
    if (last.kind === 'wait-condition') {
      expect(last.config.conditions[0].frameId).toBe('tm-laser-runtime');
      expect(last.config.conditions[0].fieldId).toBe('tec1-t-m-out');
    }
  });

  it('commLinkCheckTask 的 wait-condition 包含 carrier/symbol/frame 三态锁定', () => {
    const waits = commLinkCheckTask.steps.filter((s) => s.kind === 'wait-condition');
    expect(waits.length).toBe(1);
    const wait = waits[0];
    if (wait.kind === 'wait-condition') {
      const fieldIds = wait.config.conditions.map((c) => c.fieldId).sort();
      expect(fieldIds).toEqual(['carrier-lock-state', 'frame-lock-state', 'symbol-lock-state']);
    }
  });

  it('rateSweepTask 是 timer schedule，intervalMs=10000，maxIterations=8', () => {
    expect(rateSweepTask.schedule.kind).toBe('timer');
    if (rateSweepTask.schedule.kind === 'timer') {
      expect(rateSweepTask.schedule.intervalMs).toBe(10000);
    }
    expect(rateSweepTask.stopCondition?.maxIterations).toBe(8);
  });

  it('rateSweepTask 的 wait-condition onTimeout 是 skip（单档失败继续）', () => {
    const waits = rateSweepTask.steps.filter((s) => s.kind === 'wait-condition');
    expect(waits.length).toBe(1);
    const wait = waits[0];
    if (wait.kind === 'wait-condition') {
      expect(wait.config.onTimeout).toBe('skip');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. defaultTargetId fallback（task 级 targetId + step 级可选）
// ---------------------------------------------------------------------------

describe('[dongfanghong-tasks] defaultTargetId fallback', () => {
  it('4 个 task 的 definition.defaultTargetId 都等于 dongfanghong-device-1', () => {
    for (const task of dongfanghongTasks) {
      expect(task.defaultTargetId, `task "${task.id}" 应设置 defaultTargetId`).toBe('dongfanghong-device-1');
    }
  });

  it('4 个 task 的所有 send step 都不带 targetId 字段（统一由 task 级 fallback）', () => {
    const violations: string[] = [];
    for (const task of dongfanghongTasks) {
      for (const step of task.steps as readonly TaskStepDefinition[]) {
        if (step.kind === 'send' && step.config.targetId !== undefined) {
          violations.push(`task="${task.id}" step="${step.id}" 不应带 targetId（应由 task 级 fallback）`);
        }
      }
    }
    expect(violations, violations.join('\n  ')).toEqual([]);
  });

  it('buildSendRequest 在 step.targetId 缺失时返回 definition.defaultTargetId', () => {
    const task = laserInitTask;
    const sendStep = task.steps.find((s) => s.kind === 'send') as
      | undefined
      | Extract<TaskStepDefinition, { kind: 'send' }>;
    expect(sendStep, 'laserInitTask 应至少有一个 send step').toBeDefined();
    if (!sendStep) return;
    const req = buildSendRequest(sendStep, task, 0, 0);
    expect(req.targetId).toBe('dongfanghong-device-1');
  });

  it('JSON round-trip 后 defaultTargetId 完整保留', () => {
    const __filenameRT = fileURLToPath(import.meta.url);
    const __dirnameRT = dirname(__filenameRT);
    const jsonPath = resolve(__dirnameRT, '../../../../public/frames/dongfanghong-tasks.json');
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version: number; templates: readonly { definition: TaskDefinition }[] };
    for (const tpl of parsed.templates) {
      expect(tpl.definition.defaultTargetId, `task "${tpl.definition.id}" JSON 应保留 defaultTargetId`).toBe('dongfanghong-device-1');
    }
  });

  it('JSON round-trip 后所有 send step 仍然没有 targetId 字段', () => {
    const __filenameRT = fileURLToPath(import.meta.url);
    const __dirnameRT = dirname(__filenameRT);
    const jsonPath = resolve(__dirnameRT, '../../../../public/frames/dongfanghong-tasks.json');
    const raw = readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version: number; templates: readonly { definition: TaskDefinition }[] };
    for (const tpl of parsed.templates) {
      for (const step of tpl.definition.steps as readonly TaskStepDefinition[]) {
        if (step.kind === 'send') {
          expect(step.config.targetId, `task "${tpl.definition.id}" step "${step.id}" JSON 反序列化后不应有 targetId`).toBeUndefined();
        }
      }
    }
  });
});
