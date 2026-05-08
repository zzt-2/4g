---
doc_type: feature-design
feature: rewrite-send
status: draft
date: 2026-05-06
summary: 东方红上位机重写中 send feature 的 owner、构帧、发送请求、target 路由、发送结果、队列模型、统计 read model 和跨 feature 交互契约。
---

# Rewrite send feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/architecture/rewrite-system-architecture.md`
5. `codestable/architecture/rewrite-feature-boundaries.md`
6. `codestable/architecture/rewrite-feature-interaction-matrix.md`
7. `codestable/quality/rewrite-quality-rules.md`
8. `codestable/quality/rewrite-review-checklist.md`
9. `codestable/features/rewrite-frame/rewrite-frame-design.md`
10. `codestable/features/rewrite-connection/rewrite-connection-design.md`
11. `codestable/features/rewrite-receive/rewrite-receive-design.md`
12. 当前实现参考：`rewrite/src/features/frame/index.ts`（frame public API）
13. 当前实现参考：`rewrite/src/features/connection/index.ts`（connection public API）
14. 当前实现参考：`rewrite/src/features/receive/index.ts`（receive public API）
15. `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`

`codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。frame design 固定 frame 是静态资产 owner；connection design 固定 connection 是 transport facts 和 byte output owner；receive design 固定 receive 是输入解析 owner。

## 2. Boundary guards

- 本轮是 Lane A design，只产出 design/checklist，不写实现代码。
- send owns 构帧、发送请求处理、target 路由、transport write 编排、发送结果输出和 send statistics read model。
- send does not own frame definition truth、connection transport lifecycle、task lifecycle/scheduling/trigger、SCOE semantics、result truth、report generation、northbound delivery。
- send 不继承旧 store 组织。旧 `useUnifiedSender`、`sendFrameInstancesStore`、`sendTasksStore` 的结构不迁移。
- send 不等于 task。send 执行单帧发送；task 拥有定时/触发/序列编排。
- send 不拥有 frame definition truth。构帧只消费 frame public API 的只读 snapshot。
- send 不拥有 connection transport lifecycle。发送字节只通过 connection public service。
- send 不硬编码 SCOE target、northbound 语义或 report 语义。
- 统计 read model 禁止写回 frame definition、field definition 或其他静态资产。
- 跨 feature 只通过 public API、runtime 编排、显式事件或只读 selector 交互。
- 高频数据本轮只锁原则，不冻结队列深度、窗口大小或丢弃策略。
- 本轮不写 preload、main、renderer API schema，不冻结 DTO、channel 或枚举。
- 旧 `src/`、`src-electron/` 只作为 evidence、oracle 或 migration input。

## 3. Evidence summary

### 3.1 Contract evidence

- target structure 定义 `features/send` 为构帧、发送请求、发送队列、target 落地、发送结果输出的 owner；不拥有中心任务 lifecycle、SCOE 成功条件、报告交付。
- feature boundaries 明确 send 的 owner 边界：send request 到 target 落地和 send result；不拥有 task/case lifecycle、SCOE completion、report delivery。
- interaction matrix 明确 `send -> task/status/result/storage/SCOE` 交互方向：send writes send result；各消费者通过 explicit event 或 runtime 读取。`task -> send` 方向：task writes task context，send writes send result。
- frame design 明确 send 读取发送方向 frame snapshot 和字段定义用于构帧；send 不让 frame 拥有发送实例或发送队列。
- connection design 明确 send 消费 target availability 和 transport write capability；send 不 own connection lifecycle。
- receive design 与 send 无直接依赖；未来 receive trigger 若需要发帧，通过 task/runtime 路由。
- quality rules R8 要求 send 主链只承接发送请求、构帧、目标落地和输出发送结果；R13 要求统计不污染静态模型。

### 3.2 Upstream public API evidence

frame public API（`rewrite/src/features/frame/index.ts`）提供：
- 类型：`ReadonlyFrameAsset`、`ReadonlyFrameFieldDefinition`、`FrameDirection`、`FrameDataType`、`FrameFieldReference`、`ExpressionDefinition`
- 选择器：`findFrameAssets`、`getFrameAsset`、`selectFrameReferenceOptions`、`selectFieldReferenceOptions`
- 服务：`FrameAssetReader`

connection public API（`rewrite/src/features/connection/index.ts`）提供：
- 类型：`TransportTargetSnapshot`、`ConnectionRuntimeFact`、`TransportErrorSnapshot`、`ConnectionLifecycleStatus`
- 选择器：`selectTransportTargets`、`selectConnectionSnapshot`
- 服务：`ConnectionService`（含 transport write）、`ConnectionReader`

receive public API 与 send 无直接消费关系。

### 3.3 Legacy evidence

旧系统事实只用于保留可观测行为和识别迁移风险，不作为新架构：

- 统一发送入口：`src/composables/frames/sendFrame/useUnifiedSender.ts` — 同时处理构帧、校验和、target 路由、发送执行、send stats、global stats、SCOE 记录。
- 发送实例 store：`src/stores/frames/sendFrameInstancesStore.ts` — 发送实例配置、发送方向 frame 引用、字段值输入。
- 发送任务 store：`src/stores/frames/sendTasksStore.ts` — 任务状态、计时器、触发器、执行器。
- 发送 UI：`src/components/frames/FrameSend/` — 发送对话框、定时发送、触发发送、序列发送。
- 旧编码逻辑：`src/utils/frames/frameInstancesUtils.ts` — send instance → buffer、checksum、field encoding。
- 旧校验和策略：`src/utils/frames/defaultConfigs.ts` — 各种 checksum 策略定义。
- 旧 SCOE UDP target 硬编码：`src/composables/frames/sendFrame/useUnifiedSender.ts` 中 SCOE 特判。
- 旧发送后跨 store 更新：send 成功后直接写 send stats、global stats 和 SCOE record。

## 4. Design

### 4.1 Owner / not owner

| 分类 | send owner | send not owner |
| --- | --- | --- |
| 构帧 | 接收 send request，基于 frame snapshot 执行字段编码、字节组装、checksum 计算，输出 FrameBuildOutput。 | frame definition truth、field definition truth、expression definition truth、expression runtime 执行。 |
| 发送请求 | 接收外部 SendRequest，验证参数完整性，编排构帧→target 解析→transport write→结果输出。 | task scheduling、trigger logic、timed execution、sequence orchestration。 |
| target 路由 | 将 SendRequest.targetId 解析为 connection TransportTargetSnapshot，检查可用性。 | connection lifecycle、target creation/deletion、transport resource handle、northbound deviceId。 |
| 队列 | 可选内部 write queue，保证同一 target 的 transport write 顺序。 | task-level step 序列编排、多帧执行顺序、pause/resume 语义。任何多步骤发送编排都是 task 职责，send 只做单帧发送。 |
| 发送结果 | 输出 SendResult（sent / build-error / target-unavailable / transport-error / timeout / cancelled）。 | task progress、case result、report generation、northbound response。 |
| 统计 read model | 按 stable key 维护 send count、success/failure count、bytes sent、per-frame stats、per-target stats、last send timestamp。 | global system lifecycle、receive stats、task progress stats。 |
| 平台能力 | 构帧和 send 编排在 renderer TypeScript 完成；transport write 通过 connection public service。 | 直接访问 Node/Electron/serialport/socket。 |

send 的核心职责是把一个 SendRequest 转化为一个 SendResult。send 不是 task 的子集，也不是 task 的替代。task 是通用执行引擎，负责编排"按什么顺序执行哪些步骤"（含 send-step、wait-condition-step、delay-step）；send 负责"这一次怎么构帧、写到哪个 target、结果是什么"。所有多步骤发送编排（定时、触发、序列、SCOE 命令、northbound 用例）都通过 task 执行，send 只被 task 的 send-step 调用。

### 4.2 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level |
| --- | --- | --- | --- | --- |
| `/frames/send` 发送页面入口可达，页面展示帧选择、字段输入、目标选择和发送按钮。 | pages + send | preserve | `src/pages/frames/FrameSend.vue`、`src/components/frames/FrameSend/` | manual checklist |
| 发送方向帧按 `direction === 'send'` 过滤可用帧。 | frame owns definition; send consumes snapshot | preserve | `src/stores/frames/sendFrameInstancesStore.ts` | fixture test |
| 发送实例配置包含选帧、字段值输入和目标选择。 | send owns send request shape; frame owns definition | preserve boundary | `src/stores/frames/sendFrameInstancesStore.ts` | fixture test, manual checklist |
| 字段编码按 offset、length、data type、big endian、factor 进行。 | send core | preserve | `src/utils/frames/frameInstancesUtils.ts` | fixture test, oracle comparison |
| 校验和计算支持多种策略（累加和、异或、CRC 等）。 | send core | preserve | `src/utils/frames/defaultConfigs.ts`、`src/utils/frames/frameInstancesUtils.ts` | fixture test, oracle comparison |
| 发送前检查连接状态和 target 可用性，未连接时返回错误。 | send validates; connection owns availability | preserve | `src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture test |
| 发送成功后可见成功状态和发送字节数。 | send owns result; pages display | preserve | `src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture test, manual checklist |
| 发送失败后可见错误信息（连接断开、写入失败、校验失败等）。 | send owns result | preserve | `src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture test, manual checklist |
| 发送统计包含发送次数、成功/失败数、字节数等。 | send statistics read model | preserve with layering | `src/stores/frames/sendFrameInstancesStore.ts` | fixture test |
| 旧 send 成功后直接写 global stats 和 SCOE record。 | task/status/result/SCOE own their facts; send only outputs result | candidate drop for location | `src/composables/frames/sendFrame/useUnifiedSender.ts` | fixture test |
| 旧 SCOE 使用硬编码 UDP target。 | SCOE translates to explicit request; no hardcode in send | candidate drop for hardcode | `src/composables/frames/sendFrame/useUnifiedSender.ts` | static scan |
| 定时发送和触发发送。 | task owns scheduling; send executes per-request | preserve as task boundary | `src/components/frames/FrameSend/TimedSend/`、`src/components/frames/FrameSend/TriggerSend/` | fixture test, runtime validation |
| 序列发送。 | task owns sequence; send executes per-request | preserve as task boundary | `src/components/frames/FrameSend/EnhancedSequentialSend/` | fixture test, runtime validation |
| 发送测试工具可手动发送文本/二进制。 | connection test tool; send may provide raw send entry | preserve boundary | `src/components/connect/SerialTestTools.vue`、`src/components/connect/NetworkTestTools.vue` | manual checklist, hardware validation |

