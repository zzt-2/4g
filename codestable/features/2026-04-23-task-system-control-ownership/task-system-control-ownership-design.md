---
doc_type: feature-design
feature: 2026-04-23-task-system-control-ownership
status: draft
summary: 明确已创建任务的持续控制归属，覆盖监控 start/retry、pause/resume/stop、对话框关闭/后台继续运行与 waiting-schedule 控制解释。
tags: [task-system, ownership, control, cut-2]
---

# task-system-control-ownership design

## 0. 术语约定

| 术语 | 定义 | 防冲突结论 |
| --- | --- | --- |
| 已创建任务 | 已进入 `sendTasksStore`，并且后续控制动作通过既有 `taskId` 指向该任务，而不是在创建流程里一边建任务一边首次 `startTask`。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:47-89`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:259-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:315-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:643-753`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:90-106` | 本文沿用 PRD 的 `cut 2 = control ownership` / `cut 3 = creation-entry ownership` 两分法，不再引入“运行控制”“二次启动”之类新别名。 |
| 持续控制 | 针对已创建任务的 `monitor start/retry`、`pause`、`resume`、`stop`、对话框关闭后的“停止并关闭/后台继续运行”决策，以及 `waiting-schedule` 的控制解释。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-43` | 本文把这些动作统一记为“持续控制”，不把 dialog close、monitor retry、waiting-schedule stop 分成三套 seam。 |
| `waiting-schedule` / 等待调度 | `waiting-schedule` 是当前代码状态值，监控 UI 显示文案是“等待执行”，架构文档用语是“等待调度/等待触发”。本 cut 讨论的是它作为“已创建任务是否仍受控制”的解释权，而不是底层 timer 资源。证据：`src/stores/frames/sendTasksStore.ts:23-30`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:54-62`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `easysdd/architecture/domain-task-system-ownership.md:198-206`, `.omx/plans/prd-task-system-followup-2026-04-23.md:168-169` | 本文统一写“`waiting-schedule`（代码状态值）/等待调度（架构语义）”，避免把 UI 文案“等待执行”误当架构术语。 |
| 后台继续运行 | 用户关闭对话框时选择“UI 退出，但既有任务继续运行”的控制决定；它只改变 UI 占有关系，不应直接宣布任务生命周期事实。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `easysdd/architecture/domain-task-system-ownership.md:302-317` | 本文把它归为 cut 2 控制 seam，而不是 cut 3 输入采集，也不是生命周期终态。 |
| monitor `start/retry` | 任务监控对已存在任务记录发出的 `startTask(taskId)`；当前显式 UI 形态是错误任务的“重试”，但 ownership 边界覆盖所有“对已创建任务重新下达 start”的控制语义。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:372-378`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:155-157` | 本文只把 monitor 上对既有任务的 `startTask(taskId)` 归入 cut 2；创建流程里的首次 `startTask` 继续留给 cut 3。 |

## 1. 决策与约束

### 1.1 需求摘要

- 本 feature 只定义 **已创建任务** 的持续控制归属：监控 `start/retry`、`pause/resume/stop`、对话框关闭后的“停止并关闭/后台继续运行”、以及 `waiting-schedule` 的控制解释。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:69-86`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-43`
- 本 feature 明确 **不拥有创建期首次启动**；cut 3 才拥有输入采集、创建请求与 creation-time first start。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:88-106`, `.omx/plans/prd-task-system-followup-2026-04-23.md:155-157`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:45-54`
- 本 feature 明确 **不拥有 trigger ingress、timer-resource internals、boot 退出兜底、input capture**。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:79-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-147`
- 若本 cut 覆盖的控制路径最终触达 `updateTaskStatus(..., 'completed')`，本文只拥有“谁可以发出 stop / close-stop 控制意图”的边界，不拥有 `completed` 的生命周期终态含义；生命周期结束语义仍归 cut 1。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`, `src/stores/frames/sendTasksStore.ts:401-426`, `.omx/plans/prd-task-system-followup-2026-04-23.md:55-67`, `.omx/plans/prd-task-system-followup-2026-04-23.md:155-158`

### 1.2 关键决策

- 决策 1：cut 2 的 seam 起点不是页面按钮，也不是 timer/trigger 状态，而是“任务已经存在且后续动作通过既有 `taskId` 指向它”。这保证 cut 2 处理的是 ongoing control，不回收 create-and-first-start。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:47-89`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:90-106`
- 决策 2：monitor、dialog 只是控制意图入口，不应继续拥有架构级生命周期解释权；架构级定义权应回到任务系统控制语义，而不是留在视图状态。证据：`easysdd/architecture/domain-task-system-ownership.md:103-105`, `easysdd/architecture/domain-task-system-ownership.md:194-206`, `easysdd/architecture/boundary-runtime-state-ownership.md:105-111`, `easysdd/architecture/boundary-runtime-state-ownership.md:233-272`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:155-162`
- 决策 3：`waiting-schedule` 的“是否仍属于可控制中的已创建任务、哪些动作可发出”属于 cut 2；但 `TimerManager`、渲染层 delay、调度资源分账仍留给 cut 5。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `easysdd/architecture/domain-task-system-ownership.md:198-206`, `.omx/plans/prd-task-system-followup-2026-04-23.md:127-147`, `.omx/plans/prd-task-system-followup-2026-04-23.md:168-169`
- 决策 4：dialog close / background continue 归入 cut 2，因为它处理的是“UI 是否继续占有一个已运行任务”的控制归属；它不能被视为新的生命周期事实，也不能回收为 cut 3 的创建入口逻辑。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `easysdd/architecture/domain-task-system-ownership.md:302-317`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:98-103`
- 决策 5：monitor `start/retry` 在本 cut 中只指“对已创建任务再次发出开始/重试控制”；创建流程内部的首次 `startTask` 不属于本 cut。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:88-95`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:372-378`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:259-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:315-368`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-54`

### 1.3 明确不做

- 不改创建期输入采集、任务实例组装、`create*Task(...)` 入口。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `.omx/plans/prd-task-system-followup-2026-04-23.md:79-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:98-103`
- 不改 receive 侧 trigger candidate production，也不改任务侧 trigger input ingress。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:82-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`, `easysdd/architecture/topology-receive-send-mainlines.md:483-487`
- 不改 timer bridge / main-process timer manager / 局部 delay 的资源归属。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:83-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:127-147`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:336-339`
- 不在本 cut 里重新定义 `stop -> completed -> remove` 的终态语义。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`, `.omx/plans/prd-task-system-followup-2026-04-23.md:55-67`

### 1.4 被拒方案

- 被拒方案 A：把 dialog close / background continue 归到 cut 3，只因为它出现在创建对话框里。拒绝原因：PRD 已把它划为 ongoing control，而架构文档明确“页面对话框关闭后选择后台继续运行”不能冒充生命周期事实。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:98-103`, `easysdd/architecture/domain-task-system-ownership.md:302-317`
- 被拒方案 B：把 `waiting-schedule` 问题整体推给 cut 5。拒绝原因：当前首要矛盾是 monitor 提供 stop，而 controller 不承认其可停，这首先是 control interpretation，不是 timer-resource ownership。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `.omx/plans/prd-task-system-followup-2026-04-23.md:168-169`

