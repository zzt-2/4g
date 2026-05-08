---
doc_type: feature-design
feature: 2026-04-23-task-system-lifecycle-end-ownership
status: draft
summary: 明确任务系统 cut 1 的生命周期结束语义，把 stop / completed / remove 从当前混叠状态拆成单一语义边界
tags: [task-system, lifecycle, ownership, stop, completed, remove]
---

# task-system-lifecycle-end-ownership design

## 0. 术语约定

### 0.1 术语 grep 与防冲突结论

本次先按 `easysdd-feature-design` 要求做术语 grep，覆盖了 `easysdd/architecture/`、`easysdd/compound/`、`easysdd/features/` 与 `src/`。现有高频语言已经稳定落在三组词上：

| 术语 | 本文定义 | 防冲突结论 |
| --- | --- | --- |
| 生命周期结束 | 本 cut 的总称，只指任务在语义上“如何结束”，不含创建入口、持续控制、触发 ingress、timer 资源所有权 | `overview` 已把该 seam 识别为“生命周期容器与结束原因切口”，PRD 也把 `cut 1` 定义为 `lifecycle-end ownership cut`，因此本文沿用“生命周期结束”而不新造“终态中台/终结域”之类新名词。证据：`easysdd/compound/2026-04-23-explore-task-system-module-overview.md:326-329`, `.omx/plans/prd-task-system-followup-2026-04-23.md:53-67` |
| 已停止 | 显式 stop 请求吸收后的结束事实，不等于 `completed` | 架构文档已经把 `已停止` 与 `已完成` 分开列为任务级正式语义，当前代码却把 `stopTask()` 直接写成 `completed`；因此本文采用架构口径，不沿用现状混写。证据：`easysdd/architecture/domain-task-system-ownership.md:253-259`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57` |
| 已完成 | 任务工作已自然结束、且结果归口已落定后的结束事实 | 架构文档要求 `已完成` 是独立结束事实；overview 也指出当前问题是 stop 与 completed 混在一起。证据：`easysdd/architecture/domain-task-system-ownership.md:257-258`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:138-142` |
| 移除 | 容器清理动作，不是结束原因 | overview 已明确当前问题是 `completed => removeTask` 把结束语义和清理语义揉在一起；本文固定“移除 = cleanup action”。证据：`easysdd/compound/2026-04-23-explore-task-system-module-overview.md:131-142`, `src/stores/frames/sendTasksStore.ts:424-426` |

### 0.2 本文采用的正式口径

- `stop`：显式结束意图；它要产出 `已停止`，而不是借道 `已完成`。证据：`easysdd/architecture/domain-task-system-ownership.md:253-259`, `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`
- `completed`：自然完成后的结束事实；它不再隐含“马上从容器里删掉”。证据：`easysdd/architecture/domain-task-system-ownership.md:257-258`, `src/stores/frames/sendTasksStore.ts:424-426`
- `remove`：结束后的显式容器动作；它只能消费已经结束的任务事实，不能反向决定结束原因。证据：`easysdd/architecture/domain-task-system-ownership.md:214-216`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md:326-329`

## 1. 决策与约束

### 1.1 需求摘要

要做的事：

- 为 follow-up plan 的 `cut 1` 起草唯一设计输入，明确 `stop / completed / remove` 的语义边界，并把它固定为后续 cut 的 defer 基线。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:13-21`, `.omx/plans/prd-task-system-followup-2026-04-23.md:53-67`

为谁做：

- 为 leader 与后续 execution lane 做边界拍板，避免 `cut 2-5` 再次各自解释 lifecycle-end meaning。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:14-23`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:82-95`

成功标准：

- reviewer 能从一份文档里回答三件事：
  - stop 到底代表什么；
  - completed 到底代表什么；
  - remove 何时发生、由谁触发、不能越过什么边界。
- 后续任何触碰 `updateTaskStatus(..., 'completed')` 的 cut，都必须显式声明“语义权仍属于 cut 1”。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:121-145`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:16-18`

明确不做：

- 不设计 creation-entry。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:61-65`, `.omx/plans/prd-task-system-followup-2026-04-23.md:88-106`
- 不设计 ongoing control（`pause / resume / start/retry / waiting-schedule` 解释权）。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:61-67`, `.omx/plans/prd-task-system-followup-2026-04-23.md:69-87`
- 不设计 trigger ingress。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:61-65`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-125`
- 不设计 timer-resource。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:61-65`, `.omx/plans/prd-task-system-followup-2026-04-23.md:127-147`
- 不产出 checklist yaml，不进入实现。证据：用户本轮约束；`.omx/plans/prd-task-system-followup-2026-04-23.md:30`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:95`

