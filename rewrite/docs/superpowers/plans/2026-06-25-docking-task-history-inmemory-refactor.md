# 中心对接任务批次历史 — 改内存派生 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把批次面板数据源从独立持久化(`docking-tasks.json`)改成「taskService 实例内存派生 + command-ingress 内存映射表」,解决暂停态割裂 + 消除两套数据冗余。

**Architecture:** 新建内存 `DockingBatchRegistry`(command-ingress,不持久化)存批次元信息(taskId/taskName/receivedAt/caseName/instanceId 关联)。面板渲染时用 instanceId 查 taskService 实例,实时派生 case 状态(含 paused)。删 `docking-task-history-storage.ts` 整文件 + Lazy holder wiring + 接入点3/4 写 storage 逻辑。task 内核不动,D004 不变。

**Tech Stack:** Vue 3 + Quasar + TypeScript + Vitest。代码在 `rewrite/` 子目录。

**Spec:** `rewrite/docs/superpowers/specs/2026-06-25-docking-task-history-inmemory-refactor-design.md`

**前端规范要点(执行时遵守):**
- TDD:先红后绿,每个 Task 末尾 commit
- D007:flex 容器 `1 1 0; min-h-0; overflow`(面板外层已有,不动)
- O4:不变的数据定义(状态映射等)放模块级
- 不动 processLayers barrier(D018 已修)

---

## Task 1: 新建 DockingBatchRegistry(内存映射表)

**Files:**
- Create: `rewrite/src/features/command-ingress/core/docking-batch-registry.ts`
- Test: `rewrite/src/features/command-ingress/__tests__/docking-batch-registry.spec.ts`

纯内存 `Map<taskId, DockingBatchMeta>`,不持久化。范式照 `northbound-state.ts` 闭包 Map。

- [ ] **Step 1: 写失败测试**

Create `rewrite/src/features/command-ingress/__tests__/docking-batch-registry.spec.ts`:

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress/__tests__/docking-batch-registry.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 docking-batch-registry.ts**

Create `rewrite/src/features/command-ingress/core/docking-batch-registry.ts`:

```ts
/**
 * 中心对接「批次元信息」内存映射表(spec: 批次历史改内存派生)。
 *
 * 只存 taskService 内存里没有的批次元信息:taskId 分组、taskName、receivedAt、
 * testCaseId↔instanceId 关联、caseName。**不存 status/进度/结果**——这些运行时
 * 从 taskService 实例派生(面板渲染时查 getInstance)。
 *
 * 不持久化(重启清空,用户已确认跨重启历史无所谓)。范式照 northbound-state.ts 闭包 Map。
 * 归 command-ingress(D004:对接归 command-ingress,task 内核不感知甲方)。
 */
export interface DockingBatchCaseMeta {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly instanceId: string | null;
}

export interface DockingBatchMeta {
  readonly taskId: string;
  readonly taskName: string;
  readonly receivedAt: number;
  readonly cases: readonly DockingBatchCaseMeta[];
}

export interface DockingBatchRegistry {
  /** 插入新批次(按 taskId 去重,已存在返回 false 不覆盖)。 */
  insertBatch(meta: DockingBatchMeta): boolean;
  /** 回填指定 taskId/testCaseId 的 instanceId(不存在则静默跳过)。 */
  setInstance(taskId: string, testCaseId: string, instanceId: string): void;
  /** 读全部批次(返回快照,外部修改不影响内部)。 */
  loadAll(): readonly DockingBatchMeta[];
  /** 清空。 */
  clear(): void;
}

export function createDockingBatchRegistry(): DockingBatchRegistry {
  const batches = new Map<string, DockingBatchMeta>();

  return {
    insertBatch(meta: DockingBatchMeta): boolean {
      if (batches.has(meta.taskId)) return false;
      batches.set(meta.taskId, meta);
      return true;
    },

    setInstance(taskId: string, testCaseId: string, instanceId: string): void {
      const batch = batches.get(taskId);
      if (!batch) return;
      const cases = batch.cases.map(c =>
        c.testCaseId === testCaseId ? { ...c, instanceId } : c,
      );
      batches.set(taskId, { ...batch, cases });
    },

    loadAll(): readonly DockingBatchMeta[] {
      return [...batches.values()];
    },

    clear(): void {
      batches.clear();
    },
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress/__tests__/docking-batch-registry.spec.ts`
Expected: PASS,6 tests。

