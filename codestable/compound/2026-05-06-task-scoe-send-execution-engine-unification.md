---
doc_type: compound
type: cross-feature-decision
status: draft
date: 2026-05-06
summary: send/task/SCOE 交叉讨论结论——task 定位为通用执行引擎，step 多态化（send/wait-condition/delay），SCOE 和 northbound 通过入口适配复用 task 编排能力，send 只做单帧发送。
tags:
  - rewrite
  - task
  - send
  - scoe
  - execution-engine
  - cross-feature
---

# Task-SCOE-Send 执行引擎统一决策

## 1. 背景与问题

send design 和 task design 分别完成后，发现三个场景的核心模式高度相似：

| 场景 | 触发来源 | 执行内容 |
| --- | --- | --- |
| 本地定时/触发发送 | 用户 UI、定时器、receive 事件 | 按计划发一系列帧 |
| SCOE 命令执行 | SCOE TCP 收到指令码 | 发命令帧 → 等完成条件 → 发确认帧 |
| Northbound 外部任务 | HTTP 收到外部命令 | 按用例序列发一系列帧 |

三者都是"入口触发 → 按计划执行一系列发送操作 → 错误处理 → 进度追踪"，区别仅在入口适配。send design 和 task design 原本把 task 定位为"本地发送任务调度"，SCOE 只是"可选复用"——这个定位太窄了。

## 2. 旧代码 evidence

### 2.1 共性

| 模式 | Task Executor | SCOE Executor | 共性程度 |
| --- | --- | --- | --- |
| 发送调用方式 | `useUnifiedSender.sendFrameInstance` | 同 | 高 |
| 结果检查 | `result.success` + target availability | `result.success` + 错误计数 | 中 |
| 定时器管理 | `useTimerManager` | `useTimerManager` 1秒轮询 | 高 |

### 2.2 差异（旧代码结构层面）

| 模式 | Task Executor | SCOE Executor |
| --- | --- | --- |
| 编排模式 | 三种调度（timed/trigger/sequence）+ error policy | 单命令执行 + 完成条件轮询 + 确认帧 |
| 错误策略 | pause/skip/stop 可配置 | 直接计数，无 pause/retry |
| 进度追踪 | currentCount/percentage/instanceIndex | commandSuccessCount/ErrorCount |

差异来自旧代码的组织方式，不是来自业务语义的必然差异。统一后 task 的执行引擎可以覆盖所有场景。

### 2.3 SCOE 不需要多命令序列

用户确认：SCOE 命令是单命令执行模式（收一个指令码 → 执行一个命令）。不存在多命令按序列执行的需求。SCOE 的完整执行流程是：发命令帧 → 等完成条件 → 发确认帧。

## 3. 决策

### 3.1 task 是通用执行引擎

task 的核心职责不是"本地定时/触发发送调度"，而是：

**接收一个执行计划（step 序列），按顺序执行，处理错误，追踪进度。**

触发来源只是入口适配的不同：
- `user-ui`：send 页面的定时/触发/序列对话框
- `timer`：定时器自动触发
- `receive-trigger`：receive 事件匹配触发
- `scoe-command`：SCOE 指令码解析后触发
- `northbound-command`：northbound 外部命令触发

入口适配由调用方负责（SCOE 翻译命令、northbound 翻译外部请求、send 页面翻译用户配置），执行逻辑由 task 统一提供。

### 3.2 TaskStepDefinition 多态化

TaskCaseDefinition 重命名为 TaskStepDefinition，支持多态 step 类型：

**send-step**：构帧 → 通过 send service 发送 → 得到 SendResult

- `frameId`、`fieldValues`、`targetId`、`options`

**wait-condition-step**：订阅 receive 事件，等待条件满足或超时

- `condition`：frameId + fieldId + operator + threshold
- `timeoutMs`：超时时间
- `onTimeout`：超时策略（fail / skip / continue）

**delay-step**：等待指定时长

- `durationMs`

### 3.3 各场景如何映射

**本地定时发送**（schedulingMode = timed）：

```
每轮: [send-step]
```

**本地触发发送**（schedulingMode = trigger）：

```
循环: [wait-condition-step(等触发条件)] → [send-step]
```

**本地序列发送**（schedulingMode = sequence）：

```
[send-step-1] → [delay-step] → [send-step-2] → [delay-step] → [send-step-3] → ...
```

**SCOE 命令执行**（triggerSource = scoe-command）：

```
[send-step(命令帧)] → [wait-condition-step(SCOE 完成条件)] → [send-step(确认帧)]
```

**Northbound 外部任务**（triggerSource = northbound-command）：

```
[send-step(case-1)] → [delay-step] → [send-step(case-2)] → ...
```

### 3.4 SCOE 不需要自己的执行器

`useScoeCommandExecutor` 的编排逻辑完全由 task 承接。SCOE 的职责是：