### 4.3 Core types

本轮不冻结最终类型名和字段 schema，只定义类型职责和分类。

**SendRequest** — 发送请求输入：
- `frameId`：目标帧引用。
- `fieldValues`：字段值映射（字段 ID → 用户/系统提供的值）。
- `targetId`：目标 transport target 引用。
- `options`：构帧选项（checksum 策略、编码选项）。
- `context`：请求来源标识（user / task / SCOE / test），含可选 taskId、caseId、stepIndex 用于追踪。

**FrameBuildInput** — 构帧内部输入：
- `frameSnapshot`：从 frame public API 获取的只读帧资产。
- `fieldDefinitions`：对应字段定义列表。
- `fieldValues`：已解析的字段值。
- `options`：构帧选项。

**FrameBuildOutput** — 构帧内部输出：
- `bytes`：组装完成的 Uint8Array。
- `resolvedFields`：实际写入的字段值映射（含编码后值）。
- `checksumValue`：校验和计算结果。
- `issues`：构建过程中的警告/错误（字段缺失、值溢出、编码问题等）。

**SendResult** — 发送结果公开输出：
- `kind`：sent / build-error / target-unavailable / transport-error / timeout / cancelled。
- `requestRef`：回引原始请求标识。
- `bytesBuilt`：构帧产生的字节数。
- `bytesSent`：实际写入 transport 的字节数。
- `timestamp`：发送完成时间戳。
- `error`：transport-level 错误详情（如可用）。
- `buildIssues`：构帧阶段的问题列表（如有）。