- [ ] **Step 5: 从 core/index.ts 导出(export 落点)**

已核实:`command-ingress/core/index.ts` 是 core 模块的 barrel export(catalog-mapping 等都从这里导出),`command-ingress/index.ts` 再 `from './core'` 转出。所以在 `core/index.ts` 末尾加一节:

```ts
// Docking batch registry(批次元信息内存映射表)
export { createDockingBatchRegistry } from './docking-batch-registry';
export type { DockingBatchRegistry, DockingBatchMeta, DockingBatchCaseMeta } from './docking-batch-registry';
```

这样 `import { createDockingBatchRegistry, type DockingBatchMeta } from '@/features/command-ingress'` 可用(feature-wiring/northbound 都这么引)。

- [ ] **Step 6: Commit**

```bash
cd rewrite
git add src/features/command-ingress/core/docking-batch-registry.ts src/features/command-ingress/__tests__/docking-batch-registry.spec.ts src/features/command-ingress/index.ts
git commit -m "feat(command-ingress): DockingBatchRegistry 内存批次映射表 [Task1]"
```

---

## Task 2: 改造 use-docking-task-history composable(派生视图)

**Files:**
- Modify: `rewrite/src/features/command-ingress/composables/use-docking-task-history.ts`
- Test: `rewrite/src/features/command-ingress/__tests__/use-docking-task-history.spec.ts`(重写)

数据源从 `historyStorage.loadAll()` 改为 `batchRegistry.loadAll()` + `taskService.getInstance` 派生。新增 `resumeCase`。

- [ ] **Step 1: 重写测试文件**

Replace `rewrite/src/features/command-ingress/__tests__/use-docking-task-history.spec.ts` 全文:

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress/__tests__/use-docking-task-history.spec.ts`
Expected: FAIL — composable 签名还是旧的(`historyStorage` 参数),类型/行为不匹配。

- [ ] **Step 3: 重写 composable**

Replace `rewrite/src/features/command-ingress/composables/use-docking-task-history.ts` 全文:

```ts
import { ref, computed } from 'vue';
import type { TaskProgress, TaskInstanceState } from '@/features/task';
import type { DockingBatchRegistry, DockingBatchMeta } from '../core/docking-batch-registry';

/**
 * 中心对接「任务批次历史面板」数据源 + 控制动作(spec: 批次历史改内存派生)。
 *
 * 数据源:batchRegistry(批次元信息)+ taskService(实例 lifecycle/进度/结果)派生。
 * case.status 实时从实例 lifecycle 算(含 paused),暂停/停止/恢复零同步成本。
 * 控制动作直接打 taskService,下一秒 polling 自然反映。
 */
export type DockingCaseStatus = 'pending' | 'running' | 'paused' | 'passed' | 'failed';

export interface DockingCaseView {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly instanceId: string | null;
  readonly status: DockingCaseStatus;
  readonly durationMs: number | null;
}

export type DockingBatchStatus = 'running' | 'completed' | 'partial-failed' | 'failed';

export interface DockingBatchView {
  readonly taskId: string;
  readonly taskName: string;
  readonly receivedAt: number;
  readonly status: DockingBatchStatus;
  readonly cases: readonly DockingCaseView[];
}

/** taskService 最小消费接口(返回完整实例含 lifecycle/时间戳)。 */
export interface DockingTaskHistoryTaskServicePort {
  getInstance(id: string): TaskInstanceState | undefined;
  pauseTask(id: string): void;
  resumeTask(id: string): void;
  stopTask(id: string): void;
  getProgress?(id: string): TaskProgress | undefined;
}

