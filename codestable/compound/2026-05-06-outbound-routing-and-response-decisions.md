---
doc_type: compound
type: cross-feature-decision
status: draft
date: 2026-05-06
summary: 出站路由和回报构造的跨 feature 决策——SCOE/northbound/用户三条出站路径的 targetId 来源、确认帧内容范围、task-level 并发协调策略，以及所有特化配置的归属。
tags:
  - rewrite
  - outbound-routing
  - response-construction
  - cross-feature
  - target-routing
  - concurrency
---

# 出站路由和回报构造决策

## 1. 背景与问题

send/task/SCOE 三个 feature design 完成后，发现一个跨 feature 的路由问题没有统一设计：

- SCOE 发指令码给我们，我们执行命令（发帧到下位机）后要发确认帧回 SCOE
- northbound 发任务给我们，我们执行后要回报结果给 northbound
- 用户自己也有定时/触发/序列发送
- 三种来源的出站帧可能走同一个下位机连接，回报数据来源和格式各不同
- 下位机遥测全量接收后，给 SCOE/northbound 回的是筛选/翻译/硬编码的数据，不是原始转发

Direct contract：

- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
- `codestable/features/rewrite-send/rewrite-send-design.md`
- `codestable/features/rewrite-task/rewrite-task-design.md`
- `codestable/features/rewrite-scoe/rewrite-scoe-design.md`
- `codestable/features/rewrite-receive/rewrite-receive-design.md`
- `codestable/features/rewrite-connection/rewrite-connection-design.md`

Boundary guards：

- 不写实现代码
- 不推翻已有 design 中与本文不冲突的部分
- northbound schema/枚举/HTTP/FTP 细节不冻结
- 不进入 send/task/SCOE 内部实现设计

## 2. 旧代码 evidence

### 2.1 SCOE 发送的 target 选择

旧 `scoeReceiveCommands.json` 中帧实例配置含 targetId，指向 SCOE 自己的连接（`network:scoe-tcp-server`、`network:scoe-udp:scoe-udp-remote`）。旧 `useScoeCommandExecutor.ts:108` 确认帧 target 硬编码为 `network:scoe-udp:scoe-udp-remote`。

**问题：** 旧代码中 SCOE 命令帧的 target 指向 SCOE 连接而非下位机连接。新架构中 SCOE 命令帧应发往下位机（通过下位机的 serial/network 连接），确认帧才发回 SCOE UDP target。

### 2.2 统一发送路由

旧 `useUnifiedSender.ts` 通过 `parseTargetId(targetId)` 解析格式（`type:identifier` 或 `type:connectionId:remoteHostId`），路由到 serial 或 network 发送。旧 `connectionTargetsStore.ts` 聚合 serial/network target 为统一池。

### 2.3 确认帧构造

旧 `useScoeCommandExecutor.ts:94-113` 的 `sendSuccessFrame`：从 `scoeStore.globalConfig.successFrameId` 获取帧模板，构造发送实例，字段值主要使用帧模板默认值，target 硬编码为 SCOE UDP remote。

### 2.4 Northbound

旧代码中**没有** northbound 发送和回报的实现。Northbound 是 pure gap。

### 2.5 多来源并发

旧代码没有跨来源的发送协调。各 composable/store 独立调用 `sendFrameInstance`，依赖 transport 层的串行写入保证顺序。

## 3. 决策

### D1: SCOE 命令帧 targetId 来源

**决策：** SCOE 命令帧的 targetId 由 ScoeCommand 配置中的 `frameInstances[0].targetId` 声明，指向下位机连接的 connection target ID。

**理由：**

- 不同 SCOE 命令可能需要发往不同下位机（多目标场景）
- 与 TaskDefinition 的 step.targetId 语义一致
- 旧代码 SCOE 帧实例配置中已有 targetId 字段（虽然旧值需修正）
- SCOE adapter 翻译时已有解析 frameInstances 的逻辑

**SCOE design 修订点：**

- `ScoeCommand.frameInstances` 显式标注含 targetId，指向下位机连接 target
- `translateToTaskDefinition` step 4 明确 targetId 来源：`command.frameInstances[0].targetId`

### D2: Northbound 任务 targetId 来源

**决策：** Northbound adapter 翻译外部任务时，targetId 按以下优先级获取：

1. 外部请求含 deviceId → northbound adapter 通过 `NorthboundConfig.deviceTargetMap` 映射为 connection targetId
2. 无 deviceId → 使用 `TaskDefinition.defaultTargetId`（系统默认配置）

**理由：**

