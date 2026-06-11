---
doc_type: feature-design
feature: 2026-04-23-task-system-timer-resource-ownership
status: draft
summary: 任务系统 cut 5 方案，限定 timer-resource ownership 的资源边界，不吸收生命周期终态或控制语义
tags: [task-system, timer, ownership, scheduling, lifecycle-boundary]
---

## 0. 术语约定

### 0.1 timer-resource ownership

定义：本文中的 `timer-resource ownership` 只指“任务为了等待调度/时间推进而占用、登记、释放哪些定时资源，以及这些资源句柄由谁统一持有”；它不指 `waiting-schedule` 的生命周期含义，更不指 `completed` 的终态含义。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:129-141`, `easysdd/architecture/domain-task-system-ownership.md:198-200`, `easysdd/architecture/domain-task-system-ownership.md:312-317`

防冲突结论：架构文档已经稳定使用“时间推进”“定时器桥接”来描述任务时间语义与资源载体，PRD 在此基础上把 cut 5 命名为 `timer-resource ownership`；本文沿用该命名，不另造“调度清理归口”“timer cleanup cut”之类会把范围拉进 boot/退出清理桶的词。证据：`easysdd/architecture/domain-task-system-ownership.md:198-200`, `easysdd/architecture/domain-task-system-ownership.md:312-317`, `.omx/plans/prd-task-system-followup-2026-04-23.md:129-141`

### 0.2 时间推进基础设施

定义：时间推进基础设施包含任务执行层生成 timer id、通过 `useTimerManager` 向主进程注册/注销定时器、接收 tick 事件，以及任务路径上仍然存在的局部延时原语。它是“资源怎么被占用”的问题，不是“任务现在处于什么正式状态”的问题。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/composables/common/useTimerManager.ts:29-53`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`

防冲突结论：本文把 `task.timers`、`useTimerManager(false)`、主进程 `TimerManager` 视为同一资源链上的不同层，不把它们误写成生命周期状态源。证据：`src/stores/frames/sendTasksStore.ts:109-121`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `easysdd/architecture/domain-task-system-ownership.md:302-317`

### 0.3 lifecycle-end meaning

定义：凡是路径最终落到 `updateTaskStatus(..., 'completed')` 的地方，`completed` 的业务含义、与 `stop/remove` 的关系、以及“何时算结束”都不由本 feature 拍板，而由 cut 1 统一归口。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:54-65`, `.omx/plans/prd-task-system-followup-2026-04-23.md:135-141`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`

防冲突结论：本文会引用这些路径作为边界风险，但不会为它们重新定义“完成”“停止”“删除”语义。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:14-18`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:57-66`

## 1. 决策与约束

### 1.1 需求摘要

本 feature 只为 cut 5 起草方案：收口“任务用于等待调度/时间推进时所占用的 timer 资源到底由哪一层统一持有、登记、释放和回传”，不进入生命周期终态、控制权、触发入口、boot 退出清理、对话框关闭/后台继续运行，也不新增任何调度能力。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:129-141`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:57-66`

成功标准：

- reviewer 能明确指出 cut 5 只覆盖 `useSendTaskExecutor -> useTimerManager -> TimerManager` 这一条时间资源链，以及 `task.timers` 这种任务侧资源句柄登记点，而不是控制/UI/trigger 语义。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/composables/common/useTimerManager.ts:20-52`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`, `src/stores/frames/sendTasksStore.ts:109-121`
- reviewer 能检查任何触达 `updateTaskStatus(..., 'completed')` 的调度路径时，文档都明确写明“终态语义仍归 cut 1”。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:135-141`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:600-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:865-875`
- reviewer 能证明 boot 清理、dialog close/background、monitor `waiting-schedule` 控制解释未被本文吸收。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`, `src/boot/taskManager.ts:17-57`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`

明确不做：

- 不定义 `completed`/`stopped`/`removeTask` 的业务含义；这属于 cut 1。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:54-65`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`
- 不接管 `pause/resume/stop`、`waiting-schedule` 的控制解释；这属于 cut 2。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:67-84`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`
- 不改造任务创建入口、首次 start、dialog close/background 决策；这属于 cut 2 或 cut 3。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:83-103`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`
- 不改造 receive 侧 trigger candidate ingress，也不把 trigger condition 语义搬进本 cut；这属于 cut 4。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:105-125`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
- 不新增调度能力，例如新的重复策略、后台持续策略、超时规则或新的 timer feature。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`, `refactor/docs/01-scan/07-problem-list-round-1.md:161-177`

### 1.2 关键决策

#### 决策 A：cut 5 的唯一主 seam 是“timer resource owner”，不是“时间语义 owner”

当前代码里，时间语义由任务系统架构归口，但资源载体散落在执行器本地 id 生成、`task.timers` 记录、renderer `setTimeout`、`useTimerManager` 和主进程 `TimerManager` 之间；因此 cut 5 只能解决“资源句柄谁拥有”，不能顺手决定“等待调度/完成意味着什么”。证据：`easysdd/architecture/domain-task-system-ownership.md:198-200`, `easysdd/architecture/domain-task-system-ownership.md:245-259`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`, `src/composables/common/useTimerManager.ts:29-53`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`

#### 决策 B：`task.timers` 在本 cut 中只被视为任务侧资源句柄表，不被视为状态机事实

`SendTask` 已经有 `timers?: string[]`，controller 和 boot 都依赖它做清理，但架构文档明确“定时器已经登记”不能再冒充生命周期事实；因此 cut 5 应把它界定成资源引用登记点，而不是 `waiting-schedule` 或完成语义的根据。证据：`src/stores/frames/sendTasksStore.ts:109-121`, `src/composables/frames/sendFrame/useSendTaskController.ts:42-57`, `src/boot/taskManager.ts:25-44`, `easysdd/architecture/domain-task-system-ownership.md:302-317`

#### 决策 C：boot/exit cleanup 明确排除在本 cut 之外

`taskManager.ts` 现在用浏览器 `clearTimeout/clearInterval` 清理 `task.timers`，但 PRD 已把“boot/exit cleanup bucket”列为 cut 5 显式排除项；所以本文只把它记录为邻接风险，不把“退出时怎么扫尾”并入 timer-resource ownership。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`, `src/boot/taskManager.ts:17-57`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:310-311`

#### 决策 D：凡是调度路径落到 `completed`，都只记为“资源路径会碰到 lifecycle-end seam”，不记为本 cut 拥有该 seam

当前定时执行和时间触发执行都会在某些分支直接写 `completed`，而 store 会立刻 `removeTask`；这些路径是本 cut 的回归守护对象，但其 meaning 明确延后给 cut 1。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:558-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:595-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:862-875`, `src/stores/frames/sendTasksStore.ts:401-426`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:10-18`

### 1.3 被拒方案

- 被拒方案：把 cut 5 写成“timer + cleanup”综合收口。
  原因：这会把 boot 退出清理和正常路径资源所有权揉成一个桶，直接违反 PRD 的显式排除。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`, `src/boot/taskManager.ts:17-57`
