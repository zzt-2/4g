# 设计:中心对接任务批次历史 — 改为从 taskService 内存派生(推翻独立持久化)

> 2026-06-25 | 状态:待审 | 关联 topic: `2026-05-18-northbound-integration`
> 推翻决策: `2026-06-24-docking-task-history-panel-design.md` 的「持久化」+「数据接入点」章节
> 关联不变量: D004(task feature 纯粹,不带甲方字段)——**本设计保持 D004 不变**

## 背景与问题

9-Task(2026-06-24)把中心对接 `TaskListPanel.vue` 改造成「按 T_xxx 批次分组、带历史」的列表,数据走独立持久化文件 `docking-tasks.json`(`PersistedTaskBatch`/`PersistedTaskCase`),靠 4 个接入点手工同步 setTestTask/resultReport/controlTestTask 链路。

上线后用户实测 + 代码复查发现两个问题,引出本次重构:

1. **暂停态割裂(直接触发)**:批次面板有暂停按钮(`TaskCaseRow.vue:64`),但 `PersistedTaskCase.status` 只有 `pending/running/passed/failed` 四态,没有 `paused`。点暂停只调本地 `taskService.pauseTask`,批次记录不反映,面板看不出「已暂停」、没有恢复按钮。根因是**两套数据(批次记录 vs taskService 实例)要手工同步**,暂停是同步机制的漏洞。
2. **架构冗余味儿(用户质疑)**:同一批中心下发的用例,底层是同一个 `taskService` 实例(`instanceId` 相同),command-ingress 又复制了一份批次记录。两份数据描述同一个东西,靠接入点同步——脆弱。

用户决策(2026-06-25,两轮问答):
- **跨重启历史不重要**(「麻烦就不要」)→ 持久化文件的主要价值消失。
- **批次分组信息走 command-ingress 内存映射表**(选项 A),task 内核不动,D004 不变。

## 目标

把批次面板的数据源从「独立持久化 docking-tasks.json」改成「**taskService 内存实例 + command-ingress 内存映射表**派生」:

- 单一真相源:批次视图 = taskService 实例按 customerTaskId 分组聚合 + 内存映射表补批次元信息。
- 暂停/停止/恢复状态**零同步成本**:case 状态直接来自实例 lifecycle。
- 不持久化(重启清空,用户已确认无所谓)。
- task 内核(`TaskInstanceState`)不加任何字段,D004 原封不动。

## 不做(YAGNI)

- ❌ 不持久化批次记录(用户确认跨重启历史无所谓)。内存映射表重启清空。
- ❌ 不给 `TaskInstanceState` 加 `customerTaskId`(那是选项 B,违反 D004)。批次归属靠 command-ingress 内存映射表。
- ❌ 不合并执行监控页(路 3,改动太大且撞 UI)。两面板并存,职责不变(docking spec 职责划分表仍有效)。
- ❌ 不改 setTestTask/resultReport/controlTestTask 对外协议(纯内部数据源替换)。
- ❌ 不动 northbound-state 的 `mapTaskId` 等内存映射(本来就内存,是 controlTestTask 定位实例的依据,保留)。

## 核心设计:内存映射表 + 派生视图

### 数据模型

#### 内存批次映射表(command-ingress 持有,不持久化)

```ts
// command-ingress/core/docking-batch-registry.ts(新建)
interface DockingBatchMeta {
  readonly taskId: string;            // 'T_xxx'
  readonly taskName: string;          // setTestTask.taskName
  readonly receivedAt: number;        // 收到 setTestTask 的时间戳
  readonly cases: readonly DockingBatchCaseMeta[];
}
interface DockingBatchCaseMeta {
  readonly testCaseId: string;        // 关联键
  readonly caseName: string;          // 从 node.name 取(建批次时定)
  readonly instanceId: string | null; // createAndStartTask 后回填;未轮到执行前为 null
}
```

**只存 taskService 内存里没有的批次元信息**:taskId 分组、taskName、receivedAt、testCaseId↔instanceId 关联、caseName。**不存 status / 进度 / 结果 / 时间戳**——这些全部运行时从 taskService 实例取。

#### case 运行态视图(派生,不入库)

面板渲染时,对每个 `DockingBatchCaseMeta`,用 `instanceId` 查 `taskService.getInstance(instanceId)`,派生出展示用的 case 视图:

```ts
// command-ingress/composables/use-docking-task-history.ts(改造)
interface DockingCaseView {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly instanceId: string | null;
  readonly status: DockingCaseStatus;  // 派生自 instance.lifecycle(见映射表)
  readonly durationMs: number | null;  // 派生自实例时间戳
}
type DockingCaseStatus = 'pending' | 'running' | 'paused' | 'passed' | 'failed';
```

### lifecycle → case status 映射(关键,需在实施时定)