- 甲方外部请求可能携带 deviceId，但 deviceId 不是 connection target（charter 已固定分离）
- 映射表归 northbound config，不改 connection/task/send 的语义
- 首轮用 defaultTargetId 兜底，简化实现

**影响范围：** northbound design（未写），不修订现有 design。

### D3: 确认帧内容范围

**决策：** 首轮 SCOE 确认帧只支持固定值（`ScoeAckFrameConfig.fieldValues` 配置声明）。遥测选取值（从 receive 字段动态填入确认帧）等 expression runtime 归属确定后再支持。

**理由：**

- 确认帧字段大多数是固定值（指令码回传、固定状态码等）
- 遥测选取需要 expression runtime（从 receive field value 动态取值写入 send field），归属未定
- 首轮固定值已满足 SCOE 协议基本需求

**SCOE design 修订点：**

- `ScoeAckFrameConfig.fieldValues` 描述缩窄为"首轮固定值"
- deferred 新增"确认帧遥测选取字段"

### D4: Task-level 并发协调

**决策：** 首轮不做 task-level 调度，依赖 send QueueModel 保证 transport-level FIFO + 文档约束。后续如有 runtime 并发证据再在 task service 层增加 target lock。

**理由：**

- 实际场景中 SCOE 命令频率不高（秒级），用户定时发送也可控
- send QueueModel 保证 transport 层不会出现半个帧交错
- 真正的冲突（同时往同一 target 发不同命令序列）需要 runtime 证据才能量化
- 过早引入调度器会增加不必要的复杂度

**task design 修订点：**

- deferred 新增"多任务同时往同一 target 发帧时的 task-level 协调策略"

## 4. 已由现有 design 解决的问题

| 问题 | 覆盖位置 |
|---|---|
| send-step targetId 解析方式（直接引用 connection target ID，无额外映射） | send design §4.3-4.4 |
| 同一 target 池（用户/SCOE/northbound 共享 connection `selectTransportTargets()`） | connection design + send design |
| transport-level 并发（send QueueModel 保证同一 target FIFO） | send design §4.3 QueueModel |
| 遥测存储路径（receive 解析 → event → storage 持久化） | receive design + storage design |
| 用户回报（task progress selector → pages） | task design §4.5 |
| northbound 回报翻译（ExternalResponseTranslator） | SCOE design §4.1 |

## 5. 特化配置归属

### 5.1 连接声明

| 配置项 | Owner | 存放位置 | 谁读 | 持久化 |
|---|---|---|---|---|
| SCOE 固定 TCP server（port 等） | SCOE 声明需求；connection 管理生命周期 | `ScoeGlobalConfig.requiredTransports` | runtime 启动时读 → 请求 connection 创建 | SCOE config → storage |
| SCOE 固定 UDP remote（host/port） | 同上 | 同上 | 同上 | 同上 |
| Northbound HTTP server（port 等） | northbound 声明需求；platform 管理生命周期 | `NorthboundConfig.requiredTransports` | runtime 启动时读 → 请求 platform 创建 | northbound config → storage |

### 5.2 路由映射

| 配置项 | Owner | 存放位置 | 谁读 |
|---|---|---|---|
| SCOE 命令帧 targetId | SCOE | `ScoeCommand.frameInstances[0].targetId` | SCOE adapter 翻译时 → send-step.targetId |
| SCOE 确认帧 targetId | SCOE | `ScoeAckFrameConfig.targetId` | SCOE adapter 翻译时 → send-step.targetId |
| Northbound defaultTargetId | northbound | `TaskDefinition.defaultTargetId` | task service 执行 send-step 时 fallback |
| Northbound deviceId → targetId 映射 | northbound | `NorthboundConfig.deviceTargetMap` | northbound adapter 翻译时查表 |

### 5.3 回报构造

| 配置项 | Owner | 存放位置 |
|---|---|---|
| SCOE 确认帧 frameId + fieldValues | SCOE | `ScoeAckFrameConfig` |
| SCOE 完成条件定义 | SCOE | `ScoeCompletionCondition` |
| Northbound 回报模板 | northbound | `NorthboundConfig.responseTemplate` |

### 5.4 错误策略

| 配置项 | Owner | 存放位置 |
|---|---|---|
| SCOE 默认 errorPolicy | SCOE | `ScoeGlobalConfig.defaultErrorPolicy` |
| SCOE 命令级 errorPolicy 覆盖 | SCOE | `ScoeCommand.errorPolicyOverride` |
| Northbound 默认 errorPolicy | northbound | `NorthboundConfig.defaultErrorPolicy` |
| 用户任务 errorPolicy | task | `TaskDefinition.errorPolicy` |

### 5.5 协议解析