### 1.5 主流程概述

- 监控控制路径：`ActiveTasksMonitor` 当前直接把 `stop / start / pause / resume` 发给 `useSendTaskManager`，因此 monitor 已经是既有任务控制入口。cut 2 要解决的是这条入口的 ownership，不是它是否存在。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:20-23`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`
- 对话框关闭路径：`TimedSendDialog` 与 `EnhancedSequentialSendDialog` 在已有运行任务时，允许用户在“停止并关闭”和“后台继续运行”之间做选择；这同样是对既有任务的持续控制，而不是输入采集。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
- 生命周期边界：当前 `stopTask()` 会直接写 `completed`，而 store 会在 `completed` 时删除任务；因此本 cut 只能规划“谁有权发 stop / close-stop / retry”，不能顺手吸收 lifecycle-end semantics。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`, `src/stores/frames/sendTasksStore.ts:401-426`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:138-142`

## 2. 接口契约

### 2.1 控制意图契约

以下是 **范围契约示意**，用于约束 cut 2 应处理哪些控制意图；它不是 implementation signature。

```ts
type ExistingTaskControlAction =
  | 'monitor-start-retry'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'close-stop'
  | 'close-background-continue';

type ExistingTaskControlIntent = {
  taskId: string;
  action: ExistingTaskControlAction;
  source: 'active-tasks-monitor' | 'timed-send-dialog' | 'enhanced-sequential-dialog';
  observedStatus: 'running' | 'paused' | 'error' | 'waiting-trigger' | 'waiting-schedule';
};
```