**TargetResolution** — target 解析结果：
- `target`：解析到的 TransportTargetSnapshot。
- `available`：target 当前是否可用。
- `error`：解析失败原因（如 target 不存在、连接未建立）。

**SendStatistics** — 统计 read model：
- 按 stable key（frameId / targetId / resultKind）维护计数。
- 包含 total requests、total sent、total errors、total bytes sent。
- 包含 last send timestamp。
- 不包含 task progress、case result、report 或 northbound 语义。

**QueueModel** — 写入队列（可选）：
- 同一 target 的 transport write 请求按 FIFO 排队。
- 队列深度、溢出策略和优先级由实现阶段结合 runtime 证据决定。
- 队列是 send 内部优化，不是 task-level 序列编排的替代。

### 4.4 Service contract

send 的主服务合约是单次发送生命周期：

```
SendRequest
  → validate (参数完整性、frameId/targetId 存在性)
  → resolve frame snapshot (通过 frame public API)
  → build frame (core 构帧逻辑)
  → resolve target (通过 connection public API)
  → check availability
  → [queue write if needed]
  → execute transport write (通过 connection public service)
  → emit SendResult
  → update statistics read model
```

任何步骤失败都提前返回对应 kind 的 SendResult，不继续后续步骤。

**同步 vs 异步**：

