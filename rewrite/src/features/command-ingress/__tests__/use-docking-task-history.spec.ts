import { describe, it, expect, vi } from 'vitest';
import { useDockingTaskHistory } from '../composables/use-docking-task-history';
import type { DockingTaskHistoryStorage, PersistedTaskBatch, PersistedTaskCase } from '../services/docking-task-history-storage';
import type { TaskProgress } from '@/features/task';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeCase(over: Partial<PersistedTaskCase> = {}): PersistedTaskCase {
  return { testCaseId: 'tc1', caseName: 'case1', status: 'pending', instanceId: null, startedAt: null, finishedAt: null, durationMs: null, ...over };
}

function makeBatch(over: Partial<PersistedTaskBatch> = {}): PersistedTaskBatch {
  return { taskId: 'T_1', taskName: '批次1', receivedAt: 1000, status: 'running', cases: [makeCase()], ...over };
}

function makeFakeStorage(initial: PersistedTaskBatch[] = []): DockingTaskHistoryStorage & { _batches: PersistedTaskBatch[] } {
  const batches = [...initial];
  return {
    _batches: batches,
    async hydrate() { /* no-op */ },
    loadAll: vi.fn(() => [...batches]),
    saveAll: vi.fn((next: readonly PersistedTaskBatch[]) => { batches.length = 0; batches.push(...next); }),
    insertBatch: vi.fn(),
    updateCase: vi.fn(),
    recomputeBatchStatus: vi.fn(),
  };
}

function makeFakeTaskService(over: Partial<{
  getInstance: ReturnType<typeof vi.fn>;
  pauseTask: ReturnType<typeof vi.fn>;
  stopTask: ReturnType<typeof vi.fn>;
  getProgress: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    getInstance: over.getInstance ?? vi.fn().mockReturnValue(undefined),
    pauseTask: over.pauseTask ?? vi.fn(),
    stopTask: over.stopTask ?? vi.fn(),
    getProgress: over.getProgress ?? vi.fn().mockReturnValue(undefined),
  };
}

function makeFakeRouter() {
  return { push: vi.fn() };
}

// ---------------------------------------------------------------------------

