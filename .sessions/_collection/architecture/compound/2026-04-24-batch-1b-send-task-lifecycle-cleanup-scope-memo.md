---
doc_type: explore
type: cleanup-scope-memo
memo_type: Batch 1B send-task-lifecycle cleanup scope memo
status: current
date: 2026-04-24
summary: Scope memo for Batch 1B send-task lifecycle cleanup, covering local send execution objects, center-task fact misuse risks, lifecycle-state semantic risks, per-layer ownership and side effects, F03-F06 exposure boundaries, and deferred feature-design questions.
tags:
  - cleanup-first
  - batch-1b
  - send-task
  - task-lifecycle
  - local-execution-state
---

# Batch 1B send-task-lifecycle cleanup scope memo

## Scope guard

Evidence:

- Batch 1B 的模块范围已被限定为 `sendTasksStore`、`useSendTaskManager`、`useSendTaskExecutor`、`useSendTaskController`、`FrameSendPage.vue` 与 `taskManager.ts`。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:205-220`
- Batch 1B 的 gate decision 是：F03-F06 设计前必须先清 send-task lifecycle，避免把中心任务事实错误绑定到本地 send task 状态。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:41-47`
- 架构文档已明确：现有发送任务对象不等于中心任务上下文；现有发送任务更接近本地发送执行能力的任务对象。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:50-55`
- 任务系统文档明确层级关系：中心任务上下文 > 用例执行上下文 > 本地发送执行对象。`refactor/docs/03-architecture/06-任务系统归口方式.md:163-180`

Scope decision:

- 本 memo 只收窄 Batch 1B 的责任边界。
- 本 memo 不写实现方案，不定义 spec 字段，不设计未来任务状态机，不把现有 `sendTasksStore` 当作未来中心任务系统。
- 本 memo 对 F03-F06 只说明 Batch 1B cleanup 后应暴露的最小边界与禁止外放项，不替这些 feature 做 design。

## 1. 当前 send-task cluster 中哪些是本地发送执行对象

Evidence:

- `TaskStatus` 当前定义为 `idle / running / paused / completed / error / waiting-trigger / waiting-schedule`。`src/stores/frames/sendTasksStore.ts:23-30`
- `SendTask` 当前绑定 `type`、`status`、`config`、`progress`、`timers`、`errorInfo`、创建 / 启动 / 完成时间等本地任务字段。`src/stores/frames/sendTasksStore.ts:109-122`
- `FrameInstanceInTask` 当前绑定发送实例、目标、间隔、局部实例状态和参数变化配置。`src/stores/frames/sendTasksStore.ts:43-54`
- `CachedFrameInstance` 是 executor 内部的任务实例缓存，保存原始实例、缓存实例和参数变化游标。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:20-28`
- executor 通过 `frameInstanceCaches` 按 `taskId` 持有本地执行缓存。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:46-48`
- `sendTasksStore` 持有触发监听器实例，并对外提供注册、注销、接收帧转发和监听器统计。`src/stores/frames/sendTasksStore.ts:149-150`, `src/stores/frames/sendTasksStore.ts:533-562`
- `SendTask.timers` 用于记录任务停止时要清理的定时器 ID。`src/stores/frames/sendTasksStore.ts:116`

Inference:

- 当前 send-task cluster 的事实对象主要是本地发送执行对象、发送实例局部状态、调度资源、触发监听资源和执行缓存。
- 这些对象可以作为未来任务系统下层能力或发送主链前的局部执行载体，但不能直接等同中心任务上下文、用例执行上下文或统一运行主状态。

Scope decision:

- Batch 1B 中可被保留为本地发送执行对象的，是 `SendTask`、`FrameInstanceInTask`、executor 缓存、timer 引用、trigger listener 引用、progress/config cache 等局部执行事实。
- 这些事实只能说明“本地发送动作如何被组织和推进”，不能说明“中心任务现在处于什么正式生命周期”。

## 2. 哪些被误用或容易被误用为中心任务事实

Evidence:

- `sendTasksStore` 同时维护任务数组、状态索引、任务映射、活跃任务计算视图、已完成 / 错误 / 等待触发任务视图。`src/stores/frames/sendTasksStore.ts:145-214`
- `updateTaskStatus` 是当前任务状态写入主入口，且会在 `completed` 时立即删除任务。`src/stores/frames/sendTasksStore.ts:401-426`
- `useSendTaskManager` 聚合 creator、executor、controller，并向外暴露创建、启动、停止、暂停、恢复、状态查询、统计和监听器查询。`src/composables/frames/sendFrame/useSendTaskManager.ts:15-23`, `src/composables/frames/sendFrame/useSendTaskManager.ts:180-222`
- `useSendTaskExecutor` 是当前写入 `running`、`waiting-trigger`、`waiting-schedule`、`completed`、`error`、`paused` 的主力执行层。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-485`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:490-537`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:661-728`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:733-976`
- `FrameSendPage` 持有任务监控弹窗入口、定时发送弹窗、触发发送弹窗、顺序发送弹窗和即时发送入口。`src/pages/FrameSendPage.vue:153-193`, `src/pages/FrameSendPage.vue:264-400`
- 架构文档明确禁止现有发送任务监控列表中的任务状态、页面工作台显示、接收共享状态、历史记录等反向充当主状态事实源。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:223-231`

