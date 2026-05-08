---
doc_type: feature-design
feature: 2026-04-23-task-system-creation-entry-ownership
status: draft
summary: 明确任务系统 cut 3 的 creation-entry ownership，只覆盖创建入口输入捕获、任务创建请求与创建时首次启动。
tags: [任务系统, creation-entry, first-start, cut-3, ownership]
---

# task-system-creation-entry-ownership design

## 0. 术语约定

| 术语 | 本文定义 | 防冲突结论 | 证据 |
| --- | --- | --- | --- |
| creation-entry ownership | 任务实例“还未存在”时的入口归口，只覆盖入口暴露、用户/命令输入捕获、任务创建请求，以及创建后立刻发出的首次启动请求。 | 不等于 ongoing control；`cut 2` 明确拥有 already-created task 的控制面。 | `.omx/plans/prd-task-system-followup-2026-04-23.md:88-107`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:45-55` |
| 创建时首次启动 | 与创建同一入口流内、紧跟 `create*Task(...)` 之后的第一次 `startTask(taskId)` 请求。 | 只包含创建流内的 first start，不包含监控面板对既有任务的 `start/retry`。 | `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:259-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:323-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:643-753`, `src/composables/scoe/commands/readFileAndSend.ts:127-157`, `.omx/plans/prd-task-system-followup-2026-04-23.md:101-102`, `.omx/plans/prd-task-system-followup-2026-04-23.md:156-158` |
| already-created task control | 任务实例已经存在之后的 `start/retry`、`pause`、`resume`、`stop`、dialog close / background continue、`waiting-schedule` 控制解释。 | 全部属于 `cut 2`，本文只做显式排除。 | `.omx/plans/prd-task-system-followup-2026-04-23.md:69-87`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-43`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793` |
| lifecycle-end semantics | `stop / completed / remove` 的语义归口，以及“为什么结束、结束后是否保留事实”的判断。 | 全部属于 `cut 1`；本文只允许引用，不允许吸收语义所有权。 | `.omx/plans/prd-task-system-followup-2026-04-23.md:53-68`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:401-426` |

术语 grep 结论：

- `creation-entry` / `first-start` / `already-created task` / `waiting-schedule` 的切分已在 PRD / test spec 中定稿，本文沿用该切分，不另造新词。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:88-107`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:45-55`
- 现有架构/探索文档里已经有“页面/对话框直接拥有任务创建与后台继续运行决策”的表述，因此本文必须显式把“后台继续运行决策”排除到 `cut 2`，避免把 overview 里混在一起的现状继续沿用为新范围。证据：`easysdd/compound/2026-04-23-explore-task-system-module-overview.md:34-35`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:155-163`

## 1. 决策与约束

### 1.1 需求摘要

本 cut 只拥有 creation-entry seam：入口暴露、输入捕获、创建请求、创建时首次启动。这样切分符合已批准的 cut 3 定义，也符合“任务系统是独立能力域，页面/组件只能提供入口并提交意图”的架构方向。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:88-107`, `easysdd/architecture/domain-task-system-ownership.md:93-105`, `easysdd/architecture/domain-task-system-ownership.md:192-216`, `easysdd/architecture/domain-task-system-ownership.md:286-299`

成功标准：