- 构帧（validate → build）是同步计算，可在 core 层单测。
- target 解析是同步查询，读取 connection selector 当前值。
- transport write 是异步操作，通过 connection service 发起。
- SendResult 通过 service 返回值或 explicit event 输出，由调用方（task/runtime/page）选择消费方式。

**调用方式**：

- task 通过 send public service 调用，获得 SendResult。
- page 通过 send composable/service 调用，更新 UI snapshot。
- SCOE 通过 runtime 编排或 send public service 调用，将 SCOE 命令翻译为 SendRequest。
- 测试通过 fake adapter 调用，验证构帧和结果逻辑。

### 4.5 State shape and selector surface

| 状态类别 | 写入 owner | 读取方 | reset / lifecycle | 设计约束 |
| --- | --- | --- | --- | --- |
| Send runtime facts | send service | task、status、result、storage、SCOE、pages（通过 selector/event） | 随 send lifecycle、app cleanup 驱动；通常 transient | 单点写入；不保存 connection/frame/task/SCOE 状态 |
| Send statistics read model | send service 基于 SendResult 增量更新 | pages、status、result、task（通过只读 selector） | 按 stable key 增量；reset 由 send lifecycle 或显式 action 驱动 | 不写回 frame definition 或其他静态资产 |
| Send result history | send service | pages、storage、result（通过 selector/event） | 有限窗口；超出部分由 storage 持久化 | 不等同于 task result 或 report |
| UI snapshot | pages / send composables | UI 组件 | 页面生命周期 | 不定义 send truth |

**Selector surface**：

- `selectSendStatistics`：send 统计 read model。
- `selectSendResults`：近期 send result 只读列表。
- `selectSendSnapshot`：面向 UI 的安全 snapshot。
- `selectSendStatus`：当前 send 服务状态（idle / sending / error）。

Selector 不暴露可变 state 引用、内部 service 实例、connection adapter 或 frame store。

### 4.6 Cross-feature interaction contracts

#### send → frame（消费帧定义构帧）

| 维度 | 契约 |
| --- | --- |
| 方向 | send 读取 frame public API |
| send 需要 | `getFrameAsset(frameId)` 获取 `ReadonlyFrameAsset`；字段定义从 frame snapshot 中读取；`FrameDirection` 过滤 send 方向帧 |
| frame 提供 | 只读 frame asset snapshot、field definition、expression definition |
| 禁止 | send 写入 frame state；send 让 frame 拥有 send instance 或 send queue；send import frame internal state |

