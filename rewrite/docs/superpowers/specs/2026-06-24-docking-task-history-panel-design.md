# 中心对接任务批次历史面板设计

> 2026-06-24 | 状态:待审 | 关联 topic: `2026-05-18-northbound-integration`
> 关联 session 笔记: S017(setTestTask/getTestCaseAll 闭环跑通)

## 背景与问题

中心对接页的 `TaskListPanel.vue` 名为"任务列表",实际是一个 `DataTable`,每行显示**一个活跃实例**(instanceId / lifecycle / startedAt + 停止按钮)。存在两个问题:

1. **名实不符**:面板叫"任务列表",但展示的语义粒度是"实例",而中心对接的心智单位是"任务批次"(一次 setTestTask 下发 = 一个任务 T_xxx,含若干用例)。用户原话:"现在匹配的是实例,并不是任务"。
2. **无历史**:实例跑完即从面板消失(实例结束),无法回看"之前中心下发过哪些任务、各自结果如何"。

## 目标

把 `TaskListPanel.vue` 从"活跃实例表"改造成**按任务批次分组、可收放、带历史的列表**:

- 一级 = 任务批次(仿 `CatalogMappingPanel.vue` 的 `q-expansion-item` 语言),按时间倒序
- 二级(展开)= 该批次下的用例,每个用例行根据状态显示不同内容
- **进行中**用例:内联进度条 + 控制按钮(暂停/停止),复用 `TaskExecutionDetail.vue` 的进度与控制逻辑
- **已完成/失败**用例:结果徽章 + 耗时 + "详情"跳转(到执行监控页那条实例记录)
- **待执行**用例:用例名 + 等待标记,无操作
- 历史持久化(粒度 2):存批次元信息 + 每用例结果摘要,不存逐步骤明细

## 不做(YAGNI)

- ❌ 不存完整 stepResults(粒度 3)—— 文件膨胀、字段过多,收益低。完成后逐步详情靠跳转现有执行监控页。
- ❌ 不在面板内编辑任务/用例(只读浏览 + 进行中控制)。编辑入口仍在执行监控页/模板页。
- ❌ 不做"任务批次"的筛选/搜索/分页 —— 量级未到(中心下发频率低),等真有需求再加。
- ❌ 不改现有 `t_ftp_server`/`t_file_trans_record` 交互(那是甲方侧表,我方只上报)。
- ❌ 不改 setTestTask/resultReport 的对外协议(纯叠加内部持久化,不动报文)。

## 数据模型

### 任务批次记录(PersistedTaskBatch)

```ts
interface PersistedTaskBatch {
  readonly taskId: string;           // 'T_178022737246337558'(setTestTask.taskId)
  readonly taskName: string;         // setTestTask.taskName
  readonly receivedAt: number;       // 收到 setTestTask 的时间戳(ms)
  readonly status: 'running' | 'completed' | 'partial-failed' | 'failed';
  readonly cases: readonly PersistedTaskCase[];
}

interface PersistedTaskCase {
  readonly testCaseId: string;       // testCaseInfo.testCaseId(关联 instance 的键)
  readonly caseName: string;         // 从 catalog 映射查得的用例名;查不到回落用 testCaseId
  readonly status: 'pending' | 'running' | 'passed' | 'failed';
  readonly instanceId: string | null; // setTestTask 后创建实例时填入;完成前可能为 null
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null; // finishedAt - startedAt
}
```

**`status` 语义(批次级)**:
- `running`:至少一个用例在 pending/running
- `completed`:所有用例 passed
- `partial-failed`:部分 passed、部分 failed(无 running/pending)
- `failed`:全部 failed(无 running/pending)

**用例名来源决策**:executionPlan.layers[].nodes 的节点是 `{id, name?, type?}`,但**不带业务用例名**(那是 catalog 里的 caseName)。caseName 从 catalog 映射表(`CatalogMapping`,已有持久化)按 testCaseId 查;查不到回落用 testCaseId 原样显示。这样不依赖解析报文里的 name 字段(它可能是节点名非用例名)。

### executionPlan 与 testCaseInfo 的关联(关键,易错)

`SetTestTaskRequest` 里有两个数组,**不是一一对应**,要靠 id 关联:

- `executionPlan.layers[].nodes[]`:节点可以是 `string` 或 `{id, name?, type?}`,`id` = testCaseId
- `testCaseInfo[]`:每个元素带 `testCaseId` + `inputPars` + 可选 `deviceIds`/轨道信息等

