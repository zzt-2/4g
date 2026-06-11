---
doc_type: explore
type: code-reality-check
memo_type: code reality check before 1A cleanup plan
status: current
date: 2026-04-24
summary: Code-level reality checkpoint between Batch 1ABC sequencing and the 1A first-cut cleanup plan, verifying the receive input -> trigger listener chain, real entry points, side paths, protected current behavior, and boundaries that must not drift into 1B/1C/SCOE/result design.
tags:
  - cleanup-first
  - batch-1a
  - code-reality
  - receive-chain
  - trigger-boundary
---

# Code reality check before 1A cleanup plan

## Scope Guard

Evidence:

- Guardrail 要求当前链路先清理事实源和边界，防止把现有 `receiveFramesStore`、`sendTasksStore`、`useUnifiedSender`、SCOE 特判、history/storage/files 工具层升格为目标架构事实。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:19-25`
- Gate 2 要求进入 cleanup plan 前已经明确第一刀链路、不做哪些功能设计、回归保护面，以及遇到 SCOE 或 F09-F12 是否需要补观察。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:87-101`
- cleanup plan 仍禁止设计中心任务字段、生命周期枚举、JSON 报告字段、北向协议和 SCOE 专题能力。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:103-109`
- Sequencing 已裁定第一刀只围绕 1A 直接链路，即 `receiveFramesStore` 当前接收输入事实、接收副作用边界、触发检查到 listener 的隐式事实链。`easysdd/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:79-87`

Code reality:

- 本 checkpoint 只核对真实调用路径和现有行为边界，不写实现方案、不写 spec 字段、不提出代码改法。
- 本 checkpoint 最终只作为 `1A first-cut cleanup plan` 的前置事实校验，不替 cleanup plan 本身写步骤。

## 1. Sequencing 第一刀事实链是否成立

Evidence:

- 串口 store 在创建时持有 `receiveFramesStore`。`src/stores/serialStore.ts:31-34`
- 串口连接成功后调用 `setupPortListeners(portPath)`。`src/stores/serialStore.ts:177-193`
- 串口数据回调先按 `portPath` 过滤，再把 `data.data` 转成 `Uint8Array` 调用 `receiveFramesStore.handleReceivedData('serial', portPath, ...)`。`src/stores/serialStore.ts:391-419`
- 网络 store 在 `setupNetworkDataHandling` 中获取 `receiveFramesStore`，注册 `networkAPI.onData` 后把接收数据转成 `Uint8Array` 调用 `receiveFramesStore.handleReceivedData('network', connectionId, ...)`。`src/stores/netWorkStore.ts:197-219`
- 网络初始化会执行 `setupNetworkDataHandling()`，boot 阶段会调用 `networkStore.initialize()`。`src/stores/netWorkStore.ts:296-300`, `src/boot/taskManager.ts:5-15`
- `handleReceivedData` 的入参只有 `source`、`sourceId`、`data`，并通过 `processingLock` 与 `pendingProcessQueue` 串行处理。`src/stores/frames/receiveFramesStore.ts:805-891`
- 通用接收解析调用点是 `receiveAPI.handleReceivedData(source, sourceId, data)`，Electron receive API 不可用时返回 `success: false`。`src/stores/frames/receiveFramesStore.ts:1023-1025`, `src/api/common/receiveApi.ts:21-48`
- 解析成功后，接收 store 以 `frameId`、`source + ':' + sourceId`、`updatedDataItems` 调用 `checkTriggerConditions`。`src/stores/frames/receiveFramesStore.ts:1127-1138`
- `checkTriggerConditions` 将更新项补成 `DataItem[]` 后调用 `sendTasksStore.handleFrameReceived(frameId, sourceId, dataItems)`。`src/stores/frames/receiveFramesStore.ts:1186-1227`
- `sendTasksStore.handleFrameReceived` 只转发到 trigger listener。`src/stores/frames/sendTasksStore.ts:553-562`
- trigger listener 匹配 `triggerFrameId` 与 `sourceId`，并要求任务仍是 `waiting-trigger`，条件成立后调用 `executeTriggerTask`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-92`