task 实例 lifecycle 有 `created/running/paused/completed/failed/stopped`,批次面板 case 要显示 `pending/running/paused/passed/failed`。映射规则:

| instance.lifecycle(查到实例) | case status | 说明 |
|---|---|---|
| `created` | `running` | 实例已建但没 start?实际 createAndStartTask 建完就 start,几乎见不到 created;归 running |
| `running` | `running` | |
| `paused` | `paused` | **本重构核心收益**:暂停态天然反映 |
| `completed` | `passed` | |
| `failed` | `failed` | |
| `stopped` | `failed` | stopped 归 failed(粒度 2 不细分,沿用旧接入点4 决策) |
| **instanceId 为 null**(未轮到执行) | `pending` | layer barrier 还没放行到本用例 |
| **查不到实例**(实例已被清/重启后映射残留) | `failed`?或 `pending`? | **实施时核对**:正常不会出现(createAndStartTask 建实例后映射才回填);若出现视为异常,标 failed + 不崩溃 |

> 实施前需核对 `stopped` 是否真归 `failed`——旧接入点4 这么做,但 task lifecycle 本身有独立 `stopped` 态。粒度 2 不细分的话归 failed 合理。这条沿用旧决策,不重新讨论。

### 批次级 status(派生)

照旧规则,但从派生的 case status 算:

| 条件 | batch status |
|---|---|
| 任一 case 是 pending/running/paused | `running` |
| 全 passed | `completed` |
| 全 failed | `failed` |
| 混合(passed + failed) | `partial-failed` |

> 注:加了 `paused` 算「活跃」(批次仍 running),符合「暂停≠完成」。

## 数据流(重构后)

```
setTestTask(甲方下发)
  ↓ northbound handleSetTestTask
  ↓ 1. 解析 executionPlan + testCaseInfo
  ↓ 2. 建 DockingBatchMeta(全部 case instanceId:null,即 pending)→ 写入 batchRegistry
  ↓ processLayers:
       createAndStartTask(每用例)
         ↓ taskService.createTask + startTask(现有,不动)
         ↓ northbound-state.mapTaskId/mapTestCase(现有,不动)
         ↓ batchRegistry 回填 case.instanceId(替换旧接入点2,改写内存表而非 storage)
  ↓
面板渲染(usePolling 1s):
  batchRegistry.loadAll() → 每批 cases → 用 instanceId 查 taskService.getInstance
  → 派生 DockingCaseView(status/进度/duration 实时)→ TaskCaseRow 渲染

暂停/停止/恢复(面板按钮):
  TaskCaseRow emit → composable → taskService.pauseTask/stopTask/resumeTask(现有,不动)
  → 下一秒 polling,case status 从实例 lifecycle 实时反映

controlTestTask(中心下发 stop/pause/continue):
  northbound handleControlTestTask → taskService.stopTask/pauseTask/resumeTask(现有,不动)
  → 批次面板下次 polling 自然反映(不再需要接入点4 写 storage)
```

## 模块清单

### 模块1:内存批次映射表(新建)

路径:`rewrite/src/features/command-ingress/core/docking-batch-registry.ts`

```ts
export interface DockingBatchRegistry {
  insertBatch(meta: DockingBatchMeta): boolean;  // 按 taskId 去重
  setInstance(taskId: string, testCaseId: string, instanceId: string): void;  // 回填(替换旧 updateCase 的 instanceId 部分)
  loadAll(): readonly DockingBatchMeta[];
  clear(): void;
}
export function createDockingBatchRegistry(): DockingBatchRegistry;
```

纯内存 `Map<taskId, DockingBatchMeta>`,不持久化。范式参考 northbound-state.ts 的闭包 Map(但归属 command-ingress)。

### 模块2:composable 改造

路径:`rewrite/src/features/command-ingress/composables/use-docking-task-history.ts`

改造点:
- 数据源从 `historyStorage.loadAll()` 改为 `batchRegistry.loadAll()` + `taskService.getInstance(instanceId)` 逐 case 派生(不用 getSnapshot 全量,只查映射表里有的 instanceId)。
- `batches`/`sortedBatches` 改成 `computed`:从 batchRegistry 读 meta + 实时查实例派生 `DockingCaseView[]`。
- 新增 `resumeCase`(调 `taskService.resumeTask`)。
- 保留 `progressOf`/`pauseCase`/`stopCase`/`viewDetail`(已直打 taskService,不动)。
- Port 接口 `DockingTaskHistoryTaskServicePort` 加 `resumeTask` + 明确 `getInstance` 要返回含 lifecycle/时间戳的完整实例。

### 模块3:northbound 接入点改造

路径:`rewrite/src/features/northbound/services/northbound-service.ts`

