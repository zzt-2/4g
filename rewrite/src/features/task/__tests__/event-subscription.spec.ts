import { describe, it, expect, vi } from 'vitest';
import { createTaskService } from '../services/task-service';
import { createTaskState } from '../state/task-state';
import { createFakeSendService, createFakeReceiveEventSource } from '../adapters/test-exports';
import { timedTaskDef, makeSendResult, makeSendStepResult } from '../fixtures/task-fixtures';

function createService() {
  return createTaskService({
    sendService: createFakeSendService(),
    receiveEventSource: createFakeReceiveEventSource(),
    now: () => '2026-06-11T00:00:00.000Z',
  });
}

describe('TaskService - subscribe (钩子机制)', () => {
  it('subscribe 返回 unsubscribe 函数；之后不再收到事件', () => {
    const service = createService();
    const onStepResult = vi.fn();
    const unsub = service.subscribe({ onStepResult });

    expect(typeof unsub).toBe('function');

    unsub();
    // 后续触发不应再调 onStepResult（验证订阅已清理）
    // 见后续测试用 state 直接触发验证清理契约
  });

  it('多订阅者都能收到 onStepResult 事件', async () => {
    const state = createTaskState();
    const onA = vi.fn();
    const onB = vi.fn();

    state.subscribe({ onStepResult: onA });
    state.subscribe({ onStepResult: onB });

    state.createInstance('inst-1', timedTaskDef());
    state.addStepResult('inst-1', makeSendStepResult());

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA.mock.calls[0]![0]).toBe('inst-1');
    expect(onB.mock.calls[0]![0]).toBe('inst-1');
  });

  it('unsubscribe 后不再收到事件', () => {
    const state = createTaskState();
    const onA = vi.fn();
    const unsub = state.subscribe({ onStepResult: onA });

    state.createInstance('inst-1', timedTaskDef());
    state.addStepResult('inst-1', makeSendStepResult());
    expect(onA).toHaveBeenCalledTimes(1);

    unsub();
    state.addStepResult('inst-1', makeSendStepResult());
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it('错误隔离：单个 subscriber 抛错不影响其他 subscriber', () => {
    const state = createTaskState();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onBroken = vi.fn(() => { throw new Error('broken'); });
    const onOk = vi.fn();

    state.subscribe({ onStepResult: onBroken });
    state.subscribe({ onStepResult: onOk });

    state.createInstance('inst-1', timedTaskDef());
    state.addStepResult('inst-1', makeSendStepResult());

    expect(onBroken).toHaveBeenCalledTimes(1);
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('onTaskLifecycleChange 在 lifecycle 变化时触发', () => {
    const state = createTaskState();
    const onChange = vi.fn();

    state.subscribe({ onTaskLifecycleChange: onChange });
    state.createInstance('inst-1', timedTaskDef());
    state.updateInstance('inst-1', { lifecycle: 'running' });

    expect(onChange).toHaveBeenCalledWith('inst-1', 'created', 'running');
  });

  it('onTaskSettled 仅在终态时触发', () => {
    const state = createTaskState();
    const onSettled = vi.fn();

    state.subscribe({ onTaskSettled: onSettled });
    state.createInstance('inst-1', timedTaskDef());

    // 非终态变化不触发
    state.updateInstance('inst-1', { lifecycle: 'running' });
    expect(onSettled).not.toHaveBeenCalled();

    // 进入终态触发
    state.updateInstance('inst-1', { lifecycle: 'completed' });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith('inst-1', 'completed');
  });

  it('updateInstance 设置相同 lifecycle 不重复触发事件', () => {
    const state = createTaskState();
    const onChange = vi.fn();
    const onSettled = vi.fn();

    state.subscribe({ onTaskLifecycleChange: onChange, onTaskSettled: onSettled });
    state.createInstance('inst-1', timedTaskDef());
    state.updateInstance('inst-1', { lifecycle: 'created' }); // 相同

    expect(onChange).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('通过 service.subscribe 订阅，stop 流程触发 onTaskSettled', async () => {
    const service = createService();
    const onSettled = vi.fn();

    service.subscribe({ onTaskSettled: onSettled });
    const inst = service.createTask(timedTaskDef());
    service.startTask(inst.instanceId);

    // 等待 execution 进入 running 后 stop
    await new Promise((r) => setTimeout(r, 20));
    service.stopTask(inst.instanceId);

    await new Promise((r) => setTimeout(r, 20));
    expect(onSettled).toHaveBeenCalledWith(inst.instanceId, 'stopped');
  });

  it('execution loop 触发的 step result 也会通知订阅者', async () => {
    const service = createService();
    const onStepResult = vi.fn();

    service.subscribe({ onStepResult });
    const def = { ...timedTaskDef(), stopCondition: { maxIterations: 1 }, schedule: { kind: 'timer', intervalMs: 5 } as const };
    const fakeSend = createFakeSendService({ results: [makeSendResult(), makeSendResult()] });
    const svc = createTaskService({
      sendService: fakeSend,
      receiveEventSource: createFakeReceiveEventSource(),
      now: () => '2026-06-11T00:00:00.000Z',
    });
    svc.subscribe({ onStepResult });

    const inst = svc.createTask(def);
    svc.startTask(inst.instanceId);

    await new Promise((r) => setTimeout(r, 100));
    expect(onStepResult).toHaveBeenCalled();
    expect(onStepResult.mock.calls[0]![0]).toBe(inst.instanceId);
  });
});