- 命令解析（指令码 → step 定义）
- 完成条件定义
- 确认帧配置
- SCOE 领域状态管理（commandSuccessCount 等，通过订阅 task lifecycle event 更新）

SCOE 不拥有 send 编排、错误策略、进度追踪——这些都由 task 提供。

### 3.5 send 不变

send 只做单帧发送（构帧 + target 路由 + transport write + 结果输出）。send 页面的定时/触发/序列对话框本质上是 task 的 UI 入口，创建 TaskDefinition 并通过 task service 执行。

### 3.6 条件匹配归属

wait-condition 和 trigger 共用同一套条件匹配逻辑（frameId + fieldId + operator + threshold）。归属：

- 条件类型定义和匹配算法归 `task/core`（纯 TypeScript，可单测）
- 条件内容由调用方定义（SCOE 定义完成条件、trigger 配置定义触发条件）
- task service 通过 receive public API 的 `ReceiveInputEvent` 订阅事件源，在 task/core 中匹配条件
- runtime 只负责服务装配时把 receive event source 注入 task service

### 3.7 error policy 适用于所有 step 类型

- send-step 失败：retry / skip / stop / pause
- wait-condition 超时：retry / skip / stop / pause
- delay-step 不可失败

### 3.8 QueueModel 不受影响

send 的 transport-level FIFO 不变。task 的编排级等待通过 `await SendResult` 实现。

## 4. 对现有 design 的修订影响

### 4.1 task design

需要修订的部分：

1. **定位重写**：从"本地发送任务调度"调整为"通用执行引擎"
2. **核心类型**：TaskCaseDefinition → TaskStepDefinition（多态，kind = send / wait-condition / delay）
3. **新增类型**：WaitCondition、TaskStepKind、TaskTriggerSource
4. **执行循环**：支持多态 step 执行，不限于 send
5. **trigger 模式**：用 wait-condition-step 表达，不再单独处理
6. **SCOE 交互**：从"可选复用"调整为"主要消费者之一"
7. **条件匹配**：新增 task/core 中的条件匹配逻辑

不需要修改的部分：

- Lifecycle 状态机（created/running/paused/stopped/completed/failed）
- error policy 模型（retry/skip/stop/pause）
- 进度追踪机制
- timer 管理
- 与 send/frame/connection/status/result 的交互契约

### 4.2 send design

需要修订的部分：

1. **§4.6 SCOE interaction**：补充 SCOE 通过 task 创建执行计划的说明
2. **§4.1 owner 表**：明确"任何多步骤发送编排都是 task 职责"

不需要修改的部分：

- send service contract（单帧发送）
- QueueModel（transport-level FIFO）
- core types（SendRequest / SendResult / FrameBuildOutput）
- 与 frame/connection 的交互契约
- fake adapter / fixture 策略

### 4.3 SCOE design（待写）

方向已锁定：

- SCOE 是 task 的入口适配器之一（triggerSource = scoe-command）
- SCOE 翻译指令码为 TaskDefinition（含 send-step + wait-condition-step + send-step）
- SCOE 领域逻辑（命令解析、条件定义、确认帧配置）留在 SCOE feature
- SCOE 不拥有 send 编排、错误策略或进度追踪
- SCOE 订阅 task lifecycle event 更新自己的领域状态

## 5. Open questions

| 问题 | 状态 | 备注 |
| --- | --- | --- |
| SCOE 是否需要多命令序列 | 已确认：不需要 | 单命令执行模式 |
| 完成条件和确认帧归属 | 已确认：task step 类型 | wait-condition-step + send-step |
| SCOE 任务是否出现在用户可见任务列表 | deferred | 需用户确认 |
| wait-condition 超时后的 SCOE 领域状态更新 | deferred | SCOE design 中确定 |
| northbound task 与本地 task 的 schema 差异 | deferred | northbound design 中确定 |

## 6. 修订顺序建议

1. 先修订 task design（核心类型和定位变更）
2. 再小修订 send design（SCOE interaction 和 owner 表）
3. 再写 SCOE design（基于修订后的 task design）
4. 最后更新 rewrite-target-structure 和 rewrite-feature-boundaries 中 task 的描述

## 7. Direct contract

本文是 send/task/SCOE 交叉讨论的结论记录。后续 task design 修订和 SCOE design 起草以本文为直接合同之一。

本文继承：

- `codestable/compound/2026-04-28-rewrite-execution-charter.md`
- `codestable/architecture/rewrite-target-structure.md`
- `codestable/quality/rewrite-quality-rules.md`
- `codestable/features/rewrite-send/rewrite-send-design.md`
- `codestable/features/rewrite-task/rewrite-task-design.md`

本文不推翻上述文档中与本文不冲突的部分。若本文与上述文档冲突，以本文的明确决策为准。