#### send → connection（通过 adapter port 发送字节）

| 维度 | 契约 |
| --- | --- |
| 方向 | send 调用 connection public service |
| send 需要 | `selectTransportTargets()` 获取 target availability；`ConnectionService` write 方法提交字节；write result 返回 transport acceptance/failure |
| connection 提供 | target snapshot、transport write capability、transport-level error |
| 禁止 | send 管理 connection lifecycle；send import connection internal state；send 硬编码 SCOE/northbound target；send 把 transport failure 等同 task/result failure |

#### task → send（被 task 编排调度）

| 维度 | 契约 |
| --- | --- |
| 方向 | task 调用 send public service |
| task 提供 | SendRequest（含 frameId、fieldValues、targetId、context） |
| send 返回 | SendResult（sent / error kind） |
| 禁止 | send 写入 task state；send 决定 task lifecycle；send 拥有 pause/resume/stop 语义 |

**与 task 的边界**：

- send 执行单帧发送，返回结果。
- task 是通用执行引擎，拥有 step 序列编排（send-step / wait-condition-step / delay-step），决定按什么顺序执行哪些步骤。
- send 内部 write queue 只保证同一 target 的 transport-level 顺序，不等于 task-level step 序列。
- task 的 send-step 通过 `await sendService.execute(request)` 实现编排级等待。
- send 不了解 task 的存在，只接收 SendRequest 和 context。task 是 send 的唯一编排方（含 SCOE、northbound、本地定时/触发/序列）。

#### send → status

| 维度 | 契约 |
| --- | --- |
| 方向 | status 消费 send statistics/result |
| send 提供 | 只读 send statistics selector、send result event |
| 禁止 | send 写入 status read model；status import send internal state |

#### send → result

| 维度 | 契约 |
| --- | --- |
| 方向 | result 消费 send result 作为 result material |
| send 提供 | SendResult event / selector |
| 禁止 | send 定义 case/task result truth；send 直接写 result state |

#### send → storage

| 维度 | 契约 |
| --- | --- |
| 方向 | storage 消费 send result 作为 local history/material |
| send 提供 | SendResult event |
| 禁止 | send 执行文件写入；send 定义 storage 路径或 history schema |

#### send → SCOE

| 维度 | 契约 |
| --- | --- |
| 方向 | SCOE 翻译命令为 TaskDefinition（triggerSource = scoe-command），通过 task public service 创建执行。task 的 send-step 调用 send public service。 |
| SCOE 提供 | TaskDefinition（含 send-step + wait-condition-step + send-step）。send 只被 task 的 send-step 调用，不感知 SCOE。 |
| send 返回 | 普通 SendResult（给 task，不直接给 SCOE） |
| 禁止 | send 硬编码 SCOE fixed target；send 解释 SCOE 命令语义；send 判断 SCOE 完成条件；send 感知 task 或 SCOE 的存在 |

SCOE 不直接调用 send service。SCOE 通过 task 创建执行计划，task 的 send-step 调用 send。send 的唯一调用方是 task（含各种 triggerSource 的 task 实例）和 send 页面（单次发送）。

#### send → receive

| 维度 | 契约 |
| --- | --- |
| 方向 | 无直接依赖 |
| 说明 | 若 receive trigger 需要发帧，通过 task/runtime 编排，send 不直接调用 receive |

#### send → report / northbound

| 维度 | 契约 |
| --- | --- |
| 方向 | 无直接依赖 |
| 说明 | report 和 northbound 从 task/result/storage 读取事实，不直接消费 send internals |

### 4.7 Fake adapter boundary and fixture strategy

**Fake adapter boundary**：

send 的 fake adapter 需要模拟两个外部依赖：

