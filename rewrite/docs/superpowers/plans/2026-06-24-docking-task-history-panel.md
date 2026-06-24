# 中心对接任务批次历史面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把中心对接页 `TaskListPanel.vue` 从"活跃实例表"改造成"按任务批次(T_xxx)分组、可收放、带历史"的列表,并新增批次历史持久化。

**Architecture:** 新建 `docking-task-history-storage.ts`(照 `docking-file-storage.ts` 范式:文件+.bak+原子写+Lazy holder+bootstrap hydrate)。在 setTestTask 收到时建批次、createInstance 时回填、reportTaskResult 时更新结果——三处叠加,不动现有报文/映射逻辑。UI 重写 `TaskListPanel.vue`(q-expansion-item 批次列表)+ 新建 `TaskCaseRow.vue` 子组件(四状态:pending/running/passed/failed,进行中内联进度+控制)。

**Tech Stack:** Vue 3 + Quasar(q-expansion-item/q-linear-progress/q-item) + TypeScript + Vitest。

**关联:** spec `docs/superpowers/specs/2026-06-24-docking-task-history-panel-design.md`;topic `2026-05-18-northbound-integration`;S017(setTestTask 闭环已跑通)。

**命名约定:** `PersistedTaskBatch` / `PersistedTaskCase`(类型);`docking-task-history-storage`(文件/storage);`use-docking-task-history`(composable);`TaskCaseRow`(子组件)。

## 真实甲方 setTestTask 报文(集成测试 fixture)

### 顺序执行(2 layer,各 1 node,parallel:false)

2026-06-24 实测:

```json
{
  "method": "setTestTask", "taskId": "T_20260624180344_380", "taskName": "22222",
  "subSysType": "laser", "subSysId": "JG",
  "immediate": true, "repeatCount": 1, "isEnd": false, "orbitProtectTime": 0,
  "testCaseInfo": [
    { "testCaseId": "c2b43266-...@1782295395974", "deviceIds": [], "masterTest": false, "testMode": 0, "ephMode": 0, "orbitInfo": null, "inputPars": [] },
    { "testCaseId": "21814bdf-...@1782295395975", "deviceIds": [], "masterTest": false, "testMode": 0, "ephMode": 0, "orbitInfo": null, "inputPars": [] }
  ],
  "executionPlan": {
    "layers": [
      { "layer": 1, "parallel": false, "nodes": [ { "id": "c2b43266-...@1782295395974", "name": "1540波长测试 - 5G RS", "type": "case" } ] },
      { "layer": 2, "parallel": false, "nodes": [ { "id": "21814bdf-...@1782295395975", "name": "1540波长测试 - 2.5G LDPC", "type": "case" } ] }
    ]
  }
}
```

### 混合并发(3 layer,layer1/2 parallel:true 多 node,layer3 parallel:false)

2026-06-24 实测(同一用例 UUID 可跨批次出现,@timestamp 不同):

```json
{
  "method": "setTestTask", "taskId": "T_20260624232827_386", "taskName": "333_副本_副本",
  "testCaseInfo": [
    { "testCaseId": "c2b43266-...@1782301905126", "inputPars": null, /* ... */ },
    { "testCaseId": "e8f159c2-...@1782301905127", "inputPars": null },
    { "testCaseId": "21814bdf-...@1782301905128", "inputPars": null },
    { "testCaseId": "587f859a-...@1782301905129", "inputPars": null },
    { "testCaseId": "2f8c10c7-...@1782301905130", "inputPars": null }
  ],
  "executionPlan": {
    "layers": [
      { "layer": 1, "parallel": true, "nodes": [
        { "id": "21814bdf-...@1782301905128", "name": "1540波长测试 - 2.5G LDPC", "type": "case" },
        { "id": "c2b43266-...@1782301905126", "name": "1540波长测试 - 5G RS", "type": "case" }
      ]},
      { "layer": 2, "parallel": true, "nodes": [
        { "id": "587f859a-...@1782301905129", "name": "1540波长测试 - 1.25G RS", "type": "case" },
        { "id": "e8f159c2-...@1782301905127", "name": "1540波长测试 - 5G LDPC", "type": "case" }
      ]},
      { "layer": 3, "parallel": false, "nodes": [
        { "id": "2f8c10c7-...@1782301905130", "name": "1540波长测试 - 625M LDPC", "type": "case" }
      ]}
    ]
  }
}
```