export interface DockingHistoryRouterPort {
  push(to: unknown): unknown;
}

export interface UseDockingTaskHistoryOptions {
  readonly batchRegistry: DockingBatchRegistry;
  readonly taskService: DockingTaskHistoryTaskServicePort;
  readonly router: DockingHistoryRouterPort;
}

export interface UseDockingTaskHistory {
  readonly sortedBatches: ReturnType<typeof computed<readonly DockingBatchView[]>>;
  progressOf(c: DockingCaseView): TaskProgress | null;
  pauseCase(c: DockingCaseView): void;
  resumeCase(c: DockingCaseView): void;
  stopCase(c: DockingCaseView): void;
  viewDetail(c: DockingCaseView): void;
  refresh(): void;
}

/** lifecycle → DockingCaseStatus 映射(spec 映射表)。 */
function deriveCaseStatus(instanceId: string | null, instance: TaskInstanceState | undefined): DockingCaseStatus {
  if (!instanceId) return 'pending';
  if (!instance) return 'failed'; // 异常兜底:实例被清/映射残留
  switch (instance.lifecycle) {
    case 'created': return 'running';   // 建完就 start,几乎见不到,归 running
    case 'running': return 'running';
    case 'paused': return 'paused';
    case 'completed': return 'passed';
    case 'failed': return 'failed';
    case 'stopped': return 'failed';     // 粒度2 不细分
    default: return 'failed';
  }
}

/** 实例时间戳 → durationMs(终态: endRef - startedAt;非终态: null)。 */
function deriveDurationMs(instance: TaskInstanceState | undefined): number | null {
  if (!instance) return null;
  const start = instance.startedAt ? new Date(instance.startedAt).getTime() : null;
  if (start === null) return null;
  const endRef = instance.completedAt ?? instance.stoppedAt ?? instance.failedAt;
  if (!endRef) return null; // 非终态
  return Math.max(0, new Date(endRef).getTime() - start);
}

/** 派生批次 status(spec 规则)。 */
function deriveBatchStatus(cases: readonly DockingCaseView[]): DockingBatchStatus {
  const hasActive = cases.some(c => c.status === 'pending' || c.status === 'running' || c.status === 'paused');
  if (hasActive) return 'running';
  const passed = cases.filter(c => c.status === 'passed').length;
  const failed = cases.filter(c => c.status === 'failed').length;
  if (failed === 0) return 'completed';
  if (passed === 0) return 'failed';
  return 'partial-failed';
}