**建批次时**:
1. 遍历 `executionPlan.layers` 所有 node(按 layer 升序,保证 cases 数组顺序 = 拓扑序 = 执行顺序),提取 testCaseId(字符串节点取本身,对象节点取 `.id`)
2. 对每个 testCaseId,从 `testCaseInfo[]` 找到对应项(按 testCaseId 匹配)补全;匹配不到仍记录该用例(用 testCaseId 做 caseName 回落)
3. node 的 `layer`/`parallel` 信息**不入库**。理由(已用真实拓扑报文核实,非 YAGNI 砍除):
   - **layer 编号承载依赖拓扑**:甲方按 `node.layer = max(所有前驱的 layer) + 1` 编号(实测:加一条 5G LDPC→1.25G RS 依赖后,1.25G RS 从 layer2 跳到 layer3)。
   - 因此 `processLayers` 的 barrier 语义(本层全完才下层)是**正确的**,不是 bug——它靠 layer 编号 + 屏障完整表达了 DAG,**报文不需要 edges 字段**。
   - 历史列表只看"这次下了哪些用例 + 各自结果",不承担依赖可视化(那是执行监控实时页的职责)。且 cases 数组按 layer 升序遍历,平铺顺序天然 = 拓扑序 = 执行顺序,用户视觉顺序合理。
   - `parallel` 字段亦不入库:它表示"本 layer 内 node 互不依赖可并行启动",对历史结果展示无意义。

## 持久化(照 docking-file-storage 范式)

新建 `command-ingress/services/docking-task-history-storage.ts`,完全照搬 `docking-file-storage.ts`:

- **文件**:`state/docking-tasks.json`
- **payload**:`{ version: 1, taskBatches: PersistedTaskBatch[] }`
- **同步读(内存缓存)+ 异步写(fire-and-forget)**:`loadAll()` / `saveAll()`
- **hydrate**:`readJsonWithBackup` + `.bak` 损坏恢复 + schema version 校验(version-high / malformed → onDataLoss)
- **Lazy holder**:`LazyDockingTaskHistoryStorage`(照 `LazyDockingStorage`),wireFeatures 初始注入空 delegate,bootstrap 异步 setDelegate 真实例
- **不做 localStorage 迁移**:这是新数据,无旧 localStorage 后端可迁(首次启动文件不存在 = 空数组)
- **写入触发点**(见下"数据接入点")
- **无上限滚动**(暂不做):批次记录小(每批次几 KB × N 批次),中心下发频率低,先不做滚动清理。记为已知债务,若 prod 文件膨胀再加(参照 D010 排除的"records 滚动上限"同类决策)。

## 数据接入点

批次记录的生命周期与现有 setTestTask → resultReport 链路**叠加**,不动现有报文/映射逻辑。

### 接入点 1:handleSetTestTask(northbound-service.ts:311)

收到 setTestTask、**创建实例之前**,建一条批次记录:

```
1. 解析 executionPlan + testCaseInfo → PersistedTaskCase[](全部 status: 'pending')
2. 建 PersistedTaskBatch { taskId, taskName, receivedAt: Date.now(), status: 'running', cases }
3. storage.saveAll([新批次, ...现有批次])  // 新批次插到最前
```

**幂等保护**:若 taskId 已存在(重复下发/重试),不重复插入(按 taskId 去重,保留首次)。

### 接入点 2:实例创建时

`handleSetTestTask` 遍历用例、调 task-service 创建实例时,**回填 instanceId**。实施前需核对 `handleSetTestTask`(northbound-service.ts:311)当前如何遍历 testCaseInfo 调 createInstance —— 是同步返回 instanceId 还是异步。本接入点假设同步返回(若异步,回填改为 then 回调内):

```
对每个用例 testCaseId:
  instanceId = taskService.createInstance(...)
  state.mapTestCase(testCaseId, instanceId)    // 现有逻辑,不动
  state.mapTaskId(instanceId, taskId)          // 现有逻辑,不动
  // 新增:更新批次记录里该用例
  storage.updateCase(taskId, testCaseId, { instanceId, status: 'running', startedAt: Date.now() })
```

### 接入点 3:reportTaskResult(northbound-service.ts:170)

每个用例跑完上报结果时,**更新批次记录**:

```
1. verdict = resultService.collectResult(instance)  // 现有逻辑
2. storage.updateCase(taskId, testCaseId, {
     status: verdict.passed ? 'passed' : 'failed',
     finishedAt: Date.now(),
     durationMs: finishedAt - startedAt
   })
3. 若该批次所有用例都不再 running/pending → 重算批次 status(completed/partial-failed/failed)
4. // 现有的 removeMapping 逻辑不动(state.removeMapping 仍清临时映射;批次记录独立持久化,不受影响)
```

**关键**:现有 `state.removeMapping(testCaseId)` / `removeTaskIdMapping(instanceId)` 仍照常清临时映射,**不影响批次持久化记录**。批次记录是独立存储,任务结束后保留。

### 接入点 4:controlTestTask(可选,进行中控制)

`controlTestTask`(pause/continue/stop/abort)语义上影响进行中用例状态。stop/abort 后用例应标记为 failed(或新增 'aborted' 状态?粒度 2 倾向不细分,统一归 failed 并在结果里体现)。