describe('useDockingTaskHistory', () => {
  it('batches 初始化从 storage.loadAll() 读 + 按 receivedAt 倒序', () => {
    const storage = makeFakeStorage([
      makeBatch({ taskId: 'T_OLD', receivedAt: 1000 }),
      makeBatch({ taskId: 'T_NEW', receivedAt: 5000 }),
      makeBatch({ taskId: 'T_MID', receivedAt: 3000 }),
    ]);
    const { batches } = useDockingTaskHistory({
      historyStorage: storage,
      taskService: makeFakeTaskService(),
      router: makeFakeRouter(),
    });

    // 初始读取(未排序,原序)
    expect(batches.value.map(b => b.taskId)).toEqual(['T_OLD', 'T_NEW', 'T_MID']);
  });

  it('sortedBatches 按 receivedAt 倒序(最新在前)', () => {
    const storage = makeFakeStorage([
      makeBatch({ taskId: 'T_OLD', receivedAt: 1000 }),
      makeBatch({ taskId: 'T_NEW', receivedAt: 5000 }),
      makeBatch({ taskId: 'T_MID', receivedAt: 3000 }),
    ]);
    const { sortedBatches } = useDockingTaskHistory({
      historyStorage: storage,
      taskService: makeFakeTaskService(),
      router: makeFakeRouter(),
    });

    expect(sortedBatches.value.map(b => b.taskId)).toEqual(['T_NEW', 'T_MID', 'T_OLD']);
  });

  it('progressOf:running 用例 → 从 taskService.getProgress(instanceId) 取', () => {
    const progress: TaskProgress = {
      stepsTotal: 3, stepsCompleted: 1, sendsTotal: 15, sendsCompleted: 7,
      stepsFailed: 0, stepsSkipped: 0, iterationsCompleted: 0, iterationsTotal: 1,
      elapsedMs: 1000, estimatedRemainingMs: null, lastStepResult: undefined,
    };
    const storage = makeFakeStorage([makeBatch({ cases: [makeCase({ status: 'running', instanceId: 'inst-1' })] })]);
    const taskService = makeFakeTaskService({ getProgress: vi.fn().mockReturnValue(progress) });
    const { progressOf } = useDockingTaskHistory({
      historyStorage: storage,
      taskService,
      router: makeFakeRouter(),
    });

    expect(progressOf(makeCase({ status: 'running', instanceId: 'inst-1' }))).toBe(progress);
    // 非 running / 无 instanceId → null
    expect(progressOf(makeCase({ status: 'pending', instanceId: null }))).toBeNull();
    expect(progressOf(makeCase({ status: 'passed', instanceId: 'inst-2' }))).toBeNull();
  });

  it('progressOf:getProgress 不存在时回退 null(可选 API)', () => {
    const storage = makeFakeStorage([makeBatch()]);
    // taskService 不提供 getProgress
    const taskService = { getInstance: vi.fn(), pauseTask: vi.fn(), stopTask: vi.fn() };
    const { progressOf } = useDockingTaskHistory({
      historyStorage: storage,
      taskService,
      router: makeFakeRouter(),
    });

    expect(progressOf(makeCase({ status: 'running', instanceId: 'inst-1' }))).toBeNull();
  });

  it('pauseCase:转发 taskService.pauseTask(instanceId);无 instanceId 跳过', () => {
    const storage = makeFakeStorage([makeBatch()]);
    const pauseTask = vi.fn();
    const taskService = makeFakeTaskService({ pauseTask });
    const { pauseCase } = useDockingTaskHistory({
      historyStorage: storage,
      taskService,
      router: makeFakeRouter(),
    });

    pauseCase(makeCase({ status: 'running', instanceId: 'inst-1' }));
    expect(pauseTask).toHaveBeenCalledWith('inst-1');
    pauseCase(makeCase({ status: 'pending', instanceId: null }));
    expect(pauseTask).toHaveBeenCalledTimes(1); // 第二次跳过
  });

  it('stopCase:转发 taskService.stopTask(instanceId);无 instanceId 跳过', () => {
    const storage = makeFakeStorage([makeBatch()]);
    const stopTask = vi.fn();
    const taskService = makeFakeTaskService({ stopTask });
    const { stopCase } = useDockingTaskHistory({
      historyStorage: storage,
      taskService,
      router: makeFakeRouter(),
    });

    stopCase(makeCase({ status: 'running', instanceId: 'inst-1' }));
    expect(stopTask).toHaveBeenCalledWith('inst-1');
    stopCase(makeCase({ status: 'pending', instanceId: null }));
    expect(stopTask).toHaveBeenCalledTimes(1);
  });

  it('viewDetail:router.push 到 /tasks(执行监控页;路由无 name,用 path 最小跳转)', () => {
    const storage = makeFakeStorage([makeBatch()]);
    const router = makeFakeRouter();
    const { viewDetail } = useDockingTaskHistory({
      historyStorage: storage,
      taskService: makeFakeTaskService(),
      router,
    });

    viewDetail(makeCase({ status: 'passed', instanceId: 'inst-1' }));
    expect(router.push).toHaveBeenCalledWith({ path: '/tasks' });
  });

  it('refresh:重新从 storage.loadAll() 读,更新 batches', () => {
    const storage = makeFakeStorage([makeBatch({ taskId: 'T_1' })]);
    const { batches, refresh } = useDockingTaskHistory({
      historyStorage: storage,
      taskService: makeFakeTaskService(),
      router: makeFakeRouter(),
    });
    expect(batches.value).toHaveLength(1);

    // 模拟 storage 写入新批次后 refresh
    storage._batches.push(makeBatch({ taskId: 'T_2', receivedAt: 2000 }));
    refresh();
    expect(batches.value).toHaveLength(2);
  });

  it('空 storage:batches 空,sortedBatches 空', () => {
    const storage = makeFakeStorage([]);
    const { batches, sortedBatches } = useDockingTaskHistory({
      historyStorage: storage,
      taskService: makeFakeTaskService(),
      router: makeFakeRouter(),
    });
    expect(batches.value).toEqual([]);
    expect(sortedBatches.value).toEqual([]);
  });
});
