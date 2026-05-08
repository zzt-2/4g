---
doc_type: feature-design
feature: rewrite-scoe
status: draft
date: 2026-05-06
summary: 东方红上位机重写中 SCOE feature 作为"外部指令适配器"模式的第一个实现——SCOE 领域命令解析、完成条件定义、确认帧配置、领域状态管理、与 task/send/connection/receive 的交互契约，以及 ExternalCommandAdapter 通用模式的定义。
---

# Rewrite SCOE feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
2. `codestable/architecture/rewrite-target-structure.md`
3. `codestable/architecture/rewrite-system-architecture.md`
4. `codestable/architecture/rewrite-feature-boundaries.md`
5. `codestable/architecture/rewrite-feature-interaction-matrix.md`
6. `codestable/quality/rewrite-quality-rules.md`
7. `codestable/quality/rewrite-review-checklist.md`
8. `codestable/features/rewrite-send/rewrite-send-design.md`
9. `codestable/features/rewrite-task/rewrite-task-design.md`
10. `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
11. `codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`
12. `codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`
12. 当前实现参考：`rewrite/src/features/frame/index.ts`
13. 当前实现参考：`rewrite/src/features/connection/index.ts`
14. 当前实现参考：`rewrite/src/features/receive/index.ts`

`codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md` 锁定：task 是通用执行引擎，SCOE 不需要自己的执行器，SCOE 翻译领域命令为 TaskDefinition（triggerSource = scoe-command）。`codestable/features/rewrite-task/rewrite-task-design.md` 固定 TaskDefinition、TaskStepDefinition（多态 step：send / wait-condition / delay）、WaitCondition、TaskTriggerSource、TaskInstanceCompletion 等核心类型和 service contract。

## 2. Boundary guards

- 本轮是 Lane A design，只产出 design/checklist，不写实现代码。
- SCOE owns SCOE 协议领域规则、命令解析（指令码 → step 定义映射）、完成条件定义、确认帧配置、SCOE 领域状态（commandSuccessCount 等）、SCOE 静态资产（卫星配置、SCOE 帧实例）。
- SCOE does not own 通用执行引擎（task owns）、单帧发送（send owns）、帧定义 truth（frame owns）、连接传输生命周期（connection owns）、接收解析 truth（receive owns）、结果事实 truth（result owns）、报告生成（report owns）、对外交付（northbound owns）。
- SCOE 不直接调用 send service。SCOE 通过 task public service 创建执行计划（TaskDefinition），由 task 编排 send-step。
- SCOE 不直接调用 receive service 订阅事件。SCOE 定义 WaitCondition 内容，由 task 的 wait-condition-step 执行匹配。
- SCOE 不拥有 frame definition truth。SCOE 读取 frame public selector 获取帧资产。
- SCOE 不管理 connection transport lifecycle。SCOE 声明固定 target 需求，由 runtime 装配。
- SCOE 的领域逻辑（命令解析、完成条件、确认帧配置、SCOE 状态管理）留在 SCOE feature 的 `core/` 和 `services/`，不依赖 Vue/Pinia/Electron。
- SCOE 不继承旧 store 组织。旧 `scoeStore`、`useScoeCommandExecutor`、`scoeFrameInstancesStore` 的结构不迁移。
- northbound 的具体 schema/枚举/错误码/HTTP/FTP 细节不在此轮冻结。本轮只定义"外部指令适配器"通用模式骨架，供 northbound 后续复用。
- SCOE 命令执行是单命令模式（三步：发命令帧 → 等完成条件 → 发确认帧），不需要多命令序列。
- 旧 `src/`、`src-electron/` 只作为 evidence、oracle 或 migration input。
- 统计 read model 禁止写回 frame definition、field definition 或其他静态资产。
- SCOE 定时状态循环在新模型中是 SCOE 领域内部的定时行为，不映射为 task step。

## 3. Evidence summary

### 3.1 Contract evidence

- target structure 定义 `features/scoe` 为 SCOE 协议、领域命令、领域状态、完成条件、测试工具记录的 owner；不拥有通用 receive/send 主链定义权、统一运行主状态。
- feature boundaries 明确 SCOE 的 owner：SCOE 专项协议、命令、状态和测试工具记录；不拥有通用 receive/send 主链定义权、当前甲方 northbound 身份。
- interaction matrix 明确 `SCOE -> receive/send/task/status/storage/result` 交互方向。SCOE 是声明式边界例外。
- charter 固定：SCOE 保留为专项能力和复用材料，但不直接并入当前甲方 northbound 身份。SCOE 命令解析/checksum/completion 条件可做 fixture；真实设备必须 hardware validation。
- quality rules R9 要求 SCOE 作为声明式领域例外处理；固定 source/target、命令语义、完成条件、反馈语义留在 SCOE 边界内；SCOE 进入 receive/send/task 必须通过显式入口。
- `2026-05-06-task-scoe-send-execution-engine-unification.md` 锁定：task 定位为通用执行引擎；SCOE 是 task 的入口适配器之一；SCOE 命令 = TaskDefinition（steps = [send-step, wait-condition-step, send-step]）。
- task design 明确：SCOE 通过 task public service 创建执行；SCOE 领域逻辑留在 SCOE feature；SCOE 订阅 task lifecycle event 更新自己的领域状态。
- send design 明确：send 执行单帧发送，返回 SendResult；send 不了解 task 或 SCOE 的存在。
- northbound gap map 明确：SCOE 属于另一个客户/外部系统，不在当前甲方 northbound 身份内，但命令码/收发/解析行为可作为内部事实和 oracle 材料。
- connection design 明确：SCOE 固定连接是边界例外，需要 runtime 登记。
- receive design 明确 receive 只处理通用遥测帧。SCOE 入站指令码不走 receive，直接从 connection transport event 到 SCOE adapter。

### 3.2 Upstream public API evidence

frame public API 提供：`ReadonlyFrameAsset`、`ReadonlyFrameFieldDefinition`、`FrameAssetReader`、`selectFrameReferenceOptions`、`selectFieldReferenceOptions`。

connection public API 提供：`TransportTargetSnapshot`、`ConnectionService`、`ConnectionReader`、`selectTransportTargets`。

receive public API 提供：`ReceiveInputEvent`、`ReceiveReader`、`ReceiveService`、`ReceiveFieldValueSnapshot`、`selectReceiveFieldValues`。

task public API（按 task design 将提供）：`TaskService`（createTask / startTask / pauseTask / resumeTask / stopTask）、`TaskInstanceState` selector、`TaskInstanceCompletion` event、`TaskLifecycleEvent`。

send public API（按 send design 将提供）：`SendRequest`、`SendResult`、send service（Promise\<SendResult\>）。

### 3.3 Legacy evidence

旧系统事实只用于保留可观测行为和识别迁移风险：

- 旧 SCOE 执行器策略模式：`src/composables/scoe/useScoeCommandExecutor.ts` — commandFunction 映射到具体执行函数，含 load_satellite_id / unload_satellite_id / health_check / link_check / send_frame / read_file_and_send。
- 旧完成条件等待：`src/utils/receive/scoeFrame.ts` — `waitForCompletionConditions`，从 receive 缓存匹配条件。
- 旧确认帧发送：`src/composables/scoe/useScoeCommandExecutor.ts:94-113` — `sendSuccessFrame`，使用固定 successFrameId 和固定 target `'network:scoe-udp:scoe-udp-remote'`。
- 旧 SCOE store：`src/stores/scoeStore.ts` — 同时管理配置持久化、TCP/UDP 连接生命周期、SCOE 发送、状态循环和测试工具记录。
- 旧 SCOE 指令码路由：`src/composables/scoe/useScoeCommandExecutor.ts:223-238` — `executeCommandByCode` 通过功能码查找指令并执行。
- 旧完成条件异步非阻塞等待：`src/composables/scoe/useScoeCommandExecutor.ts:171-187` — `waitForCompletionConditions` 不阻塞后续数据接收，成功后更新 commandSuccessCount 和发送确认帧。
- 旧 SCOE 命令配置：`public/data/scoeReceiveCommands.json` — 命令列表，含 id/label/code/function/params/frameInstances。
- 旧 SCOE 发送实例：`public/data/scoeSendInstances.json` — SCOE 专用发送帧配置。
- 旧状态循环：`src/stores/scoeStore.ts` — 1 秒定时器轮询状态。
- 旧直接依赖 receive store：`src/utils/receive/scoeFrame.ts:5` — 直接 import receive store。
- 旧硬编码 UDP target：`src/composables/scoe/useScoeCommandExecutor.ts:108` — `'network:scoe-udp:scoe-udp-remote'`。

## 4. Design

### 4.1 External Command Adapter 通用模式

SCOE 和 northbound 本质上都是"外部指令驱动"模式：外部系统发指令 → 翻译为 TaskDefinition → task 执行 → 结果回传。区别只在"外部系统"不同（SCOE TCP/UDP vs HTTP）。

#### 4.1.1 ExternalCommandAdapter 接口

接口拆分为两层：base adapter 所有实现者都需要，output translator 仅需要对外响应翻译的场景使用。

**Base adapter（SCOE 和 northbound 都实现）**：

```
ExternalCommandAdapter<ExternalCommand>:
  translateToTaskDefinition(command: ExternalCommand) → TaskDefinition
  onExecutionEvent(event: TaskLifecycleEvent) → void
  getAdapterId() → string