```ts
const retryIntent = {
  taskId: 'task_123',
  action: 'monitor-start-retry',
  source: 'active-tasks-monitor',
  observedStatus: 'error',
};
// 来源：src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103
// 来源：src/components/frames/FrameSend/ActiveTasksMonitor.vue:372-378
```

```ts
const closeInBackgroundIntent = {
  taskId: 'task_456',
  action: 'close-background-continue',
  source: 'timed-send-dialog',
  observedStatus: 'running',
};
// 来源：src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220
```

```ts
const stopWaitingScheduleIntent = {
  taskId: 'task_789',
  action: 'stop',
  source: 'active-tasks-monitor',
  observedStatus: 'waiting-schedule',
};
// 来源：src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369
// 说明：本 cut 拥有“这是不是可控制状态”的解释；timer internals 仍不在此契约内。
```

边界要求：

- `taskId` 必须已存在；没有 `taskId` 的输入捕获、实例拼装、创建请求不属于本契约。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:47-89`, `.omx/plans/prd-task-system-followup-2026-04-23.md:79-86`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:43-54`
- `close-background-continue` 只表达 UI relinquish，不表达“任务已完成/已停止”。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:216-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:788-793`, `easysdd/architecture/domain-task-system-ownership.md:302-317`
- 任何 `stop` / `close-stop` 后续若仍落到 `updateTaskStatus(..., 'completed')`，终态语义解释继续交给 cut 1。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`, `.omx/plans/prd-task-system-followup-2026-04-23.md:55-67`

### 2.2 状态解释契约

| 已创建任务状态 | 当前控制入口 | 本 cut 拥有的解释 | 本 cut 明确不拥有 |
| --- | --- | --- | --- |
| `running` | 监控可 `pause/stop`；对话框关闭时可“停并关/后台继续”。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-341`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:768-785` | 谁可以对运行中任务发 `pause`、`stop`、`close-stop`、`close-background-continue`。 | `stop` 之后为什么进入 `completed`、是否立即移除。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426` |
| `paused` | 监控可 `resume/stop`；controller 当前仅改状态，不补完整恢复逻辑。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:345-353`, `src/composables/frames/sendFrame/useSendTaskController.ts:70-110` | 谁有权发 `resume`、`stop`，以及这些动作属于 ongoing control 而非 creation。 | 恢复后的完整执行引擎细节。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:103-110` |
| `waiting-trigger` | 监控可 `stop`，controller 也允许把它视为可停。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:356-361`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `src/composables/frames/sendFrame/useSendTaskController.ts:49-53` | 作为“已创建但等待外部条件”的任务，它仍在 cut 2 的控制面中。 | trigger candidate 生产与 trigger input ingress。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:82-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-125` |
| `waiting-schedule` | 监控给出 `stop`，但 controller 当前不把它当作可停状态。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:298-300` | cut 2 必须定义“等待调度中的既有任务是否仍受持续控制、允许哪些控制动作”。 | timer-resource 所有权、调度资源实现。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:127-147`, `.omx/plans/prd-task-system-followup-2026-04-23.md:168-169` |
| `error` | 监控当前给出 `start` 按钮，语义上是 retry existing task。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:372-378` | cut 2 拥有“对已存在错误任务发重试控制”的分类。 | 创建流程里的首次 `startTask(taskId)`。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:270-280`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:43-54` |

### 2.3 邻接 cut 契约

- 与 cut 1 的契约：cut 2 可以重新整理 `stop`、`close-stop` 的控制入口，但凡路径碰到 `updateTaskStatus(..., 'completed')` 或任务移除，语义解释权仍归 cut 1。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`, `.omx/plans/prd-task-system-followup-2026-04-23.md:55-67`
- 与 cut 3 的契约：creation-time input capture、实例组装、`create*Task(...)`、创建流程内部首次 `startTask(taskId)` 全部留在 cut 3；cut 2 只接管“任务已存在之后”的控制。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `.omx/plans/prd-task-system-followup-2026-04-23.md:79-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:98-103`
- 与 cut 4 的契约：`waiting-trigger` 的控制归属在 cut 2，但 trigger candidate 的生产与 task-consumed trigger input 的边界仍留给 cut 4。证据：`easysdd/architecture/domain-task-system-ownership.md:205-206`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`
- 与 cut 5 的契约：`waiting-schedule` 的控制解释在 cut 2，但时间推进资源、bridge 和 main-process timer manager 仍留给 cut 5。证据：`easysdd/architecture/domain-task-system-ownership.md:198-200`, `.omx/plans/prd-task-system-followup-2026-04-23.md:127-147`