### 1.2 归档与冲突检查

归档检索结果：

- `python3 easysdd/tools/search-yaml.py --dir easysdd/compound --query "task system lifecycle completed remove stop"` → `No matching documents found.`
- `python3 easysdd/tools/search-yaml.py --dir easysdd/features --filter doc_type=feature-design --query "task lifecycle completed remove stop"` → `No .md files found in easysdd/features`

结论：

- 当前没有可复用的既有 feature design，也没有同主题 compound 沉淀；本稿需要直接把 cut 1 的边界、契约和验证口径完整写出来。

### 1.3 关键决策

#### 决策 A：本 cut 放在“任务系统生命周期结束语义层”，不放在 UI、control、trigger 或 timer 子面

原因：

- 架构文档已经要求任务系统负责生命周期事实与清理归口，页面 / store / composable / timer bridge 不再拥有架构定义权。证据：`easysdd/architecture/domain-task-system-ownership.md:93-112`, `easysdd/architecture/domain-task-system-ownership.md:192-216`
- PRD 已把 `cut 1` 固定成唯一 hard gate，并显式排除了 creation/control/trigger/timer。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:34-40`, `.omx/plans/prd-task-system-followup-2026-04-23.md:53-67`

落点：

- 本 cut 只回答“任务如何结束、结束后是否保留、何时可移除”，不回答“谁可以下达 stop”“何时能 retry”“等待触发/调度怎样推进”。

#### 决策 B：`stop` 的正式语义改为 `已停止`，不再通过 `completed` 借道表达

原因：

- 架构文档把 `已停止` 与 `已完成` 明确拆成两个任务级正式语义。证据：`easysdd/architecture/domain-task-system-ownership.md:253-259`
- 现状里 `stopTask()` 直接写 `completed`，这正是 PRD 认定的 hard gate。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `.omx/plans/prd-task-system-followup-2026-04-23.md:34-36`

落点：

- 未来任何 stop path 的设计说明、实现说明、验收说明，都必须以 `已停止` 作为 canonical meaning；如果底层仍保留兼容字段或兼容分支，那只是实现兼容，不是语义定义。

#### 决策 C：`completed` 只表示自然完成，且进入 `completed` 时不得自动 `remove`

原因：

- 架构文档要求“完成”与“清理”是两个不同层面的职责：完成属于生命周期事实，清理属于资源/容器释放。证据：`easysdd/architecture/domain-task-system-ownership.md:211-216`, `easysdd/architecture/domain-task-system-ownership.md:257-258`
- 现状 store 在 `status === 'completed'` 时立刻 `removeTask(id)`，导致 `completedTasks` / `clearCompletedTasks` 这类容器能力失去真实承载对象。证据：`src/stores/frames/sendTasksStore.ts:194-199`, `src/stores/frames/sendTasksStore.ts:424-426`, `src/stores/frames/sendTasksStore.ts:482-491`

落点：

- `completed` 之后任务仍应可被查询、展示、验证、再决定是否移除；否则后续 cut 根本无从“defer to cut 1”。

#### 决策 D：`remove` 是显式容器动作，只允许消费已经结束的任务

原因：

- 要保持 single dominant seam，就必须让 `remove` 只处理“容器保留多久”，不能顺手吸收 stop/control 语义。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:27-30`, `.omx/plans/prd-task-system-followup-2026-04-23.md:61-67`
- 架构文档把清理定义为任务系统决定何时释放调度资源、注销等待条件、结束局部执行对象，而不是由页面或按钮直接定义结束事实。证据：`easysdd/architecture/domain-task-system-ownership.md:214-216`, `easysdd/architecture/domain-task-system-ownership.md:293-317`

落点：

- 对 active task 的“结束它”仍属于 stop/completion seam；`remove` 只处理已停止 / 已完成 的容器退出，不吸收 active-task termination。

#### 决策 E：后续 cut 凡触碰 `updateTaskStatus(..., 'completed')` 路径，必须显式 defer 到本 cut

原因：

- PRD 与 test spec 都把这条 defer rule 写成硬门槛。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:121-145`, `.omx/plans/prd-task-system-followup-2026-04-23.md:158-187`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:16-18`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:82-88`
- 当前 trigger path 与 scheduled path 都会写 `completed`，并最终落到 store removal。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-290`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-600`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:865-874`, `src/stores/frames/sendTasksStore.ts:424-426`

落点：

- `cut 4/5` 即便改到这些 call site，也只能消费 cut 1 已定义的 meaning，不能重新解释 `completed` 和 `remove` 的关系。

### 1.4 被拒方案