1. **Fake frame snapshot provider**：
   - 提供预设的 `ReadonlyFrameAsset`，包含 send 方向帧和字段定义。
   - 支持返回 empty snapshot、invalid frameId、缺少字段的帧。
   - 不实现 frame service 内部逻辑，只提供测试用 fixture data。

2. **Fake connection writer**：
   - 接受 transport write 请求，返回预设的 success/failure。
   - 支持模拟：写入成功、transport-error、timeout、target-unavailable、写入延迟。
   - 不模拟真实串口/TCP/UDP 行为，只验证 send 逻辑对 connection 结果的处理。
   - 支持记录所有 write 调用，用于断言。

**Fixture 策略**：

- 构帧 fixture：提供 frame snapshot + field values → 期望 bytes 输出。覆盖各种 data type、endianness、factor、offset、length 组合。
- 校验和 fixture：提供 bytes + checksum 策略 → 期望 checksum 值。
- target 解析 fixture：提供 targetId → 期望 target snapshot 或 unavailable 结果。
- 发送结果 fixture：提供各种 kind 的 SendResult，验证消费者处理。
- 边界 fixture：空 frame list、无效 frameId、无字段、字段值溢出、target 不可用、写入失败。
- Legacy oracle：旧 `frameInstancesUtils.ts` 的编码输出可作为 golden output 对比。

**Fixture 位置**：

- `rewrite/src/features/send/fixtures/frame-snapshots/`：预设 frame asset fixture。
- `rewrite/src/features/send/fixtures/build-cases/`：构帧输入/输出 fixture。
- `rewrite/src/features/send/fixtures/checksum-cases/`：校验和 fixture。
- `rewrite/src/features/send/fixtures/legacy-oracle/`：旧系统编码输出 oracle。

### 4.8 Target internal layering

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript。负责字段编码（data type → byte）、字节组装（offset + length）、checksum 计算、SendRequest 参数验证、SendResult 构造。不依赖 Vue、Pinia、Electron、platform、Node、frame store、connection store 或全局 store。 |
| `services` | send 用例入口。负责 request intake → resolve frame → build → resolve target → write → emit result → update stats。通过显式依赖注入接收 frame reader、connection service 和 event emitter。 |
| `state` | send runtime facts、statistics read model、recent results、只读 selector。state action 保持薄层，不保存 platform adapter，不写其他 feature state。 |
| `adapters` | 可选。用于 fake frame provider、fake connection writer 或 runtime event adapter。real frame/connection 消费通过 public API，不通过 adapter 包装。 |
| `composables` | 面向 send 页面的 UI-facing 组合。负责帧选择、字段值表单、target 选择、发送按钮状态、错误展示和 service 调用。 |
| `components` | 发送对话框、字段值输入、target 选择、发送结果展示等 feature UI。组件通过 props/events/composables 使用 send 能力。 |
| `fixtures` | frame snapshot fixture、field value fixture、构帧输入/输出 fixture、checksum fixture、legacy oracle。 |

### 4.9 Runtime involvement

send 需要 runtime 参与的场景：

- **服务装配**：runtime 创建 send service，注入 frame reader、connection service、event emitter。
- **跨 feature 路由**：SCOE 发送请求通过 runtime 路由到 send public service。
- **send result 分发**：runtime 可将 SendResult event 路由到 task/status/result/storage。
- **生命周期**：app startup/shutdown 时初始化和清理 send service/state。

runtime 不得：
- 执行构帧逻辑。
- 决定发送策略或 task lifecycle。
- 解释 send result 的业务含义。
- 变成 send/task/SCOE 的总编排器。

### 4.10 Platform involvement

send 不直接访问 platform：

- 构帧在 renderer TypeScript 完成，不需要 platform 能力。
- Transport write 通过 connection public service，由 connection adapter 调用 platform facade。
- send 不新增 platform / preload / main API。

### 4.11 High-frequency data flow

send 的数据流不是高频入站流，但存在以下需要注意的场景：