## 3. 实现提示

### 3.1 目标文件状况评估结论

当前 control seam 不是单点文件，而是散在 monitor、dialog、manager、controller 四层：监控直接调 manager，对话框在关闭分支里直接决定 stop/background，controller 集中 stop/pause/resume，但 monitor retry 仍绕经 `startTask`，所以当前问题不是“先把某个超长文件拆小”而是“先把 ongoing control boundary 立起来”。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:20-23`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `src/composables/frames/sendFrame/useSendTaskManager.ts:180-220`, `src/composables/frames/sendFrame/useSendTaskController.ts:23-117`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:155-162`

本设计不建议先做“只搬不改行为”的独立前置 cleanup feature；control ownership 本身就是这组文件之间的 boundary normalization。

### 3.2 改动计划

1. 先把所有“已创建任务控制入口”列成单表，只保留 monitor action、dialog close 决策和 existing-task retry；同时把创建流程里的 `create*Task + first start` 显式标记为 cut 3。退出信号：代码面上每个入口都能回答“这是 existing-task control 还是 creation-entry”。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-793`
2. 把 ongoing control 的入口统一收束到任务系统控制 seam，让 monitor/dialog 只表达控制意图，不再各自暗含生命周期解释。退出信号：monitor retry、pause/resume/stop、dialog close 选择都经过同一类 control dispatch 约束。证据：`easysdd/architecture/domain-task-system-ownership.md:194-206`, `easysdd/architecture/boundary-runtime-state-ownership.md:258-272`
3. 明确 `waiting-schedule` 的控制解释并与 monitor/controller 对齐：要么双方都承认其是可停的已创建任务，要么双方都不承认，但该判断必须由 control seam 统一，不得继续一边显示 stop、一边控制层忽略。退出信号：`waiting-schedule` 的动作许可在 UI 与控制层一致。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `.omx/plans/prd-task-system-followup-2026-04-23.md:168-169`
4. 把 dialog close / background continue 从“页面局部决定运行事实”降级为“已创建任务控制选择”；`close-background-continue` 只能释放 UI 占有关系，`close-stop` 只能表达 stop control，不得顺手定义 lifecycle-end meaning。退出信号：关闭对话框后的两条路径都只改变控制归属，不额外占有终态语义。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `easysdd/architecture/domain-task-system-ownership.md:302-317`
5. 最后补控制 seam 回归验证，证明 cut 2 没吞掉 cut 1 / cut 3 / cut 4 / cut 5。退出信号：monitor start/retry、pause/resume/stop、dialog close/background continue、waiting-schedule interpretation 都有验证，而 creation-time first start、trigger ingress、timer-resource ownership 仍留在各自 cuts。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-64`

### 3.3 实现风险与约束

- 风险 1：`stop` 目前直接落 `completed`，而 `completed` 立即删除任务；如果 cut 2 在实施时顺手改这个链路，就会越界进入 cut 1。约束：本 cut 只能整理控制 authority，不能重新定义 terminal semantics。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`, `.omx/plans/prd-task-system-followup-2026-04-23.md:55-67`
- 风险 2：dialog 里现在既有 create-and-start，又有 close/background continue；一旦不先画边界，cut 2 很容易回收 cut 3。约束：凡是“输入采集 + 创建 + 首次启动”的路径都继续归 cut 3。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `.omx/plans/prd-task-system-followup-2026-04-23.md:90-106`
- 风险 3：`waiting-schedule` 同时牵涉控制解释和 timer 资源；如果实现时直接下潜到 timer bridge，就会越界进入 cut 5。约束：cut 2 只定义“它是不是受控中的已创建任务、可接受哪些控制动作”，不动 timer-resource internals。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `.omx/plans/prd-task-system-followup-2026-04-23.md:127-147`, `.omx/plans/prd-task-system-followup-2026-04-23.md:168-169`
- 风险 4：monitor 列表状态和页面“当前发送中”展示态容易反向塑造控制语义。约束：视图状态只能消费运行事实，不能继续定义主状态语义。证据：`easysdd/architecture/boundary-runtime-state-ownership.md:105-111`, `easysdd/architecture/boundary-runtime-state-ownership.md:235-272`

### 3.4 测试设计

- 功能点 A：monitor existing-task control。
  测试约束：必须证明 monitor `start/retry`、`pause`、`resume`、`stop` 都被归类为 existing-task control，而不是 creation-entry。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-43`
  验证方式：从监控面板触发错误任务 retry、运行中 pause/stop、暂停后 resume/stop，确认控制入口走的是 cut 2 定义的统一 seam。
  用例骨架：`error -> retry`、`running -> pause -> resume`、`running -> stop`。