- reviewer 能把 `FrameSendPage` 的三个创建入口、三个任务对话框、以及 SCOE 命令入口归到同一条 creation-entry seam，而不是继续把它们与 monitor/control seam 混看。证据：`src/pages/FrameSendPage.vue:153-183`, `src/pages/FrameSendPage.vue:264-400`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:223-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `src/composables/scoe/commands/readFileAndSend.ts:118-157`
- reviewer 能验证“创建时首次启动”只指 create 后紧接的 `startTask(taskId)`，不包含 monitor 对错误任务的 `start/retry`。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:56-80`, `src/composables/frames/sendFrame/useSendTaskManager.ts:194-202`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:373-378`
- reviewer 能验证本 cut 不吸收 lifecycle-end meaning：即使创建后的执行路径将来进入 `updateTaskStatus(..., 'completed')`，语义归口仍属于 `cut 1`。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:104-107`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:516-519`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:559-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:864-875`, `src/stores/frames/sendTasksStore.ts:401-426`

明确不做：

- 不做 dialog-close behavior。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:99-103`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
- 不做 background-continue decisions。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:99-103`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:216-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:787-793`
- 不做 `pause / resume / stop` 与 `waiting-schedule` control semantics。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:99-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`, `src/composables/frames/sendFrame/useSendTaskController.ts:23-117`
- 不做 already-created task 的 `start/retry`。`cut 2` 拥有已经创建出的任务控制面；本文只拥有 creation-time first start。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:69-87`, `.omx/plans/prd-task-system-followup-2026-04-23.md:156-158`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:373-378`
- 不做 trigger ingress、timer-resource internals。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:103-107`, `src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:627-717`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:792-964`

### 1.2 放置结论

本 feature 应放在“任务系统 creation-entry boundary”而不是页面工作台或 monitor 组件里，因为架构文档已经把页面/组件限制为“提供入口、展示派生状态、提交显式意图”，而当前代码恰恰是在页面/对话框/命令入口里混写了 capture、create、start。本文的设计任务是把这条 ownership seam 说明白，而不是再给任一具体页面加更多局部规则。证据：`easysdd/architecture/domain-task-system-ownership.md:95-105`, `easysdd/architecture/domain-task-system-ownership.md:194-216`, `easysdd/architecture/domain-task-system-ownership.md:286-299`, `src/pages/FrameSendPage.vue:264-400`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:296-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:643-753`, `src/composables/scoe/commands/readFileAndSend.ts:118-157`

### 1.3 关键决策

1. 把 `FrameSendPage -> dialog` 与 `SCOE command` 视为同一类 creation-entry surface，只是 capture 方式不同。
   依据：UI 侧由页面暴露入口并打开三个任务对话框；命令侧直接构造 task instances，但两者最终都走 `useSendTaskManager` 的 create + start 聚合入口。证据：`src/pages/FrameSendPage.vue:153-183`, `src/pages/FrameSendPage.vue:316-323`, `src/composables/scoe/commands/readFileAndSend.ts:118-157`, `src/composables/frames/sendFrame/useSendTaskManager.ts:15-23`, `src/composables/frames/sendFrame/useSendTaskManager.ts:47-80`, `src/composables/frames/sendFrame/useSendTaskManager.ts:194-202`
2. 把 first-start 的 ownership 截止在 `startTask(taskId)` 请求交给 executor 的那一刻；后续进入 `running / waiting-trigger / waiting-schedule / completed / error` 的状态推进，属于其他 cut 的职责边界，不在本文吸收。
   依据：current entry surfaces 只是在 create 后立即调用 `startTask(taskId)`；状态推进由 executor / store 接手。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:259-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:323-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:643-753`, `src/composables/scoe/commands/readFileAndSend.ts:127-157`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-485`
3. 任何 covered path 只要落到 `updateTaskStatus(..., 'completed')`，都必须在文档里声明“lifecycle-end meaning belongs to cut 1”。
   依据：当前 `completed` 立刻触发 `removeTask`，而 `stopTask()` 也会写 `completed`，所以创建入口文档不能越权定义“完成”的含义。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:401-426`

### 1.4 被拒方案

- 把 dialog close / background continue 放进 creation-entry cut。
  拒绝原因：PRD 已将其归入 ongoing control seam；现状代码也证明这些决定发生在关闭对话框和后台继续运行选择处，不属于 create/start request 本身。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:69-87`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
