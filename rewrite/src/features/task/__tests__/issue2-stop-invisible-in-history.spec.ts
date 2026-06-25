import { describe, it, expect } from 'vitest';
import type { SendResult } from '@/features/send';
import type { TaskDefinition } from '../core';
import { timedTaskDef, makeSendResult } from '../fixtures/task-fixtures';
import { createFakeSendService } from '../adapters/test-exports';
import { createFakeReceiveEventSource } from '../adapters/test-exports';
import { createTaskService, type TaskService } from '../services/task-service';
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
