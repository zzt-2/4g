import { describe, it, expect } from 'vitest';
import type { SendResult } from '@/features/send';
import type { TaskDefinition, TaskInstanceState } from '../core';
import { timedTaskDef, makeSendResult } from '../fixtures/task-fixtures';
import { createFakeSendService } from '../adapters/test-exports';
import { createFakeReceiveEventSource } from '../adapters/test-exports';
import { createTaskService, type TaskService } from '../services/task-service';
import type { TaskHistoryStorage } from '../services/task-history-storage';
import {
  selectTaskInstances,
  selectTaskHistory,
} from '../selectors/task-selectors';

// --- 复现：用户现象2「刚刚停止的在历史记录里没有，明明活动任务里能看见，停止之后就没了」
// 复现路径（用户口述）：
//   1. 实例在「活动任务」里可见 = lifecycle running/paused，在 snapshot.instances 里
//   2. 停止它 → stopTask → transition 'stopped'（终态）
//   3. 期望：停止后出现在「历史记录」里（selectTaskHistory 合并 instances 中终态）
//   4. 实际（用户）：停止后两边都看不到了
//
// 这个测试用页面同款 selector(selectTaskHistory) 验证停止后是否进历史。

function makeSentResult(): SendResult {
  return makeSendResult();
}

function createTestSetup(overrides: { definition?: TaskDefinition; sendResults?: readonly SendResult[] } = {}) {
  const fakeSend = createFakeSendService({ results: overrides.sendResults ?? [makeSentResult()] });
  const fakeReceive = createFakeReceiveEventSource();
  const service = createTaskService({
    sendService: fakeSend,
    receiveEventSource: fakeReceive,
    now: () => '2026-05-06T12:00:00.000Z',
  });
  const definition = overrides.definition ?? timedTaskDef();
  const instance = service.createTask(definition);
  return { service, fakeSend, fakeReceive, definition, instance };
}