**本次范围**:controlTestTask 的批次记录更新**纳入**(stop/abort → 对应用例 status: failed,重算批次 status),保证面板状态与实际一致。

## UI 结构(方案 B + B1)

### 组件改造:`TaskListPanel.vue`

完全重写 template,逻辑层用新 composable。布局照 CatalogMappingPanel 的 `q-expansion-item` 语言。

```
<div class="docking-task-history">          ← flex:1 1 0; min-height:0; overflow-y:auto(D007/D011 钳制)
  <q-expansion-item
    v-for="batch in batches"                ← 按 receivedAt 倒序
    :key="batch.taskId"
    :default-opened="batch.status === 'running'"   ← 进行中默认展开
  >
    <template #header>
      <批次头部>                              ← taskId 截断 + taskName + 状态徽章 + 进度计数
    </template>

    <用例列表>
      <TaskCaseRow                           ← 新子组件
        v-for="c in batch.cases"
        :testCaseRow="c"
        @pause / @stop / @view-detail        ← 事件
      />
    </用例列表>
  </q-expansion-item>
</div>
```

### 批次头部字段

| 元素 | 内容 | 备注 |
|---|---|---|
| taskId | `T_1782...`(截断) | tooltip 显示完整 |
| taskName | 任务名 | 主文本 |
| 状态徽章 | ●进行中 / ✓完成 / ⚠部分失败 / ✗失败 | 仿 CatalogMappingPanel badge 配色 |
| 进度计数 | `完成数/总数`(如 3/6) | 进行中显示;完成显示最终结果比 |
| 时间 | receivedAt 简短显示(如 "06-24 14:10") | 次要信息 |

### 用例行子组件:`TaskCaseRow.vue`(新建)

**B1:进行中用例内联进度 + 控制按钮**

```vue
<q-item>
  <q-item-section avatar>
    <状态图标>  ← pending:○ / running:⟳ / passed:✓ / failed:✗
  </q-item-section>

  <q-item-section>
    <q-item-label>{{ caseName }}</q-item-label>
    <q-item-label caption v-if="status === 'running'">
      <!-- 进行中:内联进度条(复用 TaskExecutionDetail 的进度计算)-->
      <q-linear-progress :value="progressPct" />
      <span>{{ progressLabel }}</span>     <!-- 如 "7/15" 或 "2/3 步" -->
    </q-item-label caption>
    <q-item-label caption v-else-if="finished">
      <耗时>  <!-- "01:23" -->
    </q-item-label>
  </q-item-section>

  <q-item-section side>
    <!-- 进行中:控制按钮 -->
    <div v-if="status === 'running'" class="row no-wrap">
      <q-btn flat round icon="pause" @click="$emit('pause')" />
      <q-btn flat round icon="stop" @click="$emit('stop')" />
    </div>
    <!-- 已完成:跳转按钮 -->
    <q-btn v-else flat dense icon="open_in_new" @click="$emit('view-detail')">
      详情
    </q-btn>
    <!-- pending:无操作 -->
  </q-item-section>
</q-item>
```

**进度条数据来源(复用,不重造)**:`TaskExecutionDetail.vue` 现有的 `progressPct` / `progressLabel` computed 逻辑(基于 `TaskProgress` 双维度 sends/steps,D004),抽成共享 composable 或纯函数,被 `TaskCaseRow` 和 `TaskExecutionDetail` 共用。**不复制粘贴。**

### 控制事件链(进行中用例)

`TaskCaseRow` emit pause/stop → `TaskListPanel` 调 composable → composable 调 task-service 的现有控制 API(暂停/停止实例)。**复用现有控制逻辑,不新增。**

### 跳转(已完成用例"详情")

`TaskCaseRow` emit view-detail → `TaskListPanel` 通过 router 跳转到执行监控页,**定位到该 instanceId 的记录**。具体跳转目标取决于现有路由结构(执行监控页/历史页是否支持按 instanceId 定位 —— 设计阶段需确认路由参数)。

**设计待确认项(实施时核对)**:执行监控页/历史页现有路由是否接受 `instanceId` query 参数做定位?若不支持,本次需补一个最小跳转(到执行监控页即可,不做精确定位),或扩展现有路由。**倾向最小跳转**,精确定位列为后续。

## 命名与职责划分

### 命名

- **`TaskListPanel.vue`** → 重命名(或保留文件名改标题)。"任务列表"语义对齐了(现在确实是任务批次),可保留。**倾向保留文件名,标题改"中心下发任务"**。
- 新子组件 `TaskCaseRow.vue`(放 docking/components/)。
- 新 storage `docking-task-history-storage.ts`。
- 新 composable `use-docking-task-history.ts`(面板的数据源 + 控制动作)。

