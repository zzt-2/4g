import { describe, it, expect, vi } from 'vitest';
import { createDockingTaskHistoryStorage, type PersistedTaskBatch } from '../services/docking-task-history-storage';

interface FakeFileAccess {
  /** 可检视的文件后端(测试断言落盘内容用)。 */
  store: Map<string, string>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
}

function makeFakeFiles(initial: Record<string, string> = {}): FakeFileAccess {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    async readTextFile(p: string) {
      if (!store.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return store.get(p)!;
    },
    async writeTextFile(p: string, c: string) { store.set(p, c); },
  };
}

function batchFixture(over: Partial<PersistedTaskBatch> = {}): PersistedTaskBatch {
  return {
    taskId: 'T_1', taskName: 'test', receivedAt: 1000,
    status: 'running',
    cases: [{ testCaseId: 'tc1', caseName: 'case1', status: 'pending', instanceId: null, startedAt: null, finishedAt: null, durationMs: null }],
    ...over,
  };
}

/** 文件后端 saveAll 用 fire-and-forget 异步写,flush 让测试断言文件已落盘。 */
function flushAsyncWrites(): Promise<void> {
  return new Promise((r) => setTimeout(r, 10));
}

describe('docking-task-history-storage - 基本读写 + hydrate', () => {
  it('hydrate loads from file when present', async () => {
    const payload = { version: 1, taskBatches: [batchFixture()] };
    const files = makeFakeFiles({ 'dir/state/docking-tasks.json': JSON.stringify(payload) });
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    expect(s.loadAll()).toHaveLength(1);
    expect(s.loadAll()[0].taskId).toBe('T_1');
  });

  it('hydrate returns empty when file missing', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    expect(s.loadAll()).toEqual([]);
  });

  it('saveAll persists to file with version', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.saveAll([batchFixture()]);
    await flushAsyncWrites(); // fire-and-forget write
    const raw = files.store.get('dir/state/docking-tasks.json');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual({ version: 1, taskBatches: [batchFixture()] });
  });
});

describe('docking-task-history-storage - insertBatch / updateCase / recomputeBatchStatus', () => {
  it('insertBatch dedupes by taskId', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    expect(s.insertBatch(batchFixture({ taskId: 'T_1' }))).toBe(true);
    expect(s.insertBatch(batchFixture({ taskId: 'T_1', taskName: 'dup' }))).toBe(false);
    expect(s.loadAll()).toHaveLength(1);
    expect(s.loadAll()[0].taskName).toBe('test');
  });

  it('insertBatch prepends new batch to front (most recent first)', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture({ taskId: 'T_1', receivedAt: 1000 }));
    s.insertBatch(batchFixture({ taskId: 'T_2', receivedAt: 2000 }));
    const all = s.loadAll();
    expect(all).toHaveLength(2);
    expect(all[0].taskId).toBe('T_2'); // 新批次在最前
    expect(all[1].taskId).toBe('T_1');
  });

  it('updateCase patches specific case fields', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture());
    s.updateCase('T_1', 'tc1', { status: 'passed', instanceId: 'i1', durationMs: 500 });
    const c = s.loadAll()[0].cases[0];
    expect(c.status).toBe('passed');
    expect(c.instanceId).toBe('i1');
    expect(c.durationMs).toBe(500);
  });

  it('updateCase no-op when task/case missing', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture());
    s.updateCase('T_NOPE', 'tc1', { status: 'passed' });
    s.updateCase('T_1', 'tc_NOPE', { status: 'passed' });
    expect(s.loadAll()[0].cases[0].status).toBe('pending');
  });

  it('recomputeBatchStatus: all passed → completed', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture({ cases: [
      { testCaseId: 'a', caseName: 'a', status: 'passed', instanceId: 'i1', startedAt: 1, finishedAt: 2, durationMs: 1 },
      { testCaseId: 'b', caseName: 'b', status: 'passed', instanceId: 'i2', startedAt: 1, finishedAt: 2, durationMs: 1 },
    ]}));
    s.recomputeBatchStatus('T_1');
    expect(s.loadAll()[0].status).toBe('completed');
  });

  it('recomputeBatchStatus: all failed → failed', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture({ cases: [
      { testCaseId: 'a', caseName: 'a', status: 'failed', instanceId: 'i1', startedAt: 1, finishedAt: 2, durationMs: 1 },
      { testCaseId: 'b', caseName: 'b', status: 'failed', instanceId: 'i2', startedAt: 1, finishedAt: 2, durationMs: 1 },
    ]}));
    s.recomputeBatchStatus('T_1');
    expect(s.loadAll()[0].status).toBe('failed');
  });

  it('recomputeBatchStatus: mixed → partial-failed; has running → stays running', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture({ cases: [
      { testCaseId: 'a', caseName: 'a', status: 'passed', instanceId: 'i1', startedAt: 1, finishedAt: 2, durationMs: 1 },
      { testCaseId: 'b', caseName: 'b', status: 'failed', instanceId: 'i2', startedAt: 1, finishedAt: 2, durationMs: 1 },
    ]}));
    s.recomputeBatchStatus('T_1');
    expect(s.loadAll()[0].status).toBe('partial-failed');

    s.saveAll([batchFixture({ cases: [
      { testCaseId: 'a', caseName: 'a', status: 'running', instanceId: 'i1', startedAt: 1, finishedAt: null, durationMs: null },
      { testCaseId: 'b', caseName: 'b', status: 'passed', instanceId: 'i2', startedAt: 1, finishedAt: 2, durationMs: 1 },
    ]})]);
    s.recomputeBatchStatus('T_1');
    expect(s.loadAll()[0].status).toBe('running');
  });

  it('recomputeBatchStatus no-op when batch missing', async () => {
    const files = makeFakeFiles({});
    const s = createDockingTaskHistoryStorage(files, 'dir');
    await s.hydrate();
    s.insertBatch(batchFixture());
    s.recomputeBatchStatus('T_NOPE'); // 不抛错
    expect(s.loadAll()[0].status).toBe('running');
  });
});