```

**Optional output translator（仅 northbound 实现）**：

```
ExternalResponseTranslator<ExternalResponse>:
  translateResponse(completion: TaskInstanceCompletion) → ExternalResponse
```

SCOE 不实现 `ExternalResponseTranslator`——确认帧已作为 task 的最后一个 send-step 完成，SCOE 不需要额外输出翻译。

职责：
- **输入翻译**：将外部指令（SCOE 指令码、northbound HTTP 请求）翻译为 TaskDefinition。翻译过程可以访问 SCOE/northbound 的领域配置（命令映射、完成条件定义、确认帧配置）。
- **生命周期回调**：订阅 task lifecycle event 更新领域状态（SCOE 更新 commandSuccessCount 等）。
- **适配器标识**：返回 adapter ID，用于 task 的 triggerSource 标记。
- **输出翻译**（可选）：仅 northbound 需要，将 TaskInstanceCompletion 翻译为外部响应格式。SCOE 不实现此接口。

#### 4.1.2 适配器生命周期

```
1. 连接管理（transport 侧）：
   SCOE: 由 connection 管理 TCP server / UDP 的生命周期和入站字节流
   northbound: 由 platform/main 提供 HTTP server，经 platform facade 暴露
   adapter 不直接管理 transport lifecycle

2. 入站指令路径（绕过 receive）：
   SCOE: connection transport event (入站字节流) → SCOE adapter 直接消费 → 自有协议解析 → 指令码 + 参数
   northbound: platform HTTP event → northbound adapter 直接消费 → JSON/XML 解析 → 外部命令
   receive 只处理通用遥测帧，不知道 SCOE/northbound 入站指令的存在
   SCOE/northbound 完成条件响应仍走 receive → task wait-condition-step 匹配（这部分不变）

3. 指令路由：
   adapter 收到解析后的指令 → adapter.translateToTaskDefinition(指令) → TaskDefinition
   → taskService.createTask(definition) + taskService.startTask(instanceId)

4. 执行监控：
   adapter.onExecutionEvent(event) 更新领域状态
   不干预 task 执行逻辑（不重试、不停顿、不修改 step）

5. 错误处理：
   task 执行失败/超时 → adapter 收到 event → 翻译为领域错误语义
   SCOE: 更新 commandErrorCount
   northbound: 翻译为外部错误码/拒绝语义
