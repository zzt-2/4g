---
doc_type: feature-design
feature: 2026-04-23-task-system-trigger-input-boundary
status: draft
summary: 明确任务系统 cut 4 中 receive 侧触发候选与 task 侧触发输入之间的边界、非目标与验证口径
tags: [task-system, trigger, boundary, cut-4]
---

## 0. 术语约定

| 术语 | 本文定义 | 防冲突结论 |
| --- | --- | --- |
| 触发候选输入 | 接收主链在解析完成后，交给任务系统判断“是否可能触发”的显式输入边界。它来自接收事实，不等于任务状态本身。 | 这是仓库里已经稳定存在的正式术语，应继续沿用，不另造“trigger event / trigger signal”一套新名字。证据：`easysdd/architecture/domain-task-system-ownership.md:109-112`, `easysdd/architecture/domain-task-system-ownership.md:338-350`, `easysdd/architecture/topology-receive-send-mainlines.md:177-181`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:46-55` |
| 任务消费的触发输入 | 本文的设计性描述，指 cut 4 在边界内把 receive 侧候选整理成 task 侧可直接消费的显式输入后，交给任务系统判断的那一层输入。 | 该说法只在本设计 doc 里作为 cut 4 的局部表述使用，不改写项目级正式名词；架构文档只把“触发输入层”保留为后续可能分层的待决问题。证据：`easysdd/architecture/topology-receive-send-mainlines.md:513-514`, `easysdd/architecture/domain-task-system-ownership.md:549-550` |
| trigger ingress / trigger-input boundary | 本 feature 的英文辅助名，专指 `receiveFramesStore` 产出候选、`sendTasksStore`/`useSendTaskTriggerListener` 消费输入的交界面。 | 该说法只用于 cut 4，不覆盖 creation/control/timer seam。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:56-64` |

术语 grep 结果：

- `trigger input boundary` 在仓库内只出现在本轮 PRD / test-spec 草案链路中，尚无既有 feature design 冲突。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:56-64`
- 中文正式口径已经是“触发候选输入”，而不是“接收链直接触发任务”。证据：`easysdd/architecture/topology-receive-send-mainlines.md:173-181`, `easysdd/architecture/domain-task-system-ownership.md:109-112`
- 归档检索无现成可复用方案，当前 feature 目录也还没有既有 design doc。证据：`python3 easysdd/tools/search-yaml.py --dir easysdd/compound --query "trigger input boundary"` 返回 `No matching documents found.`；`python3 easysdd/tools/search-yaml.py --dir easysdd/features --filter doc_type=feature-design --query "trigger input boundary"` 返回 `No .md files found in easysdd/features`

## 1. 决策与约束

### 1.1 需求摘要

- 本 cut 只定义 trigger ingress：即 receive 侧已经产出的触发候选，如何跨过边界变成 task 侧可消费、可判断、且不再回读 receive 共享状态的显式输入。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`, `easysdd/architecture/domain-task-system-ownership.md:109-112`, `easysdd/architecture/domain-task-system-ownership.md:338-359`
- 成功标准不是“触发逻辑能跑”，而是：task 侧判断触发时不再依赖 `receiveFramesStore.mappings/groups/allReceiveFrameData` 这类共享状态面，而是只消费边界输入。证据：`easysdd/architecture/domain-task-system-ownership.md:345-359`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
- 本 cut 必须保持 planning-only；这里只产出设计口径，不做实现、不改业务代码、不生成 checklist yaml。证据：用户任务约束；`.omx/plans/prd-task-system-followup-2026-04-23.md:31-32`

### 1.2 明确不做什么