Inference:

- `SendTask.status`、`activeTasks`、manager 统计、任务监控视图、trigger listener 注册状态、timer 注册状态、页面“任务监控”入口，都容易被误读为中心任务事实或统一执行状态。
- `useSendTaskManager` 因为是聚合入口，最容易在后续 F03/F04 中被误当成“中心任务入口”；但当前证据只支持它是本地发送任务入口。

Scope decision:

- Batch 1B 必须把这些对象降级为本地执行态、监控态、展示态或基础设施资源。
- 它们可以被任务系统消费或映射，但不能直接外放为 F03 中心任务上下文、F04 启动事实、F05 停止事实或 F06 统一执行状态事实。

## 3. `completed / stopped / paused / waiting-trigger / waiting-schedule / running` 的语义风险

### 3.1 `completed`

Evidence:

- `updateTaskStatus` 在状态为 `completed` 时直接调用 `removeTask(id)`。`src/stores/frames/sendTasksStore.ts:424-426`
- `removeTask` 会从状态索引、`taskMap` 和 `tasks` 数组中移除任务。`src/stores/frames/sendTasksStore.ts:461-477`
- 顺序任务、定时任务、时间触发任务自然结束时都会写入 `completed`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:516-518`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:559-606`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:861-878`

Inference:

- 当前 `completed` 不是稳定的终态留痕；它更像“本地执行对象可被移除”的清理触发。
- 若将它外放为中心任务“已完成”，会混淆任务自然完成、局部发送完成、结果归口落定和对象清理。

Scope decision:

- Batch 1B 内不得把当前 `completed` 语义外放为中心任务已完成事实。

### 3.2 `stopped`

Evidence:

- 当前 `TaskStatus` 没有 `stopped` 枚举。`src/stores/frames/sendTasksStore.ts:23-30`
- `stopTask` 在清理 timer 和触发监听器后，将任务状态写成 `completed`。`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`
- 任务系统文档明确“停止中 -> 已停止”或“停止中 -> 异常中止 / 完成”应是任务系统吸收停止请求后的正式事实。`refactor/docs/03-architecture/06-任务系统归口方式.md:198-200`

Inference:

- 当前停止语义被折叠进 `completed`，无法区分显式停止、自然完成和异常收束。

Scope decision:

- Batch 1B 只能记录“当前没有可靠 stopped 事实”这一边界；未来停止语义必须 deferred 到任务生命周期设计。

### 3.3 `paused`

Evidence:

- `pauseTask` 只在当前任务为 `running` 时允许执行，并将任务状态写为 `paused`。`src/composables/frames/sendFrame/useSendTaskController.ts:70-85`
- `pauseTask` 注释明确：当前只是简单更新状态，具体暂停逻辑需要在各任务执行函数中实现。`src/composables/frames/sendFrame/useSendTaskController.ts:77-81`
- `resumeTask` 只把 `paused` 改回 `running`，注释明确实际定时器恢复需要重新启动任务。`src/composables/frames/sendFrame/useSendTaskController.ts:97-111`
- executor 中 `isTaskStillRunning` 默认只把 `running` 和 `waiting-trigger` 视为仍在运行。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:123-135`