Code reality:

- Sequencing 假设的第一刀主链成立：`serial/network inbound -> receiveFramesStore.handleReceivedData -> receiveAPI/common parse -> checkTriggerConditions -> sendTasksStore.handleFrameReceived -> useSendTaskTriggerListener`。
- 代码现实需要补一条更窄的事实：`checkTriggerConditions` 在转发前不是纯透传，它会回读 `groups`，用当前接收配置/显示对象补 `DataItem[]`。`src/stores/frames/receiveFramesStore.ts:1199-1225`
- trigger listener 也不是纯消费本次接收更新，它会反读 `receiveFramesStore.mappings` 来把 condition 的 `fieldId` 映射到 data item。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:160-184`

Inference:

- “第一刀从接收输入事实到触发候选 / listener 隐式链切”是被代码支持的最强判断。
- “当前代码已经存在稳定的 trigger candidate 正式对象”不成立；代码只提供 `frameId + sourceId + updatedDataItems/DataItem[]` 这条现状链路证据。

Plan implication:

- 1A cleanup plan 必须重点覆盖接收入口、串行处理、解析结果、副作用更新、触发转发、listener 反读映射这条链。
- cleanup plan 不能把 `DataItem[]`、`groups`、`mappings` 或 `allReceiveFrameData` 直接当作未来任务输入事实。
- `receiveAPI.handleReceivedData` 当前经过 renderer common API 到 preload / IPC 的 Platform API 路径；1A cleanup plan 可以保护它的现有行为，但不应顺手修改 `contextIsolation`、`contextBridge`、`window.electron.*` 或 `src/api/common/*Api.ts`。

## 2. 遗漏入口、旁路与反向依赖

Evidence:

- 在限定检索范围内，`handleReceivedData` 的真实入站调用只落在串口和网络两处。`src/stores/serialStore.ts:416`, `src/stores/netWorkStore.ts:212`
- `receiveFramesStore` return 面公开了 `handleReceivedData`、`clearReceiveStats`、`getRecentPackets`、`allReceiveFrameData`、`groups`、`mappings`、`frameStats` 等读写面。`src/stores/frames/receiveFramesStore.ts:1333-1386`
- SCOE 旁路发生在 `sourceId === 'scoe-tcp-server'`：先调用 `handleScoeFrame(data)`，若返回 true 则直接 return，不进入通用 `receiveAPI.handleReceivedData`。`src/stores/frames/receiveFramesStore.ts:1015-1021`
- `handleScoeFrame` 会初始化 SCOE store / frame instances / command executor，调用 `isScoeFrame`，并在命中后做校验、参数提取、`executeCommand` 和 `scoeStore.addReceiveData`。`src/stores/frames/receiveFramesStore.ts:899-991`
- `isScoeFrame` 自身含 SCOE 未加载时只接受 `01` 加载指令的规则。`src/utils/receive/scoeFrame.ts:167-213`
- 表达式管理器直接读取 `receiveFramesStore.mappings`、`groups`、`allReceiveFrameData` 来计算和回填接收表达式。`src/composables/frames/useFrameExpressionManager.ts:21-24`, `src/composables/frames/useFrameExpressionManager.ts:354-395`, `src/composables/frames/useFrameExpressionManager.ts:443-462`
- SCOE 完成条件检查会读取 `useReceiveFramesStore().allReceiveFrameData`。`src/utils/receive/scoeFrame.ts:416-432`
- SCOE 链路自检命令会读取 `receiveFramesStore.groups`。`src/composables/scoe/commands/linkCheck.ts:14-35`
- 应用生命周期会在 mounted 时 `loadConfig`，并在清理逻辑中调用 `clearDataItemValues` 与 `saveConfig`。`src/layouts/useAppLifecycle.ts:17-38`, `src/layouts/useAppLifecycle.ts:44-50`

Code reality:

- 未发现绕过 `receiveFramesStore.handleReceivedData` 直接进入 trigger listener 的入站帧路径；当前接收触发入口仍在 receive store 内部。
- 已存在一个明确旁路：SCOE 来源命中后可能跳过通用解析链。
- 已存在多类反向依赖：表达式、SCOE completion/link-check、页面展示/统计/配置组件都读取 receive store 的共享状态。它们是现状消费面，不是任务输入事实源。

Inference:

- “没有遗漏的串口/网络入站入口”在本轮限定检索内可信度高；但这不是全仓证明，因为本轮按用户要求没有全仓漫游。
- “反向依赖需要全部在 1A 内清掉”不成立；1A 只需要识别并保护/隔离其影响，不能扩成表达式、SCOE 或展示系统改造。

Plan implication:

- cleanup plan 应把 SCOE 早退、表达式回读、SCOE completion/link-check 回读列为观察点和停线点。
- cleanup plan 不应把页面展示、表达式、SCOE 读点纳入第一刀实现范围。

## 3. 必须保护的现有行为

Evidence:

- 串口入口按端口过滤并保存最近接收消息，再调用统一接收处理。`src/stores/serialStore.ts:391-419`
- 网络入口把原始数据转成 `Uint8Array` 后调用统一接收处理，并更新连接活动时间。`src/stores/netWorkStore.ts:207-218`
- `handleReceivedData` 保证同一入口串行处理，队列请求逐个 `processDataInternal`，最后在 `finally` 释放锁。`src/stores/frames/receiveFramesStore.ts:857-891`
- 每次处理先更新全局接收包数和字节数。`src/stores/frames/receiveFramesStore.ts:1011-1013`
- 通用解析失败会更新未匹配 / 解析错误统计，记录 recent packet 并保留 warning。`src/stores/frames/receiveFramesStore.ts:1027-1045`
- 解析成功会记录 recent packet、更新 `frameDataCache`、回填 `groups` 当前值、触发表达式计算、收集星座图数据、更新 `frameStats`，再触发条件检查。`src/stores/frames/receiveFramesStore.ts:1050-1138`
- `clearReceiveStats` 会同时清空 recent packets、frame stats 与 frame data cache。`src/stores/frames/receiveFramesStore.ts:1233-1240`
- 触发 listener 的空条件默认触发；有条件但无数据项返回 false；未知操作符或异常返回 false。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:100-158`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:189-218`
- 触发执行前会复核任务存在，且状态必须是 `running` 或 `waiting-trigger`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-245`
- 条件触发任务启动时写入 `waiting-trigger`，再注册触发监听器。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:733-783`
- `updateTaskStatus('completed')` 会删除任务；`stopTask` 会清 timer/listener 后写 `completed`；`forceCleanupTask` 会清 timer/listener 后写 `error`。`src/stores/frames/sendTasksStore.ts:401-434`, `src/composables/frames/sendFrame/useSendTaskController.ts:26-57`, `src/composables/frames/sendFrame/useSendTaskController.ts:191-220`

Code reality:

- 这些行为目前混在同一事实链上，但都是现有运行行为或可观察副作用。
- `completed`、`waiting-trigger`、`paused` 等状态是本地发送任务现状行为，不是中心任务生命周期事实。

Plan implication:

- cleanup plan 必须保护串口/网络入站可达性、处理顺序、成功/失败统计、recent packet、页面当前值、表达式、星座图、frame stats、触发任务可用性。
- cleanup plan 必须标注 send-task 状态与 listener/timer 行为为“现状兼容行为”，不能外放为未来中心任务事实。

## 4. 被代码支持的文档判断

Evidence:

- 1A memo 说串口 / 网络入站进入 `receiveFramesStore.handleReceivedData`。代码支持：`src/stores/serialStore.ts:416`, `src/stores/netWorkStore.ts:212`
- 1A memo 说 `receiveFramesStore` 同时处理队列、解析、统计、缓存、显示回填、表达式、星座图、帧统计和触发检查。代码支持：`src/stores/frames/receiveFramesStore.ts:805-891`, `src/stores/frames/receiveFramesStore.ts:1005-1138`
- 1A memo 说触发链把命中帧、来源和更新项转给 `sendTasksStore.handleFrameReceived`。代码支持：`src/stores/frames/receiveFramesStore.ts:1127-1138`, `src/stores/frames/receiveFramesStore.ts:1186-1227`, `src/stores/frames/sendTasksStore.ts:553-562`
- 1A memo 说 listener 会读取本地任务状态、反读接收映射并动态进入 executor。代码支持：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:79-92`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:160-184`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`
- 1B memo 说当前 `SendTask.status`、active task 视图、listener/timer 注册状态容易被误读为中心任务事实。代码支持这些状态和视图真实存在：`src/stores/frames/sendTasksStore.ts:23-30`, `src/stores/frames/sendTasksStore.ts:145-214`, `src/stores/frames/sendTasksStore.ts:533-575`
- 1B memo 说 manager 是聚合入口、executor 是本地执行副作用集中点、controller 是本地控制动作入口。代码支持：`src/composables/frames/sendFrame/useSendTaskManager.ts:15-23`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:33-48`, `src/composables/frames/sendFrame/useSendTaskController.ts:13-21`
- Sequencing 说第一刀要保护串口 / 网络入站、解析成功 / 失败、展示 / 统计副作用、现有触发任务路径。代码支持这些行为都在当前链路上。`easysdd/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:110-135`

Code reality:

- 文档对当前主链、混层、副作用、listener 回读和 send-task 本地执行态的判断，与代码基本一致。
- 代码还加强了一个文档判断：SCOE 不只是普通依赖，而是在 `sourceId === 'scoe-tcp-server'` 下拥有明确早退旁路。`src/stores/frames/receiveFramesStore.ts:1015-1021`

## 5. 仍只是推断、不能直接当代码事实的文档判断

Inference:

- “第一刀应该从 1A 切，而不是先切 1B/1C”是 sequencing 推断；代码能证明 1A 是上游事实链，但不能单独证明推进顺序的项目决策。`easysdd/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:74-83`
- “1A/1B/1C 没有方向性冲突”是文档仲裁判断；代码只能证明三者交叉，不证明未来 cleanup 一定无冲突。`easysdd/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:46-58`
- “1A 后给 1B 的边界输入应包含哪些语义项”是目标边界推断；当前代码只证明现状传递 `frameId/sourceId/DataItem[]`。`easysdd/compound/2026-04-24-batch-1a-receive-input-and-trigger-cleanup-scope-memo.md:195-220`
- “不先补完整 Batch 1D 或 result boundary observation”是 gate 选择；代码只能证明存在 SCOE 旁路和 SCOE 回读点，不能证明这些点无需先展开。`easysdd/compound/2026-04-24-batch-1abc-cleanup-sequencing-and-first-cut-scope.md:179-203`
- “可以进入 cleanup plan”是流程判断，不是代码事实；代码只提供 Gate 2 所需的真实链路和保护面证据。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:87-101`

Plan implication:

- cleanup plan 可以引用这些推断作为边界裁剪依据，但必须把它们标为 plan decision / inference，不能写成“代码已经存在该对象 / 该架构”。
- cleanup plan 不能直接定义 trigger candidate 字段、中心任务字段、生命周期枚举、结果对象或 SCOE 接入对象。

## 6. 继续深入会越界的位置

Deferred:

- 进入 1B：listener 命中后动态导入 `useSendTaskExecutor`，初始化实例缓存并调用 `processInstance` 或 `processMultipleInstances`。继续分析这里会进入本地发送执行对象和生命周期写入。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`
- 进入 1B/1C 交界：executor 的 `processSingleInstance` 会调用 `sendFrameToTarget`，而 `sendFrameToTarget` 使用 `useUnifiedSender().sendFrameInstance`。继续深入会进入 common sender / target 发送边界。`src/composables/frames/sendFrame/useSendTaskExecutor.ts:220-247`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:263-298`
- 进入 1B lifecycle：controller 的 stop/pause/resume/force cleanup 会写任务状态和清理 timer/listener。继续设计这些语义会越界到 Batch 1B。`src/composables/frames/sendFrame/useSendTaskController.ts:26-220`
- 进入 SCOE：`handleScoeFrame` 命中后会走 `isScoeFrame`、校验、参数解析、`scoeCommandExecutor.executeCommand` 与 `scoeStore.addReceiveData`。继续解释指令模型、完成条件或领域成功会越界到 SCOE / Batch 1D。`src/stores/frames/receiveFramesStore.ts:899-991`
- 进入 SCOE 反向事实：`checkCompletionConditions` 和 `executeLinkCheck` 分别读取 `allReceiveFrameData` 与 `groups`。继续解释这些值是否构成领域完成事实会越界到 SCOE/result。`src/utils/receive/scoeFrame.ts:416-432`, `src/composables/scoe/commands/linkCheck.ts:14-35`
- 进入 result：本轮限定代码没有读取 history/storage/files；若 cleanup plan 开始移动历史、记录、文件交付或报告对象，应停回 result boundary observation。guardrail 已把这些列为 stop condition。`easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:153-163`
- 进入 Platform API boundary：若 cleanup plan 开始修改 `src/api/common/receiveApi.ts`、`src-electron/preload/api/receive.ts`、IPC handler、`window.electron.*` 暴露方式或 `contextIsolation`，应停回 Platform API boundary analysis。用户倾向关闭隔离，但这尚未形成 decision。

## 7. 是否可以进入 1A cleanup plan

Code reality:

- 可以进入 `1A first-cut cleanup plan`，但只能以“现有接收链路事实核对已完成”为前提。
- 进入条件不是“目标架构已清楚”，而是 Gate 2 所需的第一刀链路、保护面、SCOE/result 停线点已经有足够代码证据。

Plan implication:

- 1A cleanup plan 必须重点覆盖：
  - 串口 / 网络入站到 `handleReceivedData` 的可达性与顺序保护。
  - `processingLock + pendingProcessQueue` 的串行化行为。
  - `receiveAPI.handleReceivedData` 的成功、失败和 Electron API 不可用降级路径。
  - recent packets、global stats、frame stats、frame data cache、`groups` value/displayValue、表达式、星座图这些现有副作用的保护与边界标注。
  - `checkTriggerConditions -> sendTasksStore.handleFrameReceived -> trigger listener` 的现有触发可用性。
  - `checkTriggerConditions` 回读 `groups` 与 listener 回读 `mappings` 的事实源混合点。
  - SCOE `scoe-tcp-server` 早退旁路、SCOE completion/link-check 回读 receive store 的停线条件。
  - 进入 executor、controller、useUnifiedSender、history/storage/files 时的 1B/1C/SCOE/result 停止条件。
  - 进入 `receiveAPI` wrapper、preload API、IPC handler 或 Electron isolation 设置时的 Platform API 停止条件。

Deferred:

- 不在 1A cleanup plan 里设计 trigger candidate 最终对象。
- 不在 1A cleanup plan 里定义任务生命周期、中心任务上下文、统一执行状态、结果 / 报告对象。
- 不在 1A cleanup plan 里设计 SCOE 指令、SCOE 成功条件、SCOE 记录或 common sender 目标 schema。
- 不在 1A cleanup plan 里决定是否关闭 `contextIsolation` 或删除 renderer common API wrapper。