- 不定义 lifecycle-end semantics；`stop/completed/remove` 的含义仍归 `cut 1`。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:116-123`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`
- 不吸收 creation ownership，不讨论任务创建入口、首次启动入口、对话框表单采集或 SCOE 创建入口。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:90-106`, `.omx/plans/prd-task-system-followup-2026-04-23.md:116-119`
- 不吸收 control ownership，不讨论 monitor `start/retry`、pause/resume/stop、close/background-continue、`waiting-schedule` 解释权。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:68-88`, `.omx/plans/prd-task-system-followup-2026-04-23.md:123-125`
- 不重做 receive parsing，不改变接收链如何解析数据、归一数据、更新显示面；cut 4 只站在“接收解析已经完成”之后看边界输入。证据：`src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/stores/frames/receiveFramesStore.ts:1186-1228`, `.omx/plans/prd-task-system-followup-2026-04-23.md:119-120`
- 不用“cleanup”泛化问题，不把 scheduling/timer cleanup framing、timer-resource ownership 并入本 cut。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:119-125`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:66-70`

### 1.3 关键决策

#### 决策 A：把 cut 4 放在 receive 产物与 task 入口之间，而不是放进 trigger listener 内部继续回读 receive store

原因：

- 架构已经要求接收主链只输出显式输入，任务系统负责基于该输入推进判断；任务系统不该再回头读接收缓存或共享状态面。证据：`easysdd/architecture/domain-task-system-ownership.md:109-112`, `easysdd/architecture/domain-task-system-ownership.md:345-359`
- 当前代码里，receive 侧先在 `processDataInternal` 后调用 `checkTriggerConditions(...)`，随后通过 `sendTasksStore.handleFrameReceived(...)` 把数据交给 task 侧；但 `useSendTaskTriggerListener` 又回读 `receiveFramesStore.mappings` 做字段解释，说明边界没有真正立住。证据：`src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/stores/frames/receiveFramesStore.ts:1186-1228`, `src/stores/frames/sendTasksStore.ts:554-562`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`

决策：

- cut 4 设计的目标对象不是“新的接收解析器”，而是“显式边界输入”。
- 任何需要读取 receive 侧映射/分组事实的动作，都必须留在边界前或边界适配层，不能继续藏在 task 侧 trigger listener 内部。

#### 决策 B：边界输入必须足以支撑 trigger 判断，但不承担任务生命周期终局解释

原因：

- 架构要求任务系统基于显式输入决定等待、推进、停止或完成，但“完成的语义”本身仍是任务系统生命周期所有权问题，不是 trigger ingress seam 的所有权问题。证据：`easysdd/architecture/domain-task-system-ownership.md:194-216`, `.omx/plans/prd-task-system-followup-2026-04-23.md:116-123`
- 当前 trigger 路径在 `continueListening=false` 时会进入 `sendTasksStore.updateTaskStatus(taskId, 'completed')`，而 store 又会立刻 `removeTask`；这正是 cut 1 的 gate，不允许 cut 4 重新定义其含义。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-293`, `src/stores/frames/sendTasksStore.ts:424-426`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:63-64`

决策：

- cut 4 可以覆盖“哪些输入进入 trigger path”“输入如何被 task 侧消费”，但不能重新解释 `updateTaskStatus(..., 'completed')` 代表什么。
- 如果未来实现中 cut 4 仍经过 `executeTriggerTask -> updateTaskStatus(taskId, 'completed')`，这里只允许做边界输入整理和依赖移除；不允许顺手改写生命周期终局含义。
- lifecycle-end semantics 明确 defer 给 cut 1。

#### 决策 C：本 cut 只建立单一 seam，拒绝把相邻 cut 一起打包

原因：

- PRD 已把 cut 2、3、4、5 拆成相互排斥的 ownership seam；cut 4 失败的主要风险就是顺手把 control/timer 逻辑也带进来。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:68-88`, `.omx/plans/prd-task-system-followup-2026-04-23.md:90-106`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`

决策：

- 本文只回答“什么是 receive-produced trigger candidate”“什么是 task-consumed trigger input”“二者之间哪一步负责翻译语义”。
- 本文不回答“谁能停任务”“谁能重试任务”“谁拥有定时资源”“谁决定 completed 是否删除任务”。

### 1.4 被拒方案

| 方案 | 不采用原因 |
| --- | --- |
| 继续让 `useSendTaskTriggerListener` 在 task 侧通过 `useReceiveFramesStore()` 回读映射并解释字段 | 这与“任务系统只消费显式输入、不回读 receive 共享状态”直接冲突，边界仍然是假的。证据：`easysdd/architecture/domain-task-system-ownership.md:349-359`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183` |
| 把 trigger path 上的 `completed` 行为一起纳入 cut 4 统一整理 | 这会抢 cut 1 的生命周期终局解释权，违反 PRD 和 test-spec 的 rejection rule。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:121-123`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:63-64` |
| 借 cut 4 顺手重做 receive parsing 或 timer cleanup | 这会把单一 seam 扩成多所有权切口，无法通过 cut 4 的 scope 审查。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:116-125` |

### 1.5 主流程概述

正常路径：

1. receive 侧在既有解析完成后拿到 `frameId + sourceId + updatedDataItems`。证据：`src/stores/frames/receiveFramesStore.ts:1127-1139`
2. 当前实现会把这些数据补成 `DataItem[]` 后调用 `sendTasksStore.handleFrameReceived(...)`。证据：`src/stores/frames/receiveFramesStore.ts:1199-1227`, `src/stores/frames/sendTasksStore.ts:554-562`
3. task 侧当前根据 `listener.triggerFrameId/sourceId` 过滤，再用 `fieldId -> receiveFramesStore.mappings -> dataItemId` 的回读链解释条件。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-91`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`

本设计要求的边界变化：

1. receive 侧继续负责“产生候选”，不改它的解析主线。
2. cut 4 只增加一个明确的 ingress contract，把候选整理成 task 侧可直接判断的显式输入。
3. trigger listener 只消费该显式输入，不再直接读取 `receiveFramesStore`。
4. 若后续执行触达 `executeTriggerTask(...)->updateTaskStatus(...,'completed')`，cut 4 只保持现有语义穿透，不声明“completed 到底意味着什么”。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`, `src/stores/frames/sendTasksStore.ts:401-426`