```

#### 4.1.3 SCOE 和 northbound 各自实现

| 维度 | SCOE | northbound |
| --- | --- | --- |
| 外部指令 | TCP/UDP 收到的指令码 + 参数字节 | HTTP 收到的 JSON/XML 请求 |
| 入站路径 | connection transport event → adapter 直接消费字节流（自有协议解析，core 里写死） | platform HTTP event → adapter 直接消费（JSON/XML 解析） |
| 输入翻译 | 指令码 → ScoeCommand → TaskDefinition（3 steps） | 外部任务描述 → TaskDefinition（N steps） |
| 输出翻译 | 不实现（确认帧已作为 send-step） | TaskInstanceCompletion → HTTP response（含结果/状态/错误码） |
| 连接管理 | connection 管理 SCOE TCP server/UDP | platform/main 管理 HTTP server |
| 领域状态 | commandSuccessCount/ErrorCount/lastCommandCode | northbound transaction 状态 |
| 错误处理 | task 失败 → 领域 errorCount++ | task 失败 → 外部错误码/拒绝语义 |
| adapter ID | `'scoe-command'` | `'northbound-command'` |

#### 4.1.4 模式放置

ExternalCommandAdapter 接口定义放在 `rewrite/src/shared/external-command-adapter/`。理由：

- SCOE 和 northbound 已是明确的两个消费者，满足 shared 提取条件。
- 如果放在 SCOE/core，northbound 需要引用 SCOE core 的接口，违反 feature boundary。
- 接口定义 + 类型放在 shared，具体实现（ScoeCommandAdapter、NorthboundCommandAdapter）留在各自 feature。

shared 中只包含：
- `ExternalCommandAdapter<ExternalCommand>` 接口定义
- `ExternalResponseTranslator<ExternalResponse>` 接口定义
- 相关通用类型

实现（ScoeCommandAdapter、命令解析、领域逻辑等）全部留在 `features/scoe/`。

### 4.2 Owner / not owner

| 分类 | SCOE owner | SCOE not owner |
| --- | --- | --- |
| 命令解析 | 指令码 → ScoeCommand 映射、参数提取、step 定义构建。 | 执行引擎逻辑、send 编排、错误策略。 |
| 入站协议解析 | SCOE 自有协议解析（帧头/校验/帧尾 → 指令码 + 参数）。入站字节流直接从 connection transport event 到 SCOE adapter，不经 receive。协议解析逻辑在 SCOE core 里实现。 | 通用 receive 解析链。receive 不知道 SCOE 入站协议的存在。 |
| 完成条件 | SCOE 完成条件定义（哪个 receive 帧的哪个字段满足什么条件）。由 SCOE 构建 WaitCondition 交给 task 的 wait-condition-step。 | 条件匹配执行（task/core 执行）、receive 解析 truth（receive owns）。 |
| 确认帧 | SCOE 确认帧配置（successFrameId → frameId + fieldValues + targetId）。确认帧内容为固定/硬编码数据或从遥测中选取的数据，targetId 指向 SCOE UDP remote。由 SCOE 构建 send-step 交给 task。 | 实际发送执行（send owns）、transport write（connection owns）。 |
| SCOE 领域状态 | commandSuccessCount、commandErrorCount、lastCommandCode、lastErrorReason、loadedSatelliteId、receiveCommandSuccess。通过订阅 task lifecycle event 更新。 | task lifecycle truth（task owns）、send result truth（send owns）、receive parse truth（receive owns）。 |
| SCOE 静态资产 | 卫星配置（satelliteId + 关联命令 + 关联帧）、SCOE 帧实例配置、SCOE 全局配置（scoeIdentifier、successFrameId、highlightConfigs）、命令到 step 定义的映射表。 | 通用帧定义 truth（frame owns）、通用连接配置（connection owns）。 |
| ExternalCommandAdapter | SCOE 作为 adapter 的第一个实现。接口定义在 shared，实现留在 SCOE feature。 | 接口定义归 shared，不属于 SCOE 领域。 |
| 状态循环 | SCOE 定时状态循环是 SCOE 领域内部行为（1 秒轮询），使用 shared TimerRegistry 管理。 | 不是 task step，不纳入 task 执行计划。 |
| 测试工具记录 | SCOE 收发数据记录、高亮配置、测试工具 UI 状态。v1 只做最小实现。 | 不是系统主状态，不成为其他 feature 的事实源。 |
| 协议边界例外 | SCOE 固定 source（TCP server / UDP remote）和固定 target（UDP remote）需要登记为边界例外。 | 通用 receive/send 链不包含 SCOE 硬编码。 |

### 4.3 Core types

本轮不冻结最终类型名和字段 schema，只定义类型职责和分类。

**ScoeCommand** — SCOE 领域命令（指令码到 step 定义的映射单元）：

- `id`、`label`、`code`：指令码（如 `"01"`、`"02"`、`"30"`）。
- `function`：命令功能标识（`load_satellite_id`、`health_check`、`link_check`、`send_frame` 等）。
- `params`：命令参数定义（offset、length、type、options 含 receiveCode）。
- `frameInstances`：命令关联的发送帧实例配置。每个帧实例含 `targetId`，指向命令帧发往的下位机连接 target（connection target ID），不是 SCOE 自己的连接。SCOE adapter 翻译时将此 targetId 写入 send-step。参见 `2026-05-06-outbound-routing-and-response-decisions.md` D1。
- `completionCondition`：ScoeCompletionCondition（映射到 WaitCondition）。
- `ackFrameConfig`：ScoeAckFrameConfig（映射到 send-step）。
- `errorPolicyOverride`：可选 ErrorPolicy 覆盖。不同 ScoeCommand 可定义不同的错误策略（如 health_check 可 retry，link_check 可 stop）。翻译时写入 TaskDefinition.errorPolicy。

**ScoeCompletionCondition** — SCOE 完成条件（映射到 task 的 WaitCondition）：

- `frameId`：等待的接收帧。
- `fieldId`：等待的字段。
- `operator`：比较运算（映射到 WaitCondition.operator）。
- `threshold`：阈值。
- `sourceId`：可选 source 过滤。
- `timeoutMs`：超时时间。
- `onTimeout`：超时策略（映射到 wait-condition-step 的 onTimeout）。

SCOE 的 completionCondition 不是新的条件类型，而是对 task WaitCondition 的领域封装。SCOE 在 `translateToTaskDefinition` 时将 ScoeCompletionCondition 转换为 WaitCondition。

**ScoeAckFrameConfig** — 确认帧配置（映射到 task 的 send-step）：

- `frameId`：确认帧引用（旧 `successFrameId`）。
- `fieldValues`：确认帧字段值。首轮只支持固定值（配置声明）。遥测选取值（从 receive 字段动态填入确认帧）等 expression runtime 归属确定后再支持。参见 `2026-05-06-outbound-routing-and-response-decisions.md` D3。
- `targetId`：发送目标（固定为 SCOE UDP target，运行时解析）。

**ScoeGlobalConfig** — SCOE 全局配置：

- `scoeIdentifier`：SCOE 标识符（用于构造 lastCommandCode）。
- `successFrameId`：默认确认帧 ID。
- `highlightConfigs`：高亮配置。
- `scoeTcpPort`、`scoeUdpHost`、`scoeUdpPort`：SCOE 连接参数。

**ScoeSatelliteConfig** — 卫星配置：

- `id`、`satelliteId`、`label`。
- 关联的命令列表和帧实例映射。

**ScoeDomainState** — SCOE 领域状态（通过订阅 task lifecycle event 更新）：

- `commandSuccessCount`：命令执行成功计数。
- `commandErrorCount`：命令执行错误计数。
- `lastCommandCode`：最近执行的命令码。
- `lastErrorReason`：最近错误原因。
- `loadedSatelliteId`：当前加载的卫星 ID。
- `receiveCommandSuccess`：最近一次接收命令是否成功。

**ScoeCommandTranslation** — 命令翻译结果（translateToTaskDefinition 的中间产物）：

- `commandRef`：引用的 ScoeCommand。
- `resolvedParams`：解析后的参数值。
- `taskDefinition`：翻译后的 TaskDefinition。

### 4.4 SCOE 与 task 的交互契约

#### SCOE → task（创建执行计划）

| 维度 | 契约 |
| --- | --- |
| 方向 | SCOE 调用 task public service |
| SCOE 提供 | TaskDefinition（triggerSource = `scoe-command`），steps 含 [send-step(命令帧 → 下位机), wait-condition-step(等下位机遥测响应), send-step(确认帧 → SCOE UDP)] |
| task 执行 | 按序执行 steps：发命令帧到下位机 → 等下位机遥测中的完成条件 → 发确认帧回 SCOE 设备。错误策略由 TaskDefinition.errorPolicy 决定。 |
| errorPolicy | 按命令可配置。不同 ScoeCommand 可定义不同的 errorPolicy（如 health_check 可 retry，link_check 可 stop）。ScoeCommand 中增加可选的 errorPolicyOverride 字段，翻译时写入 TaskDefinition。 |
| task 返回 | TaskInstanceCompletion（task 终态快照，含 completed/stopped/failed、step 摘要、耗时等） |
| 禁止 | SCOE 自己实现 send 编排/错误策略/进度追踪；task 为 SCOE 硬编码特殊逻辑；SCOE import task internal state |

#### SCOE ← task（生命周期事件订阅）

| 维度 | 契约 |
| --- | --- |
| 方向 | task 输出 lifecycle event，SCOE 消费 |
| task 提供 | TaskLifecycleEvent（step-completed / step-failed / task-completed / task-failed / task-stopped） |
| SCOE 行为 | 收到 task-completed → commandSuccessCount++；收到 task-failed/step-failed → commandErrorCount++、lastErrorReason 更新 |
| 禁止 | SCOE 干预 task 执行逻辑；SCOE 在 task 执行中修改 task state |

#### 命令翻译流程

```
1. SCOE TCP 收到指令字节
2. connection 输出 transport event（入站字节流）
3. SCOE adapter 直接消费字节流（绕过 receive）
4. SCOE core 执行自有协议解析（帧头/校验/帧尾 → 指令码 + 参数）
5. 查找 ScoeCommand（by code）
6. 提取参数（从解析结果中按 ScoeCommand.params 定义提取）
7. 构建 TaskDefinition:
   - triggerSource = 'scoe-command'
   - schedulingMode = 'sequence'（单次执行，无循环）
   - steps = [
       send-step: frameId = 命令帧, fieldValues = 解析后参数, targetId = SCOE UDP target,
       wait-condition-step: condition = ScoeCompletionCondition → WaitCondition,
       send-step: frameId = 确认帧, fieldValues = 确认帧字段, targetId = SCOE UDP target
     ]
   - errorPolicy = command.errorPolicyOverride ?? defaultScoeErrorPolicy