#### 被拒方案 1：保留 `stop -> completed -> remove`，只额外记一个结束原因字段

拒绝原因：

- 这会保留当前核心塌陷：结束事实在进入容器之前就被删除，`completed` 仍然不是稳定事实。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`
- 它也违背了架构文档把 `已停止` 与 `已完成` 拆开的目标语言。证据：`easysdd/architecture/domain-task-system-ownership.md:253-259`

#### 被拒方案 2：先让 trigger 或 timer cut 顺带梳理 `completed/remove`

拒绝原因：

- PRD 已经把 lifecycle-end 定成唯一 hard gate；later cut 只能 defer，不能反客为主。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:13-21`, `.omx/plans/prd-task-system-followup-2026-04-23.md:170-173`

### 1.5 主流程概述

本文拍板后的正常路径应收敛为：

1. 任务进入 active path。
2. 如果收到显式 stop，请进入 `已停止`。
3. 如果任务工作自然结束且结果归口完成，请进入 `已完成`。
4. 进入结束事实后，任务仍保留在任务容器内，直到显式 `remove`。
5. `remove` 只移除容器占位，不再改写“为什么结束”。证据：`easysdd/architecture/domain-task-system-ownership.md:245-259`, `easysdd/architecture/domain-task-system-ownership.md:312-317`

关键边界/异常：

- active task 不允许靠 `remove` 直接结束，否则会把 control seam 偷渡进本 cut。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:61-67`
- `error` 仍保留现有口径；本 cut 不扩展 error taxonomy，只要求它不能再借 `completed/remove` 语义混写。假设：`error` 详细分型留给后续生命周期专题，不在本 cut 拍板。

## 2. 接口契约

### 2.1 契约 A：显式停止请求的可观察结果

```ts
// 输入：对一个 active task 发起 stop
stopTask('task-1')

// 期望可观察结果
getTaskById('task-1') === {
  id: 'task-1',
  status: 'stopped',
  // 仍然保留在任务容器里，等待显式 remove
}
```

// 来源：`src/composables/frames/sendFrame/useSendTaskController.ts` `stopTask`
// 来源：`src/stores/frames/sendTasksStore.ts` `getTaskById` / `updateTaskStatus` / `removeTask`

契约说明：

- `stopTask` 是结束意图入口，不再把 stop 语义编码成 `completed`。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`, `easysdd/architecture/domain-task-system-ownership.md:253-256`
- 停止后的任务必须仍可查询，否则结束事实无法被 monitor、后续 remove、验收文档消费。证据：`src/stores/frames/sendTasksStore.ts:390-426`, `src/composables/frames/sendFrame/useSendTaskManager.ts:30-33`

### 2.2 契约 B：自然完成路径的可观察结果

```ts
// 输入：一次性定时任务达到 repeatCount，或非 continueListening 的触发任务自然跑完
finishNaturally('task-2')

// 期望可观察结果
getTaskById('task-2') === {
  id: 'task-2',
  status: 'completed',
  // 仍可被 completed 视图/验收逻辑观察
}
```

// 来源：`src/composables/frames/sendFrame/useSendTaskExecutor.ts` `createTimedSender` / `createScheduledExecutor`
// 来源：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts` `executeTriggerTask`

契约说明：

- executor / trigger listener 仍可产生“自然完成”的结束事实，但它们不再拥有 `completed => remove` 的定义权。证据：`src/composables/frames/sendFrame/useSendTaskExecutor.ts:559-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:595-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:861-875`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:285-293`
- later cut 若碰这些路径，只能调用 cut 1 定义好的 lifecycle-end meaning。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:16-18`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:82-88`

### 2.3 契约 C：显式移除是独立动作

```ts
// 输入：对一个已停止或已完成的任务执行 remove
removeTask('task-1')

// 期望可观察结果
getTaskById('task-1') === undefined

// 输入：对一个仍在 running / waiting-* 的任务直接 remove
removeTask('task-3')

// 期望可观察结果
// 拒绝或 no-op，但不能把 active-task ending 偷渡成 remove
```

// 来源：`src/stores/frames/sendTasksStore.ts` `removeTask`
// 来源：`.omx/plans/prd-task-system-followup-2026-04-23.md` `cut 1` / `cut 2`

契约说明：

- `remove` 不负责解释 stop/completed 的来源，它只消费已结束的任务。证据：`src/stores/frames/sendTasksStore.ts:459-477`, `.omx/plans/prd-task-system-followup-2026-04-23.md:61-67`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`
- 这条约束是为了把 active-task authority 留在 lifecycle/control seam，而不是让 remove 变成另一种 stop。证据：`easysdd/architecture/domain-task-system-ownership.md:241-259`, `easysdd/architecture/domain-task-system-ownership.md:293-317`