## 2. 接口契约

### 2.1 当前边界现状（问题基线）

当前 receive -> task seam 实际上传的是“帧与数据项更新”，不是“任务系统可独立消费的显式 trigger input”：

```ts
checkTriggerConditions(frameId, sourceId, updatedDataItems)

const dataItems = updatedDataItems.map((item) => {
  const group = groups.value.find((g) => g.id === item.groupId)
  const dataItem = group?.dataItems.find((di) => di.id === item.dataItemId)
  return dataItem ? { ...dataItem, value: item.value, displayValue: item.displayValue } : fallback
})

sendTasksStore.handleFrameReceived(frameId, sourceId, dataItems)
// 来源：src/stores/frames/receiveFramesStore.ts checkTriggerConditions
// 来源：src/stores/frames/sendTasksStore.ts handleFrameReceived
```

task 侧随后又回读 receive store 才能解释 `fieldId`：

```ts
const mapping = receiveFramesStore.mappings.find((m) => m.fieldId === fieldId)
const dataItem = dataItems.find((item) => item.id === mapping.dataItemId)
// 来源：src/composables/frames/sendFrame/useSendTaskTriggerListener.ts findDataItemByFieldId
```

这条链路的问题是：task 侧消费的不是显式输入，而是“receive 侧共享状态 + 一次更新包”的组合。证据：`easysdd/architecture/domain-task-system-ownership.md:349-359`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`

### 2.2 目标契约：一条显式输入边界，两个对象层次

#### A. receive-produced trigger candidate

这是 receive 侧在既有解析完成之后、跨边界之前保留的候选对象。它仍然站在 receive 语义里，只表达“发生了哪些可用于触发判断的接收更新”。

```ts
type ReceiveProducedTriggerCandidate = {
  frameId: string
  sourceId: string
  updates: Array<{
    groupId: number
    dataItemId: number
    value: unknown
    displayValue: string
  }>
}
// 来源：src/stores/frames/receiveFramesStore.ts:1128-1137
// 来源：src/stores/frames/receiveFramesStore.ts:1186-1227
```

约束：

- 该对象只承接“解析已完成后的候选事实”，不承担 receive parsing redesign。
- 它仍可沿用现有 `frameId/sourceId/updatedDataItems` 信息形状，避免 cut 4 变成对接收链的大改。

#### B. task-consumed trigger input

这是 cut 4 需要立起来的 task 侧正式输入。它必须让 trigger listener 在不回读 receive store 的前提下完成匹配与条件判断。

```ts
type TaskConsumedTriggerInput = {
  frameId: string
  sourceId: string
  fieldUpdates: Array<{
    fieldId: string
    dataItemId: number
    value: unknown
    displayValue: string
  }>
}
```

约束：

- `fieldUpdates` 必须是“task 判断真正需要的显式字段语义”，而不是原样把 `groups/mappings/allReceiveFrameData` 暴露给 task 侧。证据：`easysdd/architecture/domain-task-system-ownership.md:345-359`
- 允许 `fieldUpdates` 为空数组；这对应“当前帧到达本身可触发无条件监听”的场景，不能为了字段映射而阻断无条件触发。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:104-110`