- 把 monitor `start/retry` 视为 first-start 的补充路径。
  拒绝原因：monitor 只处理已存在任务的动作选择；这是 `cut 2` 的“already-created task control”，不是创建流。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:71-87`, `.omx/plans/prd-task-system-followup-2026-04-23.md:156-158`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:373-378`
- 把 create/start 之后的 `completed`、remove、stop meaning 一并在本文定义。
  拒绝原因：这样会直接侵入 `cut 1` 的 hard gate。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:53-68`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`

### 1.5 主流程概述

正常路径：

1. 页面或命令侧暴露 creation entry，并收集当前这次创建所需输入。证据：`src/pages/FrameSendPage.vue:153-183`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:223-257`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-357`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:643-745`, `src/composables/scoe/commands/readFileAndSend.ts:118-133`
2. entry surface 把输入组织成 create request，调用 `createSequentialTask / createTimedTask / createTriggeredTask / createTimedTriggeredTask`，使任务先以 `idle` 事实进入 store。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:47-80`, `src/composables/frames/sendFrame/useSendTaskCreator.ts:28-52`, `src/composables/frames/sendFrame/useSendTaskCreator.ts:65-97`, `src/composables/frames/sendFrame/useSendTaskCreator.ts:108-142`, `src/composables/frames/sendFrame/useSendTaskCreator.ts:153-194`, `src/stores/frames/sendTasksStore.ts:364-385`
3. 同一入口流内可立即提交 first-start request：`startTask(taskId)`。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:270-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:359-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:747-753`, `src/composables/scoe/commands/readFileAndSend.ts:142-157`
4. first-start 被 executor 接手后，任务可能进入 `running`、`waiting-trigger` 或 `waiting-schedule`；这些状态的运行含义、控制含义与结束含义不属于本文。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:499-526`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:754-783`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:899-964`

异常/边界路径：