- 被拒方案：顺手统一 `waiting-schedule` 的控制行为。
  原因：PRD 已把这件事放在 cut 2，且 monitor 上的 `waiting-schedule` stop/retry 属于控制面，不是 timer resource seam。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:67-84`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`
- 被拒方案：借 cut 5 修正 `completed -> removeTask`。
  原因：这会越过 cut 1 的 hard gate。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:19-20`, `.omx/plans/prd-task-system-followup-2026-04-23.md:135-141`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`

### 1.4 主流程概述

当前 cut 5 关心的正常路径是：

1. executor 为任务生成 timer id，并把 id 视为该任务持有的调度资源引用。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`
2. executor 通过 `useTimerManager(false)` 注册/注销主进程 timer，并消费 tick 回调。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:40`, `src/composables/common/useTimerManager.ts:29-53`, `src/composables/common/useTimerManager.ts:142-165`
3. 主进程 `TimerManager` 只负责资源实例存在、启动、停止和事件回传，不解释任务状态。证据：`src-electron/main/ipc/timerManagerHandlers.ts:194-220`
4. executor 在 tick 后决定是否继续等待、再次注册下一次调度资源，或沿现有路径写 `completed`；但后一件事的 meaning 不归本文。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:844-860`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:862-875`

关键边界异常：

