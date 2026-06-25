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
| **查不到实例**(实例已被 removeTask 清掉/映射残留) | `failed` | 异常兜底:正常不会出现(createAndStartTask 建实例后映射才回填 instanceId);若出现视为异常,标 failed + 不崩溃。**已拍板(不再列待核对)** |

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
- **接入点3**(reportTaskResult 内的批次历史写入):**删除函数内 historyStorage 相关逻辑**(northbound-service.ts:204-220 约 15 行:loadAll 反查 + updateCase + recomputeBatchStatus)。**reportTaskResult 函数本身保留**——它还负责上报甲方 testCaseResultReport(L222)、上传 TestReport(L225)、清映射(L227-228),这些全部不动。用例结果改由面板从实例 lifecycle 实时派生,不需要写。
- **接入点4**(handleControlTestTask 内的批次历史写入):**删除函数内 historyStorage 相关逻辑**(northbound-service.ts:507-520 约 14 行)。**handleControlTestTask 函数本身保留**——它调 taskService.stopTask/pauseTask/resumeTask(L495/515/518)是核心,保留;面板从实例 lifecycle 自动反映。
- northbound 需要 `batchRegistry` 注入(新选项,替代 `historyStorage`)。

### 模块4:runtime wiring 改造

- `feature-wiring.ts`:
  - 删 `LazyDockingTaskHistoryStorage` import(L41)/构造(L107)/注入 northbound(L211)/导出(L233)。
  - `RewriteWiredFeatures` 接口:**删字段** `readonly dockingTaskHistoryStorage: LazyDockingTaskHistoryStorage`(L86),**加字段** `readonly batchRegistry: DockingBatchRegistry`。
  - 返回对象同步改:删 `dockingTaskHistoryStorage`、加 `batchRegistry: createDockingBatchRegistry()`。
  - 注入 northbound 的选项:`historyStorage` 删,加 `batchRegistry`。
- `rewriteRuntime.ts`:删 `hydrateDockingTaskHistory` import(L17)/调用(L184)/函数(L360-385)(batchRegistry 纯内存,无需 hydrate)。
- `feature-wiring.spec.ts`:核对(`RewriteWiredFeatures` 接口变了,若有断言引用 dockingTaskHistoryStorage 需改)。

> 注:task feature 自己的 `TaskHistoryStorage`(task-service.ts:83/93/123-129,实例历史持久化 `rw-task-history`)与本次删的 `DockingTaskHistoryStorage` 同名不同物,**勿误删 task 的 historyStorage**。

### 模块5:面板/组件

- `TaskCaseRow.vue`:**非零改动**(新增 paused 态渲染)。props 类型 `caseRow` 从 `PersistedTaskCase` 改 `DockingCaseView`(字段名相同:testCaseId/caseName/instanceId/status/durationMs,但 status 联合从 4 态变 5 态含 paused)。template 新增 paused 分支:显示「恢复」按钮(替代 running 态的「暂停」按钮)+ 进度条可显示「已暂停」文案。emit 新增 `resume: []`(对应恢复按钮)。import 源从 `docking-task-history-storage` 改到新类型定义处。
- `task-case-display.ts`:**要改**(spec 自检发现遗漏文件)。`TASK_CASE_STATUS_MAP` 加 `paused` 项(label「已暂停」/color `warning`/icon 如 `o_pause_circle`);import 源从 `PersistedTaskCase['status']` 改 `DockingCaseStatus`;`isCaseFinished` 不加 paused(paused 非终态,应显示恢复按钮而非详情跳转,保持现状逻辑正确)。
- `TaskListPanel.vue`:composable 调用参数从 `runtime.features.dockingTaskHistoryStorage` 换 `runtime.features.batchRegistry`(见模块4 接口字段);新增 `onResumeCase` 转发 `resumeCase`;`@resume` 事件接 TaskCaseRow。polling 不变。
- `task-case-display.spec.ts`:**要改**。原断言「四种状态都有映射(无遗漏)」需扩成五种(含 paused)。

> 自检纠正:初稿误写「TaskCaseRow 零改动」。实际新增 paused 态必然触发 TaskCaseRow + task-case-display.ts + 其 spec 的联动改动(恢复按钮/resume emit/状态映射/import 源)。这三个文件是 spec 初稿遗漏的受影响文件。

## 删除清单