- **task 快速连发**：task 按序列快速调用 send，send 内部 write queue 需要处理背压。
- **transport write 耗时**：某些 transport 的 write 操作可能阻塞或延迟，send 需要异步处理。
- **统计更新频率**：快速连发时统计更新使用 batch/delta，不逐次刷新 UI snapshot。

本轮不冻结队列深度、窗口大小、延迟阈值或丢弃策略，只要求实现阶段声明并验证。

### 4.12 Validation plan

**Static scan**：

- `features/send/core` 无 Vue/Pinia/Electron/platform/Node 依赖。
- send 不 import frame/connection/task/SCOE/status/result/report/northbound internal state。
- send 不硬编码 SCOE target 或 northbound 语义。

**Vitest unit**：

- 构帧 core：各 data type 编码、offset/length 处理、endianness、factor、字段缺失、值溢出。
- Checksum core：各种策略的校验和计算。
- Service：request validate → build → resolve → write → result，使用 fake frame provider 和 fake connection writer。
- Selector/State：snapshot 不可变、统计增量更新、reset 行为。

**Fixture test**：

- 最小合法构帧正例。
- 多字段、混合 data type、各种 endianness。
- Checksum 策略覆盖。
- 无 target、target 不可用、写入失败、timeout。
- 空 frame list、无效 frameId、缺少必要字段。

**Oracle comparison**：

- 旧 `frameInstancesUtils.ts` 的编码输出可沉淀为 legacy oracle。
- 旧发送实例配置和发送结果可作为 visible behavior oracle。

**Fake adapter test**：

- Fake frame provider：返回预设 frame snapshot、empty snapshot、invalid reference。
- Fake connection writer：返回 success / transport-error / timeout / target-unavailable。
- 验证 send service 对各种组合的处理。

**Manual checklist**：

- `/frames/send` 页面和导航入口可达。
- 帧选择、字段输入、目标选择、发送按钮可用。
- 发送成功/失败结果可见。
- 发送统计数据可见。
- 错误信息（未连接、写入失败、构帧失败）可见。

**Runtime validation**：

- send service 装配和清理。
- SendResult event 路由到 task/status/result/storage。
- task 快速连发时 write queue 行为。

**Hardware validation**：

- 真实 target 发送：构帧 → connection write → 传输成功。
- 发送失败：连接断开、target 不可用、transport error。
- 快速连发的 transport 行为。

Cannot claim from this design：

- send implementation complete.
- real serial/TCP/UDP send complete.
- high-frequency burst steady-state complete.
- SCOE fixed target complete.
- report/northbound/customer closure complete.

### 4.13 Deferred / blockers

**Deferred**：

- Concrete SendRequest schema、field value mapping shape、checksum enum names。
- Send instance / send configuration model 是否持久化、如何持久化。
- Queue depth、overflow/drop policy、priority。
- Expression runtime 在 send 中的角色：send 是否执行 expression，还是只使用 resolved value。
- send configuration 中哪些属于 settings，哪些属于 send own config。
- 旧 send instance JSON 兼容范围。
- 旧 checksum 策略完整列表和命名。
- send result history 窗口大小和归档策略。

**Blockers for implementation**：

- 需要 task design 确认 send-task 调用方式（sync return vs async event）。
- 需要 connection bridge implementation 完成 target write 的实际可用性。
- 需要确认 expression runtime 归属（frame/receive/send/task 哪个执行）。

**Blockers for acceptance**：

- Missing send implementation and tests。
- Missing hardware validation for real target send。
- Missing task design to confirm send-task boundary。

## 5. Open questions

### 5.1 send 与 task 的边界

以下问题需要 task design 联合确认：

1. **send 是否拥有内部 write queue？**
   - 建议是：send 拥有轻量 transport-level write queue，保证同一 target 的 write 顺序。
   - task 拥有 task-level 序列编排（多帧执行顺序、间隔、条件）。
   - 两者不冲突：task 等前一次 SendResult 后再发下一帧。

