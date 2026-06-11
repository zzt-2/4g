---
doc_type: scope-memo
type: cleanup-scope
memo_type: batch 1A receive-input-and-trigger cleanup scope memo
status: current
date: 2026-04-24
summary: Batch 1A cleanup scope memo for receiveFramesStore and useSendTaskTriggerListener, focused on receive input facts, display/stat/cache side effects, trigger candidates, and boundaries handed to Batch 1B.
tags:
  - cleanup-first
  - batch-1a
  - receive-chain
  - trigger-boundary
  - task-input
---

# Batch 1A receive-input-and-trigger cleanup scope memo

## Scope

本 memo 只围绕 Batch 1A：

- `src/stores/frames/receiveFramesStore.ts`
- `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`

直接调用关系只读到：

- `src/stores/serialStore.ts`
- `src/stores/netWorkStore.ts`
- `src/stores/frames/sendTasksStore.ts`

本文只回答 cleanup scope，不写实现方案，不写 spec 字段，不新增架构名词，不把当前模块升格为正式架构。

## Context evidence

`Evidence`

- Batch 1A 已在 gating memo 中被定义为 `receive input fact and trigger boundary`，覆盖 `receiveFramesStore` 与 `useSendTaskTriggerListener`。`easysdd/compound/2026-04-24-post-step3-review-and-execution-gating.md:190-203`
- scoping memo 已将 `receiveFramesStore` 判为一号核心交叉模块：同时承担输入承接、SCOE 短路、解析后更新、表达式、统计、触发。`easysdd/compound/2026-04-23-scoping-capability-domains-and-core-modules.md:132-136`
- spike 已指出 `receiveFramesStore` 是多能力域共享热点：参数信号、触发、显示、统计、SCOE、任务编排汇流。`easysdd/compound/2026-04-23-spike-capability-domain-current-code-map.md:207-223`
- `04` 明确接收共享状态、任务对象状态、页面监控状态、显示记录状态不得被误拿来充当运行事实源。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:109-117`
- `04` 明确 `receiveFramesStore.groups` 这类面向接收配置和显示回填的共享状态不得反向当作主状态事实源。`refactor/docs/03-architecture/04-运行主状态与状态边界.md:223-231`
- `05` 明确主链只能消费明确边界输入、产出明确边界结果，不能依赖共享状态补齐语义。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:31-49`
- `05` 明确接收链不该直接触发显示、历史、任务、测试工具等多方向副作用。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:145-148`
- `06` 明确接收主链只能输出明确的触发候选输入或等价运行输入，任务系统再解释这些输入。`refactor/docs/03-architecture/06-任务系统归口方式.md:22-28`
- `07` 明确 SCOE 不应直接消费 `receiveFramesStore.groups`、`receiveFramesStore.mappings`、`allReceiveFrameData` 作为运行语义事实源。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:222-254`

## 1. `receiveFramesStore` 当前混了哪些层次

`Evidence`

- 串口入站直接调用 `receiveFramesStore.handleReceivedData('serial', portPath, ...)`。`src/stores/serialStore.ts:414-417`
- 网络入站直接调用 `receiveFramesStore.handleReceivedData('network', connectionId, ...)`。`src/stores/netWorkStore.ts:207-212`
- store 同时持有 `groups`、`mappings`、`frameStats`、`selectedFrameId`、`selectedGroupId`、`isLoading`。`src/stores/frames/receiveFramesStore.ts:91-99`
- store 同时初始化全局统计、表达式管理、帧模板依赖。`src/stores/frames/receiveFramesStore.ts:100-102`
- store 内有 SCOE 相关依赖和延迟初始化。`src/stores/frames/receiveFramesStore.ts:116-131`
- store 持有最近接收包记录。`src/stores/frames/receiveFramesStore.ts:133-143`
- store 自动保存配置并同步主进程缓存。`src/stores/frames/receiveFramesStore.ts:167-255`
- store 基于帧模板和 mappings 产出页面/配置可用选项。`src/stores/frames/receiveFramesStore.ts:269-335`
- store 持有 `frameDataCache` 与 `allReceiveFrameData`。`src/stores/frames/receiveFramesStore.ts:337-341`
- store 负责配置加载、保存、导入、导出、映射验证。`src/stores/frames/receiveFramesStore.ts:343-433`
- store 负责分组、数据项、映射、可见性、收藏、排序等管理动作。`src/stores/frames/receiveFramesStore.ts:446-803`, `src/stores/frames/receiveFramesStore.ts:1263-1330`
- `handleReceivedData` 内有处理锁和待处理队列。`src/stores/frames/receiveFramesStore.ts:805-891`
- `processDataInternal` 内同时处理全局统计、SCOE 短路、主进程解析、失败统计、最近包、缓存、groups 回填、表达式、星座图采集、帧统计、触发检查。`src/stores/frames/receiveFramesStore.ts:1005-1139`
- `checkTriggerConditions` 将接收更新项转换为 `DataItem[]` 并调用 `sendTasksStore.handleFrameReceived`。`src/stores/frames/receiveFramesStore.ts:1186-1227`