- **删**:`DockingTaskHistorySink` 接口、`historyStorage` 选项、类型 import(`PersistedTaskBatch`/`PersistedTaskCase`)。
- **接入点1**(handleSetTestTask):从 `historyStorage.insertBatch` 改为 `batchRegistry.insertBatch`(只存 meta,不存 status)。
- **接入点2**(createAndStartTask):从 `historyStorage.updateCase` 改为 `batchRegistry.setInstance`(只回填 instanceId,不回填 status/startedAt)。
- **接入点3**(reportTaskResult):**删除**(用例结果从实例 lifecycle 实时派生,不需要写)。
- **接入点4**(handleControlTestTask):**删除**(stop/pause/continue 直接动 taskService,面板自动反映)。
- northbound 需要 `batchRegistry` 注入(新选项,替代 `historyStorage`)。

### 模块4:runtime wiring 改造

- `feature-wiring.ts`:删 `LazyDockingTaskHistoryStorage` import/构造/注入/导出;加 `createDockingBatchRegistry()` 构造,注入 northbound + 放进 wiredFeatures(供 composable 用)。
- `rewriteRuntime.ts`:删 `hydrateDockingTaskHistory` import/调用/函数(batchRegistry 无需 hydrate)。

### 模块5:面板/组件(基本不动)

- `TaskCaseRow.vue`:**零改动**(props 契约 `caseRow` 字段不变,只是类型名从 `PersistedTaskCase` 改 `DockingCaseView`,字段同)。
- `TaskListPanel.vue`:composable 调用参数从 `historyStorage` 换 `batchRegistry`(解构不变,polling 不变)。

## 删除清单

| 文件/符号 | 处理 |
|---|---|
| `command-ingress/services/docking-task-history-storage.ts` | **整文件删** |
| `PersistedTaskBatch`/`PersistedTaskCase`/`LazyDockingTaskHistoryStorage`/`createDockingTaskHistoryStorage` | 删(被 DockingBatchMeta/DockingCaseView/createDockingBatchRegistry 替代) |
| `rewriteRuntime.ts` `hydrateDockingTaskHistory` | 删 |
| `feature-wiring.ts` Lazy holder 接线 | 删 |
| northbound `DockingTaskHistorySink` + 4 接入点写 storage | 删/改 |
| `docking-task-history-storage.spec.ts` | **删**(测的是文件持久化,新方案不持久化) |
| `docking-task-history-integration.spec.ts` | **重写**(接入点改了) |
| `use-docking-task-history.spec.ts` | **重写**(数据源换了) |

## 测试策略

1. **batchRegistry 单测**(新):insertBatch 去重、setInstance 回填、loadAll、clear。照 northbound-state.spec 范式。
2. **composable 单测**(重写):派生 batches(DockingCaseView)、lifecycle→status 映射(各 lifecycle 态含 paused)、resumeCase 转发、progressOf、pause/stop/resume。用 fake taskService(可观测 getInstance 返回不同 lifecycle)。
3. **接入点集成测试**(重写):setTestTask 建 meta + 回填 instanceId(接入点1+2);reportTaskResult/controlTestTask **不再碰 registry**(验证 registry 无变化)。
4. **回归**:northbound-service.spec(现有 setTestTask/controlTestTask 不依赖 registry 的断言全过)、northbound-state.spec(不动)。
5. **TaskCaseRow 渲染**:新增 paused 态渲染测试(恢复按钮),其余四态沿用现有测试改类型名。

## 已知债务/取舍

| 债务 | 取舍 | 触发解决 |
|---|---|---|
| 跨重启批次历史丢失 | 用户明确接受(「麻烦就不要」) | 若以后要历史,重新加持久化(但派生逻辑保留,只持久化 meta) |
| 映射表与实例生命周期不同步(实例被 removeTask 后映射残留) | loadAll 派生时 instanceId 查不到实例 → 标 failed/异常,不崩溃 | removeTask 时清映射(可后续加) |
| 9-Task 的持久化代码作废 | 推翻刚完成的设计,属于架构演进 | 无(docking spec 同步勘误) |

## 与 D004 的关系(确认不变)

D004 三层职责:
- task feature:纯粹执行引擎,不带甲方字段 —— **本设计保持**(`TaskInstanceState` 不加字段)。
- command-ingress:和甲方对接 —— **本设计保持**(batchRegistry 归 command-ingress)。
- northbound:协议层 —— **本设计保持**(northbound 只拿 batchRegistry 引用做接入点1+2,不持有业务规则)。

**D004 无需修订**。批次归属信息在 command-ingress(不在 task),符合「task 不感知甲方」。

## 待实施核对项

1. `stopped` lifecycle 归 `failed` 还是单独显示?(倾向 failed,粒度2 不细分,沿用旧决策)
2. instanceId 查不到实例时标 `failed` 还是 `pending`?(倾向 failed,异常兜底)
3. controlTestTask 的 1:1 覆盖映射(northbound-state mapTaskId 一批多用例只记最后)是否在本轮一并修?(独立 bug,见 docking-history-followup-investigation.md 现象2;倾向**不并入本重构**,单列)