- renderer 本地延时仍存在于实例间延时路径，说明资源所有权今天是双轨的；cut 5 需要正面承认这一点，而不是假装只有主进程 timer。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`, `refactor/docs/01-scan/07-problem-list-round-1.md:161-177`, `refactor/docs/01-scan/06-coupling-matrix.md:228-235`
- trigger listener 也存在本地 `setTimeout`，但其入口解释权仍属 cut 4；本 cut 最多只约束“若它占用时间资源，不能因此改写 trigger ingress meaning”。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-233`, `.omx/plans/prd-task-system-followup-2026-04-23.md:105-125`

## 2. 接口契约

### 2.1 任务调度资源申请契约

```ts
// 输入示例：任务执行层请求一份调度资源
{
  taskId: 'task-123',
  resourceKind: 'timeout',
  purpose: 'recurring-next-fire',
  delayMs: 3000
}

// 输出示例：返回资源句柄；句柄只代表资源存在，不代表生命周期终态
{
  ok: true,
  resourceHandle: 'task-task-123-timeout-1710000000000-recurring'
}

// 来源：src/composables/frames/sendFrame/useSendTaskExecutor.ts createTaskTimerIds
// 来源：src/composables/common/useTimerManager.ts registerTimer
// 来源：src-electron/main/ipc/timerManagerHandlers.ts register
```

契约要求：

- 资源句柄生成权和登记权必须能被 reviewer 追到同一条 seam 上，而不是一部分藏在 executor 局部数组、一部分藏在 boot 清理。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/boot/taskManager.ts:25-44`
- 句柄返回后，任务侧只能把它当作“待释放资源引用”，不能据此宣布 `waiting-schedule` 或 `completed`。证据：`easysdd/architecture/domain-task-system-ownership.md:302-317`, `src/stores/frames/sendTasksStore.ts:109-121`

### 2.2 调度 tick 回传契约

```ts
// 输入示例：主进程 timer 触发一次 tick
{
  timerId: 'task-task-123-timeout-1710000000000-recurring',
  executionCount: 2,
  timestamp: 1710000003000,
  interval: 3000
}

// 输出示例：执行层只把它解释为“某资源到点”，后续状态推进仍走任务系统语义层
{
  consumeAs: 'resource-fired',
  nextAction: 'execute-task-step'
}

// 来源：src-electron/main/ipc/timerManagerHandlers.ts TimerInstance.emitTick
// 来源：src/composables/common/useTimerManager.ts onTimerTick
// 来源：src/composables/frames/sendFrame/useSendTaskExecutor.ts createTimedSender / startScheduledTask
```

契约要求：

- tick 事件只承载时间事实，不承载 `waiting-schedule`、`completed`、`stopped` 的定义权。证据：`easysdd/architecture/domain-task-system-ownership.md:314-317`, `src-electron/main/ipc/timerManagerHandlers.ts:185-190`
- 如果消费 tick 的路径最终写 `updateTaskStatus(..., 'completed')`，文档和实现说明都必须标注“生命周期终态 meaning defer to cut 1”。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:57-66`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:595-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:862-875`

### 2.3 资源释放契约

```ts
// 输入示例：资源 owner 释放任务占用的 timer handles
{
  taskId: 'task-123',
  handles: [
    'task-task-123-timeout-1710000000000-recurring',
    'task-task-123-interval-1710000001000'
  ],
  reason: 'resource-scope-end'
}

// 输出示例：资源已释放；这不等价于任务已经完成、停止或被移除
{
  ok: true,
  released: 2
}

// 来源：src/composables/frames/sendFrame/useSendTaskExecutor.ts createTaskTimerIds.cleanup
// 来源：src/composables/common/useTimerManager.ts unregisterTimer
// 来源：src/composables/frames/sendFrame/useSendTaskController.ts stopTask
// 来源：src/boot/taskManager.ts beforeunload
```

契约要求：

- 正常调度路径的资源释放，与 boot 退出兜底释放必须在设计上被区分；后者只是邻接面，不归本 cut 所有。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:149-158`, `src/boot/taskManager.ts:17-44`
- 资源释放原因可以被记录，但原因解释不应反向定义 lifecycle-end 语义。证据：`easysdd/architecture/domain-task-system-ownership.md:253-259`, `src/stores/frames/sendTasksStore.ts:424-426`

### 2.4 显式排除契约