8. taskService.createTask(definition) → instanceId
9. taskService.startTask(instanceId)
10. SCOE 订阅该 instanceId 的 lifecycle event
```

### 4.5 SCOE 与 connection 的交互契约

| 维度 | 契约 |
| --- | --- |
| SCOE 需要 | 固定的 TCP server 端口（接收 SCOE 指令字节流）和固定 UDP remote target（发送 SCOE 命令帧和确认帧） |
| connection 提供 | TCP server / UDP transport target 的生命周期管理、入站字节流事件（transport event）、transport write 能力 |
| SCOE 不做 | 管理 TCP server 创建/销毁、管理 UDP socket 绑定/解绑、直接访问 platform/main |
| 入站消费 | runtime 订阅 connection transport event，按 sourceId 匹配 SCOE 固定 TCP server source，构造 ScoeCommandTrigger（rawBytes + sourceId）调用 SCOE adapter。SCOE 不直接订阅 connection transport event，不经 receive，自己做协议解析 |
| 发送路径 | 发送经 task → send → connection → platform（SCOE 不直接调用 connection write） |
| 边界例外 | SCOE 固定 TCP server source 和固定 UDP target 是已声明的边界例外，需在 runtime 层登记 |

**连接声明（requiredTransports）**：

SCOE 全局配置中声明固定连接需求，由 runtime 启动时请求 connection 创建：

- `ScoeGlobalConfig.requiredTransports: [{ kind, port/id, host?, ... }]`
- 包含 SCOE 固定 TCP server（接收指令字节流）和固定 UDP remote（发送命令帧和确认帧）
- runtime 启动时读取配置 → 请求 connection 创建对应 transport → 注册入站路由
- SCOE 不直接调用 connection create/destroy API，只读取 target snapshot 和订阅 transport event

**连接生命周期归属**：

- SCOE TCP server 的创建/监听/关闭由 connection feature 管理（connection owns transport lifecycle）。
- SCOE 只声明需求（通过 requiredTransports），不管理 transport 生命周期。

**入站字节流路径（绕过 receive）**：

```
SCOE TCP server 收到指令字节
  → connection 输出 transport event（入站字节流）
  → SCOE adapter 直接订阅该 transport event（按 sourceId 过滤）
  → SCOE core 执行自有协议解析（帧头/校验/帧尾 → 指令码 + 参数）
  → SCOE adapter 翻译指令码为 TaskDefinition