**关键确认(两份报文对照)**:
1. `nodes[]` 始终是 `{id,name,type}` 对象数组(非 string);`node.name` = 用例名。
2. `testCaseId` 带 `@timestamp` 后缀(=上报 outCaseId)。同 UUID 不同 timestamp = 不同次下发(批次间安全,不撞 hasTestCase)。
3. **`inputPars` 可能是 `[]` 也可能是 `null`** —— 解析 testCaseInfo 时要兼容 null(本次批次列表不存 inputPars,但接入点 1 遍历 testCaseInfo 建索引时 null 安全)。
4. 一个批次内 layer 可混 parallel(并行/顺序混用)。
5. 同 layer 多 node + parallel:true = 真并行(processLayers 用 Promise.all 启动)。

### 展示决策:用例平铺,不体现 layer 分组

历史列表的职责是"回看结果",执行拓扑(谁并行谁顺序)归执行监控页实时展示。**用例平铺成一个列表(按 layer 顺序遍历),不分组。** 理由:职责划分清晰,历史列表不承担拓扑可视化。

### 已知边界风险(不在本次范围)

`processLayers` 的 `state.hasTestCase(tc.testCaseId)` 是会话级去重。若甲方下发**完全相同**的 testCaseId(同 UUID+同 timestamp)两次,第二次跳过。正常每次下发生成新 timestamp 不触发,记录此处为边界。

---

## 关键事实(实施时必读,已从代码核实)

1. **createAndStartTask 是 async**(northbound-service.ts:374),返回 `{instanceId}`。接入点 2 在它 resolve 后回填。
2. **进度算法**(从 TaskExecutionDetail.vue:114-131 复用,抽纯函数):`sendsTotal !== null ? sendsCompleted/sendsTotal : stepsCompleted/stepsTotal`。
3. **用例名来源**:执行中/已完成 → `taskService.getInstance(instanceId).definitionRef.name`;建批次时 pending(无 instance)→ 从 ReportedSnapshot 或回落 testCaseId。
4. **executionPlan node**:可能是 `string`(=testCaseId)或 `{id, name?, type?}`,`id`=testCaseId。processLayers 已有 `resolveNode` 逻辑可参考。
5. **json-storage**:用 `readJsonWithBackup`/`writeJsonWithBackup`(`@/shared/utils/json-storage`),照 docking-file-storage.ts 用法。
6. **Lazy holder 范式**:照 `LazyDockingStorage`(docking-file-storage.ts:71),wireFeatures 初始空 delegate,bootstrap 异步 setDelegate。
7. **规范 D007/D011**:外层容器 `flex:1 1 0; min-height:0; overflow-y:auto`,不靠 max-height:100%。高度问题先 DevTools 实测,不猜。

---

## File Structure

**Create:**
- `rewrite/src/features/command-ingress/services/docking-task-history-storage.ts` — 批次历史文件持久化
- `rewrite/src/features/command-ingress/composables/use-docking-task-history.ts` — 面板数据源 + 控制动作
- `rewrite/src/features/command-ingress/components/docking/TaskCaseRow.vue` — 用例行子组件(四状态)
- `rewrite/src/shared/utils/task-progress-format.ts` — 进度百分比/标签纯函数(从 TaskExecutionDetail 抽出)
- `rewrite/src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts`
- `rewrite/src/features/command-ingress/__tests__/use-docking-task-history.spec.ts`
- `rewrite/src/features/command-ingress/__tests__/docking-task-history-integration.spec.ts`(接入点集成)

**Modify:**
- `rewrite/src/features/northbound/services/northbound-service.ts` — 3 处接入点(handleSetTestTask / createAndStartTask / reportTaskResult)+ controlTestTask
- `rewrite/src/features/northbound/index.ts` + `core/types.ts` — 注入 storage 到 service options
- `rewrite/src/runtime/feature-wiring.ts` — Lazy holder + bootstrap setDelegate
- `rewrite/src/features/command-ingress/components/docking/TaskListPanel.vue` — 重写 template
- `rewrite/src/widgets/TaskExecutionDetail.vue` — 改用抽出的纯函数(消除重复)

---