- 功能点 B：dialog close/background continue。
  测试约束：必须证明“停止并关闭”和“后台继续运行”都只作用于已创建任务控制，不回收输入采集和首次启动。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-43`
  验证方式：对已经运行的 timed / enhanced task 关闭对话框，分别选择两条分支，确认一条只发 stop control，一条只释放 UI 占有关系。
  用例骨架：`running timed task -> close -> background continue`、`running sequential task -> close -> stop and close`。
- 功能点 C：`waiting-schedule` control interpretation。
  测试约束：必须证明 monitor 与 control seam 对 `waiting-schedule` 的动作许可一致；若可停，monitor 与 controller 都承认；若不可停，monitor 不能再暴露误导性 stop。证据：`src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:298-300`
  验证方式：构造进入 `waiting-schedule` 的已创建任务，检查 monitor 显示动作与控制层判定是否一致。
  用例骨架：`timed-triggered task -> waiting-schedule -> stop permission check`。
- 功能点 D：邻接 seam 守护。
  测试约束：必须证明 cut 2 没吞 cut 1 / 3 / 4 / 5。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:35-64`
  验证方式：回归检查 creation-time first start、trigger ingress、timer internals 未被本 cut 修改；若 stop 仍落 `completed`，文档/实现说明继续声明 lifecycle-end meaning 属于 cut 1。
  用例骨架：`create dialog first start unchanged`、`receive trigger ingress unchanged`、`timer resource bridge unchanged`、`stop -> completed path still documented as cut 1 boundary`。

## 4. 与项目级架构文档的关系

- `easysdd/architecture/domain-task-system-ownership.md` 是本设计的上位约束：它已经把生命周期控制、时间推进、等待解释、停止、完成、清理都归到任务系统语义，而页面/组件只能发控制意图。cut 2 只是把这条总原则收紧到“已创建任务的持续控制归属”。证据：`easysdd/architecture/domain-task-system-ownership.md:93-105`, `easysdd/architecture/domain-task-system-ownership.md:194-216`, `easysdd/architecture/domain-task-system-ownership.md:234-237`
- `easysdd/architecture/topology-receive-send-mainlines.md` 约束本 cut 不得回收 receive/send mainline seam；本 cut 只处理 task entry 之后的控制 ownership，不碰 trigger ingress 与显式输入/输出边界。证据：`easysdd/architecture/topology-receive-send-mainlines.md:481-487`, `easysdd/architecture/topology-receive-send-mainlines.md:531-536`
- `easysdd/architecture/boundary-runtime-state-ownership.md` 约束 monitor/dialog 的视图状态不能继续反向定义运行主状态；这正是 cut 2 需要把 monitor/dialog 降级为 control-intent surface 的原因。证据：`easysdd/architecture/boundary-runtime-state-ownership.md:105-111`, `easysdd/architecture/boundary-runtime-state-ownership.md:235-272`
- 若 cut 2 后续实施并稳定，建议补一条架构 follow-up：
  1. 在 `domain-task-system-ownership.md` 里补一句“monitor start/retry、dialog close/background continue、waiting-schedule control interpretation 属于已创建任务控制 seam；creation-time first start 仍属 entry seam”。
  2. 在 `boundary-runtime-state-ownership.md` 里补一句“任务监控列表动作只能表达 control intent，不得再定义 lifecycle-end meaning”。
  以上只是后续架构文档补充建议，本设计阶段不直接修改架构文档。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`, `.omx/plans/prd-task-system-followup-2026-04-23.md:155-171`, `easysdd/architecture/boundary-runtime-state-ownership.md:258-272`