```ts
// 非本 cut 契约：dialog close / background continue
// 来源：src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue handleClose / stopTaskAndClose / continueTaskInBackground

// 非本 cut 契约：trigger ingress meaning
// 来源：src/composables/frames/sendFrame/useSendTaskTriggerListener.ts findDataItemByFieldId

// 非本 cut 契约：lifecycle-end meaning
// 来源：src/composables/frames/sendFrame/useSendTaskController.ts stopTask
// 来源：src/stores/frames/sendTasksStore.ts updateTaskStatus
```

排除要求：

- `waiting-schedule` 的 UI 文案、stop/retry 行为不在本 cut 内定义。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`, `.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`
- trigger condition 命中后的字段语义、continueListening 策略不在本 cut 内定义。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-293`
- 覆盖路径若触达 `updateTaskStatus(..., 'completed')`，只允许作为 regression anchor 出现，不允许作为 feature owner 的语义声明出现；生命周期终态 meaning 继续 defer to cut 1。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:10-18`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-567`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-293`

## 3. 实现提示

### 3.1 改动计划

本 feature 后续实现应只围绕以下设计目标推进：

1. 把任务调度资源链明确成一个 seam：任务执行层申请资源、资源 owner 生成/登记 handle、桥接层注册/回传、资源 owner 负责释放。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/composables/common/useTimerManager.ts:29-53`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
2. 把 `task.timers` 重新定义为“任务侧资源引用表”，并与 lifecycle/control 解释解耦。证据：`src/stores/frames/sendTasksStore.ts:109-121`, `easysdd/architecture/domain-task-system-ownership.md:302-317`
3. 对长生命周期调度资源与 renderer 本地延时做显式分类：前者是本 cut 的核心资源面，后者必须被标注为“已存在但待明确是否并入同一 owner”而不是被忽略。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`, `refactor/docs/01-scan/07-problem-list-round-1.md:161-177`
4. 给所有 timer-driven `completed` 写路径边界注释或验证点，确保它们只作为 lifecycle bleed guard 存在。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:57-66`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:595-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:862-875`

### 3.2 实现风险与约束

- 风险：把 `waiting-schedule` 的控制解释顺手吸进 timer seam。
  约束：所有“用户能否 stop/retry/看到什么文案”的问题仍回 cut 2。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:67-84`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`
- 风险：把 boot `beforeunload` 清理误当成正常资源 owner。
  约束：exit cleanup 只作为邻接 bucket 记录，不作为本 cut 的设计目标。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:133-139`, `src/boot/taskManager.ts:17-44`
- 风险：为了统一 timer 资源而把 trigger ingress 逻辑也一起搬动。
  约束：`findDataItemByFieldId`、trigger candidate interpretation、continueListening 都留在 cut 4/生命周期相邻面。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:105-125`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-293`
- 风险：把 `completed` 的 meaning 隐式改掉。
  约束：任何碰到 `updateTaskStatus(..., 'completed')` 的改动都必须写出“本 feature 不拥有该 meaning，defer to cut 1”。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:135-141`, `src/stores/frames/sendTasksStore.ts:424-426`

### 3.3 推进顺序

1. 先画出现有 timer-resource seam 清单：`task.timers`、executor 局部 timer id、`useTimerManager(false)`、主进程 `TimerManager`、renderer 局部延时分别在哪条任务时间推进路径上出现。
   退出信号：reviewer 能逐项把资源点映射到具体文件和路径。证据：`src/stores/frames/sendTasksStore.ts:109-121`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`, `src/composables/common/useTimerManager.ts:20-52`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
2. 明确“谁是资源 owner、谁只是 bridge、谁只是 consumer”的设计角色，不写生命周期意义，只写资源职责。
   退出信号：文档中每一层都有单一职责，不再出现 bridge 定义语义。证据：`easysdd/architecture/domain-task-system-ownership.md:198-200`, `easysdd/architecture/domain-task-system-ownership.md:312-317`