```

旧代码中 SCOE 入站数据直接进入 `receiveFramesStore` 的 SCOE 分支。新架构中，SCOE 入站字节从 connection transport event 直接到达 SCOE adapter，receive 完全不知道 SCOE 入站协议的存在。

### 4.6 SCOE 与 receive 的交互契约

SCOE 与 receive 的唯一交互点是完成条件的字段值来源。SCOE 入站指令码不走 receive，receive 完全不知道 SCOE 入站协议的存在。

| 维度 | 契约 |
| --- | --- |
| 方向 | receive 输出解析结果，task 的 wait-condition-step 消费（SCOE 只定义条件内容） |
| receive 提供 | ReceiveInputEvent（含 frameId、fieldId、value、sourceId） |
| SCOE 参与 | SCOE 定义 ScoeCompletionCondition 内容 → 翻译为 WaitCondition → 写入 task 的 wait-condition-step。task 自己通过 receive event source 匹配条件。 |
| SCOE 不做 | 直接订阅 receive event source；直接读取 receive store；参与条件匹配执行 |
| 禁止 | SCOE import receive internal state；receive 为 SCOE 硬编码特殊分支 |

**完成条件字段值来源**：

- task 的 wait-condition-step 通过 receive public API 的 ReceiveInputEvent 匹配 WaitCondition。
- SCOE 只定义条件内容（ScoeCompletionCondition → WaitCondition），不参与条件匹配执行。
- SCOE 完成条件的响应帧是通用遥测帧，由 receive 正常解析。receive 不知道这个帧是 SCOE 的完成条件响应。

### 4.7 SCOE 与 frame 的交互契约

| 维度 | 契约 |
| --- | --- |
| 方向 | SCOE 读取 frame public selector |
| SCOE 需要 | 命令帧和确认帧的 frame asset snapshot、field definitions（用于构建 send-step 的 frameId 和 fieldValues） |
| frame 提供 | 只读 frame asset snapshot、field definitions、reference options |
| 禁止 | SCOE 写入 frame state；SCOE 让 frame 拥有 SCOE 命令配置 |

### 4.8 SCOE 领域状态管理

SCOE 领域状态（ScoeDomainState）的更新来源是 task lifecycle event，不是 SCOE 自己的执行逻辑。

**更新机制**：

```
task 执行完成 → emit TaskInstanceCompletion
  → SCOE adapter.onExecutionEvent(event)
    → if event.kind == 'task-completed': commandSuccessCount++
    → if event.kind == 'task-failed': commandErrorCount++, lastErrorReason = event.error
    → if event.kind == 'step-failed': lastErrorReason = event.error
    → if event.kind == 'step-completed' && step.kind == 'wait-condition':
         receiveCommandSuccess = stepResult.matched
```

**状态不是系统主状态**：

- ScoeDomainState 是 SCOE 领域内部状态，不是系统运行主状态。
- status feature 可以读取 ScoeDomainState 的只读 projection 作为状态摘要的一部分。
- 其他 feature 不依赖 ScoeDomainState 推进自己的业务逻辑。

**持久化**：

- ScoeDomainState 运行时状态不持久化。应用重启后重新初始化。
- SCOE 静态资产（卫星配置、命令映射、帧实例）通过 storage 持久化。

### 4.9 SCOE 定时状态循环在新模型中的归属

旧代码中 `scoeStore` 有一个 1 秒轮询的状态循环。在新模型中：

**归属判断**：

- SCOE 定时状态循环是 SCOE 领域内部的定时行为（查询卫星状态、更新 SCOE 领域状态）。
- 它不是 task step——没有发送帧、没有等待条件、没有需要编排的多步骤。
- 它是 SCOE feature 内部的定时查询（读取 receive 或 connection 的公开状态，更新 ScoeDomainState）。

**新模型表达**：

- 使用 `shared/timer/TimerRegistry` 管理定时器（与 task 定时器统一管理）。
- 定时器回调读取 receive/connection 的公开 selector（如 selectReceiveFieldValues），按 SCOE 领域规则更新 ScoeDomainState。
- 定时器 lifecycle 随 SCOE service lifecycle：SCOE service 启动时注册，销毁时注销。
- 不通过 task 实现（不是执行计划，没有 send-step/wait-condition-step）。

### 4.10 ExternalCommandAdapter 在 SCOE 中的实现

SCOE 的 ScoeCommandAdapter 实现 ExternalCommandAdapter<ScoeCommandTrigger>：

```
ScoeCommandAdapter implements ExternalCommandAdapter<ScoeCommandTrigger>:

  translateToTaskDefinition(trigger: ScoeCommandTrigger) → TaskDefinition:
    1. 从 trigger.rawBytes 执行 SCOE 自有协议解析（帧头/校验/帧尾 → 指令码 + 参数）
    2. 查找 ScoeCommand（by code）
    3. 提取参数（按 ScoeCommand.params 定义从解析结果提取）
    4. 构建 steps:
       - send-step: frameId = command.frameInstances[0].frameId（SCOE 命令固定单帧实例，无 frameInstance 时为翻译错误）,
                    fieldValues = 解析后参数,
                    targetId = command.frameInstances[0].targetId（指向下位机连接的 connection target ID，D1）
       - wait-condition-step: condition = command.completionCondition → WaitCondition,
                              timeoutMs = command.completionCondition.timeoutMs,
                              onTimeout = command.completionCondition.onTimeout
       - send-step: frameId = command.ackFrameConfig.frameId,
                    fieldValues = command.ackFrameConfig.fieldValues（确认帧内容为固定/硬编码数据，或从遥测中选取的数据）,
                    targetId = SCOE UDP target（确认帧发回给 SCOE 设备）
    5. 返回 TaskDefinition(triggerSource='scoe-command',
                           errorPolicy = command.errorPolicyOverride ?? defaultScoeErrorPolicy)

  onExecutionEvent(event: TaskLifecycleEvent) → void:
    // 更新 ScoeDomainState
    switch event.kind:
      task-completed: commandSuccessCount++, receiveCommandSuccess = true
      task-failed: commandErrorCount++, lastErrorReason = event.error
      step-failed: lastErrorReason = event.error
      step-completed && step.kind == 'wait-condition': receiveCommandSuccess = stepResult.matched

  getAdapterId() → 'scoe-command'