export function useDockingTaskHistory(options: UseDockingTaskHistoryOptions): UseDockingTaskHistory {
  // 触发器:每次 refresh 重新读 registry + 派生(让 sortedBatches 响应)。
  const tick = ref(0);

  function refresh(): void {
    tick.value++;
  }

  const sortedBatches = computed<readonly DockingBatchView[]>(() => {
    void tick.value; // 依赖 tick,refresh 后重算
    const metas = options.batchRegistry.loadAll();
    const views = metas.map(meta => deriveBatchView(meta, options.taskService));
    return views.sort((a, b) => b.receivedAt - a.receivedAt);
  });

  function deriveBatchView(meta: DockingBatchMeta, ts: DockingTaskHistoryTaskServicePort): DockingBatchView {
    const cases = meta.cases.map(c => {
      const inst = c.instanceId ? ts.getInstance(c.instanceId) : undefined;
      return {
        testCaseId: c.testCaseId,
        caseName: c.caseName,
        instanceId: c.instanceId,
        status: deriveCaseStatus(c.instanceId, inst),
        durationMs: deriveDurationMs(inst),
      } satisfies DockingCaseView;
    });
    return { taskId: meta.taskId, taskName: meta.taskName, receivedAt: meta.receivedAt, status: deriveBatchStatus(cases), cases };
  }

  function progressOf(c: DockingCaseView): TaskProgress | null {
    if (c.status !== 'running' || !c.instanceId) return null;
    return options.taskService.getProgress?.(c.instanceId) ?? null;
  }

  function pauseCase(c: DockingCaseView): void {
    if (!c.instanceId) return;
    options.taskService.pauseTask(c.instanceId);
  }
  function resumeCase(c: DockingCaseView): void {
    if (!c.instanceId) return;
    options.taskService.resumeTask(c.instanceId);
  }
  function stopCase(c: DockingCaseView): void {
    if (!c.instanceId) return;
    options.taskService.stopTask(c.instanceId);
  }
  function viewDetail(c: DockingCaseView): void {
    void c;
    options.router.push({ path: '/tasks' });
  }

  return { sortedBatches, progressOf, pauseCase, resumeCase, stopCase, viewDetail, refresh };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress/__tests__/use-docking-task-history.spec.ts`
Expected: PASS,11 tests。

- [ ] **Step 5: Commit**

```bash
cd rewrite
git add src/features/command-ingress/composables/use-docking-task-history.ts src/features/command-ingress/__tests__/use-docking-task-history.spec.ts
git commit -m "refactor(command-ingress): composable 改从 batchRegistry+taskService 派生 [Task2]"
```

---

## Task 3: task-case-display 加 paused 态 + TaskCaseRow 加恢复按钮

**Files:**
- Modify: `rewrite/src/features/command-ingress/components/docking/task-case-display.ts`
- Modify: `rewrite/src/features/command-ingress/components/docking/TaskCaseRow.vue`
- Test: `rewrite/src/features/command-ingress/__tests__/task-case-display.spec.ts`(若存在;否则新建)

- [ ] **Step 1: 改 task-case-display 测试(文件已存在,改而非新建)**

已核实 `rewrite/src/features/command-ingress/__tests__/task-case-display.spec.ts` 存在。先读它,把它对 `PersistedTaskCase['status']` 的引用 + 「四种状态都有映射」断言,改成下面的五态版本(替换全文):

```ts
import { describe, it, expect } from 'vitest';
import { TASK_CASE_STATUS_MAP, resolveCaseStatusDisplay, isCaseFinished } from '../components/docking/task-case-display';
import type { DockingCaseStatus } from '../composables/use-docking-task-history';

const ALL: DockingCaseStatus[] = ['pending', 'running', 'paused', 'passed', 'failed'];

describe('task-case-display', () => {
  it('五种状态都有映射(无遗漏)', () => {
    for (const s of ALL) {
      expect(TASK_CASE_STATUS_MAP[s]).toBeDefined();
      expect(resolveCaseStatusDisplay(s).icon).toBeTruthy();
    }
  });
  it('paused 映射到 warning 色 + 暂停图标', () => {
    expect(resolveCaseStatusDisplay('paused').color).toBe('warning');
  });
  it('isCaseFinished: passed/failed 为 true,其余 false(含 paused)', () => {
    expect(isCaseFinished('passed')).toBe(true);
    expect(isCaseFinished('failed')).toBe(true);
    expect(isCaseFinished('paused')).toBe(false);
    expect(isCaseFinished('running')).toBe(false);
    expect(isCaseFinished('pending')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress/__tests__/task-case-display.spec.ts`
Expected: FAIL — paused 未映射/import 源还是 PersistedTaskCase。

- [ ] **Step 3: 改 task-case-display.ts**

Replace `rewrite/src/features/command-ingress/components/docking/task-case-display.ts` 全文:

```ts
import type { DockingCaseStatus } from '../../composables/use-docking-task-history';

/**
 * 任务批次历史面板「用例行」的显示映射(纯数据,模块级,O4)。
 * 五状态:pending/running/paused/passed/failed。
 */
export interface TaskCaseStatusDisplay {
  readonly label: string;
  readonly color: 'grey' | 'primary' | 'warning' | 'positive' | 'negative';
  readonly icon: string;
}

export const TASK_CASE_STATUS_MAP: Readonly<Record<DockingCaseStatus, TaskCaseStatusDisplay>> = {
  pending: { label: '等待', color: 'grey', icon: 'o_radio_button_unchecked' },
  running: { label: '进行中', color: 'primary', icon: 'o_autorenew' },
  paused: { label: '已暂停', color: 'warning', icon: 'o_pause_circle' },
  passed: { label: '通过', color: 'positive', icon: 'o_check_circle' },
  failed: { label: '失败', color: 'negative', icon: 'o_cancel' },
} as const;

export function resolveCaseStatusDisplay(status: DockingCaseStatus): TaskCaseStatusDisplay {
  return TASK_CASE_STATUS_MAP[status];
}

/** 终态(完成/失败):显示「详情」跳转;非终态(含 paused):显示控制按钮。 */
export function isCaseFinished(status: DockingCaseStatus): boolean {
  return status === 'passed' || status === 'failed';
}
```

- [ ] **Step 4: 跑 task-case-display 测试确认通过**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress/__tests__/task-case-display.spec.ts`
Expected: PASS。

- [ ] **Step 5: 改 TaskCaseRow.vue(paused 分支 + 恢复按钮 + resume emit)**

Modify `rewrite/src/features/command-ingress/components/docking/TaskCaseRow.vue`:

(a) import 类型改:
```ts
import type { DockingCaseView } from '../../composables/use-docking-task-history';
```
(删掉旧的 `import type { PersistedTaskCase } from '../../services/docking-task-history-storage';`)

(b) props 类型:
```ts
const props = defineProps<{
  readonly caseRow: DockingCaseView;
  readonly progress: TaskProgress | null;
}>();
```

(c) emit 加 resume:
```ts
const emit = defineEmits<{
  pause: [];
  resume: [];
  stop: [];
  'view-detail': [];
}>();
```

(d) template 控制按钮区:`v-if="caseRow.status === 'running'"` 改成 running+paused 都显示(暂停态显示恢复 + 停止;running 态显示暂停 + 停止):
```html
<div v-if="caseRow.status === 'running' || caseRow.status === 'paused'" class="flex items-center no-wrap">
  <q-btn v-if="caseRow.status === 'running'" flat round dense icon="o_pause" color="warning" size="sm" @click="emit('pause')">
    <q-tooltip>暂停</q-tooltip>
  </q-btn>
  <q-btn v-else flat round dense icon="o_play_arrow" color="primary" size="sm" @click="emit('resume')">
    <q-tooltip>恢复</q-tooltip>
  </q-btn>
  <q-btn flat round dense icon="o_stop" color="negative" size="sm" @click="emit('stop')">
    <q-tooltip>停止</q-tooltip>
  </q-btn>
</div>
```

(e) 进度条区域:`v-if="caseRow.status === 'running'"` 保持(running 才显示进度;paused 不显示进度条,显示「已暂停」文案)。在进度条 q-item-label 后加 paused 文案:
```html
<q-item-label v-else-if="caseRow.status === 'paused'" caption class="rw-text-label text-xs">
  已暂停
</q-item-label>
```
(放在 running 进度条分支之后、finished 耗时分支之前)

- [ ] **Step 6: 跑 TaskCaseRow 相关测试(若有)+ 类型检查**

Run: `cd rewrite && pnpm vitest run src/features/command-ingress 2>&1 | tail -5`
(此时 TaskListPanel 还没改,可能有类型错,正常——下个 Task 修。task-case-display 测试应全过。)

- [ ] **Step 7: Commit**

```bash
cd rewrite
git add src/features/command-ingress/components/docking/task-case-display.ts src/features/command-ingress/components/docking/TaskCaseRow.vue src/features/command-ingress/__tests__/task-case-display.spec.ts
git commit -m "feat(command-ingress): task-case-display 加 paused 态 + TaskCaseRow 恢复按钮 [Task3]"
```

---

## Task 4: northbound 接入点改造 + runtime wiring

**Files:**
- Modify: `rewrite/src/features/northbound/services/northbound-service.ts`(接入点1/2 改写 registry;3/4 删写 storage;删 DockingTaskHistorySink/historyStorage 选项)
- Modify: `rewrite/src/runtime/feature-wiring.ts`(wiring 换 batchRegistry)
- Modify: `rewrite/src/app/rewriteRuntime.ts`(删 hydrateDockingTaskHistory)
- Delete: `rewrite/src/features/command-ingress/services/docking-task-history-storage.ts`(整文件)
- Test: `rewrite/src/features/northbound/__tests__/docking-task-history-integration.spec.ts`(重写)
- Delete: `rewrite/src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts`

- [ ] **Step 1: 重写接入点集成测试**

Replace `rewrite/src/features/northbound/__tests__/docking-task-history-integration.spec.ts` 全文(只保留接入点1+2 的 registry 写入 + 验证接入点3/4 不碰 registry)。先读现有文件拿 `makeMockTaskService`/`makeMockHttpFacade`/`startAndGetHandler`/`defaultConfig` 这些 helper(它们在 northbound-service.spec.ts 也有,本文件自己定义了一份——保留这些 helper,只改断言部分)。

核心测试(用现有 helper):
```ts
describe('接入点1+2: setTestTask 建 batchRegistry meta + 回填 instanceId', () => {
  it('setTestTask 后 batchRegistry 有对应批次(cases 全 pending)', async () => {
    // ... 用 startAndGetHandler 发 setTestTask(2 用例 2 layer)
    await vi.waitFor(() => expect(batchRegistry.loadAll().some(b => b.taskId === 'T_xxx')).toBe(true));
    const batch = batchRegistry.loadAll().find(b => b.taskId === 'T_xxx')!;
    expect(batch.cases).toHaveLength(2);
    // 接入点2 回填后 instanceId 非 null
    await vi.waitFor(() => expect(batch.cases.every(c => c.instanceId !== null)).toBe(true));
  });
  it('setTestTask 重复 taskId 不覆盖(insertBatch 去重)', async () => { /* ... */ });
});

describe('接入点3+4 已删除: reportTaskResult/controlTestTask 不碰 registry', () => {
  it('任务 settle 后 registry 不变(不写结果)', async () => { /* ... */ });
  it('controlTestTask stop 后 registry 不变', async () => { /* ... */ });
});
```

> 实施者:读现有 docking-task-history-integration.spec.ts 的 helper 区(makeMockTaskService/makeMockHttpFacade/startAndGetHandler/defaultConfig),**原样保留**,只替换 describe/it 断言部分为上面结构。batchRegistry 用真的 `createDockingBatchRegistry()` 注入 northbound(makeOptions 加 batchRegistry 字段)。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd rewrite && pnpm vitest run src/features/northbound/__tests__/docking-task-history-integration.spec.ts`
Expected: FAIL — northbound 还没 batchRegistry 选项。

- [ ] **Step 3: 改 northbound-service.ts**

(a) 删 import(L43):`import type { PersistedTaskBatch, PersistedTaskCase } from '@/features/command-ingress/services/docking-task-history-storage';` → 换成 `import type { DockingBatchCaseMeta } from '@/features/command-ingress';`(从 command-ingress index 导出,Task1 已在 core/index.ts 加 export)。

(b) 删 `DockingTaskHistorySink` 接口(L109-114),换:
```ts
export interface DockingBatchRegistryPort {
  insertBatch(meta: { taskId: string; taskName: string; receivedAt: number; cases: readonly DockingBatchCaseMeta[] }): boolean;
  setInstance(taskId: string, testCaseId: string, instanceId: string): void;
}
```

(c) `NorthboundServiceOptions`(L116-126):删 `historyStorage?: DockingTaskHistorySink;`,加 `batchRegistry?: DockingBatchRegistryPort;`。

(d) 接入点1(handleSetTestTask, L373-392):把 `if (options.historyStorage && customerTaskId)` 块整段替换成建 meta 写 registry:
```ts
if (options.batchRegistry && customerTaskId) {
  const cases: DockingBatchCaseMeta[] = [];
  for (const layer of sortedLayers) {
    for (const node of layer.nodes) {
      const id = typeof node === 'string' ? node : node.id;
      const name = typeof node === 'string' ? id : (node.name ?? id);
      cases.push({ testCaseId: id, caseName: name, instanceId: null });
    }
  }
  options.batchRegistry.insertBatch({ taskId: customerTaskId, taskName: parsed.taskName ?? customerTaskId, receivedAt: Date.now(), cases });
}
```

(e) 接入点2(createAndStartTask, L465-473):把 historyStorage.updateCase 块换成:
```ts
if (customerTaskId) {
  options.batchRegistry?.setInstance(customerTaskId, tc.testCaseId, instance.instanceId);
}
```

(f) 接入点3(reportTaskResult, L204-220):**删除整段** `const historyStorage = options.historyStorage; if (historyStorage) {...}` 块(约 15 行)。保留 postToCustomer + uploadTestReportAndNotify + removeMapping。

(g) 接入点4(handleControlTestTask, L499-512):**删除整段** `if (options.historyStorage) {...}` 块(约 14 行)。保留 stopTask/pauseTask/resumeTask 调用。

- [ ] **Step 4: 改 feature-wiring.ts**

(a) L41 import:`import { LazyDockingTaskHistoryStorage } from '...'` → 删。加(从 command-ingress index):`createDockingBatchRegistry, type DockingBatchRegistry`(若 index 已导出)。

(b) L86 接口字段:`readonly dockingTaskHistoryStorage: LazyDockingTaskHistoryStorage;` → `readonly batchRegistry: DockingBatchRegistry;`

(c) L107:`const dockingTaskHistoryStorage = new LazyDockingTaskHistoryStorage();` → `const batchRegistry = createDockingBatchRegistry();`

(d) L211:`historyStorage: dockingTaskHistoryStorage,` → `batchRegistry,`

(e) L233 返回对象:`dockingTaskHistoryStorage,` → `batchRegistry,`

- [ ] **Step 5: 改 rewriteRuntime.ts**

(a) L17 import:删 `createDockingTaskHistoryStorage`(及关联)。

(b) L184:`await hydrateDockingTaskHistory(runtime, fileFacade, dataDir);` → 删。

(c) L360-385 `hydrateDockingTaskHistory` 函数:整段删。

- [ ] **Step 6: 删 docking-task-history-storage.ts + 其测试**

```bash
cd rewrite
git rm src/features/command-ingress/services/docking-task-history-storage.ts
git rm src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts
```

检查 `command-ingress/services/index.ts` 或 `command-ingress/index.ts` 是否还 re-export 被删的类型(`PersistedTaskBatch` 等),有则删那些 export 行。

- [ ] **Step 7: 跑接入点集成测试 + northbound 全量**

Run: `cd rewrite && pnpm vitest run src/features/northbound/__tests__/docking-task-history-integration.spec.ts`
Expected: PASS。

Run: `cd rewrite && pnpm vitest run src/features/northbound 2>&1 | tail -5`
Expected: 除 heartbeat-timer(预存 fake-timer 抖动)外全过。

- [ ] **Step 8: 类型检查 + 全量回归**

Run: `cd rewrite && pnpm vitest run 2>&1 | tail -8`
Expected: 除预存环境抖动(heartbeat-timer / tcp ECONNRESET / frame-service / event-truncation)外全过;**不能有新增失败**(尤其不能有「找不到 docking-task-history-storage」之类的 import 错)。

- [ ] **Step 9: Commit**

```bash
cd rewrite
git add -A
git commit -m "refactor(northbound+wiring): 接入点改写 batchRegistry + 删 docking-task-history-storage [Task4]"
```

---

## Task 5: TaskListPanel 接 batchRegistry + resume + 全量回归

**Files:**
- Modify: `rewrite/src/features/command-ingress/components/docking/TaskListPanel.vue`

- [ ] **Step 1: 改 TaskListPanel.vue**

(a) composable 调用(L29-33):`historyStorage: runtime.features.dockingTaskHistoryStorage` → `batchRegistry: runtime.features.batchRegistry`。解构加 `resumeCase`:
```ts
const { sortedBatches, progressOf, pauseCase, resumeCase, stopCase, viewDetail, refresh } = useDockingTaskHistory({
  batchRegistry: runtime.features.batchRegistry,
  taskService: runtime.features.taskService,
  router,
});
```

(b) 删旧的 `batches`/`hasBatches` 若引用了 `batches.value`(现在只有 sortedBatches);`hasBatches` 改成基于 sortedBatches:
```ts
const hasBatches = computed(() => sortedBatches.value.length > 0);
```

(c) 加 `onResumeCase`:
```ts
function onResumeCase(c: DockingCaseView): void {
  resumeCase(c);
}
```
(import `DockingCaseView` 类型从 composable)

(d) template 的 TaskCaseRow 加 `@resume`:
```html
<TaskCaseRow
  v-for="c in batch.cases"
  :key="c.testCaseId"
  :case-row="c"
  :progress="progressOf(c)"
  @pause="onPauseCase(c)"
  @resume="onResumeCase(c)"
  @stop="onStopCase(c)"
  @view-detail="onViewDetail(c)"
/>
```

(e) `batchStatusDisplay` / `batchProgress` / `shortTaskId` / `shortReceivedAt` 这些 helper:它们用 `PersistedTaskBatch` 类型参数,改成 `DockingBatchView`。`batchProgress` 里 `c.status === 'passed' || c.status === 'failed'` 不变(DockingCaseView.status 含这些)。import 类型换。

- [ ] **Step 2: 全量回归**

Run: `cd rewrite && pnpm vitest run 2>&1 | tail -8`
Expected: 除预存环境抖动外全过,无新增失败。

- [ ] **Step 3: 类型检查(若项目有 tsc 脚本)**

Run: `cd rewrite && pnpm vue-tsc --noEmit 2>&1 | tail -10`(若有此脚本;若无跳过,靠 vitest 的类型感知)
Expected: 无新增类型错(不能有「dockingTaskHistoryStorage 不存在」「PersistedTaskCase 找不到」之类)。

- [ ] **Step 4: Commit**

```bash
cd rewrite
git add src/features/command-ingress/components/docking/TaskListPanel.vue
git commit -m "refactor(command-ingress): TaskListPanel 接 batchRegistry + 恢复按钮 [Task5]"
```

- [ ] **Step 5: 最终全量回归确认**

Run: `cd rewrite && pnpm vitest run 2>&1 | tail -8`
Expected: 与 Task4 完成时同一基线(除预存环境抖动外全过)。记录通过数,与重构前对比无回归。

---

## 完成标志

- [ ] docking-task-history-storage.ts 已删,grep `PersistedTaskCase`/`LazyDockingTaskHistoryStorage`/`dockingTaskHistoryStorage` 全仓 0 命中(除 spec/plan 文档)
- [ ] 批次面板暂停→显示恢复按钮→点恢复→继续 running,全程零同步成本
- [ ] taskService 实例 paused 态在批次面板正确反映
- [ ] 全量测试除预存环境抖动外全过
- [ ] D004 不变量保持(task 内核零改动)

## 待后续(不在本计划)
- 现象2「停的用例看不到」:重构后数据源换了,重新验证是否还在
- controlTestTask 1:1 覆盖映射 bug:单列,不在本计划