async function settle(service: TaskService, instanceId: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inst = service.getInstance(instanceId);
    if (
      !inst ||
      inst.lifecycle === 'completed' ||
      inst.lifecycle === 'stopped' ||
      inst.lifecycle === 'failed' ||
      inst.lifecycle === 'paused'
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('现象2 复现：停止的实例在历史记录里是否可见', () => {
  it('running 实例 stopTask 后应出现在 selectTaskHistory 里（页面历史表数据源）', async () => {
    // 一个会跑很久的 timed 任务：多迭代，确保停止时仍 running
    const def: TaskDefinition = {
      ...timedTaskDef(),
      stopCondition: { maxIterations: 1000 },
      schedule: { kind: 'timer', intervalMs: 50 },
    };
    const results = Array.from({ length: 1000 * def.steps.length }, () => makeSentResult());
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    // 等它进入 running（至少跑过一次）
    await new Promise((r) => setTimeout(r, 30));

    // ---- 步骤1：停止前，实例在「活动」里可见 ----
    const running = service.getInstance(instance.instanceId);
    expect(running).toBeDefined();
    const activeBefore = selectTaskInstances(service.getSnapshot()).filter(
      (i) => i.lifecycle === 'running',
    );
    expect(activeBefore.some((i) => i.instanceId === instance.instanceId)).toBe(true);

    // ---- 步骤2：停止它 ----
    service.stopTask(instance.instanceId);
    await settle(service, instance.instanceId, 200);

    // ---- 步骤3：停止后，实例应是终态 stopped ----
    const stopped = service.getInstance(instance.instanceId);
    expect(stopped?.lifecycle).toBe('stopped');

    // ---- 步骤4（核心断言）：停止的实例是否进 selectTaskHistory（页面历史表）----
    const history = selectTaskHistory(service.getSnapshot());
    const inHistory = history.some((i) => i.instanceId === instance.instanceId);
    // 期望 true；若 false，即复现了「停止后历史里看不到」
    expect(inHistory).toBe(true);
  });

  it('paused 实例 stopTask 后也应出现在历史里', async () => {
    const def: TaskDefinition = {
      ...timedTaskDef(),
      stopCondition: { maxIterations: 1000 },
      schedule: { kind: 'timer', intervalMs: 50 },
    };
    const results = Array.from({ length: 1000 * def.steps.length }, () => makeSentResult());
    const { service, instance } = createTestSetup({ definition: def, sendResults: results });

    service.startTask(instance.instanceId);
    await new Promise((r) => setTimeout(r, 30));
    service.pauseTask(instance.instanceId);
    await settle(service, instance.instanceId, 200);
    expect(service.getInstance(instance.instanceId)?.lifecycle).toBe('paused');

    service.stopTask(instance.instanceId);
    await settle(service, instance.instanceId, 200);

    const history = selectTaskHistory(service.getSnapshot());
    expect(history.some((i) => i.instanceId === instance.instanceId)).toBe(true);
  });
});

// ===========================================================================
// 现象2 根因回归：instanceId 跨重启复用，撞上持久化历史被去重丢掉
// ===========================================================================
// 根因（运行时快照坐实，2026-06-25）：
//   task-service.ts `let nextInstanceId = 1` 是模块级变量，进程重启后从 1 重置；
//   而 historyStorage 跨重启累积。每次重启新建实例从 task-inst-1 重新编号，
//   与 history 里旧的 task-inst-1..N 撞 id。
//   selectTaskHistory 去重按 instanceId 字符串比对 → 新 stopped 实例被当重复丢掉
//   = 用户现象「活动看得见、停了就没了」。
//
// 这组测试模拟「重启」：用 fake historyStorage 注入上次的持久化历史（高 id），
// 再新建实例，断言新 id 单调递增不撞车、停止后能进历史。

/** 造一个「上次会话」持久化的终态实例（模拟重启时 loadAll 读回的数据）。 */
function makePersistedInstance(instanceId: string): TaskInstanceState {
  return {
    instanceId,
    definitionRef: timedTaskDef(),
    lifecycle: 'stopped',
    currentStepIndex: 0,
    currentIteration: 0,
    stepResults: [],
    startedAt: '2026-06-24T10:00:00.000Z',
    currentStepStartedAt: '2026-06-24T10:00:00.000Z',
    stoppedAt: '2026-06-24T10:00:01.000Z',
  };
}

function createFakeHistoryStorage(persisted: readonly TaskInstanceState[] = []): TaskHistoryStorage {
  let data = [...persisted];
  return {
    loadAll: () => [...data],
    saveAll: (history) => { data = [...history]; },
    clear: () => { data = []; },
  };
}

describe('现象2 根因回归：重启后新实例 id 必须接续持久化历史的最大 id', () => {
  it('注入 history 含 task-inst-11 后，新建实例 id 应 > 11（不撞车）', () => {
    // 模拟重启：上次历史里有 task-inst-1..task-inst-11
    const persisted = Array.from({ length: 11 }, (_, i) => makePersistedInstance(`task-inst-${i + 1}`));
    const fakeSend = createFakeSendService({ results: [makeSentResult()] });
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: createFakeReceiveEventSource(),
      historyStorage: createFakeHistoryStorage(persisted),
      now: () => '2026-06-25T06:00:00.000Z',
    });

    const inst = service.createTask(timedTaskDef());
    // 根因修复前：nextInstanceId 从 1 开始 → 新实例 = task-inst-1 → 撞 history[0]
    const idNum = Number(inst.instanceId.replace('task-inst-', ''));
    expect(idNum).toBeGreaterThan(11);
  });

  it('重启后新建实例停止，必须出现在 selectTaskHistory 里（不被去重丢掉）', async () => {
    // 上次历史已含 task-inst-1..4（用户快照里的真实情形）
    const persisted = [
      makePersistedInstance('task-inst-1'),
      makePersistedInstance('task-inst-2'),
      makePersistedInstance('task-inst-3'),
      makePersistedInstance('task-inst-4'),
    ];
    // 一个会立刻进入 running 又能被停掉的 immediate 任务
    const def: TaskDefinition = {
      ...timedTaskDef(),
      stopCondition: { maxIterations: 1000 },
      schedule: { kind: 'timer', intervalMs: 50 },
    };
    const results = Array.from({ length: 1000 * def.steps.length }, () => makeSentResult());
    const fakeSend = createFakeSendService({ results });
    const service = createTaskService({
      sendService: fakeSend,
      receiveEventSource: createFakeReceiveEventSource(),
      historyStorage: createFakeHistoryStorage(persisted),
      now: () => '2026-06-25T06:00:00.000Z',
    });

    const inst = service.createTask(def);
    // 修复前：inst.instanceId === 'task-inst-1'，撞 history → 停了就消失
    service.startTask(inst.instanceId);
    await new Promise((r) => setTimeout(r, 30));
    service.stopTask(inst.instanceId);
    await settle(service, inst.instanceId, 200);

    // 核心断言：停止后这条新实例必须在历史里可见
    const history = selectTaskHistory(service.getSnapshot());
    expect(history.some((i) => i.instanceId === inst.instanceId)).toBe(true);
  });
});