### 2.3 边界翻译责任

cut 4 需要新增或显式化的不是“另一套 listener”，而是“候选 -> 输入”的翻译责任：

- 翻译责任可以读取 receive 侧映射事实，因为映射事实本来就属于 receive 侧领域知识。证据：`src/stores/frames/receiveFramesStore.ts:1201-1205`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-169`
- 翻译责任一旦完成，task 侧 listener 就不得再通过 `useReceiveFramesStore()` 补语义。证据：`easysdd/architecture/domain-task-system-ownership.md:349-359`
- `sendTasksStore.handleFrameReceived(...)` 仍可作为 task-domain ingress 门面，但其入参语义必须从“DataItem 包”收敛为“task-consumed trigger input”。证据：`src/stores/frames/sendTasksStore.ts:554-562`

### 2.4 正常路径示例

示例：receive 侧收到某帧更新，边界前是候选，边界后是 task 可直接消费的输入。

```ts
const candidate = {
  frameId: 'frame-17',
  sourceId: 'serial:COM3',
  updates: [
    { groupId: 2, dataItemId: 8, value: 42, displayValue: '42' },
  ],
}

const taskInput = {
  frameId: 'frame-17',
  sourceId: 'serial:COM3',
  fieldUpdates: [
    { fieldId: 'pressure', dataItemId: 8, value: 42, displayValue: '42' },
  ],
}
// 来源：src/stores/frames/receiveFramesStore.ts checkTriggerConditions
// 来源：src/composables/frames/sendFrame/useSendTaskTriggerListener.ts findDataItemByFieldId
```

判定规则：

- frame/source 的匹配仍由 task 侧根据 listener 配置判断。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:76-91`
- 条件判断只使用 `taskInput.fieldUpdates`，不再回头查 `receiveFramesStore.mappings`。这是本 cut 的核心 contract。

### 2.5 主要异常/边界示例

#### 示例 1：无条件监听

```ts
const taskInput = {
  frameId: 'frame-17',
  sourceId: 'serial:COM3',
  fieldUpdates: [],
}
// 只要 frame/source 命中且 listener.conditions 为空，仍允许触发
// 来源：src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:104-110
```

约束：

- cut 4 不能因为“没有 fieldUpdates”就把无条件触发场景误判为失败。

#### 示例 2：某条更新无法解析为 fieldId

```ts
const candidate = {
  frameId: 'frame-17',
  sourceId: 'serial:COM3',
  updates: [
    { groupId: 9, dataItemId: 999, value: 'x', displayValue: 'x' },
  ],
}

const taskInput = {
  frameId: 'frame-17',
  sourceId: 'serial:COM3',
  fieldUpdates: [],
}
```

约束：