- create request 失败时，入口应在本地结束并返回 create-failed，不得偷偷落入 monitor/control seam。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-289`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:296-376`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:652-760`, `src/composables/scoe/commands/readFileAndSend.ts:135-147`
- first-start request 失败时，本文只拥有“启动请求失败”的入口层结果，不拥有失败后任务最终生命周期含义。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:270-289`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:359-376`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:747-760`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:477-485`

## 2. 接口契约

### 2.1 creation-entry surface contract

| entry surface | 当前职责 | 本 cut 拥有的契约 | 明确排除 | 证据 |
| --- | --- | --- | --- | --- |
| `FrameSendPage` | 暴露三个任务入口与 monitor 入口 | 只拥有“入口暴露”和“把用户带到具体 creation dialog” | 不拥有 monitor control | `src/pages/FrameSendPage.vue:153-183`, `src/pages/FrameSendPage.vue:264-400` |
| `TimedSendDialog` | 捕获 interval / repeat / target，create timed task，并立刻 start | 拥有 timed create request + creation-time first start request | 不拥有 close/continue/stop | `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:223-299` |
| `TriggerSendDialog` | 捕获 condition/time trigger config，create triggered task，并立刻 start | 拥有 triggered create request + creation-time first start request | 不拥有 trigger ingress after start | `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:269-377`, `src/stores/frames/receiveFramesStore.ts:1127-1139` |
| `EnhancedSequentialSendDialog` | 捕获 sequential / timed / triggered / variable task config，create task，并立刻 start | 拥有 multi-instance create request + creation-time first start request | 不拥有 close/background continue/stop | `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-809` |
| `READ_FILE_AND_SEND` command | 程序化构造 instances，create timed task，并立刻 start | 拥有 command-side create request + creation-time first start request | 不拥有 pre-stop existing task control | `src/composables/scoe/commands/readFileAndSend.ts:118-157` |

### 2.2 示例优先的请求/返回契约

```ts
// 正常路径：timed dialog 在同一入口流内完成 capture -> create -> first start。
// 来源：src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:223-280
{
  entrySurface: 'dialog:timed-send',
  capture: {
    instanceId: '<current-instance>',
    targetId: '<selected-target>',
    intervalMs: 1000,
    repeatCount: 10,
    isInfinite: false,
  },
  createRequest: {
    taskKind: 'timed',
    name: '定时发送-<instance.label>',
    instances: [{ instanceId: '<current-instance>', targetId: '<selected-target>' }],
  },
  firstStartRequest: 'startTask(taskId)',
}
=> {
  create: { ok: true, taskId: '<new-task-id>' },
  firstStart: { ok: true },
}
```

```ts
// 正常路径：trigger dialog 的 creation-time first start 只负责把任务交给 executor，
// executor 之后进入 waiting-trigger 或 waiting-schedule 的运行解释不归本文。
// 来源：src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:317-368
// 来源：src/composables/frames/sendFrame/useSendTaskExecutor.ts:733-783
// 来源：src/composables/frames/sendFrame/useSendTaskExecutor.ts:899-964
{
  entrySurface: 'dialog:trigger-send',
  capture: {
    triggerType: 'condition' | 'time',
    triggerConfig: '<validated-config>',
    targetId: '<selected-target>',
  },
  createRequest: {
    taskKind: 'triggered',
    instances: [{ instanceId: '<current-instance>', targetId: '<selected-target>' }],
  },
  firstStartRequest: 'startTask(taskId)',
}
=> {
  create: { ok: true, taskId: '<new-task-id>' },
  firstStart: { ok: true, handedOffToExecutor: true },
}
```

```ts
// 错误路径：create/start 失败时，返回 entry-layer failure；
// 失败结果属于 creation entry contract，而不是 monitor/control contract。
// 来源：src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-289
// 来源：src/composables/scoe/commands/readFileAndSend.ts:135-147
{
  entrySurface: 'dialog-or-command',
  createRequest: '<invalid-or-failing-request>',
}
=> {
  create: { ok: false, reason: '找不到指定的实例' | '创建发送任务失败' | '启动发送任务失败' },
  firstStart: { ok: false },
}
```

### 2.3 first-start handoff boundary

first-start handoff 的统一边界是：entry surface 负责决定“要不要在创建后立刻提交第一次启动请求”，`useSendTaskManager` 负责把 request 分发到 creator / executor，executor 负责真正的状态推进。这个边界已经在当前代码里存在，只是 ownership 还没被明确写开。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:15-23`, `src/composables/frames/sendFrame/useSendTaskManager.ts:47-80`, `src/composables/frames/sendFrame/useSendTaskManager.ts:194-202`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-485`

边界规则：

- contract 在 `startTask(taskId)` 返回后结束；不继续拥有后续 monitor action。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:194-202`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
- condition-trigger task 的 first-start 只拥有“注册为等待触发的开始动作”，不拥有 receive-side trigger candidate production。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:754-780`, `src/stores/frames/receiveFramesStore.ts:1127-1139`
- time-trigger / timed task 的 first-start 只拥有“进入时间推进的开始动作”，不拥有 `waiting-schedule` 的 control semantics。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:688-717`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:899-964`, `.omx/plans/prd-task-system-followup-2026-04-23.md:99-103`
- 若 first-start 后续路径进入 `updateTaskStatus(..., 'completed')`，必须回到 `cut 1` 的 lifecycle-end meaning。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:516-519`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:559-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:864-875`, `src/stores/frames/sendTasksStore.ts:401-426`

## 3. 实现提示

### 3.1 目标文件状况评估结论

这不是“往某个现成文件补几行逻辑”的 cut，而是一个跨 surface 的 ownership 澄清。当前 creation-entry 事实分散在页面入口、三个对话框、SCOE 命令和 `useSendTaskManager` 聚合入口里；如果后续实现仍按“每个 dialog 各补一点”推进，就会把 creation-entry seam 再次写散。证据：`src/pages/FrameSendPage.vue:153-183`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:223-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `src/composables/scoe/commands/readFileAndSend.ts:118-157`, `src/composables/frames/sendFrame/useSendTaskManager.ts:15-23`

### 3.2 改动计划

1. 先冻结 creation-entry seam 的 owned / excluded vocabulary。
   退出信号：后续实现文档和评审说明都只用“capture / create request / creation-time first start / already-created control / lifecycle-end”这组词，不再混用“后台继续运行”“重试”“结束”来描述同一条 seam。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:88-107`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:45-55`
2. 画清当前 entry surface 矩阵，确保 UI page、dialogs、SCOE command 都能映射到同一 contract。
   退出信号：reviewer 能逐项核对每个 surface 的 capture 输入、create request、first-start request 和 exclusions。证据：`src/pages/FrameSendPage.vue:153-183`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:223-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `src/composables/scoe/commands/readFileAndSend.ts:118-157`
3. 把 creation-time first start 与 already-created task control 明确拆开。
   退出信号：monitor `start/retry`、dialog close/background continue、`pause/resume/stop` 全部被文档或实现说明显式标为 `cut 2`，不再出现在 creation-entry 设计里。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
4. 定义 create -> first-start -> handoff 的单一截止点。
   退出信号：每条 creation flow 都能回答“何时算 creation-entry 已结束”，答案统一为“`startTask(taskId)` 的请求结果返回之后”。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:194-202`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-485`
5. 对所有会继续进入 `completed` 的路径加 lifecycle-end defer 说明。
   退出信号：任何讨论到 `updateTaskStatus(..., 'completed')` 的实施说明都同时声明“meaning owned by cut 1”。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:516-519`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:559-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:864-875`, `src/stores/frames/sendTasksStore.ts:401-426`

### 3.3 实现风险与约束

- 风险 1：SCOE `READ_FILE_AND_SEND` 在 creation flow 里先 `getTaskByName` 再 `stopTask(task.id)`，这已经碰到了 already-created task control，和 cut 3 的排除项冲突。
  约束：后续实现若触到这条路径，必须把“pre-stop existing task”当作 leader review 边界问题处理，不能直接把它吸收进 creation-entry seam。证据：`src/composables/scoe/commands/readFileAndSend.ts:119-127`, `.omx/plans/prd-task-system-followup-2026-04-23.md:99-103`
- 风险 2：time-trigger / timed first-start 很快就会进入 `waiting-schedule`，但 `waiting-schedule` 的 stop / retry / visibility 解释当前已是 control seam。
  约束：本文只能定义“创建后首次交给时间推进”，不能定义“等待执行态如何被控制”。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:688-717`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:899-964`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`