`Inference`

`receiveFramesStore` 当前至少混有九类层次：

1. 输入承接：串口/网络来源、sourceId、原始载荷、队列锁。
2. 解析归一：调用 `receiveAPI.handleReceivedData` 并处理成功/失败。
3. 接收配置与映射管理：`groups`、`mappings`、导入导出、校验、保存、同步缓存。
4. 显示状态：选中帧、选中分组、可见项排序、收藏、页面选项。
5. 当前值缓存：`groups` 内 value/displayValue、`frameDataCache`、`allReceiveFrameData`。
6. 统计与监控：全局统计、帧统计、recent packets。
7. 表达式副作用：接收成功后立即计算并回填表达式结果。
8. 展示采集副作用：星座图字段数据采集。
9. 领域与任务桥接：SCOE 来源短路、触发条件检查、send task 转发。

`Scope decision`

Batch 1A 只把这些层次读清楚并收口边界判断，不设计拆分后的模块、对象或字段。

## 2. 哪些是接收输入事实

`Evidence`

- `handleReceivedData` 的正式入参只有 `source`、`sourceId`、`data`。`src/stores/frames/receiveFramesStore.ts:846-856`
- 队列项也只保存 `source`、`sourceId`、`data` 和 promise 控制信息。`src/stores/frames/receiveFramesStore.ts:805-815`
- `receiveAPI.handleReceivedData(source, sourceId, data)` 是当前通用解析调用点。`src/stores/frames/receiveFramesStore.ts:1023-1025`
- 解析失败时当前代码只可直接确认 `success=false`、`errors`、`recentPacket` 以及统计更新。`src/stores/frames/receiveFramesStore.ts:1026-1046`
- 解析成功后当前代码使用 `result.frameStats?.frameId`、`result.updatedDataItems`、`result.recentPacket` 作为后续处理依据。`src/stores/frames/receiveFramesStore.ts:1048-1073`

`Inference`

当前代码里最窄的接收输入事实包括：

- 入站来源类型。
- 入站来源标识。
- 原始字节流或等价原始载荷。
- 当前处理顺序，由队列和锁隐含表达。
- 本次解析结果的成功/失败、错误、命中帧、更新字段、最近包等结果事实。

SCOE 来源命中本身可以视为领域入口事实，但 SCOE 指令解释、状态计数、测试工具记录不属于通用接收输入事实。

`Scope decision`

1A 只把这些事实作为可交给下游的输入证据，不定义最终接收结果对象。

## 3. 哪些只是显示/统计/缓存/历史/表达式副作用

`Evidence`