Inference:

- 当前 `paused` 是本地控制显示 / 中断提示状态，不是完整调度暂停语义。
- 将它外放为 F06 统一状态会让外部误以为 timer、listener、执行游标、发送批次都已经进入可恢复暂停态。

Scope decision:

- Batch 1B 不拍板 pause/resume 是否属于未来正式生命周期，只确认当前 `paused` 不能直接外放。

### 3.4 `waiting-trigger`

Evidence:

- 条件触发任务启动时写入 `waiting-trigger`，随后注册触发监听器。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:754-780`
- `stopTask` 只在任务处于 `waiting-trigger` 时注销触发监听器。`src/composables/frames/sendFrame/useSendTaskController.ts:49-53`
- store 的 `activeTasks` 把 `waiting-trigger` 视为活跃任务。`src/stores/frames/sendTasksStore.ts:177-185`
- 任务系统文档明确等待触发语义归任务系统，不归接收监听器。`refactor/docs/03-architecture/06-任务系统归口方式.md:302-307`

Inference:

- 当前 `waiting-trigger` 同时表示“生命周期等待触发”和“listener 已注册 / 等待 receive 转发”，二者混在一起。

Scope decision:

- Batch 1B 后对外只能承认它是本地触发监听执行态，不能把 listener 注册状态外放为正式等待触发生命周期事实。

### 3.5 `waiting-schedule`

Evidence:

- 时间触发 executor 启动时写入 `waiting-schedule`，并记录下一次执行时间。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:899-906`
- 重复时间触发任务在一次执行后会重新写入 `waiting-schedule`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:839-860`
- controller 的 `getActiveTasksCount` 和 `canStopTask` 只统计 / 允许 `running`、`paused`、`waiting-trigger`，不包含 `waiting-schedule`。`src/composables/frames/sendFrame/useSendTaskController.ts:152-165`
- manager 的 `getTaskStats` 统计 `waitingTrigger`，但没有统计 `waiting-schedule`。`src/composables/frames/sendFrame/useSendTaskManager.ts:101-113`

Inference:

- 当前 `waiting-schedule` 在 executor 层被当作活跃等待态，但在 controller / manager 统计与控制判断中不是完整的一等状态。
- 它混合了时间语义、timer 注册资源和 UI 可见性口径。

Scope decision:

- Batch 1B 不应把当前 `waiting-schedule` 直接外放为正式等待调度状态；它只能作为本地时间触发执行态证据。

### 3.6 `running`

Evidence:

- 顺序任务和定时任务启动时写入 `running`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:499-501`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:688-690`
- 时间触发任务实际执行时从 `waiting-schedule` 切为 `running`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:812-822`
- 发送失败且目标不可用时，executor 会把任务写为 `paused`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:231-237`
- 发送主链文档明确发送主链可以持有当前发送中、局部失败等局部执行状态，但不能持有系统级运行语义。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:288-310`

Inference:

- 当前 `running` 覆盖顺序发送、定时发送、时间触发正在执行、条件触发响应发送等多种本地执行窗口。
- 它不能证明中心任务已启动、当前用例正在执行、任务结果归口正在推进或子系统整体处于运行中。

Scope decision:

- Batch 1B 后 `running` 只能作为本地发送执行态，不作为 F06 统一执行状态事实。

## 4. 页面、controller、executor、store、boot 分别持有什么生命周期事实或副作用

### 4.1 `sendTasksStore`

Evidence:

- 持有 `tasks`、`statusIndexes`、`taskMap`，并维护活跃 / 运行 / 完成 / 错误 / 等待触发计算视图。`src/stores/frames/sendTasksStore.ts:145-214`
- 持有 progress/config cache，并支持批量同步与强制同步。`src/stores/frames/sendTasksStore.ts:265-358`
- `addTask` 创建本地任务并写入索引和数组。`src/stores/frames/sendTasksStore.ts:364-385`
- `updateTaskStatus` 是状态写入、时间戳写入、错误信息写入和 completed 删除触发点。`src/stores/frames/sendTasksStore.ts:401-434`
- 持有任务删除、清空完成、清空错误、清空全部、停止所有运行中任务等清理入口。`src/stores/frames/sendTasksStore.ts:461-527`
- 持有触发监听器注册、注销、接收帧转发和统计入口。`src/stores/frames/sendTasksStore.ts:533-575`

Scope decision:

- Store 当前持有的是本地任务执行事实、索引和执行资源入口。
- Store 不能被视为中心任务事实源，也不能作为 F06 single writer。

### 4.2 `useSendTaskExecutor`

Evidence:

- 持有 `isProcessing`、`processingError` 和 `frameInstanceCaches`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:42-48`
- `startTask` 按任务类型分发到 sequential / timed / triggered。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-485`
- 顺序任务负责实例缓存初始化、写入 `running`、处理多实例、写入 `completed/error`、清理缓存。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:490-537`
- 定时任务负责 timer 注册、重复执行、进度更新、写入 `completed/error`、清理 timer 和缓存。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:542-728`
- 条件触发任务负责写入 `waiting-trigger` 并注册触发监听器。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:733-789`
- 时间触发任务负责写入 `waiting-schedule`、注册 timeout、到时写入 `running`，重复时再回到 `waiting-schedule`。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:794-976`

Scope decision:

- Executor 是当前生命周期写入和副作用最集中的本地执行层。
- Executor 的状态写入只能证明本地执行器如何推进，不应外放为中心任务推进事实。

### 4.3 `useSendTaskController`

Evidence:

- `stopTask` 只处理 `running / paused / waiting-trigger`，清理 timer 和触发监听器后写为 `completed`。`src/composables/frames/sendFrame/useSendTaskController.ts:26-57`
- `pauseTask` 只允许 `running` 进入 `paused`。`src/composables/frames/sendFrame/useSendTaskController.ts:70-85`
- `resumeTask` 只允许 `paused` 回到 `running`。`src/composables/frames/sendFrame/useSendTaskController.ts:97-111`
- `getActiveTasksCount`、`canStopTask` 都只覆盖 `running / paused / waiting-trigger`。`src/composables/frames/sendFrame/useSendTaskController.ts:152-165`
- `forceCleanupTask` 清理 timer / listener 后写入 `error`。`src/composables/frames/sendFrame/useSendTaskController.ts:191-220`

Scope decision:

- Controller 持有的是本地控制动作和清理副作用，不拥有未来正式生命周期解释权。
- Stop / pause / resume 当前只能作为现状风险证据，不是未来控制语义设计。

### 4.4 `useSendTaskManager`

Evidence:

- Manager 聚合 store、creator、executor、controller。`src/composables/frames/sendFrame/useSendTaskManager.ts:15-23`
- Manager 本地只持有 `currentTaskId`，并基于它派生 `currentTask`。`src/composables/frames/sendFrame/useSendTaskManager.ts:24-33`
- Manager 包装创建任务逻辑并设置当前任务 ID。`src/composables/frames/sendFrame/useSendTaskManager.ts:47-80`
- Manager 包装 stop 后清空当前任务 ID。`src/composables/frames/sendFrame/useSendTaskManager.ts:82-89`
- Manager 提供本地任务统计，但统计项没有覆盖 `waiting-schedule`。`src/composables/frames/sendFrame/useSendTaskManager.ts:101-113`

Scope decision:

- Manager 是本地发送任务门面和选择态入口，不是中心任务入口。
- Manager 输出可以作为 UI / 本地监控读取面，但不能成为 F03-F06 的正式事实面。

### 4.5 `FrameSendPage.vue`

Evidence:

- 页面持有本地 UI 状态：搜索、发送中、批量编辑、发送错误、排序、多个弹窗开关。`src/pages/FrameSendPage.vue:33-50`
- 即时发送通过 `useUnifiedSender` 直接发送当前实例，并把错误写入页面本地 `sendError`。`src/pages/FrameSendPage.vue:109-151`
- 页面提供定时发送、触发发送、顺序发送和任务监控弹窗入口。`src/pages/FrameSendPage.vue:153-193`, `src/pages/FrameSendPage.vue:316-400`
- 页面定时刷新发送实例统计。`src/pages/FrameSendPage.vue:227-231`
- 架构文档明确页面和组件可以提供入口和监控视图，但不能直接改写任务级或用例级生命周期事实。`refactor/docs/03-architecture/06-任务系统归口方式.md:274-289`

Scope decision:

- 页面只应被视为工作台入口、即时发送入口和监控 / 配置展示面。
- 页面态、弹窗态、按钮态、即时发送错误不应外放为中心任务生命周期事实。

### 4.6 `src/boot/taskManager.ts`

Evidence:

- boot 初始化网络 store。`src/boot/taskManager.ts:8-15`
- `beforeunload` 中扫描所有 `sendTasksStore.tasks`，对 `task.timers` 调用 `clearTimeout` / `clearInterval`。`src/boot/taskManager.ts:17-38`
- `beforeunload` 同时清理网络监听并断开全部网络连接。`src/boot/taskManager.ts:40-44`
- `visibilitychange` 只记录页面隐藏 / 可见日志，隐藏时声明任务继续后台运行。`src/boot/taskManager.ts:50-57`
- 任务系统文档明确页面卸载清理只能是退出场景下的兜底，不再是正常任务生命周期的一部分。`refactor/docs/03-architecture/06-任务系统归口方式.md:204-206`

Scope decision:

- Boot cleanup 是应用退出兜底和资源释放边界。
- 它不能成为任务完成、停止、暂停、等待调度或正常清理的生命周期 owner。

## 5. 哪些事实绝不能外放给 F03-F06

Evidence:

- F03-F06 已全部 gate 为 `cleanup-first`，不能直接 design。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:47`
- F03/F04/F05/F06 分别压到接收任务上下文建立、任务启动、任务停止 / 中止控制、统一执行状态事实。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:171-174`
- `04` 明确主状态 single writer，派生投影不能反写事实。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:215-231`
- `06` 明确页面和组件只能发起控制意图，不能直接改写任务级或用例级生命周期事实。`refactor/docs/03-architecture/06-任务系统归口方式.md:274-289`

Scope decision:

- 绝不能外放 `SendTask` 作为 F03 中心任务上下文。
- 绝不能外放 `SendTask.status` 作为 F06 统一执行状态事实。
- 绝不能外放当前 `completed / paused / waiting-trigger / waiting-schedule / running` 语义作为未来中心任务生命周期枚举。
- 绝不能外放 `stopTask -> completed` 作为 F05 停止语义。
- 绝不能外放 timer/listener 是否存在，作为正式等待调度、等待触发或运行事实。
- 绝不能外放 `activeTasks`、manager 统计、任务监控视图、页面按钮态，作为任务主事实。
- 绝不能外放 boot unload 清理，作为正常任务清理或任务终止事实。
- 绝不能把发送成功、发送实例完成、本地任务删除，外放为用例结果事实或任务结果归口事实。

## 6. 1B cleanup 后应该向 1A、1C、F03-F06 暴露什么最小边界

### 6.1 向 Batch 1A 接收输入暴露的最小边界

Evidence:

- 任务系统消费的是接收主链输出，不是接收 store 当前长什么样。`refactor/docs/03-architecture/06-任务系统归口方式.md:326-349`
- 接收主链只能输出明确的触发候选输入或等价运行输入，不能继续直接承担任务编排事实源。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:428-432`

Scope decision:

- Batch 1B 只应接收 1A 已经归一后的触发候选输入或等价运行输入。
- Batch 1B 不应要求下游回读 `groups / mappings / allReceiveFrameData` 来补齐本地任务语义。
- Batch 1B 不定义 1A 的输入字段，只确认接收共享状态不能继续成为 send-task 的隐式事实源。