- “无法解析为 fieldId”属于边界翻译阶段的可观测 miss，不应再把 task 侧推回 `receiveFramesStore` 自己补齐。
- 对已有带条件监听的任务，这种 miss 最终表现为“相关条件不成立”；对无条件监听，则仍可基于 frame/source 命中。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:126-149`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`

### 2.6 生命周期防串界声明

当前 trigger 执行成功且 `continueListening=false` 时，会走到：

```ts
unregisterTriggerListener(taskId)
sendTasksStore.updateTaskStatus(taskId, 'completed')
// 来源：src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-290
```

本 feature 对这条路径的约束只有两条：

- 可以整理“它之前的输入边界”，不可以重新定义“它之后的 completed 语义”。
- 任何设计说明只要触碰 `updateTaskStatus(..., 'completed')`，都必须重复声明：生命周期终局意义属于 cut 1，不属于 cut 4。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:121-123`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:63-64`

## 3. 实现提示

### 3.1 目标文件状况评估

- 当前 seam 被拆在三处：receive store 负责候选产生，sendTasksStore 只做转发门面，trigger listener 既做条件判断又偷偷回读 receive store。证据：`src/stores/frames/receiveFramesStore.ts:1186-1228`, `src/stores/frames/sendTasksStore.ts:554-562`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-91`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
- 这不是“一个脏函数”的问题，而是 boundary contract 缺席导致职责穿透。当前设计不要求先做结构性重构 feature；它要求先把 seam 明文化，再决定实现落点。

### 3.2 改动计划

1. 先把 receive-produced candidate 与 task-consumed input 的对象边界写死，确保团队评审时讨论的是 seam，而不是某个文件的局部重构。
2. 明确“候选 -> 输入”的翻译责任只出现一次，且它是唯一允许读取 receive 映射事实、同时为 task 侧准备显式字段语义的地方。
3. 收紧 task ingress 门面语义：`sendTasksStore.handleFrameReceived(...)` 保留“任务系统入口”角色，但不再把 `DataItem[] + receive 回读` 当成默认契约。
4. 收紧 trigger listener：它只做 frame/source 命中、条件判断、触发执行桥接，不再直接依赖 `useReceiveFramesStore()`。
5. 为跨 cut 风险补守护：任何实现说明若触达 `completed`、control、timer、receive parsing，都必须回到本设计的 non-goals 重新审查。

### 3.3 实现风险与约束

- 风险 1：把“翻译责任”误做成 receive parsing redesign。
  - 守护：翻译阶段只消费既有 `frameId/sourceId/updatedDataItems` 产物，不重写接收解析主线。证据：`src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/stores/frames/receiveFramesStore.ts:1186-1228`
- 风险 2：为了移除 `receiveFramesStore` 依赖，顺手把 listener/control/lifecycle 一起重构。
  - 守护：cut 4 只拥有 trigger ingress seam，control 属 cut 2，lifecycle-end 属 cut 1，timer resource 属 cut 5。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:68-125`
- 风险 3：把 “fieldId 无法解析” 直接当成 task error。
  - 守护：未解析字段首先是边界输入不足或映射 miss，不自动升级为生命周期错误；是否 error 不是本 cut 的职责。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:126-149`, `.omx/plans/prd-task-system-followup-2026-04-23.md:116-123`
- 风险 4：触发执行路径上现有 `completed` 调用被重新包装成“trigger ingress 的完成定义”。
  - 守护：任何触达该路径的实现只可保持现状或为 cut 1 留接口，不可在 cut 4 宣告新语义。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-293`, `src/stores/frames/sendTasksStore.ts:424-426`

### 3.4 推进顺序

1. 先确认对象边界和非目标。
   - 退出信号：评审者能一句话复述“cut 4 只拥有 receive candidate -> task input 的 seam，且 completed 含义不在这里定义”。
2. 再确认翻译责任的位置与唯一性。
   - 退出信号：评审者能指出唯一允许读取 receive 映射事实的边界点，并确认 task 侧不再需要 `useReceiveFramesStore()`。
3. 再确认 task ingress 门面和 listener 的职责切分。
   - 退出信号：评审者能区分“入口门面负责接收显式输入”“listener 负责消费显式输入并判断条件”。