2. **SendResult 是 sync return 还是 async event？**
   - 建议是：send public service 返回 Promise\<SendResult\>，同时可选 emit SendResult event。
   - task 可以 await SendResult，也可以通过 event 消费。
   - 这避免了 send 需要了解 task 的存在。

3. **send instance 配置归谁？**
   - 旧系统 `sendFrameInstancesStore` 承载 per-frame 的发送配置（字段默认值、target 偏好等）。
   - 建议：send own send-time 的 request 组装；per-frame 的"发送配置模板"如果需要持久化，可能归 storage 或 send own config，不归 frame。
   - 需 task design 和 settings design 联合确认。

4. **send 是否了解 task 的存在？**
   - 建议是：不。send 只接收 SendRequest（含 context 字段供追踪），不区分调用方。
   - context 中的 source/taskId/caseId/stepIndex 是纯信息性的，send 不基于它们改变行为。

5. **send 失败是否影响 task lifecycle？**
   - send 只输出 SendResult。task 根据 SendResult.kind 决定是否 pause/stop/retry。
   - send 不直接写 task state。

### 5.2 expression runtime 在 send 中的角色

- 旧发送支持 expression 计算（如从其他帧的接收值填充发送字段）。
- 问题：expression 执行归谁？frame definition 归 frame，但 expression 执行需要运行时上下文（receive values、global stats 等）。
- 建议：本轮 send design 不执行 expression；SendRequest.fieldValues 已包含 resolved values。expression runtime 的归属由后续单独设计决定。
- 如果需要 send-time expression，应在 send design 中显式声明为新增入口，不偷偷引入。

### 5.3 checksum 策略完整列表

- 旧系统有多种 checksum 策略。本轮不冻结完整列表。
- 建议：send/core 提供可扩展的 checksum 计算接口，具体策略在实现阶段补充。

### 5.4 send 与 receive trigger 的关系

- receive design 明确 receive 不直接调用 send。
- receive trigger → task → send 是建议路径。
- 是否允许 receive 直接触发 send（不经 task）？建议否：所有发送都经过 send public service，触发方可以是 task/runtime，不是 receive。

## 6. Implementation confirmation questions

实现前必须确认以下问题：

1. **task design 是否确认 send-task 调用方式？** — SendResult 是 Promise return、event 还是两者兼有。
2. **expression runtime 归属是否已确认？** — send 是否需要执行 expression，还是只接受 resolved values。
3. **send instance 配置是否需要持久化？** — 如果需要，归 send own config、settings 还是 storage。
4. **connection bridge 是否已 ready？** — send 需要 connection 的 target write 实际可用。
5. **checksum 策略列表是否已完整？** — 需要覆盖所有旧系统支持的策略。
6. **旧 send instance JSON 样例是否可用？** — 作为 migration fixture 输入。
7. **queue 行为是否需要 runtime 证据？** — 快速连发时的背压和队列深度。

## 7. Task boundary suggestions

以下建议供 task design 参考：

1. **task owns scheduling and sequencing**：task 决定何时调 send、调几次、按什么顺序。send 只执行单帧发送。
2. **task awaits SendResult**：task 通过 await send public service 的返回值或监听 SendResult event 来推进 task progress。
3. **task owns pause/resume/stop**：这些 lifecycle 语义在 task 内部处理。send 不知道自己是否属于一个 task。
4. **task owns retry strategy**：如果 SendResult.kind 是 transport-error，task 决定是否重试、重试几次、间隔多久。send 不自动重试。
5. **task 不 import send internal state**：task 只通过 send public service 和 selector 交互。
6. **建议 task design 为 send 定义最小调用契约**：确认 SendRequest 和 SendResult 的最终形态，以及 task 如何消费 SendResult 来推进 lifecycle。

## 8. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-send/rewrite-send-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、boundary guards、owner/not owner、core types、service contract、state shape、cross-feature contracts、fake adapter boundary、validation plan 和 open questions，不能把本轮文档外的旧代码结构升级为新实现合同。