### 6.2 向 Batch 1C 发送链暴露的最小边界

Evidence:

- 任务系统向发送主链发出的应是显式发送请求，而不是把任务对象整包塞给发送链。`refactor/docs/03-architecture/06-任务系统归口方式.md:351-367`
- 发送主链返回给任务系统的应是标准化执行结果，而不是新的任务事实定义。`refactor/docs/03-architecture/06-任务系统归口方式.md:368-379`

Scope decision:

- Batch 1B 后向 1C 暴露的应只是本地发送执行载体可被翻译出的显式发送请求和上下文引用。
- Batch 1B 不应把完整 `SendTask`、当前 `TaskStatus`、timer/listener 资源状态、页面监控状态交给 1C 解释。
- 1C 返回的发送执行结果也不能反向宣布中心任务完成、用例完成或结果归口完成。

### 6.3 向 F03-F06 暴露的最小边界

Scope decision:

- 向 F03 暴露：当前 send-task cluster 可作为本地发送执行载体证据，不是中心任务上下文来源。
- 向 F04 暴露：当前 executor 可证明已有本地顺序 / 定时 / 触发发送能力，但不能证明未来中心任务启动模型。
- 向 F05 暴露：当前 stop / pause / resume 语义不稳定，尤其 stop 映射到 completed；只能作为禁止继承的现状证据。
- 向 F06 暴露：当前任务状态是本地执行态 / 监控态 / 资源状态混合体，不能作为统一执行状态事实。

Inference:

- Batch 1B 的核心交付不是新对象，而是把“本地发送执行对象”与“中心任务事实”之间的边界压清。

## 7. 哪些问题必须 deferred 到 feature design，不在 cleanup scope 内拍板

Deferred:

- 中心任务上下文、用例执行上下文、生命周期控制状态、结果归口状态的字段结构。
- 未来任务状态机是否包含 `stopping / stopped / aborted / completed / failed` 等正式状态，以及它们如何命名。
- `pause / resume` 未来是任务级正式语义、用例级正式语义，还是控制语义下的附属状态。`refactor/docs/03-architecture/06-任务系统归口方式.md:309-312`
- 停止、异常中止、自然完成、结果落定、报告可交付之间的终态关系。
- 手工工作台发送未来是否全部走任务系统统一入口，还是保留一部分显式非任务发送入口。`refactor/docs/03-architecture/06-任务系统归口方式.md:111-114`
- 本地发送执行对象里的局部重试、局部延时、局部超时，哪些保留为发送域局部状态，哪些提升到任务系统调度层。`refactor/docs/03-architecture/06-任务系统归口方式.md:215-219`
- F07 状态查询 / 自检投影、F08 心跳、F13 报告交付、F14 错误 / 拒绝语义、F15 设备信息投影。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:261-274`
- F09-F12 的结果事实、本地记录、报告素材、报告对象、对外交付边界；Batch 1B 只标注现有 send-task completion 不能直接升级为结果事实。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:249-259`
- SCOE 是否通过任务系统、发送主链或领域边界接入，以及 SCOE 自己的领域执行上下文。Batch 1B 只记录 send-task cluster 的通用边界，不替 Batch 1D 或 SCOE feature design 拍板。

## Final scope decision

Scope decision:

- 当前 send-task cluster 应被收窄为本地发送执行 / 调度 / 监控簇。
- `sendTasksStore` 是本地执行对象、状态索引、监听器入口和缓存同步的归口，不是未来中心任务系统。
- `useSendTaskExecutor` 是本地执行副作用集中点，不是中心任务 executor。
- `useSendTaskController` 是本地控制动作入口，不拥有正式生命周期解释权。
- `useSendTaskManager` 是本地发送任务门面，不是 F03/F04 的中心任务入口。
- `FrameSendPage` 是发送工作台和监控入口，不是任务事实来源。
- `taskManager.ts` 是退出兜底清理，不是正常生命周期 owner。
- Batch 1B 的 cleanup 目标是阻断本地执行态向 F03-F06 的事实外溢，而不是提前设计未来任务系统。