- 风险 3：condition-trigger first-start 之后会依赖 receive-side input 才继续推进。
  约束：本文只能拥有“开始等待触发”的 creation-time first start，不拥有 receive-produced trigger candidate seam。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:754-780`, `src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/stores/frames/sendTasksStore.ts:554-562`
- 风险 4：current code 中 `completed` 既表示自然完成，也被 `stopTask()` 复用。
  约束：creation-entry 文档不能重写“完成”的 meaning，只能把这条依赖显式引用给 `cut 1`。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`

### 3.4 测试设计

功能点 A：entry surface 识别与 scope 守护

- 约束：测试必须覆盖 `FrameSendPage` 三个入口、三个 dialog、以及 SCOE command；同时证明 `ActiveTasksMonitor` 不在本文 scope 内。证据：`src/pages/FrameSendPage.vue:153-183`, `src/pages/FrameSendPage.vue:264-400`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
- 用例骨架：
  - A1：定时/触发/顺序入口都能映射到 creation-entry contract。
  - A2：monitor `start/retry` 被判定为 cut 2，不得作为 creation-time first start 的替代路径。

功能点 B：create request 与 first-start request 的边界

- 约束：每种任务类型都要分别验证 create 与 first-start 是两个连续但不同的动作；失败时能区分 create-failed 与 first-start-failed。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-289`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:296-376`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:643-760`, `src/composables/scoe/commands/readFileAndSend.ts:127-157`
- 用例骨架：
  - B1：sequential create 成功、start 成功。
  - B2：timed create 成功、start 后 handoff 到时间推进。
  - B3：trigger create 成功、start 后 handoff 到等待触发。
  - B4：create 失败时不触发后续 control 语义。

功能点 C：cross-cut exclusion 守护

- 约束：测试说明里必须显式写出“不做 dialog-close / background-continue / pause / resume / stop / already-created start-retry / waiting-schedule control semantics / lifecycle-end semantics”。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:99-107`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:45-55`
- 用例骨架：
  - C1：关闭 dialog 时的 stop/continue 分支被标记为 cut 2 验证，不纳入 cut 3 通过条件。
  - C2：任一进入 `completed` 的路径，都附带“meaning belongs to cut 1”的 review assertion。

功能点 D：SCOE 边界风险

- 约束：单独验证 `READ_FILE_AND_SEND` 的 pre-stop existing task 行为是否已被切出 creation-entry seam；若未切出，则 cut 3 文档评审必须阻塞。证据：`src/composables/scoe/commands/readFileAndSend.ts:119-127`
- 用例骨架：
  - D1：无旧任务时，command 只走 create + first-start。
  - D2：有旧任务时，pre-stop 被识别为 cut 2 / leader review 问题，而不是默认为 cut 3 内容。

## 4. 与项目级架构文档的关系

本文直接承接三份项目级架构文档：

- `DESIGN.md` 负责把 task-system ownership 文档作为架构索引暴露出来，本文不改总入口，只引用其现有索引关系。证据：`easysdd/architecture/DESIGN.md:10-19`
- `domain-task-system-ownership.md` 提供“任务系统是独立能力域、页面/组件只提交意图、生命周期/时间/等待/停止/完成/清理由任务系统归口”的总原则；本文只是把其中的 creation-entry seam 单独切出。证据：`easysdd/architecture/domain-task-system-ownership.md:93-105`, `easysdd/architecture/domain-task-system-ownership.md:192-216`, `easysdd/architecture/domain-task-system-ownership.md:241-317`
- `topology-receive-send-mainlines.md` 提供“接收主链只输出可消费输入、发送主链只消费显式发送请求”的边界；本文因此把 trigger ingress 和 send execution 之后的语义都留在相邻 cut，而不把它们吸收到 creation-entry。证据：`easysdd/architecture/topology-receive-send-mainlines.md:175-201`, `easysdd/architecture/topology-receive-send-mainlines.md:217-239`

当前不需要新增项目级架构文档，因为 architecture direction 已经足够支撑 cut 3 的范围说明；本文只是 feature-level design，把已批准的 seam 写成 execution-ready contract。证据：`easysdd/architecture/DESIGN.md:12-19`, `.omx/plans/prd-task-system-followup-2026-04-23.md:15-21`

后续可能需要的架构文档 follow-up（本文只记录，不执行）：

- 如果后续实现最终引入一个明确命名的 creation-entry adapter / boundary 层，建议在 `domain-task-system-ownership.md` 里补一句“页面/命令 creation entry 如何把 capture/create/start 交给任务系统”。当前文档已有原则，但还没有专门命名这一层。证据：`easysdd/architecture/domain-task-system-ownership.md:103-105`, `easysdd/architecture/domain-task-system-ownership.md:286-299`
- 如果 SCOE 的 pre-stop existing task 需要长期保留，建议在任务系统与 SCOE 边界文档中单列“command-triggered replacement 是 control 还是 creation-precondition”的归口说明；本文先把它标为 leader review boundary，不在 feature doc 里替架构拍板。证据：`src/composables/scoe/commands/readFileAndSend.ts:119-127`, `easysdd/architecture/topology-receive-send-mainlines.md:232-239`