### 2.4 契约 D：容器视图与统计面必须能观察到结束事实

```ts
// 输入：任务已进入 stopped / completed
getTaskStats()
completedTasks
currentTask

// 期望可观察结果
// 这些读取面能读到稳定结束事实，而不是因为 completed 立即 remove 导致“刚完成就不可见”
```

// 来源：`src/composables/frames/sendFrame/useSendTaskManager.ts` `getTaskStats` / `currentTask`
// 来源：`src/stores/frames/sendTasksStore.ts` `completedTasks`
// 来源：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue` 状态展示

契约说明：

- 现状里 `completedTasks` 与 `clearCompletedTasks` 的存在，和 `completed` 立即 remove 互相打架；cut 1 必须让这些读取面重新变得有意义。证据：`src/stores/frames/sendTasksStore.ts:194-199`, `src/stores/frames/sendTasksStore.ts:424-426`, `src/stores/frames/sendTasksStore.ts:482-491`
- 当前若 stop 不再映射为 `completed`，状态展示面还需要看得到 `stopped`，否则 UI 会把显式停止误显示为空或仍显示完成。证据：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:437-454`

## 3. 实现提示

### 3.1 改动计划

本 cut 的设计目标不是发明新功能，而是把现有混叠 seam 收紧成一个单一 authority。建议后续实现按下面 5 步推进：

1. 先把所有 lifecycle-end 写入口分类成三类：显式 stop、自然完成、显式 remove。
   - 退出信号：能列清 `useSendTaskController`、`useSendTaskExecutor`、`useSendTaskTriggerListener`、`sendTasksStore` 四类路径各自代表哪一种结束意图。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:550-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:812-875`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-304`, `src/stores/frames/sendTasksStore.ts:401-477`
2. 建立单一 lifecycle-end 语义入口，统一吸收 `已停止`、`已完成`、`移除` 的 canonical meaning。
   - 退出信号：后续文档和代码不再直接用“`completed` 顺便代表 stop / cleanup”表述。证据：`easysdd/compound/2026-04-23-explore-task-system-module-overview.md:275-329`
3. 把 stop path 从 `completed` 改成 `stopped`，并保持任务结束后仍可查询。
   - 退出信号：`stopTask()` 之后 `getTaskById()` 仍能拿到结束任务。证据：`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`, `src/stores/frames/sendTasksStore.ts:390-426`
4. 把自然完成与容器移除拆开，所有 natural-completion path 进入 `completed` 后等待显式 remove。
   - 退出信号：`completedTasks` / `currentTask` / 状态展示面能观察到自然完成任务。证据：`src/stores/frames/sendTasksStore.ts:194-199`, `src/composables/frames/sendFrame/useSendTaskManager.ts:30-33`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:437-454`
5. 做一轮 cross-cut 守护检查，确认 later cuts 的 defer rule 仍成立。
   - 退出信号：任何 touched path 若仍调用到 `completed`，都能说明它只是消费 cut 1 semantics。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:175-192`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:78-103`

### 3.2 实现风险与约束

- 风险 1：现有 UI/统计面默认只有 `completed` 成功色，不认识 `stopped`。
  - 影响面：`getTaskStats()`、计时任务对话框状态显示、monitor 列表展示。证据：`src/composables/frames/sendFrame/useSendTaskManager.ts:101-112`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:437-454`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`
  - 约束：本 cut 只定义 lifecycle-end meaning；若需要 UI 展示适配，也只能围绕“读到新结束事实”展开，不能顺手改 control ownership。

- 风险 2：现有 store 里 `completed` 同时被当作状态索引与立即删除触发器。
  - 影响面：`completedTasks`、`clearCompletedTasks`、状态索引一致性。证据：`src/stores/frames/sendTasksStore.ts:161-170`, `src/stores/frames/sendTasksStore.ts:194-199`, `src/stores/frames/sendTasksStore.ts:424-426`, `src/stores/frames/sendTasksStore.ts:482-491`
  - 约束：后续实现不能只改 controller/executor，不改容器语义；否则 seam 仍旧断裂。

- 风险 3：trigger/scheduled paths 现在都直接写 `completed`，later cut 很容易顺手重定义它。
  - 影响面：`executeTriggerTask`、定时发送完成、时间触发完成。证据：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:285-293`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:559-567`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:595-605`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:861-875`
  - 约束：这些路径的语义 authority 归 cut 1；later cut 只允许替换调用点，不允许改 meaning。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:121-145`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:63-76`