### 与现有实例表/执行监控页的职责划分

| 地方 | 职责 | 是否区分中心下发 |
|---|---|---|
| **TaskListPanel(本设计)** | 中心下发任务的批次视图:历史 + 进行中控制 | **仅中心下发**(数据源 = docking-task-history-storage) |
| 执行监控页(ActiveTaskTable/HistoryTaskTable) | 所有实例(本地手动建 + 中心下发),逐步骤详情 | 不区分(全部实例) |
| 模板页(TemplateList) | 模板编辑 | 不涉及实例 |

**关键**:TaskListPanel 改造后**只显示中心下发的任务批次**,不再混入本地手动建的实例。本地实例仍走执行监控页。这正好解决"匹配的是实例不是任务"——中心下发的在 TaskListPanel(任务批次视角),所有实例在执行监控页(实例视角)。

## 规范遵守(D007/D011)

- 外层容器 `flex:1 1 0; min-height:0; overflow-y:auto`(q-expansion-item 全量渲染会撑开,必须钳制 —— D007)
- 不靠 `max-height:100%`(D007 撑开陷阱)
- 实施时若遇高度问题,**先用浏览器 DevTools 实测 computed height 逐环验证**,不凭读代码猜(D011)

## 测试策略

- **storage 单测**(`docking-task-history-storage.spec.ts`):照 `docking-file-storage.spec` 范式 —— hydrate ok/recovered/corrupted/missing/version-high/malformed 各路径、saveAll 原子写、去重插入、updateCase 局部更新。
- **composable 单测**(`use-docking-task-history.spec.ts`):数据源(批次列表排序)、控制动作(pause/stop 转发)、状态映射。
- **接入点集成测试**:mock setTestTask 报文 → 验证批次记录建入;mock reportTaskResult → 验证用例状态更新 + 批次 status 重算;controlTestTask stop → 用例标 failed。
- **UI 组件测试**:`TaskCaseRow` 四种状态渲染(pending/running/passed/failed)+ 事件 emit。
- **回归**:现有 northbound-service / northbound-state spec 全过(接入是叠加,不动既有逻辑)。

## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|---|---|---|---|
| 批次记录无滚动上限 | 文件不应无限膨胀 | 每批几 KB × 低频下发,短期可控 | prod 实测文件膨胀,或下发频率显著上升 |
| 跳转精确定位未做 | YAGNI | 最小跳转(到执行监控页即可) | 用户反馈需要直接定位到具体实例 |
| controlTestTask abort 细分状态 | 粒度 2 不细分 | abort 统一归 failed | 用户需要区分"中止"vs"失败" |
| 执行拓扑(layer DAG)不在历史列表可视化 | 职责划分:历史看结果,拓扑归实时页 | 平铺顺序 = layer 升序 = 拓扑序,视觉合理 | 用户要在历史回看时理解"谁依赖谁" |

## 协议事实(layer 编号承载依赖拓扑——重要,勿误判为 processLayers bug)

经真实报文核实(2026-06-24,顺序 + 混合并发两份):

- `executionPlan.layers[].layer` 编号 = `max(该 node 所有前驱的 layer) + 1`(拓扑层级)。
- 实测铁证:加一条 `5G LDPC → 1.25G RS` 依赖边后,`1.25G RS` 的 layer 从 2 跳到 3(它有两个前驱:2.5G LDPC@L1、5G LDPC@L2 → max+1=3)。
- 因此报文**不需要 edges/dependency 字段**:layer 编号 + barrier 执行语义已完整表达 DAG。
- **`processLayers`(northbound-service.ts:331)的 barrier 语义是正确的**:本层全完才下层 = 保证所有前驱完成。这不是 bug,勿改。
- `parallel:true` = 本 layer 内 node 互不依赖;`parallel:false` = 本层内串行。两者对跨层 barrier 拓扑正确性无影响。

## 风险与缓解

- **风险:executionPlan.nodes 与 testCaseInfo 关联错位** → 缓解:建批次时严格按 testCaseId 关联,匹配不到仍记录(不丢用例),加测试覆盖"关联缺失"场景。
- **风险:进行中用例内联控制挤占行高** → 缓解:用 q-item紧凑模式 + 图标按钮,实施时实测行高可接受;若不行退化为 B2(已在设计中标为退路)。
- **风险:storage 写入在 reportTaskResult 热路径** → 缓解:fire-and-forget 异步写(照范式),不阻塞上报;每批次只有 N 个用例 × 几次更新,写入频率低。

## 不确定项(实施前需核对)

1. 执行监控页/历史页路由是否接受 instanceId query 定位?(决定跳转是精确定位还是最小跳转)
2. controlTestTask 的 stop/abort 在现有代码里如何落到实例?(确认接入点 4 的实现路径)
3. catalog 映射查 caseName 的 API 是什么?(确认 caseName 来源接入)