describe('docking-task-history-storage - hydrate 损坏恢复', () => {
  it('hydrate version-high → onDataLoss + empty', async () => {
    const onDataLoss = vi.fn();
    const files = makeFakeFiles({ 'dir/state/docking-tasks.json': JSON.stringify({ version: 99, taskBatches: [] }) });
    const s = createDockingTaskHistoryStorage(files, 'dir', { onDataLoss });
    await s.hydrate();
    expect(onDataLoss).toHaveBeenCalled();
    expect(s.loadAll()).toEqual([]);
  });

  it('hydrate malformed payload → onDataLoss + empty', async () => {
    const onDataLoss = vi.fn();
    const files = makeFakeFiles({ 'dir/state/docking-tasks.json': JSON.stringify({ version: 1, taskBatches: 'NOT_AN_ARRAY' }) });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = createDockingTaskHistoryStorage(files, 'dir', { onDataLoss });
    await s.hydrate();
    expect(onDataLoss).toHaveBeenCalled();
    expect(s.loadAll()).toEqual([]);
    errorSpy.mockRestore();
  });

  it('hydrate primary corrupted + bak recovered → recovered + onDataLoss', async () => {
    const onDataLoss = vi.fn();
    const payload = { version: 1, taskBatches: [batchFixture({ taskId: 'T_FROM_BAK' })] };
    const files = makeFakeFiles({
      'dir/state/docking-tasks.json': '{CORRUPT',
      'dir/state/docking-tasks.json.bak': JSON.stringify(payload),
    });
    const s = createDockingTaskHistoryStorage(files, 'dir', { onDataLoss });
    await s.hydrate();
    expect(s.loadAll()).toHaveLength(1);
    expect(s.loadAll()[0].taskId).toBe('T_FROM_BAK');
    expect(onDataLoss).toHaveBeenCalled(); // recovered 也通知(发生了损坏事件)
  });

  it('hydrate primary+bak both corrupted → onDataLoss + empty', async () => {
    const onDataLoss = vi.fn();
    const files = makeFakeFiles({
      'dir/state/docking-tasks.json': '{CORRUPT',
      'dir/state/docking-tasks.json.bak': '{ALSO_BAD',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = createDockingTaskHistoryStorage(files, 'dir', { onDataLoss });
    await s.hydrate();
    expect(onDataLoss).toHaveBeenCalled();
    expect(s.loadAll()).toEqual([]);
    errorSpy.mockRestore();
  });
});