- 配置监听会触发保存和同步主进程缓存。`src/stores/frames/receiveFramesStore.ts:234-255`
- `selectedFrameDataItems`、`selectedGroup`、`availableReceiveFrameOptions`、`getAvailableFrameFieldOptions` 都是基于当前配置与页面选择派生。`src/stores/frames/receiveFramesStore.ts:286-335`
- `frameDataCache` 被说明为避免遍历 `groups` 和 `mappings` 的缓存。`src/stores/frames/receiveFramesStore.ts:337-341`
- 接收成功后代码回填 `groups.value` 中 dataItem 的 `value` 和 `displayValue`。`src/stores/frames/receiveFramesStore.ts:1075-1089`
- 接收成功后立即调用表达式计算。`src/stores/frames/receiveFramesStore.ts:1091-1099`
- 接收成功后调用星座图数据采集。`src/stores/frames/receiveFramesStore.ts:1101-1105`
- 接收成功后更新 `frameStats`。`src/stores/frames/receiveFramesStore.ts:1107-1125`
- `clearReceiveStats` 清空 recent packets、frame stats、frame data cache。`src/stores/frames/receiveFramesStore.ts:1233-1240`
- `getRecentPackets` 只是读取最近包记录。`src/stores/frames/receiveFramesStore.ts:1242-1261`

`Inference`

以下内容不应被 Batch 1A 视为运行主事实：

- `groups` 中的 value/displayValue 回填。
- `frameDataCache` 与 `allReceiveFrameData`。
- `recentPackets`、`frameStats`、global stats。
- 页面选择态和字段选项派生。
- 表达式计算结果回填。
- 星座图采集。
- 配置保存、同步、导入导出、排序、可见性、收藏。

这些内容可以是显示、统计、缓存、记录或表达式侧消费，但不能反向定义“任务当前该如何推进”。

`Scope decision`

Batch 1A 的 cleanup scope 应把这些内容降为副作用或订阅消费视角，而不是把它们继续当作任务输入事实源。

## 4. 哪些是 trigger candidate / 等价运行输入

`Evidence`

- 接收成功后，当前代码以 `frameId`、`source + ':' + sourceId`、`updatedDataItems` 调用 `checkTriggerConditions`。`src/stores/frames/receiveFramesStore.ts:1127-1138`
- `checkTriggerConditions` 接收 `frameId`、`sourceId`、`updatedDataItems`。`src/stores/frames/receiveFramesStore.ts:1186-1195`
- `checkTriggerConditions` 将更新项转换为 `DataItem[]` 后调用 `sendTasksStore.handleFrameReceived(frameId, sourceId, dataItems)`。`src/stores/frames/receiveFramesStore.ts:1199-1227`
- `sendTasksStore.handleFrameReceived` 只是转发到 trigger listener。`src/stores/frames/sendTasksStore.ts:553-561`
- trigger listener 注册信息包括 `sourceId`、`triggerFrameId`、`conditions`、`continueListening`、`responseDelay`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:35-55`
- listener 收到帧后匹配 `triggerFrameId` 和 `sourceId`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-79`

`Inference`

当前代码里最接近 trigger candidate / 等价运行输入的是：

- 命中的接收帧 ID。
- 标准化后的来源标识。
- 本次接收更新的数据项值。
- 触发监听器声明的帧、来源和条件。

但当前实现没有停在“候选输入”层，而是在 listener 内继续检查本地任务状态并执行任务。

`Scope decision`

1A 可以把 `frameId + sourceId + updatedDataItems` 识别为当前等价运行输入证据，但不能在 1A 拍板它的最终字段、对象名或任务解释规则。

## 5. `useSendTaskTriggerListener` 为什么会反向污染接收事实

`Evidence`

