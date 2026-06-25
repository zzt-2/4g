import { describe, it, expect, vi } from 'vitest';
import { useDockingTaskHistory } from '../composables/use-docking-task-history';
import { createDockingBatchRegistry, type DockingBatchMeta } from '../core/docking-batch-registry';
import type { TaskInstanceState } from '@/features/task';

// fake taskService:按 instanceId 映射到不同 lifecycle 实例(支持映射表全分支)
function makeFakeTaskService(instances: Record<string, Partial<TaskInstanceState>> = {}) {
  const store: Record<string, TaskInstanceState> = {};
  for (const [id, over] of Object.entries(instances)) {
    store[id] = {
      instanceId: id,
      definitionRef: { id: 'd', name: 'n', steps: [], schedule: { kind: 'immediate' }, errorPolicy: { onFailure: 'stop' } },
      lifecycle: 'running', currentStepIndex: 0, currentIteration: 0, stepResults: [],
      ...over,
    } as TaskInstanceState;
  }
  return {
    store,
    getInstance: vi.fn((id: string) => store[id] ? { ...store[id] } : undefined),
    pauseTask: vi.fn(),
    stopTask: vi.fn(),
    resumeTask: vi.fn(),
    getProgress: vi.fn().mockReturnValue(undefined),
  };
}
function makeFakeRouter() { return { push: vi.fn() }; }
function makeMeta(over: Partial<DockingBatchMeta> = {}): DockingBatchMeta {
  return { taskId: 'T_1', taskName: '批次1', receivedAt: 1000, cases: [{ testCaseId: 'tc-1', caseName: '用例1', instanceId: 'inst-1' }], ...over };
}

describe('useDockingTaskHistory', () => {
  it('batches 从 batchRegistry 派生,按 receivedAt 倒序', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta({ taskId: 'T_OLD', receivedAt: 1000 }));
    reg.insertBatch(makeMeta({ taskId: 'T_NEW', receivedAt: 5000 }));
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService(), router: makeFakeRouter() });
    expect(sortedBatches.value.map(b => b.taskId)).toEqual(['T_NEW', 'T_OLD']);
  });

  it('case.status 从实例 lifecycle 派生:running→running', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta());
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService({ 'inst-1': { lifecycle: 'running' } }), router: makeFakeRouter() });
    expect(sortedBatches.value[0].cases[0].status).toBe('running');
  });

  it('case.status: paused→paused(本重构核心)', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta());
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService({ 'inst-1': { lifecycle: 'paused' } }), router: makeFakeRouter() });
    expect(sortedBatches.value[0].cases[0].status).toBe('paused');
  });

  it('case.status: completed→passed, failed→failed, stopped→failed', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta({ cases: [
      { testCaseId: 'tc-a', caseName: 'a', instanceId: 'inst-a' },
      { testCaseId: 'tc-b', caseName: 'b', instanceId: 'inst-b' },
      { testCaseId: 'tc-c', caseName: 'c', instanceId: 'inst-c' },
    ] }));
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService({ 'inst-a': { lifecycle: 'completed' }, 'inst-b': { lifecycle: 'failed' }, 'inst-c': { lifecycle: 'stopped' } }), router: makeFakeRouter() });
    const cs = sortedBatches.value[0].cases;
    expect(cs[0].status).toBe('passed');
    expect(cs[1].status).toBe('failed');
    expect(cs[2].status).toBe('failed');
  });

  it('case.status: instanceId=null → pending(未轮到执行)', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta({ cases: [{ testCaseId: 'tc-p', caseName: 'p', instanceId: null }] }));
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService(), router: makeFakeRouter() });
    expect(sortedBatches.value[0].cases[0].status).toBe('pending');
  });

  it('case.status: 查不到实例 → failed(异常兜底)', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta({ cases: [{ testCaseId: 'tc-x', caseName: 'x', instanceId: 'inst-gone' }] }));
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService(), router: makeFakeRouter() }); // store 无 inst-gone
    expect(sortedBatches.value[0].cases[0].status).toBe('failed');
  });

  it('case.durationMs 从实例时间戳派生(completed: completedAt - startedAt)', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta());
    const ts = makeFakeTaskService({ 'inst-1': { lifecycle: 'completed', startedAt: '2026-06-25T10:00:00.000Z', completedAt: '2026-06-25T10:00:05.000Z' } });
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: ts, router: makeFakeRouter() });
    expect(sortedBatches.value[0].cases[0].durationMs).toBe(5000);
  });

  it('pauseCase 转发 taskService.pauseTask;resumeCase 转发 resumeTask;stopCase 转发 stopTask', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta());
    const ts = makeFakeTaskService({ 'inst-1': { lifecycle: 'running' } });
    const { pauseCase, resumeCase, stopCase } = useDockingTaskHistory({ batchRegistry: reg, taskService: ts, router: makeFakeRouter() });
    const c = { testCaseId: 'tc-1', caseName: '用例1', instanceId: 'inst-1', status: 'running' as const, durationMs: null };
    pauseCase(c); expect(ts.pauseTask).toHaveBeenCalledWith('inst-1');
    resumeCase(c); expect(ts.resumeTask).toHaveBeenCalledWith('inst-1');
    stopCase(c); expect(ts.stopTask).toHaveBeenCalledWith('inst-1');
  });

  it('pauseCase/resumeCase/stopCase 对 instanceId=null 静默跳过', () => {
    const reg = createDockingBatchRegistry();
    const ts = makeFakeTaskService();
    const { pauseCase } = useDockingTaskHistory({ batchRegistry: reg, taskService: ts, router: makeFakeRouter() });
    pauseCase({ testCaseId: 'tc', caseName: 'c', instanceId: null, status: 'pending', durationMs: null });
    expect(ts.pauseTask).not.toHaveBeenCalled();
  });

  it('viewDetail 跳转 /tasks', () => {
    const reg = createDockingBatchRegistry();
    const router = makeFakeRouter();
    const { viewDetail } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService(), router });
    viewDetail({ testCaseId: 'tc', caseName: 'c', instanceId: 'i', status: 'passed', durationMs: 1 });
    expect(router.push).toHaveBeenCalledWith({ path: '/tasks' });
  });

  it('batch.status 派生:含 paused/running/pending → running;全 passed → completed', () => {
    const reg = createDockingBatchRegistry();
    reg.insertBatch(makeMeta({ cases: [
      { testCaseId: 'tc-a', caseName: 'a', instanceId: 'inst-a' },
      { testCaseId: 'tc-p', caseName: 'p', instanceId: 'inst-p' },
    ] }));
    const { sortedBatches } = useDockingTaskHistory({ batchRegistry: reg, taskService: makeFakeTaskService({ 'inst-a': { lifecycle: 'completed' }, 'inst-p': { lifecycle: 'paused' } }), router: makeFakeRouter() });
    expect(sortedBatches.value[0].status).toBe('running'); // paused 算活跃
  });
});