3. 把 timer-driven `completed` 路径列为回归守护面，并逐条标注“meaning defer to cut 1”。
   退出信号：所有相关路径都被点名，且没有一句话暗示 cut 5 拥有终态定义权。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:600-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:865-875`, `src/stores/frames/sendTasksStore.ts:424-426`
4. 单独列出邻接但排除的 seam：boot cleanup、dialog close/background、monitor control、trigger ingress。
   退出信号：reviewer 能反向检查本文没有漂到 cut 2/4。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:105-141`, `src/boot/taskManager.ts:17-57`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`
5. 最后再决定 renderer 本地延时是“并入同一 timer-resource owner”还是“保留为单独局部时间资源但纳入同一验证口径”；无论选哪条，都不得引入新调度功能。
   退出信号：本地延时的归类被明确写出，且没有新增策略/语义。证据：`refactor/docs/01-scan/07-problem-list-round-1.md:161-177`, `refactor/docs/01-scan/06-coupling-matrix.md:228-235`

### 3.4 测试设计

#### 功能点 A：资源登记与释放链路

- 测试约束：验证任务时间推进使用的资源句柄可以被同一 owner 追踪到注册、回传和释放，不依赖 UI/boot 才知道资源是否存在。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `src/composables/common/useTimerManager.ts:29-53`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
- 验证方式：对定时任务和时间触发任务分别做一条 resource trace，检查句柄创建、登记、触发、释放是否可回溯。
- 关键用例骨架：
  - 定时重复任务创建 1 个 interval/timeout 资源并在结束后释放。
  - 时间触发任务创建下一次执行资源并在最后一次执行后释放。

#### 功能点 B：生命周期边界守护

- 测试约束：任何 timer-driven 路径若写 `completed`，验证说明必须显式写明“meaning defer to cut 1”；不能把 cut 5 验证写成“修正 completed 语义”。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:57-66`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:595-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:862-875`, `src/stores/frames/sendTasksStore.ts:424-426`
- 验证方式：逐条检查时间驱动分支与 store remove 路径的说明文字和测试断言。
- 关键用例骨架：
  - 定时发送达到 repeatCount 后进入现有 `completed` 路径，但测试只校验 boundary guard，不校验新终态定义。
  - 时间触发一次性完成后进入现有 `completed` 路径，但测试仍声明终态 meaning 属于 cut 1。

#### 功能点 C：排除项回归

- 测试约束：cut 5 的验证必须证明未吸收 cut 2/4 以及 boot bucket。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:105-141`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-378`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/boot/taskManager.ts:17-57`
- 验证方式：做边界回归检查，而不是功能扩张检查。
- 关键用例骨架：
  - `waiting-schedule` 的 stop/retry 规则不在本 cut 的断言集合中。
  - dialog close/background continue 不因 timer-resource 收口而改变。
  - trigger condition 命中/continueListening 的语义断言仍留在 cut 4 相关验证中。

## 4. 与项目级架构文档的关系

本文直接依赖以下项目级架构文档：

- `easysdd/architecture/domain-task-system-ownership.md`
  作用：给出“时间语义归任务系统、定时器桥接只提供资源”的总原则。证据：`easysdd/architecture/domain-task-system-ownership.md:198-200`, `easysdd/architecture/domain-task-system-ownership.md:312-317`
- `easysdd/architecture/topology-receive-send-mainlines.md`
  作用：限制本 cut 不得顺手吸收 trigger ingress 或发送主链语义。证据：`easysdd/architecture/topology-receive-send-mainlines.md:177-181`, `easysdd/architecture/topology-receive-send-mainlines.md:224-239`, `easysdd/architecture/topology-receive-send-mainlines.md:483-487`
- `easysdd/architecture/DESIGN.md`
  作用：当前仍是骨架索引；本文暂不修改它，但后续若 cut 5 最终形成稳定的“timer resource owner / bridge / consumer”术语，应该在任务系统条目下追加一句索引说明。证据：`easysdd/architecture/DESIGN.md:9-16`

如后续实现确认 renderer 本地延时与主进程 timer 需要统一纳入一套资源 owner 语言，建议在 architecture follow-up 中补一条短注记：

- 补充内容应只说明“任务时间资源所有权的边界”和“哪些仍是局部延时资源”，不要在架构 doc 里提前写 cut 1 的 lifecycle-end 定义。证据：`refactor/docs/01-scan/07-problem-list-round-1.md:161-177`, `.omx/plans/prd-task-system-followup-2026-04-23.md:135-141`

本节不创建架构 follow-up，只记录未来可能需要的补充点。