- listener 收到帧后立刻读取 `sendTasksStore.getTaskById(taskId)`，并要求任务状态为 `waiting-trigger`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:79-84`
- listener 用 `evaluateTriggerConditions` 判断是否触发。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:86-92`
- 条件字段解析时，listener 直接获取 `receiveFramesStore`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-167`
- listener 通过 `receiveFramesStore.mappings.find((m) => m.fieldId === fieldId)` 反读映射。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:168-183`
- 命中后，listener 动态导入 `useSendTaskExecutor`，初始化实例缓存并执行本地任务。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-280`
- 执行后，listener 直接注销监听、更新任务状态为 `completed`，或异常时更新为 `error`。`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:282-305`

`Inference`

污染路径是：

1. 接收链输出本次更新。
2. listener 不只消费本次更新，还反读接收配置共享面 `mappings`。
3. listener 再读取本地任务状态来决定是否接收这次输入。
4. listener 命中后直接进入本地任务执行器。
5. listener 直接写任务状态。

因此，“接收事实”“接收配置/映射缓存”“本地发送任务状态”“任务执行动作”被串成一条隐式链。接收事实不再是独立输入，而被本地任务解释和映射回读反向塑形。

`Scope decision`

1A 要收口的是 listener 对接收事实的反向依赖边界。listener 是否保留、如何改造、任务状态如何解释，都留给 1B。

## 6. 1A cleanup 后应该给 1B 暴露什么边界输入

`Evidence`

- `06` 要求接收主链向任务系统输出明确的触发候选输入或等价运行输入。`refactor/docs/03-architecture/06-任务系统归口方式.md:97-102`
- `05` 要求接收主链结果输出应是通用接收事实输出、统一运行主状态可消费输入、记录/展示域可订阅输入、领域模块接管输入。`refactor/docs/03-architecture/05-接收主链与发送主链组织方式.md:150-163`
- `07` 要求 SCOE 消费标准化后的入站事实、来源标识与接收时序、解析成功/失败/未识别结果或领域入口接管输入。`refactor/docs/03-architecture/07-SCOE 的架构位置.md:222-229`

`Inference`

1A 后给 1B 的边界输入应停留在语义层：

- 入站来源。
- 来源标识。
- 原始载荷或等价载荷引用。
- 接收顺序或接收时刻。
- 解析成功、失败或未识别的结果口径。
- 命中帧及本次更新值。
- 触发候选或等价运行输入。
- 领域入口命中输入，尤其是 SCOE 这类来源/协议命中。

这些输入不应夹带页面选中态、recent packet 视图、frame stats 视图、`groups` 当前值面板、表达式副作用、星座图采集结果或本地任务状态解释。

`Scope decision`

1A 只定义“1B 应消费什么边界输入”的范围，不定义 1B 的任务对象、生命周期字段、调度规则或执行器入口。

## 7. 仍必须留给 1B 或后续 feature design 的结论

`Deferred`

- trigger candidate 最终是否作为独立正式输出类型，还是收敛进更上层运行输入口径。
- `frameId / sourceId / updatedDataItems` 最终如何命名、如何成对象、如何承载 fieldId、groupId、dataItemId、value。
- `DataItem[]` 是否还能作为任务触发输入载体，或只作为显示/配置层对象。
- 任务系统如何解释触发候选，何时推进等待、调度、执行、停止或完成。
- `useSendTaskTriggerListener` 是否继续存在、归属哪里、是否仍负责执行任务。
- 本地发送任务状态与中心任务上下文、用例执行上下文之间的映射关系。
- SCOE 领域接管输入是否拆分，SCOE 是否插队进入 1D。
- 表达式结果能否参与触发候选，以及参与时应属于接收事实还是表达式派生输入。
- 显示、统计、历史、记录订阅接收结果的最终订阅方式。
- 手工发送、触发发送、中心任务驱动发送是否统一入口。

## Closing classification

`Evidence`

- 当前代码证据足以确认 `receiveFramesStore` 与 trigger listener 混层。
- 当前文档证据足以确认接收链只应输出显式输入，不应直接解释任务生命周期。

`Inference`

- Batch 1A 的核心价值不是提前设计新对象，而是避免 1B 继续把 `groups / mappings / allReceiveFrameData / DataItem[] / waiting-trigger` 这组当前实现细节误当作运行事实。

`Scope decision`

- Batch 1A cleanup scope 应限定为“接收输入事实与触发候选边界”。
- Batch 1A 不处理 send-task 生命周期、不处理结果事实、不处理发送主链、不处理完整 SCOE 领域设计。

`Deferred`

- 所有任务解释、生命周期推进、中心任务/用例执行语义、结果归口语义，留给 Batch 1B 或后续 feature design。