### 3.3 测试设计

按功能点组织，后续 execution/acceptance 至少要覆盖下面 4 组验证：

#### 功能点 1：显式停止语义

- 测试约束：`stop` 之后任务进入 `stopped`，而不是 `completed`。证据：`easysdd/architecture/domain-task-system-ownership.md:253-256`
- 验证方式：创建一个 running / waiting-trigger 任务，执行 stop，再检查任务是否仍可从容器查询到。
- 关键用例骨架：
  - `running -> stop -> stopped`
  - `waiting-trigger -> stop -> stopped`
  - `paused -> stop -> stopped`（如果实现允许 paused 停止）

#### 功能点 2：自然完成语义

- 测试约束：natural completion 进入 `completed` 后不得自动 remove。证据：`easysdd/architecture/domain-task-system-ownership.md:257-258`, `src/stores/frames/sendTasksStore.ts:424-426`
- 验证方式：跑完一次性定时任务、非 continueListening 的触发任务，然后检查 `getTaskById` / `completedTasks` / 状态展示面。
- 关键用例骨架：
  - `timed repeatCount reached -> completed -> still queryable`
  - `scheduled once executed -> completed -> still queryable`
  - `triggered continueListening=false -> completed -> still queryable`

#### 功能点 3：显式移除语义

- 测试约束：remove 只能消费 `stopped / completed`，不能越权结束 active task。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:61-67`, `.omx/plans/prd-task-system-followup-2026-04-23.md:71-86`
- 验证方式：分别对 terminal task 和 active task 执行 remove，确认 terminal task 被移除、active task 不被偷渡结束。
- 关键用例骨架：
  - `stopped -> remove -> undefined`
  - `completed -> remove -> undefined`
  - `running -> remove -> rejected/no-op`

#### 功能点 4：cross-cut defer 守护

- 测试约束：任何 later cut 的执行说明，只要碰 `updateTaskStatus(..., 'completed')`，都必须声明“lifecycle-end meaning belongs to cut 1”。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:14-23`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:82-88`
- 验证方式：future execution note / acceptance note 做文档级 gate review，而不是只看代码 diff。
- 关键用例骨架：
  - `cut 4` touched completed path but still defers
  - `cut 5` touched completed path but still defers

## 4. 与项目级架构文档的关系

### 4.1 直接关联的架构文档

- `easysdd/architecture/domain-task-system-ownership.md`
  - 本文把那份架构文档里的正式语言压实到一个可执行 seam：`已停止`、`已完成`、清理分离。证据：`easysdd/architecture/domain-task-system-ownership.md:245-259`, `easysdd/architecture/domain-task-system-ownership.md:312-317`
- `easysdd/architecture/topology-receive-send-mainlines.md`
  - 本文不改 receive/send 边界，但要求后续 trigger/timer cut 触碰 completion path 时只能 defer 到 cut 1，而不能重写 lifecycle-end meaning。证据：`easysdd/architecture/topology-receive-send-mainlines.md:177-181`, `easysdd/architecture/topology-receive-send-mainlines.md:483-487`, `.omx/plans/prd-task-system-followup-2026-04-23.md:108-145`

### 4.2 对项目级架构文档的影响判断

- 当前不直接改 architecture doc；本稿先作为 feature design，把 code-facing semantics 固定下来。
- 如果 cut 1 后续实现并验收通过，建议补一条 architecture follow-up：
  - 在 `domain-task-system-ownership.md` 或架构总入口中补一句代码映射口径，明确“`remove` 是容器 cleanup，不再是 `completed` 的副作用”。
  - 在同处补一句 later-cut defer 规则，明确触碰 `updateTaskStatus(..., 'completed')` 的 later cut 不得吸收 lifecycle-end authority。

### 4.3 本稿与 overview / PRD / test-spec 的关系

- 与 overview 的关系：overview 负责识别 seam；本文把 seam 变成一份可执行设计输入。证据：`easysdd/compound/2026-04-23-explore-task-system-module-overview.md:275-329`
- 与 PRD 的关系：PRD 负责 cut 排序和边界；本文只细化 `cut 1` 的设计，不回写 cut 顺序。证据：`.omx/plans/prd-task-system-followup-2026-04-23.md:17-21`, `.omx/plans/prd-task-system-followup-2026-04-23.md:53-67`
- 与 test spec 的关系：test spec 负责 future verification gate；本文把 gate 落到本 cut 的接口契约与测试设计上。证据：`.omx/plans/test-spec-task-system-followup-2026-04-23.md:27-33`, `.omx/plans/test-spec-task-system-followup-2026-04-23.md:78-103`