4. 最后跑跨 cut 守护检查。
   - 退出信号：评审结论能明确排除 cut 1 / 2 / 5 漂移。

### 3.5 测试设计

#### 功能点 A：receive 候选成功翻译为 task 输入

- 测试约束：同一帧更新进入边界后，task 侧判断触发所需字段必须全部来自显式输入，而不是来自 `receiveFramesStore` 共享状态回读。
- 验证方式：围绕 receive -> task ingress 建立契约测试，断言 task 侧消费对象已包含 `fieldId + value + displayValue` 这类最小判断语义。
- 关键用例骨架：
  - 正常条件监听：candidate 中有可解析更新，task input 中出现对应 `fieldUpdates`。
  - 多字段条件：多个字段更新同时进入时，task input 保持同一事件包语义。

#### 功能点 B：无条件监听仍可由 frame/source 命中触发

- 测试约束：`fieldUpdates=[]` 不能破坏空条件监听的默认触发行为。
- 验证方式：在 listener.conditions 为空时，仅凭 frame/source 命中验证 trigger path 仍可继续。
- 关键用例骨架：
  - 命中 frame/source 且无条件：允许进入执行桥接。
  - frame/source 不命中：即使无条件也不进入执行桥接。

#### 功能点 C：映射 miss 不把 task 侧推回 receive store

- 测试约束：当某条更新无法解析为 fieldId 时，task 侧不应为了补齐语义再次读 `receiveFramesStore.mappings`。
- 验证方式：用依赖隔离或桩替身验证 trigger listener 的判断输入来自边界对象，而不是外部 store。
- 关键用例骨架：
  - 有条件监听 + miss：条件不成立，但无额外 receive store 访问。
  - 无条件监听 + miss：仍可基于 frame/source 命中继续。

#### 功能点 D：生命周期防串界

- 测试约束：若 trigger path 仍到达 `updateTaskStatus(..., 'completed')`，cut 4 相关测试只能验证“边界输入不越界”，不能验证或声明 `completed` 新含义。
- 验证方式：把该路径列为 regression guard，而不是新语义断言。
- 关键用例骨架：
  - `continueListening=false` 的既有路径仍可走通，但测试说明里显式标注“生命周期终局语义归 cut 1”。

## 4. 与项目级架构文档的关系

- 本设计直接继承两份架构口径：
  - `easysdd/architecture/topology-receive-send-mainlines.md` 对接收主链“只输出显式输入”的要求。证据：`easysdd/architecture/topology-receive-send-mainlines.md:177-181`, `easysdd/architecture/topology-receive-send-mainlines.md:483-487`
  - `easysdd/architecture/domain-task-system-ownership.md` 对任务系统“只消费显式输入、不回读 receive 共享状态”的要求。证据：`easysdd/architecture/domain-task-system-ownership.md:109-112`, `easysdd/architecture/domain-task-system-ownership.md:338-359`, `easysdd/architecture/domain-task-system-ownership.md:549-550`
- 本设计同时继承 overview 的现状结论：当前代码的真实问题不是“没触发”，而是 receive 链直接推进 trigger 检查、task 侧再回读 receive 映射，导致边界未显式化。证据：`easysdd/compound/2026-04-23-explore-task-system-module-overview.md:46-55`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:307-308`
- 当前不修改架构文档，但需要为 leader 记录一个后续观察项：
  - 若 cut 4 设计后续被采纳并实施，项目级架构文档可能需要补一条更窄的 follow-up，明确“触发候选输入”与“任务消费的触发输入”之间是否需要作为正式二级层次写入任务系统内部边界说明；现阶段只保留为后续可能的 architecture follow-up，不在本 feature 中直接落文。证据：`easysdd/architecture/topology-receive-send-mainlines.md:201-202`, `easysdd/architecture/topology-receive-send-mainlines.md:513-514`, `easysdd/architecture/domain-task-system-ownership.md:402-402`
