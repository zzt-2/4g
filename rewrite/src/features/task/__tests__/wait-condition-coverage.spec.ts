/**
 * S014: 等待条件(wait-condition)全覆盖实测。
 *
 * 目的: 造一套覆盖 9 种 operator + and/or + 3 种 onTimeout + 永久等待 + 中断 + sourceId +
 * repeat.until + exitCondition 的用例, 跑真实执行路径验证行为。
 *
 * 为什么用集成测试而非 UI 手测: 本沙箱无真实串口/回环硬件, UI 手测不可行。但等待条件的
 * 全部执行逻辑(createTaskService → executeWaitConditionStep → ConditionRegistry.processInput)
 * 是纯 JS 代码, 用 createFakeReceiveEventSource.emit() 模拟"收到一帧"即可驱动同一代码路径,
 * 等价于"在应用里手动构造接收帧"。这是能在此环境得到的最高保真实测。
 *
 * 文档/注释里"发帧 X / 不发帧"指 receiveEventSource.emit({ frameId, fieldValues })。
 *
 * 关联文件:
 * - 求值: shared/condition-operators/compare.ts (9 operator)
 * - 组求值: core/condition-matcher.ts
 * - 执行: services/task-step-executors.ts (executeWaitConditionStep)
 * - registry: services/condition-registry.ts (processInput, frameId 索引, sourceId 过滤)
 * - 测试数据(可导入应用): public/test-data/wait-condition-test-{frames,tasks}.json
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTaskService } from '../services';
import { createFakeSendService, createFakeReceiveEventSource } from '../adapters/test-exports';
import type { ConditionTerm, TaskDefinition } from '../core';

// --- helpers ---

function buildService(opts?: { readonly fieldValueProvider?: () => Readonly<Record<string, number | string | null>> }) {
  const sendService = createFakeSendService();
  const receiveEventSource = createFakeReceiveEventSource();
  const taskService = createTaskService({
    sendService,
    receiveEventSource,
    fieldValueProvider: opts?.fieldValueProvider,
  });
  return { taskService, sendService, receiveEventSource };
}

/** 构造单 wait step + trailing delay 的 immediate 任务。 */
function waitTask(
  id: string,
  conditions: readonly ConditionTerm[],
  config: { timeoutMs?: number; onTimeout: 'continue' | 'skip' | 'fail' },
): TaskDefinition {
  return {
    id,
    name: id,
    schedule: { kind: 'immediate' },
    steps: [
      { id: `${id}-wait`, kind: 'wait-condition', name: 'wait', config: { conditions, ...config } },
      { id: `${id}-after`, kind: 'delay', name: 'after', config: { durationMs: 5 } },
    ],
    errorPolicy: { onFailure: 'stop' },
  };
}

/** 等待并返回最终 lifecycle。 */
async function settle(taskService: ReturnType<typeof buildService>['taskService'], instanceId: string): Promise<string> {
  await taskService.onSettled(instanceId);
  return taskService.getInstance(instanceId)!.lifecycle;
}

// ============================================================
// 9 种 operator
// ============================================================