| 配置项 | Owner | 存放位置 |
|---|---|---|
| SCOE 入站帧协议（帧头/帧尾/校验） | SCOE | `scoe/core/protocol-parser.ts`（硬编码） |
| SCOE 指令码 → ScoeCommand 映射 | SCOE | `ScoeCommand[]` 配置 |
| Northbound HTTP 请求解析 | northbound | `northbound/core/request-parser.ts` |

### 5.6 定时行为

| 配置项 | Owner | 存放位置 |
|---|---|---|
| SCOE 状态循环间隔 | SCOE | `ScoeGlobalConfig.statusLoopIntervalMs` |
| SCOE 状态循环查询规则 | SCOE | `scoe/services/status-loop.ts` |
| 用户定时任务间隔 | task | `TaskDefinition` scheduling params |

**原则：** 所有特化配置跟着业务 owner 走。Runtime 不持有任何业务配置，只负责启动时读取配置 → 请求 connection/platform 创建资源 → 注册路由。

## 6. 三条出站路径的统一模型

```
入站触发                    翻译                         执行
用户 UI  → 用户配置    → TaskDefinition → taskService.startTask
SCOE TCP → 协议解析    → TaskDefinition → taskService.startTask  → 统一执行引擎
HTTP     → JSON 解析   → TaskDefinition → taskService.startTask
```

所有路径最终汇聚到 `TaskDefinition → taskService` 的同一入口。区别只在：

- **入站适配**：谁翻译、怎么翻译（ExternalCommandAdapter 模式）
- **targetId 来源**：谁的配置、映射规则是什么（D1/D2）
- **回报路径**：谁消费 TaskInstanceCompletion（SCOE → 确认帧 send-step；northbound → ExternalResponseTranslator；用户 → task selector）

### SCOE 完整路径示意

```
SCOE设备 ──TCP──→ [我们] ──serial──→ 下位机
                    ↑                    │
                    │                    │ (遥测)
                  UDP ←── [确认帧] ←─────┘
                              ↑
                        receive 解析 → task wait-condition 匹配
```

### targetId 解析链

```
TaskDefinition.step.targetId (或 defaultTargetId)
  → sendService.execute(SendRequest { targetId })
    → connection.selectTransportTargets() 查找
      → TransportTargetSnapshot { id, available }
        → 可用：connection.write(targetId, bytes)
        → 不可用：SendResult { kind: 'target-unavailable' }
```

## 7. Deferred / open

| 编号 | 问题 | 依赖 |
|---|---|---|
| X1 | Northbound 回报需要额外遥测数据（超出 TaskInstanceCompletion） | 甲方 schema 确认 |
| X2 | 确认帧遥测选取字段（从 receive field 动态填入 send field） | expression runtime 归属确定 |
| X3 | 多任务同时往同一 target 发帧时的 task-level 协调（target lock 或调度器） | runtime 并发证据 |
| X4 | SCOE 任务是否出现在用户可见任务列表 | 用户确认 |
| X5 | Northbound deviceId → targetId 映射表的完整规则 | northbound design |
| X6 | 旧 SCOE JSON 中 targetId 指向 SCOE 连接的迁移策略 | SCOE 实现/迁移阶段 |

## 8. 对现有 design 的修订影响

### SCOE design

- §4.3 `ScoeCommand.frameInstances`：补充 targetId 指向下位机连接 target 的说明
- §4.3 `ScoeAckFrameConfig.fieldValues`：缩窄为"首轮只支持固定值"
- §4.5 SCOE 与 connection：补充 `requiredTransports` 声明概念
- §4.10 `translateToTaskDefinition` step 4：明确 targetId 来源为 `command.frameInstances[0].targetId`
- §4.18 Deferred：新增 X2（确认帧遥测选取）和 X3（task-level 并发）

### Task design

- §4.3 `TaskDefinition.defaultTargetId`：补充 fallback 说明（step.targetId 为 null 时使用）
- §4.13 Deferred：新增 X3（多任务同一 target 的 task-level 协调）

### Send / Connection / Receive design

无修订。本文决策与现有 design 一致。

## 9. Direct contract

本文是出站路由和回报构造跨 feature 讨论的决策记录。后续 SCOE design 修订和 northbound design 起草以本文为直接合同之一。

本文继承：

- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
- `codestable/features/rewrite-send/rewrite-send-design.md`
- `codestable/features/rewrite-task/rewrite-task-design.md`
- `codestable/features/rewrite-scoe/rewrite-scoe-design.md`

本文不推翻上述文档中与本文不冲突的部分。若本文与上述文档冲突，以本文的明确决策为准。