```

SCOE 不实现 ExternalResponseTranslator——确认帧已作为 task 的最后一个 send-step 完成，SCOE 不需要额外输出翻译。

**ScoeCommandTrigger** — SCOE adapter 输入（由 runtime 从 connection transport event 构造）：

- `rawBytes`：从 connection transport event 获取的原始入站字节流。
- `sourceId`：入站 source 标识（SCOE 固定 TCP server source）。

协议解析在 translateToTaskDefinition 内部完成（帧头/校验/帧尾 → 指令码 + 参数），ScoeCommandTrigger 只携带原始字节和 source 元信息。

### 4.11 State shape and selector surface

| 状态类别 | 写入 owner | 读取方 | reset / lifecycle | 设计约束 |
| --- | --- | --- | --- | --- |
| SCOE domain state | SCOE service（通过 task lifecycle event 更新） | pages、status、runtime | 应用生命周期；重启后重置 | 不是系统主状态；不写回 frame/task/send/receive state |
| SCOE command configs | SCOE（创建/编辑）+ storage（持久化） | SCOE adapter、pages、runtime | 低频更新；静态资产 | 不等于 frame definition truth |
| SCOE satellite configs | SCOE + storage | SCOE adapter、pages | 低频更新 | 不等于通用连接配置 |
| SCOE test tool state | SCOE test tool | pages | 应用生命周期；可选持久化 | 不是系统主状态；不是其他 feature 的事实源 |
| UI snapshot | pages / SCOE composables | UI 组件 | 页面生命周期 | 不定义 SCOE truth |

**Selector surface**：

- `selectScoeDomainState`：SCOE 领域状态只读 snapshot。
- `selectScoeCommandConfigs`：命令配置列表。
- `selectScoeSatelliteConfigs`：卫星配置列表。
- `selectScoeTestToolState`：测试工具 UI 状态。
- `selectScoeSnapshot`：面向 UI 的安全聚合 snapshot。

Selector 不暴露可变 state 引用、内部 service 实例或 task/send/receive/frame/connection 内部状态。

### 4.12 Runtime involvement

SCOE 需要 runtime 参与：

- **服务装配**：runtime 创建 SCOE service，注入 task service、frame reader、connection reader。
- **固定连接声明**：SCOE 声明需要固定 TCP server 和 UDP remote，runtime 请求 connection 创建对应 transport。
- **入站路由**：runtime 订阅 connection transport event，按 sourceId 匹配 SCOE 固定 TCP server source，构造 ScoeCommandTrigger（rawBytes + sourceId）调用 SCOE adapter。SCOE 入站不经 receive。
- **边界例外登记**：SCOE 固定 source/target 作为边界例外在 runtime 层登记。
- **生命周期**：app startup/shutdown 时启动/停止 SCOE service 和状态循环定时器。

runtime 不得：
- 执行命令解析或指令码路由。
- 决定 SCOE 完成条件。
- 管理 SCOE 领域状态。
- 变成 SCOE 和 task 之间的业务逻辑中间层。

### 4.13 Platform involvement

SCOE 不直接访问 platform：

- 入站字节流经 connection transport event → runtime 路由 → SCOE adapter 直接消费路径（绕过 receive）。
- 发送经 task → send → connection → platform 路径。
- SCOE 不新增 platform / preload / main API。
- SCOE TCP server 的 socket 创建和 UDP transport 由 connection 通过 platform 管理。

### 4.14 Fake adapter boundary and fixture strategy

**Fake adapter boundary**：

SCOE 的 fake adapter 需要模拟以下外部依赖：

1. **Fake task service**：
   - 接受 TaskDefinition，返回预设的 TaskInstanceState 和 lifecycle event。
   - 支持模拟各 step 执行结果（send-step 成功/失败、wait-condition-step 匹配/超时）。
   - 支持异步 event 发射，模拟 task 执行完成后 emit TaskInstanceCompletion。
   - 不执行真实 task 引擎。

2. **Fake frame snapshot provider**：
   - 提供预设的 SCOE 帧资产和字段定义。
   - 已在 frame fixtures 中定义，SCOE 可复用。

3. **Fake connection reader**：
   - 提供预设的 SCOE TCP server / UDP target snapshot。
   - 已在 connection fixtures 中定义，SCOE 可复用。

4. **Fake transport event provider**：
   - 模拟 connection transport event（入站字节流），构造 ScoeCommandTrigger（rawBytes + sourceId）。
   - 支持注入各种协议字节序列（合法指令、校验错误、部分帧等），验证 SCOE adapter 的协议解析和错误处理。

**Fixture 策略**：

- **命令解析 fixture**：定义 ScoeCommand 列表 → 输入指令码和参数字节 → 验证 translateToTaskDefinition 输出的 TaskDefinition steps 正确。
- **完成条件翻译 fixture**：定义 ScoeCompletionCondition → 验证 WaitCondition 转换正确（frameId/fieldId/operator/threshold 映射）。
- **确认帧翻译 fixture**：定义 ScoeAckFrameConfig → 验证 send-step 转换正确（frameId/fieldValues/targetId）。
- **生命周期事件 fixture**：注入模拟的 task lifecycle event → 验证 ScoeDomainState 更新正确（commandSuccessCount/ErrorCount）。
- **端到端命令流程 fixture**：从指令码输入 → translateToTaskDefinition → task 执行模拟 → lifecycle event → ScoeDomainState 更新，验证完整链路。
- **状态循环 fixture**：验证定时器正确启动/停止，回调正确读取公开 selector。
- **Legacy oracle**：旧 `scoeReceiveCommands.json` 的命令列表和旧 `scoeSendInstances.json` 的帧配置可作为迁移 fixture 输入。

**Fixture 位置**：

- `rewrite/src/features/scoe/fixtures/commands/`：预设 ScoeCommand fixture。
- `rewrite/src/features/scoe/fixtures/completion-conditions/`：完成条件 fixture。
- `rewrite/src/features/scoe/fixtures/ack-frames/`：确认帧配置 fixture。
- `rewrite/src/features/scoe/fixtures/command-translation-cases/`：命令翻译端到端 fixture。
- `rewrite/src/features/scoe/fixtures/legacy-oracle/`：旧系统命令配置和执行 oracle。

### 4.15 Target internal layering

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript。负责命令解析（指令码 → ScoeCommand 查找）、参数提取、ScoeCompletionCondition → WaitCondition 转换、ScoeAckFrameConfig → send-step 转换、ScoeCommandAdapter 翻译逻辑（实现 shared/ExternalCommandAdapter 接口）、SCOE 入站协议解析（TCP 字节流 → 指令码 + 参数，写死在 core 中）。不依赖 Vue、Pinia、Electron、platform、Node、task/send/receive/frame/connection store。 |
| `services` | SCOE 用例入口。负责接收指令码触发、调用 core 翻译为 TaskDefinition、调用 task public service 创建执行、订阅 task lifecycle event 更新领域状态、管理状态循环定时器。通过显式依赖注入接收 task service、frame reader、connection reader。 |
| `state` | SCOE domain state、command configs、satellite configs、test tool state、只读 selector。state action 保持薄层。不保存 task/send/receive/frame/connection 状态。 |
| `adapters` | 可选。用于 fake task service、fake frame reader、fake connection reader。real task/receive/frame 通过 public API 消费。 |
| `composables` | 面向 SCOE 页面的 UI-facing 组合。负责 SCOE 状态面板、测试工具面板、命令列表展示、配置编辑。不拥有领域逻辑。 |
| `components` | SCOE 状态面板、测试工具面板、命令列表、配置对话框等 UI。组件通过 props/events/composables 使用 SCOE 能力。 |
| `fixtures` | ScoeCommand fixture、ScoeCompletionCondition fixture、ScoeAckFrameConfig fixture、命令翻译端到端 fixture、legacy oracle。 |

### 4.16 Validation plan

**Static scan**：

- `features/scoe/core` 无 Vue/Pinia/Electron/platform/Node 依赖。
- SCOE 不 import task/send/receive/frame/connection/status/result/report/northbound internal state。
- SCOE 不硬编码通用 receive/send 链逻辑。
- SCOE 定时器在 renderer 侧，不进入 platform/main。

**Vitest unit**：

- 命令解析：指令码 → ScoeCommand 查找、参数提取。
- 条件翻译：ScoeCompletionCondition → WaitCondition 的各种组合。
- 确认帧翻译：ScoeAckFrameConfig → send-step 的正确构建。
- ExternalCommandAdapter translateToTaskDefinition：端到端翻译验证（3 steps 的正确构建）。
- onExecutionEvent：各 lifecycle event 对 ScoeDomainState 的更新。
- ScoeDomainState 更新逻辑：success/failure 计数、lastCommandCode、lastErrorReason。

**Fixture test**：

- 命令翻译端到端 fixture：指令码 + 参数 → TaskDefinition → 模拟 task 执行 → ScoeDomainState 更新。
- 完成条件超时 fixture：wait-condition-step 超时 → onTimeout 策略生效 → ScoeDomainState 更新。
- Legacy oracle：旧 JSON 命令配置迁移后的翻译结果与旧系统行为对比。

**Oracle comparison**：

- 旧 `scoeReceiveCommands.json` 的命令列表和旧 `useScoeCommandExecutor` 的行为可作为 oracle。
- 旧 `scoeFrame.ts` 的完成条件匹配输出可作为 WaitCondition 翻译 oracle。
- 旧 `sendSuccessFrame` 的确认帧参数可作为 ack frame translation oracle。

**Fake adapter test**：

- Fake task service：返回各种 TaskInstanceCompletion kind。
- 验证 SCOE adapter 对各种 task 执行结果的处理。

**Manual checklist**：

- SCOE 页面入口可达。
- SCOE 状态面板展示 commandSuccessCount/ErrorCount/lastCommandCode。
- SCOE 测试工具面板可用。
- SCOE 命令列表和配置编辑可用。
- SCOE TCP 连接状态可见（经 connection 公开状态）。

**Runtime validation**：

- SCOE service 装配和清理。
- 真实 SCOE 设备连接、指令码路由和执行。
- 完成条件在真实接收后的匹配。
- 状态循环在真实环境中的行为。

**Hardware validation**：

- 真实 SCOE TCP server 接收指令字节流。
- 真实 SCOE UDP 发送命令帧和确认帧。
- 真实 SCOE 设备的完成条件响应。

Cannot claim from this design：

- SCOE implementation complete.
- Real SCOE device integration complete.
- SCOE task integration complete.
- northbound adapter implementation complete.

### 4.17 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level |
| --- | --- | --- | --- | --- |
| SCOE TCP 连接状态可见（已连接/未连接）。 | connection owns transport; SCOE reads snapshot | preserve | `src/stores/scoeStore.ts` | fixture test, runtime validation |
| SCOE UDP 发送可用。 | connection owns transport; SCOE reads snapshot | preserve | `src/stores/scoeStore.ts` | fixture test, runtime validation |
| SCOE 命令执行后可见成功计数和错误计数。 | SCOE owns domain state; task owns execution | preserve | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test |
| SCOE 指令码路由到不同执行函数（策略模式）。 | SCOE owns command parsing; task executes steps | preserve pattern | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test |
| SCOE 命令执行后等待完成条件（收到特定响应帧+字段匹配）。 | SCOE defines condition; task wait-condition-step executes | preserve | `src/utils/receive/scoeFrame.ts` | fixture test, hardware validation |
| SCOE 完成条件满足后发送确认帧。 | SCOE defines ack config; task send-step executes | preserve | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test, hardware validation |
| SCOE 定时状态循环（1 秒轮询）。 | SCOE owns domain timer | preserve timing | `src/stores/scoeStore.ts` | runtime validation |
| SCOE 卫星配置加载/保存。 | SCOE owns config; storage owns persistence | preserve | `src/stores/scoeStore.ts` | fixture test, manual checklist |
| SCOE 测试工具收发数据记录。 | SCOE test tool | preserve | `src/composables/scoe/useScoeTestTool.ts` | manual checklist |
| SCOE 高亮配置。 | SCOE test tool | preserve | `src/stores/scoeStore.ts` | manual checklist |
| SCOE 命令成功后 receiveCommandSuccess 状态可见。 | SCOE domain state | preserve | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test |
| SCOE lastCommandCode 更新。 | SCOE domain state | preserve | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test |
| SCOE lastErrorReason 更新。 | SCOE domain state | preserve | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test |
| 旧 SCOE 硬编码 UDP target。 | SCOE defines target; connection provides transport | candidate drop for hardcode | `src/composables/scoe/useScoeCommandExecutor.ts` | static scan |
| 旧 SCOE 直接 import receive store。 | SCOE reads receive via public API | candidate drop for location | `src/utils/receive/scoeFrame.ts` | static scan |
| 旧 SCOE 直接 import send unified sender。 | SCOE uses task public service | candidate drop for location | `src/composables/scoe/useScoeCommandExecutor.ts` | static scan |

### 4.18 Deferred / blockers

**Deferred**：

- Concrete ScoeCommand / ScoeCompletionCondition schema。
- SCOE 任务是否出现在用户可见的任务列表中（需用户确认）。
- wait-condition-step 超时后 SCOE 领域状态的具体更新策略（onTimeout 各选项的领域影响）。
- SCOE 配置持久化格式和迁移（归 storage + SCOE 联合确认）。
- SCOE 入站字节到指令码的完整协议解析细节（协议帧头/帧尾/校验）。
- SCOE 命令参数的完整提取规则（不同命令的参数格式不同）。
- SCOE 测试工具的详细 UI 交互设计。
- northbound adapter 的具体 schema 和错误码映射。
- SCOE 状态循环的查询内容和更新规则。
- 旧 SCOE JSON 配置迁移范围。
- 确认帧遥测选取字段（从 receive field value 动态填入 send field）。依赖 expression runtime 归属确定。参见 `2026-05-06-outbound-routing-and-response-decisions.md` D3。
- 多任务同时往同一 target 发帧时的 task-level 协调策略。首轮依赖 send QueueModel，后续根据 runtime 并发证据决定是否在 task service 层增加 target lock。参见 `2026-05-06-outbound-routing-and-response-decisions.md` D4。
- 旧 SCOE JSON 中 targetId 指向 SCOE 连接的迁移修正策略。

**Blockers for implementation**：

- task service 尚未实现，SCOE 无法进行集成验证。
- send service 尚未实现，SCOE 命令帧无法实际发送。
- receive trigger event 的最终 event 形态待确认。
- connection bridge 实现完成后才能验证真实 SCOE TCP/UDP 通信。

**Blockers for acceptance**：

- 缺少 task implementation。
- 缺少 send implementation。
- 缺少真实 SCOE hardware validation。
- 缺少与 northbound adapter 的集成验证。

## 5. Open questions

### 5.1 SCOE 固定 target 的声明方式

SCOE 需要固定 UDP target 和 TCP server。声明方式：

- **方案 A：配置声明**。SCOE 配置中声明 `requiredTransports: [{ kind: 'tcp-server', port: X }, { kind: 'udp', host: Y, port: Z }]`，runtime 启动时请求 connection 创建。
- **方案 B：隐式依赖**。SCOE 直接使用已配置好的 connection target（假设配置已存在）。

建议方案 A：显式声明优于隐式假设。但具体声明格式 deferred 到实现阶段。

### 5.2 SCOE 任务是否出现在用户可见任务列表

旧系统中 SCOE 执行不在任务列表中显示。新系统中：

- 如果 SCOE 任务出现在任务列表，用户可以看到 SCOE 命令执行进度。好处是统一视图。风险是 SCOE 命令频率可能很高（每秒多个），污染任务列表。
- 如果不出现在任务列表，SCOE 有自己的状态面板。好处是职责清晰。风险是用户在任务列表中看不到 SCOE 执行状态。

deferred，需用户确认。

## 6. Implementation confirmation questions

实现前必须确认以下问题：

1. **task service 是否已实现并提供了 createTask/startTask 和 lifecycle event 订阅？** — SCOE 依赖 task public service。
2. **send service 是否已实现并提供了 SendRequest/SendResult？** — SCOE 的 send-step 依赖 send service。
3. **connection transport event 是否已提供入站字节流和 sourceId？** — SCOE 入站依赖 connection transport event 直接路由（不经 receive）。
4. **SCOE 固定 target 声明方式是配置声明还是隐式依赖？** — 影响启动流程。
5. **旧 SCOE JSON 配置样例是否可用？** — 作为迁移 fixture 输入。
6. **SCOE 命令的完整协议格式是否已文档化？** — 影响入站解析的 fixture 覆盖范围。
7. **SCOE 状态循环的具体查询内容和更新规则是否已确认？** — 影响 ScoeDomainState 设计。

## 7. Northbound design recommendations

基于 ExternalCommandAdapter 模式，对 northbound design 的建议：

### 7.1 模式复用点

| 模式元素 | SCOE 实现 | northbound 预期复用 |
| --- | --- | --- |
| ExternalCommandAdapter 接口 | 定义在 shared/external-command-adapter | northbound 实现 NorthboundCommandAdapter |
| translateToTaskDefinition | ScoeCommandTrigger → 3 steps | 外部任务描述 → N steps（用例序列） |
| onExecutionEvent | 更新 ScoeDomainState | 更新 northbound transaction 状态 |
| getAdapterId | `'scoe-command'` | `'northbound-command'` |
| ExternalResponseTranslator | SCOE 不实现 | northbound 实现 TaskInstanceCompletion → HTTP response |

### 7.2 差异点

| 差异 | SCOE | northbound |
| --- | --- | --- |
| 输出翻译 | 不需要（确认帧已作为 send-step） | 需要 ExternalResponseTranslator（TaskInstanceCompletion → HTTP response） |
| 入站路径 | connection transport event → adapter（绕过 receive） | platform HTTP event → adapter |
| 连接管理 | TCP server + UDP（connection 管理） | HTTP server（platform/main 管理） |
| 任务粒度 | 单命令 3 steps | 多用例序列 N steps |
| 错误翻译 | 领域内部计数 | 外部错误码/拒绝语义 |
| 生命周期 | 单次执行 | 可含 pause/resume/abort |
| schema 冻结 | SCOE 协议稳定 | 甲方 schema 待确认 |
| errorPolicy | 按 ScoeCommand.errorPolicyOverride 配置 | 按外部任务描述配置 |

### 7.3 建议

1. **northbound design 应先读 shared/ 中的 ExternalCommandAdapter 和 ExternalResponseTranslator 定义**，确认接口是否适配 HTTP 请求-响应模式。
2. **ExternalResponseTranslator 是主要差异点**。SCOE 不实现，northbound 实现。接口已拆分为两层（base + optional translator），避免 SCOE 被迫空实现。
3. **连接管理应保持统一原则**：adapter 不直接管理 transport lifecycle，由 connection/platform 负责。
4. **如果 northbound 需要 pause/resume/abort 语义**，task lifecycle 已预留了这些状态转换。northbound adapter 将外部控制命令翻译为 task service 的 pauseTask/resumeTask/stopTask 调用。
5. **入站路径与 SCOE 一致**：northbound 入站 HTTP 请求也不走 receive，直接从 platform event 到 adapter。receive 只处理通用遥测帧。