## Task 1: 进度格式化纯函数(先抽,复用基础)

**Files:**
- Create: `rewrite/src/shared/utils/task-progress-format.ts`
- Create test: `rewrite/src/shared/utils/__tests__/task-progress-format.spec.ts`

**目的:** 把 TaskExecutionDetail.vue:114-131 的 progressPct/progressLabel 逻辑抽成纯函数,TaskCaseRow 和 TaskExecutionDetail 共用。

- [ ] **Step 1: 写失败测试**

```ts
// rewrite/src/shared/utils/__tests__/task-progress-format.spec.ts
import { describe, it, expect } from 'vitest';
import { formatProgressPct, formatProgressLabel } from '../task-progress-format';
import type { TaskProgress } from '@/features/task';

describe('task-progress-format', () => {
  const baseProgress = (over: Partial<TaskProgress>): TaskProgress =>
    ({ stepsTotal: 3, stepsCompleted: 1, sendsTotal: null, sendsCompleted: 0, ...over } as TaskProgress);

  it('prefers sends dimension when sendsTotal is non-null', () => {
    const p = baseProgress({ sendsTotal: 15, sendsCompleted: 7 });
    expect(formatProgressLabel(p)).toBe('7/15');
    expect(formatProgressPct(p)).toBe(47);
  });

  it('falls back to steps dimension when sendsTotal is null', () => {
    const p = baseProgress({ sendsTotal: null, stepsTotal: 3, stepsCompleted: 2 });
    expect(formatProgressLabel(p)).toBe('2/3');
    expect(formatProgressPct(p)).toBe(67);
  });

  it('returns 0 pct and empty label when progress is null', () => {
    expect(formatProgressPct(null)).toBe(0);
    expect(formatProgressLabel(null)).toBe('');
  });

  it('handles sendsTotal=0 without divide-by-zero (falls back to steps)', () => {
    const p = baseProgress({ sendsTotal: 0, sendsCompleted: 0, stepsTotal: 2, stepsCompleted: 1 });
    expect(formatProgressLabel(p)).toBe('1/2');
    expect(formatProgressPct(p)).toBe(50);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/shared/utils/__tests__/task-progress-format.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 写实现**

```ts
// rewrite/src/shared/utils/task-progress-format.ts
import type { TaskProgress } from '@/features/task';

/**
 * 进度百分比:优先 sends 维度(sendsTotal 非 null 且 > 0),回退 steps 维度。
 * 抽自 TaskExecutionDetail.vue(原 progressPct computed),供 TaskCaseRow 共用。
 */
export function formatProgressPct(progress: TaskProgress | null): number {
  if (!progress) return 0;
  if (progress.sendsTotal !== null && progress.sendsTotal > 0) {
    return Math.round((progress.sendsCompleted / progress.sendsTotal) * 100);
  }
  const total = progress.stepsTotal || 1;
  return Math.round((progress.stepsCompleted / total) * 100);
}