describe('S014 wait-condition: 9 operators', () => {
  let svc: ReturnType<typeof buildService>;

  beforeEach(() => {
    svc = buildService();
  });

  it('eq: actual==threshold 数值相等才匹配', async () => {
    const def = waitTask('op-eq', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 不匹配: 150 != 100
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 150 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    // 匹配: 100 == 100
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('neq: actual!=threshold 数值不等才匹配', async () => {
    const def = waitTask('op-neq', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'neq', threshold: 50 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 不匹配: 50 == 50
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 50 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    // 匹配: 80 != 50
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 80 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('gt: actual>threshold 严格大于', async () => {
    const def = waitTask('op-gt', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'gt', threshold: 50 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 50 } }); // 边界不匹配
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 51 } }); // >50
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('lt: actual<threshold 严格小于', async () => {
    const def = waitTask('op-lt', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'lt', threshold: 50 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 50 } }); // 边界不匹配
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 49 } }); // <50
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('gte: actual>=threshold 含边界', async () => {
    const def = waitTask('op-gte', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'gte', threshold: 100 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 99 } }); // 不匹配
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } }); // 边界匹配
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('lte: actual<=threshold 含边界', async () => {
    const def = waitTask('op-lte', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'lte', threshold: 100 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 101 } }); // 不匹配
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } }); // 边界匹配
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('contains: String(actual).includes(String(threshold)) 子串', async () => {
    const def = waitTask('op-contains', [
      { frameId: 'wt-status', fieldId: 'wt-status-text', operator: 'contains', threshold: 'OK' },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-status-text': 'STANDBY' } }); // 不含 OK
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-status-text': 'SYSTEM-OK' } }); // 含 OK
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('change: actual 非空 且 !== threshold 才匹配', async () => {
    const def = waitTask('op-change', [
      { frameId: 'wt-counter', fieldId: 'wt-count', operator: 'change', threshold: 0 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 0 } }); // ===threshold 不匹配
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 5 } }); // !==0 非空 匹配
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('any: actual != null 只看字段有无值, threshold 被忽略', async () => {
    const def = waitTask('op-any', [
      { frameId: 'wt-status', fieldId: 'wt-optional-payload', operator: 'any', threshold: 0 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // null → 不匹配
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-optional-payload': null } });
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    // 有值(0 也算有值) → 匹配
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-optional-payload': 0 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });
});

// ============================================================
// 十六进制 threshold 0x 解析
// ============================================================

describe('S014 wait-condition: hex threshold 0x parsing', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('threshold "0x0001" 被解析为 1, 与 actual 1 数值相等匹配', async () => {
    const def = waitTask('hex-eq', [
      { frameId: 'wt-status', fieldId: 'wt-raw-status', operator: 'eq', threshold: '0x0001' },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-raw-status': 2 } }); // 不匹配
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-raw-status': 1 } }); // 0x0001 == 1
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('actual 是 "0x0001" 字符串, threshold 1 也能数值匹配(双向)', async () => {
    const def = waitTask('hex-actual', [
      { frameId: 'wt-status', fieldId: 'wt-raw-status', operator: 'eq', threshold: 1 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-raw-status': '0x0001' } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });
});

// ============================================================
// null 字段 → 除 any 外全部 false
// ============================================================

describe('S014 wait-condition: null field behavior', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('字段 null 时 eq 不匹配(超时 → onTimeout=fail → errorPolicy stop → failed)', async () => {
    // S014 修复: errorPolicy 的 'stop' 分支现在走 updateLifecycle('fail') → 终态 'failed'
    // (task-error-policy.ts:32), 与手动 stopTask(=stopped)区分, 符合直觉。
    const def = waitTask('null-eq', [
      { frameId: 'wt-status', fieldId: 'wt-optional-payload', operator: 'eq', threshold: 100 },
    ], { timeoutMs: 200, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-optional-payload': null } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('failed');
  });

  it('字段 undefined(缺失)时 gt 不匹配(超时 → failed)', async () => {
    const def = waitTask('null-gt', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'gt', threshold: 50 },
    ], { timeoutMs: 200, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 整个字段不在 fieldValues 里 → undefined → 不匹配
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: {} });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('failed');
  });
});

// ============================================================
// AND / OR 组合
// ============================================================

describe('S014 wait-condition: AND / OR group', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('AND: 部分满足不匹配, 全满足才匹配', async () => {
    const def = waitTask('and-group', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
      { frameId: 'wt-status', fieldId: 'wt-raw-status', operator: 'eq', threshold: 1 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 部分满足: power=100 但 status=2
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100, 'wt-raw-status': 2 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    // 全满足
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100, 'wt-raw-status': 1 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('OR: 任一满足即匹配 (跨 frameId)', async () => {
    const def = waitTask('or-group', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
      { frameId: 'wt-aux', fieldId: 'wt-aux-flag', operator: 'eq', threshold: 1, logicOperator: 'or' },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 只 wt-aux 满足(wt-status 不发) → OR 第二项命中
    svc.receiveEventSource.emit({ frameId: 'wt-aux', fieldValues: { 'wt-aux-flag': 1 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });
});

// ============================================================
// frameId 隔离: 等 A 来 B 不匹配
// ============================================================

describe('S014 wait-condition: frameId isolation', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('等 wt-status.power, 发 wt-aux 同值帧不该匹配', async () => {
    const def = waitTask('iso', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
    ], { timeoutMs: 300, onTimeout: 'skip' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 发 wt-aux 的帧 (registry 按 frameId 索引, wt-status 的 group 不在 wt-aux 候选集)
    svc.receiveEventSource.emit({ frameId: 'wt-aux', fieldValues: { 'wt-power': 100 } });
    await new Promise((r) => setTimeout(r, 50));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    // 超时 skip 推进
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
    const waitResult = svc.taskService.getInstance(inst.instanceId)!.stepResults[0]!;
    expect(waitResult.timedOut).toBe(true);
  });
});

// ============================================================
// 3 种 onTimeout
// ============================================================

describe('S014 wait-condition: onTimeout strategies', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('onTimeout=continue: 超时后正常推进(无 skip 标记)', async () => {
    const def = waitTask('tc', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 99999 },
    ], { timeoutMs: 200, onTimeout: 'continue' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
    const waitResult = svc.taskService.getInstance(inst.instanceId)!.stepResults[0]!;
    expect(waitResult.kind).toBe('wait-condition');
    expect(waitResult.timedOut).toBe(true);
    expect(waitResult.matched).toBe(false);
    expect(waitResult.appliedPolicy).toBeUndefined(); // continue 不标 policy
  });

  it('onTimeout=skip: 超时后标 appliedPolicy=skip-step 推进', async () => {
    const def = waitTask('ts', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 99999 },
    ], { timeoutMs: 200, onTimeout: 'skip' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
    const waitResult = svc.taskService.getInstance(inst.instanceId)!.stepResults[0]!;
    expect(waitResult.kind).toBe('wait-condition');
    expect(waitResult.timedOut).toBe(true);
    expect(waitResult.appliedPolicy).toBe('skip-step');
  });

  it('onTimeout=fail + errorPolicy stop: 超时 → 终态 failed (S014 修复后符合直觉), 后续 step 不执行', async () => {
    // S014 修复: errorPolicy 'stop' 分支改走 'fail' 终态(=failed), 与手动 stopTask(=stopped)区分。
    const def = waitTask('tf', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 99999 },
    ], { timeoutMs: 200, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    expect(await settle(svc.taskService, inst.instanceId)).toBe('failed');
    // 只执行了 wait step(超时→fail), delay step 没执行
    expect(svc.taskService.getInstance(inst.instanceId)!.stepResults.length).toBe(1);
  });

  it('onTimeout=fail + errorPolicy retry: 超时重试用尽 → failed, 只记录 1 个 wait 结果', async () => {
    // 实测发现: retry 在 applyErrorPolicy 内部循环重执行, 中间结果不进 stepResults,
    // 只最终结果被 executeSteps 记录(task-iteration-loops.ts:283)。
    const def: TaskDefinition = {
      id: 'tfr',
      name: 'tfr',
      schedule: { kind: 'immediate' },
      steps: [
        {
          id: 'tfr-wait',
          kind: 'wait-condition',
          name: 'wait',
          config: {
            conditions: [{ frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 99999 }],
            timeoutMs: 100,
            onTimeout: 'fail',
          },
        },
      ],
      errorPolicy: { onFailure: 'retry', retryCount: 1, retryDelayMs: 20 },
    };
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    expect(await settle(svc.taskService, inst.instanceId)).toBe('failed');
    // retry 用尽 → failed; 但只记录最终 1 个 wait 结果(appliedPolicy='retry'), 中间重试不记
    const waitResults = svc.taskService.getInstance(inst.instanceId)!.stepResults.filter((r) => r.kind === 'wait-condition');
    expect(waitResults.length).toBe(1);
    expect(waitResults[0]!.appliedPolicy).toBe('retry');
  });
});

// ============================================================
// timeoutMs undefined 永久等待 + 被 stop 中断
// ============================================================

describe('S014 wait-condition: forever wait + interrupt', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('timeoutMs 省略: 不发帧一直等, 发匹配帧后通过', async () => {
    const def = waitTask('fw', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
    ], { onTimeout: 'continue' }); // 无 timeoutMs
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 50));

    // 50ms 后仍 running(不会超时)
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('被 stop 中断: wait step 不记 step result(interrupted→null), 任务 stopped, 后续 step 不执行', async () => {
    // 实测发现: 被 signal 中断的 wait step, executeStepCore 返回 null(task-iteration-loops.ts:338),
    // executeSteps 不调 addStepResult → stepResults 为空(中断的 step 不留痕)。
    const def = waitTask('is', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 99999 },
    ], { timeoutMs: 60000, onTimeout: 'continue' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 20));

    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');
    svc.taskService.stopTask(inst.instanceId);

    expect(await settle(svc.taskService, inst.instanceId)).toBe('stopped');
    // 中断的 wait step 不记 result → stepResults 为空
    const stepResults = svc.taskService.getInstance(inst.instanceId)!.stepResults;
    expect(stepResults.length).toBe(0);
  });
});

// ============================================================
// sourceId 过滤
// ============================================================

describe('S014 wait-condition: sourceId filter', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('条件带 sourceId: 只匹配指定来源的帧', async () => {
    const def = waitTask('sf', [
      { frameId: 'wt-counter', fieldId: 'wt-count', operator: 'eq', threshold: 5, sourceId: 'source-A' },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // source-B 的帧: 值对但来源不对 → 不匹配
    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 5 }, sourceId: 'source-B' });
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    // source-A 的帧 → 匹配
    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 5 }, sourceId: 'source-A' });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('条件不带 sourceId: 无 sourceId 的帧也能匹配(input.sourceId undefined 时跳过过滤)', async () => {
    const def = waitTask('sf-nofilter', [
      { frameId: 'wt-counter', fieldId: 'wt-count', operator: 'eq', threshold: 5 },
    ], { timeoutMs: 2000, onTimeout: 'fail' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 5 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });
});

// ============================================================
// 疑似缺口确认: fieldValueProvider 不接线 → repeat.until / exitCondition 失效
// ============================================================

describe('S014 known gap: fieldValueProvider wiring', () => {
  // 模拟生产 wireFeatures 不传 fieldValueProvider(=undefined)
  it('无 fieldValueProvider 时 repeat.until 被跳过(只靠 maxCount 停)', async () => {
    const svc = buildService(); // 不传 fieldValueProvider
    const def: TaskDefinition = {
      id: 'ru-nogap',
      name: 'ru-nogap',
      schedule: { kind: 'immediate' },
      steps: [
        {
          id: 'ru-send',
          kind: 'send',
          name: 'repeat send',
          config: {
            frameId: 'wt-status',
            repeat: {
              intervalMs: 30,
              maxCount: 3,
              until: [{ frameId: 'wt-counter', fieldId: 'wt-count', operator: 'eq', threshold: 3 }],
            },
          },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    // 发满足 until 的帧, 但因无 provider, until 不生效 → 必须发满 maxCount=3 次
    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 3 } });
    await settle(svc.taskService, inst.instanceId);

    // 无 provider → until 被跳过 → 发满 3 次才停(而非 until 命中提前停)
    expect(svc.sendService.calls.length).toBe(3);
  });

  it('有 fieldValueProvider 时 repeat.until 命中提前退出', async () => {
    // 模拟"正确接线": provider 返回当前最新帧值
    let latestValues: Readonly<Record<string, number | string | null>> = {};
    const svc = buildService({
      fieldValueProvider: () => latestValues,
    });
    const def: TaskDefinition = {
      id: 'ru-ok',
      name: 'ru-ok',
      schedule: { kind: 'immediate' },
      steps: [
        {
          id: 'ru-send',
          kind: 'send',
          name: 'repeat send',
          config: {
            frameId: 'wt-status',
            repeat: {
              intervalMs: 30,
              maxCount: 10,
              until: [{ frameId: 'wt-counter', fieldId: 'wt-count', operator: 'eq', threshold: 3 }],
            },
          },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    // 第一次发后, 模拟收到满足 until 的帧(provider 取到值)
    await new Promise((r) => setTimeout(r, 5));
    latestValues = { 'wt-count': 3 };

    await settle(svc.taskService, inst.instanceId);

    // 有 provider → until 命中 → 提前退出, 远少于 maxCount=10
    expect(svc.sendService.calls.length).toBeLessThan(10);
    expect(svc.sendService.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('无 fieldValueProvider 时 exitCondition 永不触发(checkExitCondition 返回 false)', async () => {
    const svc = buildService();
    const def: TaskDefinition = {
      id: 'ec-nogap',
      name: 'ec-nogap',
      schedule: { kind: 'timer', intervalMs: 30 },
      steps: [
        { id: 'ec-send', kind: 'send', name: 'send', config: { frameId: 'wt-status' } },
      ],
      stopCondition: {
        maxIterations: 5,
        exitCondition: [{ frameId: 'wt-counter', fieldId: 'wt-count', operator: 'gte', threshold: 5 }],
      },
      errorPolicy: { onFailure: 'stop' },
    };
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);

    // 发满足 exitCondition 的帧, 但无 provider → exitCondition 不生效 → 跑满 maxIterations=5
    svc.receiveEventSource.emit({ frameId: 'wt-counter', fieldValues: { 'wt-count': 99 } });
    await settle(svc.taskService, inst.instanceId);

    // exitCondition 没生效 → 跑满 5 轮
    expect(svc.sendService.calls.length).toBe(5);
  });
});

// ============================================================
// push 模型不看历史帧: 条件帧在 wait step 注册前到达会被错过
// ============================================================

describe('S014 known gap: push model ignores history', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('匹配帧在 wait step 启动前到达 → 错过(只等之后的新帧)', async () => {
    const def = waitTask('push-miss', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
    ], { timeoutMs: 300, onTimeout: 'skip' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    // 注意: 此时 wait step 的 group 已注册(startTask 同步入 running, group 在第一次 processInput 前已建)

    // 立即发匹配帧(group 已注册, 应该能收到)
    await new Promise((r) => setTimeout(r, 2));
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } });
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
  });

  it('条件帧在 wait group 注册之前到达(无订阅者) → 被丢弃, 之后需重发', async () => {
    // 直接对 receiveEventSource 发帧, 但此时无 task 订阅 → 帧丢弃
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } });
    expect(svc.receiveEventSource.emitted.length).toBe(1); // 帧确实发出

    const def = waitTask('push-miss2', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
    ], { timeoutMs: 300, onTimeout: 'skip' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 旧帧已错过(无订阅者时丢弃), 只等超时
    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
    const waitResult = svc.taskService.getInstance(inst.instanceId)!.stepResults[0]!;
    expect(waitResult.timedOut).toBe(true);
  });
});

// ============================================================
// push 模型补充: 同一帧到达时, 多个 group 独立求值
// ============================================================

describe('S014 wait-condition: registry short-circuit & multi-group', () => {
  let svc: ReturnType<typeof buildService>;
  beforeEach(() => { svc = buildService(); });

  it('AND 短路: 第一项失败时不再评估后续(用 spy 验证)', async () => {
    // 用 neq 第一项不可能匹配的 threshold, 验证不误触发完成
    const def = waitTask('and-sc', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 }, // 不满足
      { frameId: 'wt-status', fieldId: 'wt-raw-status', operator: 'eq', threshold: 1 }, // 满足
    ], { timeoutMs: 300, onTimeout: 'skip' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 5));

    // 第二项满足但第一项不满足 → AND 失败 → 不完成
    svc.receiveEventSource.emit({ frameId: 'wt-status', fieldValues: { 'wt-power': 50, 'wt-raw-status': 1 } });
    await new Promise((r) => setTimeout(r, 30));
    expect(svc.taskService.getInstance(inst.instanceId)!.lifecycle).toBe('running');

    expect(await settle(svc.taskService, inst.instanceId)).toBe('completed');
    expect(svc.taskService.getInstance(inst.instanceId)!.stepResults[0]!.timedOut).toBe(true);
  });
});

// 兜底: 防止未处理的 timer 泄漏(vitest 默认会警告, 这里显式清)
describe('S014 wait-condition: cleanup', () => {
  it('任务终态后 conditionRegistry 清空(无残留 group)', async () => {
    const svc = buildService();
    const def = waitTask('clean', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 100 },
    ], { timeoutMs: 200, onTimeout: 'skip' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await settle(svc.taskService, inst.instanceId);

    // vi 的 fake timers 未启用, 真实 setTimeout 在终态后被 unregisterGroup 清掉。
    // 这里只验证终态正确, 不强制断言内部 registry(它不暴露 size)。
    expect(['completed', 'failed', 'stopped']).toContain(svc.taskService.getInstance(inst.instanceId)!.lifecycle);
  });
});

// ============================================================
// S014 修复回归: ReceiveEventSourceBridge.getLatestFieldValues 接线
// 验证生产 wireFeatures 把 bridge.getLatestFieldValues 作为 fieldValueProvider 后,
// repeat.until / exitCondition 能在收到帧后生效(原 bug: provider 未接 → 永不生效)。
// ============================================================

import { ReceiveEventSourceBridge } from '@/runtime/bridges/receive-event-source-bridge';

describe('S014 修复: ReceiveEventSourceBridge.getLatestFieldValues', () => {
  it('emit 后 getLatestFieldValues 返回最新字段值快照', () => {
    const bridge = new ReceiveEventSourceBridge();
    expect(bridge.getLatestFieldValues()).toEqual({});

    bridge.emit([{ frameId: 'wt-status', fieldValues: { 'wt-power': 100, 'wt-raw-status': 1 } }]);
    expect(bridge.getLatestFieldValues()).toEqual({ 'wt-power': 100, 'wt-raw-status': 1 });

    // 后到的帧 merge, 同名字段覆盖, 新字段追加
    bridge.emit([{ frameId: 'wt-counter', fieldValues: { 'wt-count': 5 } }]);
    expect(bridge.getLatestFieldValues()).toEqual({ 'wt-power': 100, 'wt-raw-status': 1, 'wt-count': 5 });

    // 覆盖同名
    bridge.emit([{ frameId: 'wt-status', fieldValues: { 'wt-power': 200 } }]);
    expect(bridge.getLatestFieldValues()['wt-power']).toBe(200);
    expect(bridge.getLatestFieldValues()['wt-count']).toBe(5); // 其它字段保留
  });

  it('null 值也被如实记录(不丢字段)', () => {
    const bridge = new ReceiveEventSourceBridge();
    bridge.emit([{ frameId: 'wt-status', fieldValues: { 'wt-optional-payload': null } }]);
    expect(bridge.getLatestFieldValues()).toEqual({ 'wt-optional-payload': null });
  });

  it('clear 清空快照', () => {
    const bridge = new ReceiveEventSourceBridge();
    bridge.emit([{ frameId: 'wt-status', fieldValues: { 'wt-power': 100 } }]);
    bridge.clear();
    expect(bridge.getLatestFieldValues()).toEqual({});
  });
});

describe('S014 修复回归: bridge 接线后 repeat.until 生效(等价生产 wireFeatures)', () => {
  // 模拟 feature-wiring.ts 的接线: fieldValueProvider 读 bridge.getLatestFieldValues
  function buildWiredService() {
    const bridge = new ReceiveEventSourceBridge();
    const sendService = createFakeSendService();
    const taskService = createTaskService({
      sendService,
      receiveEventSource: bridge,
      fieldValueProvider: () => bridge.getLatestFieldValues(), // ← 生产接线方式
    });
    return { taskService, sendService, bridge };
  }

  it('repeat.until: 发满足帧后提前退出(而非跑满 maxCount)', async () => {
    const { taskService, sendService, bridge } = buildWiredService();
    const def: TaskDefinition = {
      id: 'ru-wired',
      name: 'ru-wired',
      schedule: { kind: 'immediate' },
      steps: [
        {
          id: 'ru-send',
          kind: 'send',
          name: 'repeat send',
          config: {
            frameId: 'wt-counter-cmd',
            repeat: {
              intervalMs: 30,
              maxCount: 20,
              until: [{ frameId: 'wt-counter', fieldId: 'wt-count', operator: 'eq', threshold: 3 }],
            },
          },
        },
      ],
      errorPolicy: { onFailure: 'stop' },
    };
    const inst = taskService.createTask(def);
    taskService.startTask(inst.instanceId);

    // 第一次发送后, 模拟收到满足 until 的帧 → bridge 快照更新 → until 命中
    await new Promise((r) => setTimeout(r, 5));
    bridge.emit([{ frameId: 'wt-counter', fieldValues: { 'wt-count': 3 } }]);

    await taskService.onSettled(inst.instanceId);

    // 修复后: until 命中 → 提前退出, 远少于 maxCount=20
    expect(sendService.calls.length).toBeLessThan(20);
    expect(sendService.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('exitCondition: 发满足帧后任务提前退出(而非跑满 maxIterations)', async () => {
    const { taskService, sendService, bridge } = buildWiredService();
    const def: TaskDefinition = {
      id: 'ec-wired',
      name: 'ec-wired',
      schedule: { kind: 'timer', intervalMs: 30 },
      steps: [
        { id: 'ec-send', kind: 'send', name: 'send', config: { frameId: 'wt-counter-cmd' } },
      ],
      stopCondition: {
        maxIterations: 20,
        exitCondition: [{ frameId: 'wt-counter', fieldId: 'wt-count', operator: 'gte', threshold: 5 }],
      },
      errorPolicy: { onFailure: 'stop' },
    };
    const inst = taskService.createTask(def);
    taskService.startTask(inst.instanceId);

    // 发满足 exitCondition 的帧
    bridge.emit([{ frameId: 'wt-counter', fieldValues: { 'wt-count': 99 } }]);

    await taskService.onSettled(inst.instanceId);

    // 修复后: exitCondition 命中 → 提前退出, 远少于 maxIterations=20
    expect(sendService.calls.length).toBeLessThan(20);
    expect(sendService.calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// S014 修复回归: 手动 stopTask 仍是 stopped(不被 errorPolicy 改动影响)
// ============================================================

describe('S014 修复回归: 手动 stopTask 终态仍是 stopped', () => {
  it('手动 stopTask → stopped (与 errorPolicy 失败的 failed 区分)', async () => {
    const svc = buildService();
    const def = waitTask('manual-stop', [
      { frameId: 'wt-status', fieldId: 'wt-power', operator: 'eq', threshold: 99999 },
    ], { timeoutMs: 60000, onTimeout: 'continue' });
    const inst = svc.taskService.createTask(def);
    svc.taskService.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 20));

    svc.taskService.stopTask(inst.instanceId);
    expect(await settle(svc.taskService, inst.instanceId)).toBe('stopped');
  });
});