| 文件/符号 | 处理 |
|---|---|
| `command-ingress/services/docking-task-history-storage.ts` | **整文件删** |
| `PersistedTaskBatch`/`PersistedTaskCase`/`LazyDockingTaskHistoryStorage`/`createDockingTaskHistoryStorage` | 删(被 DockingBatchMeta/DockingCaseView/createDockingBatchRegistry 替代) |
| `rewriteRuntime.ts` `hydrateDockingTaskHistory` | 删 |
| `feature-wiring.ts` Lazy holder 接线 + `RewriteWiredFeatures.dockingTaskHistoryStorage` 字段 | 删(换 batchRegistry 字段) |
| northbound `DockingTaskHistorySink` + 接入点3/4 写 storage 逻辑 | 删(reportTaskResult/handleControlTestTask 函数本身保留) |
| `docking-task-history-storage.spec.ts` | **删**(测的是文件持久化,新方案不持久化) |
| `docking-task-history-integration.spec.ts` | **重写**(接入点改了) |
| `use-docking-task-history.spec.ts` | **重写**(数据源换了 + port 契约变) |
| **`command-ingress/components/docking/task-case-display.ts`** | **改**(import 源 + TASK_CASE_STATUS_MAP 加 paused;自检发现遗漏) |
| **`command-ingress/components/docking/TaskCaseRow.vue`** | **改**(paused 分支 + 恢复按钮 + resume emit;自检纠正「零改动」误判) |
| **`command-ingress/__tests__/task-case-display.spec.ts`** | **改**(四态断言扩五态;自检发现遗漏) |
| **`runtime/__tests__/feature-wiring.spec.ts`** | **核对**(RewriteWiredFeatures 接口字段变了) |

## 测试策略

1. **batchRegistry 单测**(新):insertBatch 去重、setInstance 回填、loadAll、clear。照 northbound-state.spec 闭包 Map 范式。
2. **composable 单测**(重写 + fake 重造):派生 batches(DockingCaseView)、lifecycle→status 映射(各 lifecycle 态含 paused)、resumeCase 转发、progressOf、pause/stop/resume。**注意:现有 fake `makeFakeTaskService` 的 getInstance 写死返回 undefined/单一 lifecycle,不支持「按 instanceId 返回不同 lifecycle」。需新造一个 fake:按 instanceId 映射到不同 lifecycle 实例**,才能覆盖映射表的 6 个 lifecycle 分支。port 契约变更(getInstance 要返回含 lifecycle/时间戳的完整实例)导致现有 fake 整体重造,非照搬。
3. **接入点集成测试**(重写):setTestTask 建 meta + 回填 instanceId(接入点1+2);**验证 reportTaskResult/controlTestTask 不再碰 registry**(registry 无变化)—— 因接入点3/4 的批次写入逻辑已删。
4. **回归**:northbound-service.spec(现有 setTestTask/controlTestTask 不依赖 registry 的断言全过)、northbound-state.spec(不动)。
5. **TaskCaseRow 渲染**(改):新增 paused 态渲染测试(恢复按钮 + resume emit);类型名从 PersistedTaskCase 改 DockingCaseView。
6. **task-case-display.spec.ts**(改):原「四种状态都有映射」断言扩成五种(含 paused)。

## 已知债务/取舍

| 债务 | 取舍 | 触发解决 |
|---|---|---|
| 跨重启批次历史丢失 | 用户明确接受(「麻烦就不要」) | 若以后要历史,重新加持久化(但派生逻辑保留,只持久化 meta) |
| 映射表与实例生命周期不同步(实例被 removeTask 后映射残留) | loadAll 派生时 instanceId 查不到实例 → 标 failed/异常,不崩溃 | removeTask 时清映射(可后续加) |
| 9-Task 的持久化代码作废 | 推翻刚完成的设计,属于架构演进 | 无(docking spec 同步勘误) |

## 与 D004 的关系(确认不变,附边界辩护)

D004 三层职责:
- task feature:纯粹执行引擎,不带甲方字段 —— **本设计保持**(`TaskInstanceState` 不加字段)。
- command-ingress:和甲方对接 —— **本设计保持**(batchRegistry 归 command-ingress)。
- northbound:协议层 —— **本设计保持**(northbound 只拿 batchRegistry 引用做接入点1+2)。

**D004 无需修订**。批次归属信息在 command-ingress(不在 task),符合「task 不感知甲方」。

**边界辩护(自检提出,此处回应)**:D004 对 northbound 的定位是「不持有业务规则,规则从 command-ingress 传入」。接入点1 在 northbound 的 `handleSetTestTask` 内解析 executionPlan、组装 DockingBatchMeta——这里「解析甲方报文」是**协议层本职**(northbound 本来就负责 setTestTask 的报文解析,旧实现也如此),不是「业务规则」。对比 D004 落地的 catalog 映射(setCatalogMappings 由 command-ingress 喂入):catalog 的「哪些模板上报/可覆盖哪些字段」是业务规则,归 command-ingress;而 batchRegistry 的**实例**归 command-ingress,northbound 只是在解析报文时往里写 meta(协议层职责)。这条张力在旧 spec 接入点1 就存在(本重构没让它变好或变坏),D004 原本就接受 northbound 解析 executionPlan。故「D004 不变」成立。

## 待实施核对项

1. controlTestTask 的 1:1 覆盖映射(northbound-state mapTaskId 一批多用例只记最后)是否在本轮一并修?(独立 bug,见 docking-history-followup-investigation.md 现象2;倾向**不并入本重构**,单列)

> 已拍板项(不再列待核对):
> - `stopped` lifecycle → 归 `failed`(粒度2 不细分,沿用旧接入点4 决策;映射表 L87/L91 已写死)。
> - instanceId 查不到实例 → `failed`(异常兜底;映射表 + 已知债务表均写死)。

> 自检已闭合项:instanceId 查不到实例 → 已拍板 `failed`(映射表 + 已知债务表均写死,不再列待核对)。