/** 进度 n/m 标签:优先 sends,回退 steps。抽自 TaskExecutionDetail.vue。 */
export function formatProgressLabel(progress: TaskProgress | null): string {
  if (!progress) return '';
  if (progress.sendsTotal !== null) {
    return `${progress.sendsCompleted}/${progress.sendsTotal}`;
  }
  return `${progress.stepsCompleted}/${progress.stepsTotal}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/shared/utils/__tests__/task-progress-format.spec.ts`
Expected: PASS 4/4。

- [ ] **Step 5: 改 TaskExecutionDetail.vue 用纯函数(消除重复)**

把 TaskExecutionDetail.vue:114-131 的 `progressPct`/`progressLabel` computed 改为调用纯函数:

```ts
import { formatProgressPct, formatProgressLabel } from '@/shared/utils/task-progress-format';
// ...
const progressPct = computed(() => formatProgressPct(props.progress));
const progressLabel = computed(() => formatProgressLabel(props.progress));
```

- [ ] **Step 6: 跑回归**

Run: `pnpm test src/widgets/__tests__/ 2>/dev/null; pnpm test src/shared/utils/__tests__/task-progress-format.spec.ts`
Expected: 纯函数测试 PASS;TaskExecutionDetail 相关测试(若有)无新增失败。

- [ ] **Step 7: Commit**

```bash
git add src/shared/utils/task-progress-format.ts src/shared/utils/__tests__/task-progress-format.spec.ts src/widgets/TaskExecutionDetail.vue
git commit -m "refactor: 抽出 task-progress-format 纯函数,TaskExecutionDetail 改用(D004 进度双维度)"
```

---

## Task 2: 批次历史数据模型 + storage

**Files:**
- Create: `rewrite/src/features/command-ingress/services/docking-task-history-storage.ts`
- Create test: `rewrite/src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts`

**类型定义(放 storage 文件内导出):**

```ts
export interface PersistedTaskCase {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly status: 'pending' | 'running' | 'passed' | 'failed';
  readonly instanceId: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null;
}

export interface PersistedTaskBatch {
  readonly taskId: string;
  readonly taskName: string;
  readonly receivedAt: number;
  readonly status: 'running' | 'completed' | 'partial-failed' | 'failed';
  readonly cases: readonly PersistedTaskCase[];
}
```

**Storage 接口(照 docking-file-storage.ts):**

```ts
export interface DockingTaskHistoryStorage {
  hydrate(): Promise<void>;
  loadAll(): readonly PersistedTaskBatch[];
  saveAll(batches: readonly PersistedTaskBatch[]): void;
  /** 插入新批次(按 taskId 去重,已存在则忽略)。返回是否实际插入。 */
  insertBatch(batch: PersistedTaskBatch): boolean;
  /** 局部更新某批次的某用例字段。批次/用例不存在 → no-op。 */
  updateCase(taskId: string, testCaseId: string, patch: Partial<PersistedTaskCase>): void;
  /** 重算某批次的 status(全部用例不再 running/pending 时)。 */
  recomputeBatchStatus(taskId: string): void;
}
```

- [ ] **Step 1: 写失败测试 — 基本读写 + hydrate ok 路径**

```ts
// rewrite/src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { createDockingTaskHistoryStorage, type PersistedTaskBatch } from '../services/docking-task-history-storage';

function makeFakeFiles(files: Record<string, string> = {}) {
  return {
    async readTextFile(p: string) {
      if (!(p in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files[p];
    },
    async writeTextFile(p: string, c: string) { files[p] = c; },
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

describe('docking-task-history-storage', () => {
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
    await new Promise(r => setTimeout(r, 10)); // fire-and-forget write
    const raw = files['dir/state/docking-tasks.json'];
    expect(JSON.parse(raw)).toEqual({ version: 1, taskBatches: [batchFixture()] });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 写实现(createDockingTaskHistoryStorage)**

照 `docking-file-storage.ts` 完整实现 `createDockingTaskHistoryStorage`,要点:
- `SCHEMA_VERSION = 1`,payload `{ version, taskBatches }`
- 文件路径 `${dataDir}/state/docking-tasks.json`
- `hydrate`:readJsonWithBackup → parsePayload(version-high/malformed → onDataLoss)→ 灌 cache。missing/corrupted → 空数组(**无 localStorage 迁移,这是新数据**)。
- `loadAll`:返回 `[...cache]`
- `saveAll(batches)`:`cache = [...batches]; void writeToFile()`
- `insertBatch(batch)`:taskId 已存在 → return false;否则 `cache = [batch, ...cache]; void writeToFile(); return true`
- `updateCase(taskId, testCaseId, patch)`:找到 batch → 找到 case → `cache = cache.map(...)` 替换该 case(merge patch)→ `void writeToFile()`;找不到 no-op
- `recomputeBatchStatus(taskId)`:找 batch,若所有 case 的 status 都不在 `{pending,running}` → 计算 completed(全 passed)/failed(全 failed)/partial-failed(混合)→ 更新 batch.status → `void writeToFile()`
- `reportDataLoss`/`writeToFile` 照 docking-file-storage

- [ ] **Step 4: 补测试 — insertBatch 去重 / updateCase / recomputeBatchStatus**

```ts
it('insertBatch dedupes by taskId', async () => {
  const files = makeFakeFiles({});
  const s = createDockingTaskHistoryStorage(files, 'dir');
  await s.hydrate();
  expect(s.insertBatch(batchFixture({ taskId: 'T_1' }))).toBe(true);
  expect(s.insertBatch(batchFixture({ taskId: 'T_1', taskName: 'dup' }))).toBe(false);
  expect(s.loadAll()).toHaveLength(1);
  expect(s.loadAll()[0].taskName).toBe('test');
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

it('hydrate version-high → onDataLoss + empty', async () => {
  const onDataLoss = vi.fn();
  const files = makeFakeFiles({ 'dir/state/docking-tasks.json': JSON.stringify({ version: 99, taskBatches: [] }) });
  const s = createDockingTaskHistoryStorage(files, 'dir', { onDataLoss });
  await s.hydrate();
  expect(onDataLoss).toHaveBeenCalled();
  expect(s.loadAll()).toEqual([]);
});
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm test src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts`
Expected: PASS 全部(基本读写 3 + insert/update/recompute 5 + version-high 1)。

- [ ] **Step 6: Commit**

```bash
git add src/features/command-ingress/services/docking-task-history-storage.ts src/features/command-ingress/__tests__/docking-task-history-storage.spec.ts
git commit -m "feat(command-ingress): 批次历史文件持久化 docking-task-history-storage(照 docking-file-storage 范式)"
```

---

## Task 3: Lazy holder + feature-wiring 接入

**Files:**
- Modify: `rewrite/src/features/command-ingress/services/docking-task-history-storage.ts`(加 LazyDockingTaskHistoryStorage)
- Modify: `rewrite/src/features/northbound/index.ts` + `core/types.ts`(service options 加 historyStorage)
- Modify: `rewrite/src/runtime/feature-wiring.ts`(实例化 + bootstrap setDelegate)

- [ ] **Step 1: 在 storage 文件加 LazyDockingTaskHistoryStorage 类**

照 `LazyDockingStorage`(docking-file-storage.ts:71-98):

```ts
export class LazyDockingTaskHistoryStorage implements DockingTaskHistoryStorage {
  private delegate: DockingTaskHistoryStorage = createEmptyTaskHistoryStorage();
  setDelegate(s: DockingTaskHistoryStorage): void { this.delegate = s; }
  hydrate() { return this.delegate.hydrate(); }
  loadAll() { return this.delegate.loadAll(); }
  saveAll(b: readonly PersistedTaskBatch[]) { this.delegate.saveAll(b); }
  insertBatch(b: PersistedTaskHistoryBatch) { return this.delegate.insertBatch(b); }
  updateCase(t: string, tc: string, p: Partial<PersistedTaskCase>) { this.delegate.updateCase(t, tc, p); }
  recomputeBatchStatus(t: string) { this.delegate.recomputeBatchStatus(t); }
}

function createEmptyTaskHistoryStorage(): DockingTaskHistoryStorage {
  return {
    async hydrate() {},
    loadAll: () => [],
    saveAll: () => {},
    insertBatch: () => false,
    updateCase: () => {},
    recomputeBatchStatus: () => {},
  };
}
```

- [ ] **Step 2: northbound service options 加 historyStorage**

`core/types.ts`(找 service options 接口,加字段):

```ts
// 在 createNorthboundService 的 options 接口里加:
readonly historyStorage?: { insertBatch(b: PersistedTaskBatch): void; updateCase(...): void; recomputeBatchStatus(...): void; loadAll(): readonly PersistedTaskBatch[] };
```

(用最小接口形状,不直接 import storage 类型,northbound 不耦合 command-ingress storage 实现。types.ts 顶部加 `import type { PersistedTaskBatch } from '@/features/command-ingress/services/docking-task-history-storage'`。)

- [ ] **Step 3: feature-wiring 实例化 + setDelegate**

照 docking-file-storage 在 feature-wiring.ts 的用法:
- `const lazyHistoryStorage = new LazyDockingTaskHistoryStorage();`
- createNorthboundService 传入 `historyStorage: lazyHistoryStorage`
- bootstrap 异步段(拿到 fileFacade + dataDir 后):`const realHistory = createDockingTaskHistoryStorage(files, dataDir, { onDataLoss: ... }); await realHistory.hydrate(); lazyHistoryStorage.setDelegate(realHistory);`(照 LazyDockingStorage 的 hydrate 顺序)

- [ ] **Step 4: 跑 feature-wiring 相关测试 + 确认无破坏**

Run: `pnpm test src/runtime/__tests__/ 2>/dev/null; pnpm test src/features/northbound/__tests__/northbound-service.spec.ts`
Expected: 无新增失败(接入是新增可选字段,默认空 delegate,northbound-service.spec 不传 historyStorage 仍能跑)。

- [ ] **Step 5: Commit**

```bash
git add src/features/command-ingress/services/docking-task-history-storage.ts src/features/northbound/core/types.ts src/features/northbound/index.ts src/runtime/feature-wiring.ts
git commit -m "feat(wiring): LazyDockingTaskHistoryStorage 延迟注入 + northbound service options 接入"
```

---

## Task 4: 接入点 1 + 2 — handleSetTestTask 建批次 / createAndStartTask 回填

**Files:**
- Modify: `rewrite/src/features/northbound/services/northbound-service.ts`
- Create test: `rewrite/src/features/northbound/__tests__/docking-task-history-integration.spec.ts`

**接入点 1**(handleSetTestTask,解析后、processLayers 之前):

**真实报文确认**(甲方 setTestTask 实测):`executionPlan.layers[].nodes[]` 是**对象数组** `{id, name, type}`,`node.name` 就是用例名(如 `"1540波长测试 - 5G RS"`)。所以 caseName 直接从 node.name 取,无需等 instance 创建回填。

```ts
// 在 handleSetTestTask 里,layers 校验通过、customerTaskId 确定后:
if (options.historyStorage) {
  const cases: PersistedTaskCase[] = [];
  for (const layer of layers) {
    for (const node of layer.nodes) {
      // node 实测是 {id, name, type} 对象;兼容字符串节点(id=字符串,name 回落 id)
      const id = typeof node === 'string' ? node : node.id;
      const name = typeof node === 'string' ? id : (node.name ?? id);
      cases.push({ testCaseId: id, caseName: name, status: 'pending', instanceId: null, startedAt: null, finishedAt: null, durationMs: null });
    }
  }
  options.historyStorage.insertBatch({ taskId: customerTaskId, taskName: parsed.taskName ?? customerTaskId, receivedAt: Date.now(), status: 'running', cases });
}
```

**接入点 2**(createAndStartTask,createTask 后):

**只回填 instanceId/status/startedAt,不回填 caseName**(caseName 建批次时已从 node.name 取定)。

```ts
// 在 createAndStartTask 里,state.mapTestCase 之后:
options.historyStorage?.updateCase(customerTaskId, tc.testCaseId, {
  instanceId: instance.instanceId,
  status: 'running',
  startedAt: Date.now(),
});
```

- [ ] **Step 1: 写集成测试 — setTestTask 建批次 + 回填**

```ts
// rewrite/src/features/northbound/__tests__/docking-task-history-integration.spec.ts
// 照 northbound-service.spec.ts 的 fixture 搭一个 service,注入 mock historyStorage(fake 实现),
// 发一个 setTestTask 报文,验证:
// - historyStorage.insertBatch 被调用,taskId/taskName/cases 正确
// - 每个 testCase 被 createAndStartTask 后,updateCase 被调(instanceId/status running)
// 用现有 northbound-service.spec.ts 的 createService helper(读那个文件找 fixture 模式)
```

(具体 fixture 参照 northbound-service.spec.ts 既有用例的 mock taskService/reportedSnapshotStorage 模式;此处给验证点,实施时照既有 spec 模式补全 mock。)

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/features/northbound/__tests__/docking-task-history-integration.spec.ts`
Expected: FAIL — insertBatch/updateCase 未被调用。

- [ ] **Step 3: 实现接入点 1 + 2(上面代码)**

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/features/northbound/__tests__/docking-task-history-integration.spec.ts`
Expected: PASS。

- [ ] **Step 5: 跑 northbound 全量回归**

Run: `pnpm test src/features/northbound/__tests__/`
Expected: 全过(接入是叠加,现有 spec 不传 historyStorage 时 options.historyStorage 为 undefined,走 `?.` 不执行,行为不变)。

- [ ] **Step 6: Commit**

```bash
git add src/features/northbound/services/northbound-service.ts src/features/northbound/__tests__/docking-task-history-integration.spec.ts
git commit -m "feat(northbound): 接入点1+2 — handleSetTestTask 建批次 / createAndStartTask 回填 instanceId"
```

---

## Task 5: 接入点 3 — reportTaskResult 更新结果

**Files:**
- Modify: `rewrite/src/features/northbound/services/northbound-service.ts`

**接入点 3**(reportTaskResult,collectResult 后):

```ts
// 在 reportTaskResult 里,verdict 计算后、removeMapping 之前:
const customerTaskIdForHistory = state.getCustomerTaskId(instanceId);
if (customerTaskIdForHistory && options.historyStorage) {
  options.historyStorage.updateCase(customerTaskIdForHistory, testCaseId, {
    status: verdict.passed ? 'passed' : 'failed',
    finishedAt: Date.now(),
    durationMs: /* startedAt 从 storage 现有 case 读,或从 instance 状态读 */,
  });
  options.historyStorage.recomputeBatchStatus(customerTaskIdForHistory);
}
```

**durationMs 来源**:startedAt 在接入点 2 已存进 case;updateCase 的 patch 里要算 durationMs 需先读现有 case 的 startedAt。两种实现:
- (a) updateCase 内部支持"读现有值算 durationMs"——破坏纯 patch 语义,否决
- (b) 调用方先 `loadAll` 找到 case 读 startedAt,再算 durationMs 传进 patch —— 采纳(调用方一次性算好)

- [ ] **Step 1: 写测试 — reportTaskResult 更新用例结果 + 重算批次 status**

照 Task 4 集成测试模式,搭 service 发 setTestTask(建批次)→ 让 mock taskService 触发 onTaskSettled/reportTaskResult → 验证 historyStorage.updateCase 被调(status passed/failed + durationMs)+ recomputeBatchStatus 被调。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/features/northbound/__tests__/docking-task-history-integration.spec.ts`
Expected: FAIL(新增的 reportTaskResult 断言不过)。

- [ ] **Step 3: 实现接入点 3**(注意 durationMs 先 loadAll 读 startedAt 再算)

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/features/northbound/__tests__/docking-task-history-integration.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/features/northbound/services/northbound-service.ts src/features/northbound/__tests__/docking-task-history-integration.spec.spec.ts
git commit -m "feat(northbound): 接入点3 — reportTaskResult 更新用例结果 + 重算批次 status"
```

---

## Task 6: use-docking-task-history composable

**Files:**
- Create: `rewrite/src/features/command-ingress/composables/use-docking-task-history.ts`
- Create test: `rewrite/src/features/command-ingress/__tests__/use-docking-task-history.spec.ts`

**职责:** TaskListPanel 的数据源 + 控制动作。把 historyStorage 的 loadAll 暴露成响应式 batches(按 receivedAt 倒序),并提供 pauseCase/stopCase/viewDetail 动作。

```ts
export interface UseDockingTaskHistoryOptions {
  readonly historyStorage: DockingTaskHistoryStorage;
  readonly taskService: { getInstance(id: string): TaskInstanceState | undefined; pauseTask(id: string): void; stopTask(id: string): void; getProgress?(id: string): TaskProgress | null };
  readonly router: { push(to: unknown): void };
}

export function useDockingTaskHistory(options: UseDockingTaskHistoryOptions) {
  const batches = ref<readonly PersistedTaskBatch[]>(options.historyStorage.loadAll());
  // 进度查询:对 running 用例,从 taskService.getProgress(instanceId) 取
  function progressOf(c: PersistedTaskCase): TaskProgress | null {
    return c.instanceId ? (options.taskService.getProgress?.(c.instanceId) ?? null) : null;
  }
  function pauseCase(c: PersistedTaskCase) { if (c.instanceId) options.taskService.pauseTask(c.instanceId); }
  function stopCase(c: PersistedTaskCase) { if (c.instanceId) options.taskService.stopTask(c.instanceId); }
  function viewDetail(c: PersistedTaskCase) { options.router.push({ name: 'execution-monitor' /* 或实际路由名 */ }); }
  return { batches, progressOf, pauseCase, stopCase, viewDetail };
}
```

- [ ] **Step 1: 写测试 — batches 倒序 + 控制动作转发 + progressOf**

- [ ] **Step 2: 跑测试确认失败** → FAIL

- [ ] **Step 3: 实现上面的 composable**

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/command-ingress/composables/use-docking-task-history.ts src/features/command-ingress/__tests__/use-docking-task-history.spec.ts
git commit -m "feat(command-ingress): use-docking-task-history composable(批次列表数据源+控制动作)"
```

---

## Task 7: TaskCaseRow 子组件

**Files:**
- Create: `rewrite/src/features/command-ingress/components/docking/TaskCaseRow.vue`

四状态渲染(pending/running/passed/failed),进行中内联进度 + 控制按钮。照 spec 的 template 结构(见 spec "用例行子组件"段)。

- [ ] **Step 1: 写组件测试(四状态渲染 + emit 事件)**

测试点:pending 只显示名+○;running 显示进度条+pause/stop 按钮 emit pause/stop;passed 显示✓+耗时+详情按钮 emit view-detail;failed 显示✗+耗时+详情按钮。

- [ ] **Step 2: 跑测试确认失败** → FAIL

- [ ] **Step 3: 实现 TaskCaseRow.vue**

template 照 spec。script 用 `formatProgressPct`/`formatProgressLabel` 纯函数(Task 1)。icon 用 Quasar 内置(pending:radio_button_unchecked / running:autorenew 或 cached / passed:check_circle / failed:cancel)。配色用 Quasar 色(positive/negative/warning/info)。

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/command-ingress/components/docking/TaskCaseRow.vue <test>
git commit -m "feat(command-ingress): TaskCaseRow 子组件(四状态,进行中内联进度+控制)"
```

---

## Task 8: TaskListPanel 重写

**Files:**
- Modify: `rewrite/src/features/command-ingress/components/docking/TaskListPanel.vue`

完全重写 template:q-expansion-item 批次列表 + 用 TaskCaseRow。外层容器遵守 D007(`flex:1 1 0; min-height:0; overflow-y:auto`)。

- [ ] **Step 1: 重写 TaskListPanel.vue**

照 spec 的 UI 结构。批次头部:taskId 截断 + taskName(限长省略)+ 状态徽章 + 进度计数 + 时间。进行中批次 default-opened。空态"暂无中心下发任务"。

- [ ] **Step 2: 手动验证(dev server)**

Run: `pnpm dev`(完全重启,记住 D003:HMR 对 props/emit 不可靠)
验证:面板标题"中心下发任务";空态正确;有批次时能展开收起;进行中用例有进度+按钮;完成用例有详情按钮。
**记住 D011**:若有高度撑开,先 DevTools 实测 computed height 逐环查,不猜。

- [ ] **Step 3: 全量回归**

Run: `pnpm test 2>&1 | tail -30`
Expected: 无新增失败(baseline 11 failed: heartbeat-timer×6、frame-service-state×1、tcp/event×4 是 pre-existing)。

- [ ] **Step 4: Commit**

```bash
git add src/features/command-ingress/components/docking/TaskListPanel.vue
git commit -m "feat(command-ingress): TaskListPanel 重写为任务批次历史列表(方案B+B1)"
```

---

## Task 9(可选): controlTestTask 接入点 4

**Files:**
- Modify: `rewrite/src/features/northbound/services/northbound-service.ts`

controlTestTask(stop/abort)→ 该 taskId 下所有 running 用例标 failed + recomputeBatchStatus。

- [ ] **Step 1: 写测试** → FAIL → **Step 2: 实现** → **Step 3: PASS** → **Step 4: Commit**

---

## Self-Review(写计划后自查)

- [x] **Spec 覆盖**:数据模型(Task 2)↔ 持久化范式(Task 2/3)↔ 3 接入点(Task 4/5/9)↔ UI 结构(Task 6/7/8)↔ 进度复用(Task 1)全覆盖
- [x] **Placeholder**:无 TBD;Task 4/5 的集成测试给了验证点 + 指明"照 northbound-service.spec.ts 既有 mock 模式"(因为完整 mock fixture 几十行,照搬现有 spec 模式比贴死更 DRY,实施时读那个文件)
- [x] **类型一致**:PersistedTaskBatch/Case 跨 Task 2-8 字段名一致;DockingTaskHistoryStorage 接口方法名一致
- [x] **实施前核对点**:① 路由名(Task 6/8 用 'execution-monitor' 占位,实施时核对实际路由名)② taskService.getProgress 是否存在(Task 6 用可选链,实施时核对)③ ReportedSnapshot caseName(已改为从 instance.definitionRef.name 取,更可靠)
