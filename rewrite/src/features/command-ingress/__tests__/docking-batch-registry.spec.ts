import { describe, it, expect } from 'vitest';
import { createDockingBatchRegistry } from '../core/docking-batch-registry';
import type { DockingBatchMeta } from '../core/docking-batch-registry';

function makeMeta(over: Partial<DockingBatchMeta> = {}): DockingBatchMeta {
  return {
    taskId: 'T_1', taskName: '批次1', receivedAt: 1000,
    cases: [{ testCaseId: 'tc-1', caseName: '用例1', instanceId: null }],
    ...over,
  };
}

describe('createDockingBatchRegistry', () => {
  it('insertBatch 插入新批次,loadAll 返回全部', () => {
    const r = createDockingBatchRegistry();
    expect(r.insertBatch(makeMeta({ taskId: 'T_1' }))).toBe(true);
    expect(r.loadAll()).toHaveLength(1);
    expect(r.loadAll()[0].taskId).toBe('T_1');
  });

  it('insertBatch 按 taskId 去重(已存在返回 false,不覆盖)', () => {
    const r = createDockingBatchRegistry();
    r.insertBatch(makeMeta({ taskId: 'T_1', taskName: '原名' }));
    expect(r.insertBatch(makeMeta({ taskId: 'T_1', taskName: '新名' }))).toBe(false);
    expect(r.loadAll()[0].taskName).toBe('原名'); // 保留首次
  });

  it('setInstance 回填指定 taskId/testCaseId 的 instanceId', () => {
    const r = createDockingBatchRegistry();
    r.insertBatch(makeMeta({ taskId: 'T_1', cases: [{ testCaseId: 'tc-1', caseName: 'u1', instanceId: null }] }));
    r.setInstance('T_1', 'tc-1', 'inst-001');
    expect(r.loadAll()[0].cases[0].instanceId).toBe('inst-001');
  });

  it('setInstance 对不存在的 taskId/testCaseId 静默跳过(不报错)', () => {
    const r = createDockingBatchRegistry();
    r.insertBatch(makeMeta());
    r.setInstance('T_NONE', 'tc-1', 'inst-001'); // 不抛
    r.setInstance('T_1', 'tc-none', 'inst-001'); // 不抛
    expect(r.loadAll()[0].cases[0].instanceId).toBeNull();
  });

  it('clear 清空所有批次', () => {
    const r = createDockingBatchRegistry();
    r.insertBatch(makeMeta());
    r.clear();
    expect(r.loadAll()).toHaveLength(0);
  });

  it('loadAll 返回的是快照(外部修改不影响内部)', () => {
    const r = createDockingBatchRegistry();
    r.insertBatch(makeMeta());
    const all = r.loadAll();
    (all[0] as { taskId: string }).taskId = 'TAMPERED';
    expect(r.loadAll()[0].taskId).toBe('T_1'); // 内部不变
  });
});
