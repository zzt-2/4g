---
doc_type: feature-design
feature: rewrite-task
status: draft
date: 2026-05-06
summary: 东方红上位机重写中 task feature 作为通用执行引擎的定位、多态 step 类型（send/wait-condition/delay）、lifecycle 语义、进度追踪、与 send/receive/frame/connection/SCOE/northbound 的交互契约。
---

# Rewrite task feature design

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
12. `codestable/features/rewrite-send/rewrite-send-design.md`
13. `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
14. `codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`
15. 当前实现参考：`rewrite/src/features/frame/index.ts`
15. 当前实现参考：`rewrite/src/features/connection/index.ts`
16. 当前实现参考：`rewrite/src/features/receive/index.ts`

`codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。send design 固定 send 执行单帧发送并返回 SendResult；task 是通用执行引擎，接收 step 序列，按顺序执行，处理错误，追踪进度。触发来源（用户 UI、定时器、receive 触发、SCOE 命令、northbound 外部命令）通过入口适配区分，执行逻辑统一。`2026-05-06-task-scoe-send-execution-engine-unification.md` 锁定 task 定位重定义和 step 多态化决策。

## 2. Boundary guards

- 本轮是 Lane A design，只产出 design/checklist，不写实现代码。
- task 是通用执行引擎。核心职责是接收执行计划（step 序列），按顺序执行，处理错误，追踪进度。触发来源（用户 UI、定时器、receive 触发、SCOE 命令、northbound 外部命令）通过入口适配区分，执行逻辑统一。
- task owns 多态 step 执行（send-step / wait-condition-step / delay-step）、lifecycle 语义、错误策略、进度追踪、条件匹配。
- task does not own send 内部状态、frame 定义 truth、connection transport lifecycle、receive 解析、SCOE 协议领域规则、result truth、report 生成、northbound 对外交付。
- task 不继承旧 store 组织。旧 `sendTasksStore`、`useSendTaskController`、`useSendTaskExecutor`、`useSendTaskTriggerListener` 的结构不迁移。
- task 不等于 send。task 编排"按什么顺序执行哪些步骤"；send 执行"这一次怎么构帧、结果是什么"。send 只被 task 的 send-step 调用。
- SCOE 和 northbound 是 task 的入口适配器。SCOE 翻译指令码为 TaskDefinition（含 send-step + wait-condition-step + send-step），通过 task public service 创建执行。SCOE 领域规则（命令解析、完成条件定义、确认帧配置、SCOE 状态）留在 SCOE feature。
- task 只通过 send public API 调用发送，不 import send internal state。
- task 通过 receive public API 订阅事件源用于 wait-condition-step 匹配和 trigger 模式，不 import receive internal state。
- task 只通过 frame public selector 读取帧引用配置，不 import frame internal state。
- task 只通过 connection public selector 间接获得 target availability（经 send），不管理连接生命周期。
- task 与 result/report/northbound 的边界：task 只产出内部 lifecycle 事实和进度事实，不生成报告、不对外交付、不定义外部错误语义。
- stop 后状态为 stopped，不沿用旧 `stop -> completed` 语义。
- 统计 read model 禁止写回 frame definition、field definition 或其他静态资产。
- 旧 send task 只能作为本地行为 oracle，不能等同甲方 northbound task。
- 旧 `src/`、`src-electron/` 只作为 evidence、oracle 或 migration input。

## 3. Evidence summary

### 3.1 Contract evidence

- target structure 将 `features/task` 定义为定时发送、甲方任务/用例执行上下文、调度、取消/停止/暂停/恢复语义的 owner；不拥有页面工作台状态、发送链局部状态和 northbound 回执协议。
- feature boundaries 明确 task 的 owner：本地定时/触发发送能力和外部 task/case 执行上下文的内部 lifecycle；不拥有 northbound 对外协议、send 局部状态、receive 解析和 report 文件生成。
- interaction matrix 明确 `task -> send/receive/result/report/northbound/status` 交互方向；`northbound -> task` 方向：northbound owns external transaction，task owns internal lifecycle。`SCOE -> task` 方向：SCOE 翻译命令为执行计划，task 执行。
- charter 固定：task 和 case 是不同概念；task 包含 case；stop 后状态应为 stopped；旧 send task 只能作为本地行为 oracle。
- `2026-05-06-task-scoe-send-execution-engine-unification.md` 锁定：task 定位为通用执行引擎；step 多态化（send/wait-condition/delay）；SCOE 和 northbound 是 task 的入口适配器；SCOE 不需要自己的执行器。
- send design 明确 task 通过 send public service 调用，获得 SendResult；send 不了解 task 的存在。
- receive design 明确 receive 不直接启动 task；receive 输出 trigger candidate，task 消费。
- connection design 明确 task 间接通过 send 获得 transport failure material。
- frame design 明确 task 读取 frame/field reference selector，用于 trigger/timer 配置和校验。

### 3.2 Upstream public API evidence

frame public API 提供：`ReadonlyFrameAsset`、`ReadonlyFrameFieldDefinition`、`FrameFieldReference`、`selectFrameReferenceOptions`、`selectFieldReferenceOptions`、`FrameAssetReader`。

connection public API 提供：`TransportTargetSnapshot`、`selectTransportTargets`、`ConnectionService`、`ConnectionReader`。

receive public API 提供：`ReceiveMatchedFrameSummary`、`ReceiveFieldValueSnapshot`、`ReceiveReader`、`ReceiveService`、`ReceiveInputEvent`。

send public API（按 send design 将提供）：`SendRequest`、`SendResult`、`SendResultKind`、`SendStatisticsSnapshot`、send service（返回 Promise\<SendResult\>）。

### 3.3 Legacy evidence

旧系统事实只用于保留可观测行为和识别迁移风险：

- 定时发送 UI 和任务创建：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue`
- 触发发送 UI 和触发条件配置：`src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue`
- 序列发送 UI：`src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue`
- 旧 send task store：`src/stores/frames/sendTasksStore.ts` — 任务状态、计时器、触发器
- 旧 send task controller：`src/composables/frames/sendFrame/useSendTaskController.ts` — stop 写成 completed
- 旧 send task executor：`src/composables/frames/sendFrame/useSendTaskExecutor.ts` — 发送失败后查询 target availability 并 pause
- 旧 trigger listener：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts` — 从 receive cache 匹配触发条件
- 旧任务配置工具：`src/utils/frames/taskConfigUtils.ts` — 任务配置提取/校验
- 旧策略校验：`src/utils/frames/strategyValidation.ts` — 定时/触发策略校验
- 旧 UI 组件直接创建并启动任务状态机（违反 quality rule R4）

## 4. Design

### 4.1 Owner / not owner

| 分类 | task owner | task not owner |
| --- | --- | --- |
| 定位 | 通用执行引擎。接收执行计划（step 序列），按顺序执行，处理错误，追踪进度。触发来源通过入口适配区分。 | 业务领域规则的 owner。SCOE 命令语义、northbound 外部协议、frame 定义 truth、receive 解析。 |
| Step 执行 | 多态 step 类型：send-step（通过 send service 发帧）、wait-condition-step（订阅 receive 事件等待条件）、delay-step（等待时长）。 | send 内部构帧细节、transport write 队列、connection lifecycle。 |
| 执行计划 | TaskDefinition（step 序列 + 调度参数 + 错误策略 + 触发来源）。 | frame definition truth、SCOE 命令解析、northbound 外部 schema。 |
| Lifecycle | created → running → paused → running → stopped/completed/failed。stop 后状态为 stopped。 | 旧 `stop -> completed` 语义、northbound 外部控制语义、report 生成 lifecycle。 |
| 进度追踪 | 已执行 steps、当前 step index、迭代次数、成功/失败计数、耗时。 | send 构帧细节、transport 层统计、result truth、report 素材归集。 |
| 错误策略 | 适用于所有 step 类型：retry / skip / stop / pause。send-step 失败和 wait-condition 超时使用同一套策略。 | send 内部重试（send 不重试）、transport error 语义解释、northbound 错误转换。 |
| 条件匹配 | wait-condition 和 trigger 共用的条件匹配逻辑（frameId + fieldId + operator + threshold），纯 TypeScript，可单测。 | receive 解析结果 truth、receive 内部匹配算法。 |
| 统计 read model | task 执行次数、成功/失败 step 数、总耗时。 | receive stats、send stats、global stats、northbound 状态。 |
| 入口适配 | task 不区分触发来源。调用方负责将 SCOE 命令、northbound 请求、用户配置翻译为 TaskDefinition。 | SCOE 命令解析、northbound 外部 schema、send 页面 UI 状态。 |

task 的核心职责是接收一个执行计划并按序执行其中的 step。task 不执行构帧（send 负责），不解析协议（receive/SCOE 负责），不生成报告（report 负责），不对外交付（northbound 负责）。

### 4.2 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level |
| --- | --- | --- | --- | --- |
| 定时发送对话框可配置帧、字段值、目标、间隔和次数（含无限）。 | task owns scheduling; send owns execution | preserve | `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue` | fixture test, manual checklist |
| 定时任务启动后按间隔重复发送。 | task | preserve | `src/composables/frames/sendFrame/useSendTaskExecutor.ts` | fixture test, runtime validation |
| 定时任务完成后自动停止。 | task | preserve | `src/composables/frames/sendFrame/useSendTaskExecutor.ts` | fixture test |
| 触发发送可配置触发条件（接收帧 + 字段 + 比较运算 + 阈值）。 | task owns trigger definition; receive owns parse facts | preserve | `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue` | fixture test |
| 触发条件匹配时执行发送。 | task consumes trigger; send executes | preserve | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts` | fixture test, runtime validation |
| 序列发送可配置多个帧按顺序发送，带帧间延迟。 | task | preserve | `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue` | fixture test, runtime validation |
| 任务可手动停止，停止后任务消失或标记为 completed（旧行为）。 | task lifecycle; 旧行为改为 stopped | preserve stop capability; change final state to stopped | `src/composables/frames/sendFrame/useSendTaskController.ts` | fixture test, manual checklist |
| 旧 stop 后任务从列表移除（等同于 completed）。 | task lifecycle | candidate drop for completed semantics | `src/stores/frames/sendTasksStore.ts` | fixture test |
| 发送失败后旧实现查询 target availability 并把任务置为 paused。 | task error policy; connection provides availability | preserve paused-on-failure as default error policy candidate | `src/composables/frames/sendFrame/useSendTaskExecutor.ts` | fixture test |
| 发送失败后旧实现自动重试。 | task error policy | preserve retry as configurable error policy | `src/composables/frames/sendFrame/useSendTaskExecutor.ts` | fixture test |
| 任务列表展示运行状态（运行中/已停止/错误）。 | task + pages | preserve | `src/components/frames/FrameSend/` | manual checklist |
| 旧 UI 组件直接创建并启动任务状态机。 | pages should call task service, not own state machine | candidate drop for location | `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue` | static scan |
| 旧任务配置持久化在 JSON 文件。 | storage owns persistence; task owns config semantics | preserve persistence boundary | `src/stores/frames/sendTasksStore.ts` | fixture test, manual checklist |
| SCOE 使用固定 UDP/TCP 连接发送命令。 | SCOE owns protocol; task may schedule if needed | deferred to SCOE design | `src/stores/scoeStore.ts` | runtime validation, hardware validation |
| SCOE 命令执行后等待完成条件（收到特定响应帧+字段匹配）。 | task owns wait-condition-step; SCOE defines condition | preserve pattern | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test, hardware validation |
| SCOE 完成条件满足后发送确认帧。 | task owns send-step; SCOE defines ack frame config | preserve pattern | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test, hardware validation |
| SCOE 指令码路由到不同执行函数（策略模式）。 | SCOE owns command parsing; task executes steps | preserve pattern in SCOE; task is agnostic | `src/composables/scoe/useScoeCommandExecutor.ts` | fixture test |
| SCOE 定时状态循环（1秒轮询）。 | task timer for status loop; SCOE defines status semantics | preserve timing; re-architect ownership | `src/stores/scoeStore.ts` | runtime validation |

### 4.3 Core types

本轮不冻结最终类型名和字段 schema，只定义类型职责和分类。

**TaskStepKind** — step 类型：

- `send`：通过 send service 发送一帧。参数：frameId、fieldValues、targetId、options。
- `wait-condition`：订阅 receive 事件，等待条件满足或超时。参数：condition（WaitCondition）、timeoutMs、onTimeout。
- `delay`：等待指定时长。参数：durationMs。

**TaskStepDefinition** — 多态 step（替代原 TaskCaseDefinition）：

- `id`、`name`。
- `kind`：TaskStepKind。
- `sendConfig`（kind = send 时）：frameId、fieldValues（字段值映射或表达式引用）、targetId（可选覆盖）、options（构帧选项）。
- `waitConfig`（kind = wait-condition 时）：condition（WaitCondition）、timeoutMs、onTimeout（fail / skip / continue）。
- `delayConfig`（kind = delay 时）：durationMs。

**WaitCondition** — 条件匹配（wait-condition-step 和 trigger 模式共用）：

- `frameId`：监听的接收帧。
- `fieldId`：监听的字段。
- `operator`：比较运算（eq / neq / gt / lt / gte / lte / change / any）。
- `threshold`：比较阈值。
- `sourceId`：可选 source 过滤。

**TaskTriggerSource** — 触发来源（入口适配标识，信息性，不改变执行逻辑）：

- `user-ui`：send 页面的定时/触发/序列对话框。
- `timer`：定时器自动触发。
- `receive-trigger`：receive 事件匹配触发。
- `scoe-command`：SCOE 指令码解析后触发。
- `northbound-command`：northbound 外部命令触发。

**TaskSchedulingMode** — 调度模式：

- `timed`：定时重复执行 step 序列。参数：interval、maxCount（infinite if absent）、delayBeforeStart。
- `trigger`：条件触发执行 step 序列。参数：triggerCondition（WaitCondition）、cooldown、maxTriggerCount。
- `sequence`：单次执行 step 序列。step 序列天然有序。无循环，执行完即 completed。

schedulingMode 与 step 类型的组合约束（validation 层强制）：

| | send-step | wait-condition | delay |
|---|---|---|---|
| timed | 合理 | 需 warn（每轮可能阻塞等超时） | 合理 |
| trigger | 合理 | 合理 | 合理 |
| sequence | 合理 | 合理 | 合理 |

timed + wait-condition 不禁止但 validate 时产生 warning：每 iteration 会等条件，如果条件不频繁满足会导致大量超时。

**TaskDefinition** — 任务静态配置：

- `id`、`name`（用户可见）。
- `schedulingMode`。
- `triggerSource`：TaskTriggerSource（信息性，不改变执行逻辑）。从 definitionRef 可推导，此处冗余存储仅供快速查询。
- `steps`：TaskStepDefinition[]（至少一个）。
- `targetId`：默认 target（可被 step 覆盖）。send-step 执行时若 step.targetId 为 null 则 fallback 到此值。用于 northbound adapter（D2）和用户配置中未逐 step 指定 target 的场景。参见 `2026-05-06-outbound-routing-and-response-decisions.md` D2。
- `errorPolicy`：on-failure 行为（retry / skip-step / stop / pause）。含 retryCount、retryDelay。适用于所有 step 类型。
- `stopCondition`：可选完成条件（maxDuration、maxIterations、expression-based）。

**TaskLifecycleStatus**：

- `created` | `running` | `paused` | `stopped` | `completed` | `failed`

注意：旧系统 `stop -> completed` 不保留。新系统中 stopped 和 completed 是不同终态：completed 表示正常结束（所有步骤执行完毕），stopped 表示被用户或外部主动停止。

**TaskInstanceState** — 运行时实例状态：

- `instanceId`（运行时生成）。
- `definitionRef`：引用 TaskDefinition。
- `lifecycle`：TaskLifecycleStatus。
- `startedAt`、`pausedAt`、`stoppedAt`、`completedAt`、`failedAt`。
- `currentStepIndex`、`currentIteration`。
- `stepResults`：per-iteration per-step 的执行结果列表（TaskStepResult[]）。按 iteration 分组，保留最近 maxStepResultHistory 轮（默认 100），超出丢弃最早。用于进度计算和 UI 展示。
- `error`：最后错误信息（如有）。

**TaskProgress** — 进度：

- `stepsTotal`、`stepsCompleted`、`stepsFailed`、`stepsSkipped`。
- `iterationsCompleted`、`iterationsTotal`（timed 模式；infinite 时 iterationsTotal 为 null）。
- `elapsedMs`、`estimatedRemainingMs`（可估算时）。
- `lastStepResult`：最近一次 step 执行结果快照。

**TaskStepResult** — 多态 step 执行结果（stepResults 的元素类型）：

- `stepIndex`、`iteration`（所属 iteration，0-indexed）。
- `kind`：与 TaskStepKind 对应。
- send-step：`sendResult`（SendResult）。
- wait-condition-step：`matched`（boolean）、`matchedValue`（匹配时的值，可选）、`timedOut`（boolean）。
- delay-step：`completed`（boolean，始终 true）。
- `appliedPolicy`：如果触发了 errorPolicy，记录实际执行的策略动作。

**TaskInstanceCompletion** — 任务执行结果摘要（内部事实，不等同 report）：

- `kind`：completed / stopped / failed。
- `summary`：steps total/succeeded/failed/skipped。
- `durationMs`。
- `startedAt`、`finishedAt`。
- 不包含 report schema、northbound 字段或外部错误码。

### 4.4 Service contract

task 的主服务合约是 task lifecycle：

```
TaskService:
  createTask(definition) → TaskInstanceState
  startTask(instanceId) → void
  pauseTask(instanceId) → void
  resumeTask(instanceId) → void
  stopTask(instanceId) → void
  removeTask(instanceId) → void  // 从列表移除已停止/已完成任务
```

执行循环（伪代码）：

```
startTask(definition):
  set lifecycle = running
  loop on schedulingMode:
    timed:  for each iteration (up to maxCount):
              executeSteps(definition.steps, iteration)
              wait interval
    trigger: subscribe to receive events via triggerCondition (WaitCondition)
              on match + cooldown check:
                executeSteps(definition.steps, iteration)
    sequence:
              executeSteps(definition.steps, iteration=0)
              // 无循环，执行完即 completed
  on loop exit:
    set lifecycle = completed
    emit TaskInstanceCompletion

executeSteps(steps, iteration):
  for each step in steps:
    if lifecycle is stopped/paused: break
    switch step.kind:
      send:
        build SendRequest from step.sendConfig
        result = await sendService.execute(request)
        record TaskStepResult(stepIndex, iteration, kind=send, sendResult)
        if result is error: apply errorPolicy
      wait-condition:
        subscribe to receive events (single shared stream, filtered by frameId index)
        match against step.waitConfig.condition
        on match within timeout:
          unsubscribe  // 条件满足后立即取消订阅，生命周期 = 直到匹配或超时
          record TaskStepResult(stepIndex, iteration, kind=wait-condition, matched=true)
        on timeout:
          unsubscribe
          onTimeout 决定本 step 结果：
            continue → 记录 matched=false, timedOut=true，继续下一步
            fail → 记录 matched=false, timedOut=true，交给 errorPolicy 处理
            skip → 记录 skipped，跳到下一步
      delay:
        await setTimeout(step.delayConfig.durationMs)
        record TaskStepResult(stepIndex, iteration, kind=delay, completed=true)
```

**onTimeout 与 errorPolicy 的两层交互**：

wait-condition-step 的 `onTimeout` 是 step 本地策略，决定超时后这一步算什么。errorPolicy 是 task 级别全局策略，决定某步失败后整个 task 怎么办。流程：

1. wait-condition 超时 → `onTimeout` 先生效
2. `onTimeout = continue`：本 step 视为通过，继续下一步。errorPolicy 不介入。
3. `onTimeout = skip`：本 step 视为 skipped，继续下一步。errorPolicy 不介入。
4. `onTimeout = fail`：本 step 视为失败 → 交给 errorPolicy 决定 task 级行为（retry/skip/stop/pause）。

**trigger 外层与 wait-condition-step 内层的关系**：

两层条件等待机制语义不同，互不干扰：

- **外层 trigger**：决定"什么时候启动 step 序列"。trigger 命中后进入 executeSteps。
- **内层 wait-condition-step**：step 序列内部的阻塞等待。

step 序列的 wait-condition 超时或失败只影响当前 iteration 的 executeSteps，不重置 trigger 的 cooldown 或 maxTriggerCount。trigger 只管"触发下一轮"，不管上一轮内部出了什么。

**条件匹配订阅模型**：

- task service 持有一个共享的 receive event subscription，按 frameId 建索引 map。
- wait-condition-step 执行时向索引注册条件，不新建 subscription。
- 条件满足或超时后从索引移除，subscription 不变。
- pause 时移除所有活跃条件并保留 subscription（或暂停 push），resume 时重建。
- stop 时移除所有条件并取消 subscription。

**多态 step 执行的关键特性**：

- 每个 step 按顺序执行，前一个完成（或被 skip）后才进入下一个。
- send-step 的错误和 wait-condition-step 的超时使用同一套 errorPolicy。
- delay-step 不可失败。
- 条件匹配逻辑（WaitCondition evaluation）是 task/core 的纯 TypeScript，用于 wait-condition-step 和 trigger 模式。
- task service 通过 receive public API 订阅 `ReceiveInputEvent` 用于条件匹配。

**Pause/Resume**：

- pause：暂停当前循环，停止定时器和 trigger/wait-condition 订阅。保留 progress。
- resume：从暂停点继续。不重置 progress。
- 触发 pause 的来源：用户操作、errorPolicy=pause、northbound 暂停命令（经 runtime）。

**Stop**：

- stop：终止执行循环。lifecycle 设为 stopped（不是 completed）。保留 progress 供查看。
- 移除：从活跃列表移除已停止/已完成任务。history/material 由 storage 处理。

**Error policy**（适用于所有 step 类型）：

- `retry`：重试当前 step（最多 retryCount 次，间隔 retryDelay）。超过后按 fallback 处理。
- `skip-step`：跳过当前 step，继续下一个。记录为 skipped。
- `stop`：立即 stop 任务。
- `pause`：暂停任务，等待用户手动 resume 或外部恢复。

**入口适配**：

task service 不区分触发来源。入口适配由调用方负责：

- SCOE：`scoe-command` → 解析指令码 → 构造 TaskDefinition（steps = [send-step, wait-condition-step, send-step]）→ task service.createTask + startTask
- Northbound：`northbound-command` → 翻译外部请求 → 构造 TaskDefinition → task service.createTask + startTask
- Send 页面：`user-ui` → 用户配置 → 构造 TaskDefinition → task service.createTask + startTask

### 4.5 State shape and selector surface

| 状态类别 | 写入 owner | 读取方 | reset / lifecycle | 设计约束 |
| --- | --- | --- | --- | --- |
| Task instances | task service | pages、status、result、northbound、SCOE、runtime（通过 selector/event） | 随 create/stop/complete/remove 驱动 | 单点写入；不保存 send/receive/frame/connection 内部状态 |
| Task progress | task service 基于 step 执行结果增量更新 | pages、status、result、SCOE | 随 task lifecycle 驱动；remove 时清理 | 不写回 frame definition 或其他静态资产 |
| Task statistics | task service | pages、status | 按 instance 或全局 reset | 独立于 send/receive 统计 |
| Task definitions | task（创建/编辑）+ storage（持久化） | task service、pages、SCOE、northbound | 低频更新 | 静态配置，不是运行事实 |
| UI snapshot | pages / task composables | UI 组件 | 页面生命周期 | 不定义 task truth |

**Selector surface**：

- `selectTaskInstances`：活跃任务列表。
- `selectTaskInstance(id)`：单个任务状态快照。
- `selectTaskProgress(id)`：进度快照。
- `selectTaskHistory`：已完成/已停止任务历史（有限窗口）。
- `selectTaskStatistics`：task 统计 read model。
- `selectTaskSnapshot`：面向 UI 的安全聚合 snapshot。

Selector 不暴露可变 state 引用、内部 service 实例或 send/receive/frame 内部状态。

### 4.6 Cross-feature interaction contracts

#### task → send（编排 send 执行）

| 维度 | 契约 |
| --- | --- |
| 方向 | task 调用 send public service |
| task 提供 | SendRequest（含 frameId、fieldValues、targetId、context 标识 taskId/caseId） |
| send 返回 | SendResult（Promise\<SendResult\>） |
| 禁止 | task import send internal state；task 让 send 了解 task lifecycle；task 直接写 send state |

#### task ← receive（消费 trigger 候选）

| 维度 | 契约 |
| --- | --- |
| 方向 | receive 输出 trigger candidate，task 消费 |
| receive 提供 | ReceiveInputEvent 或 receive result（含 frameId、fieldId、value） |
| task 行为 | 按 TriggerCondition 匹配，命中时构建 SendRequest 并调 send |
| 禁止 | task import receive internal state；receive 直接写 task state；receive 决定 task lifecycle |

#### task → frame（读取帧引用配置）

| 维度 | 契约 |
| --- | --- |
| 方向 | task 读取 frame public selector |
| task 需要 | frame reference options、field reference options（用于配置 UI 和 trigger condition） |
| frame 提供 | 只读 frame asset snapshot、field definitions |
| 禁止 | task 写入 frame state；task 让 frame 拥有 task config |

#### task ← connection（间接经 send）

| 维度 | 契约 |
| --- | --- |
| 方向 | task 不直接调用 connection；send result 中包含 transport-level 错误 |
| task 行为 | 根据 SendResult.kind（target-unavailable / transport-error）应用 errorPolicy |
| 禁止 | task 直接查询 connection internal state；task 管理连接生命周期 |

#### task → status

| 维度 | 契约 |
| --- | --- |
| 方向 | status 消费 task lifecycle/progress |
| task 提供 | 只读 task state selector、task lifecycle event |
| 禁止 | task 写入 status read model；status import task internal state |

#### task → result

| 维度 | 契约 |
| --- | --- |
| 方向 | result 消费 task execution summary 作为内部结果材料 |
| task 提供 | TaskInstanceCompletion event / selector |
| 禁止 | task 定义 final case result truth；task 直接写 result state；task 生成 report |

#### task → report / northbound

| 维度 | 契约 |
| --- | --- |
| 方向 | 无直接依赖；northbound 通过 selector 读取 task projection |
| task 提供 | 只读 task lifecycle/progress selector |
| 禁止 | task 生成 report 文件；task 对外交付；task 定义外部错误码；task 直接与 northbound 通信 |

#### task ← northbound（外部 task 命令经 runtime 路由）

| 维度 | 契约 |
| --- | --- |
| 方向 | northbound 通过 runtime 将外部命令翻译为 task service 调用 |
| northbound 提供 | 外部 task/control 请求（经 runtime 验证和转换） |
| task 接受 | start/pause/resume/stop/query 命令（不直接接触外部 schema） |
| 禁止 | task 直接监听 HTTP/FTP/SOCKET；task 冻结外部 task schema；旧 send task 等同 northbound task |

#### task ← SCOE（SCOE 命令通过 task 执行）

| 维度 | 契约 |
| --- | --- |
| 方向 | SCOE 翻译领域命令为 TaskDefinition，通过 task public service 创建执行 |
| SCOE 提供 | TaskDefinition（triggerSource = scoe-command），steps 含 [send-step(命令帧), wait-condition-step(SCOE 完成条件), send-step(确认帧)] |
| task 执行 | 按序执行 steps：发命令帧 → 等完成条件 → 发确认帧。SCOE 不需要自己的执行器。 |
| SCOE 领域逻辑 | 命令解析（指令码 → step 定义）、完成条件定义、确认帧配置、SCOE 状态管理。这些留在 SCOE feature。 |
| 禁止 | task 拥有 SCOE 命令语义；task 为 SCOE 硬编码特殊逻辑；SCOE 自己实现 send 编排/错误策略/进度追踪 |

### 4.7 Timer, scheduling, and condition matching

定时和条件匹配是 task 的核心基础设施。

**Timer**：

- Timer 在 renderer TypeScript 层实现（`setInterval`/`setTimeout` 或等效机制）。
- 不需要 platform/main 提供定时器。renderer 侧 timer 足够满足定时发送需求。
- Timer lifecycle 随 task lifecycle：pause 时清除 timer，resume 时重建。
- Timer 不进入 `shared/`。Timer 的创建/清除逻辑归 task service。

**条件匹配**：

- wait-condition-step 和 trigger 模式共用同一套 WaitCondition 匹配逻辑。
- 匹配算法在 `task/core` 中实现，纯 TypeScript，可单测。
- task service 通过 receive public API 的 `ReceiveInputEvent` 订阅事件源。
- pause 时取消订阅，resume 时重建订阅。
- 条件内容由调用方定义（SCOE 定义完成条件、trigger 配置定义触发条件），task 只执行匹配。

**性能设计原则**：

- **条件匹配 O(1) 查找**：收到 receive event 时按 frameId 查索引 map，只检查注册在该 frameId 下的活跃条件。不是遍历所有活跃条件。
- **共享事件流**：task service 持有一个 receive event subscription，所有 wait-condition-step 和 trigger 共用。不按 step 各自订阅。
- **stepResults 有上限**：默认保留最近 100 轮 iteration 结果，超出丢弃最早。防止 timed 模式长时间运行导致内存增长。
- **trigger 事件驱动**：trigger 模式不轮询，receive event push 过来才匹配。
- **条件注册/注销 O(1)**：wait-condition-step 开始时向索引 map 注册，条件满足/超时/stop 时注销。注册和注销都是 map 操作。

### 4.8 Runtime involvement

task 需要 runtime 参与：

- **服务装配**：runtime 创建 task service，注入 send service、frame reader、receive event source。
- **跨 feature 路由**：receive trigger event → task；SCOE task request → task service；northbound command → task service。
- **事件分发**：TaskInstanceCompletion event → result/status/northbound。
- **生命周期**：app startup/shutdown 时清理活跃任务。

runtime 不得：
- 实现 trigger 匹配逻辑。
- 决定 task error policy。
- 解释 SendResult 的业务含义。
- 变成所有 task 消费者的总路由器。

### 4.9 Platform involvement

task 不直接访问 platform：

- 调度逻辑在 renderer TypeScript 完成。
- Send 经 send public service → connection adapter → platform。
- Timer 不需要 platform 能力。
- task 不新增 platform / preload / main API。

### 4.10 Fake adapter boundary and fixture strategy

**Fake adapter boundary**：

task 的 fake adapter 需要模拟三个外部依赖：

1. **Fake send service**：
   - 接受 SendRequest，返回预设的 SendResult（sent / transport-error / timeout / target-unavailable）。
   - 支持延迟返回，模拟异步 transport write。
   - 支持记录所有调用，用于断言 send 被调用了几次、参数是否正确。
   - 不执行真实构帧和 transport。

2. **Fake receive event source**：
   - 提供预设的 ReceiveInputEvent 序列。
   - 支持触发特定 WaitCondition 的事件。
   - 支持延迟事件，模拟 wait-condition-step 超时场景。
   - 不执行真实 receive 解析。

3. **Fake frame snapshot provider**：
   - 提供预设 frame asset 和 field definitions。
   - 已在 send fixtures 中定义，task 可复用。

**Fixture 策略**：

- 定时任务 fixture：定义 timed TaskDefinition（含 send-steps）→ 预设 N 次 SendResult → 验证 progress 递增 → 验证 completed。
- 触发任务 fixture：定义 trigger TaskDefinition + WaitCondition → 注入匹配 event → 验证 send-step 被调用。
- 序列任务 fixture：定义 sequence TaskDefinition（含 send-steps + delay-steps）→ 按顺序注入 SendResult → 验证 step 顺序。
- **SCOE 模式 fixture**：定义 TaskDefinition（steps = [send-step, wait-condition-step, send-step]）→ 注入匹配 receive event 模拟完成条件 → 验证确认帧发送。
- Error policy fixture：注入失败 SendResult → 验证 retry/skip/stop/pause 行为；注入 wait-condition 超时 → 验证 onTimeout 策略。
- Lifecycle fixture：pause/resume/stop 在各状态下的行为验证。
- Legacy oracle：旧 `taskConfigUtils.ts` 的配置解析输出可作为 golden comparison。

**Fixture 位置**：

- `rewrite/src/features/task/fixtures/task-definitions/`：预设 TaskDefinition fixture。
- `rewrite/src/features/task/fixtures/trigger-conditions/`：触发条件 fixture。
- `rewrite/src/features/task/fixtures/lifecycle-cases/`：lifecycle 转换 fixture。
- `rewrite/src/features/task/fixtures/legacy-oracle/`：旧系统配置和执行 oracle。

### 4.11 Target internal layering

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript。负责 lifecycle 状态机转换、多态 step 执行分发、WaitCondition 匹配算法、progress 计算、error policy 决策。不依赖 Vue、Pinia、Electron、platform、Node、send/receive/frame/connection store。 |
| `services` | task 用例入口。负责 create/start/pause/resume/stop、调度循环执行、多态 step 执行（send-step 调 send service、wait-condition-step 订阅 receive event、delay-step 等 timeout）、写入 task state、emit lifecycle event。通过显式依赖注入接收 send service、frame reader、receive event source。 |
| `state` | task instances、progress、statistics、只读 selector。state action 保持薄层。不保存 send/receive/frame/connection 状态。 |
| `adapters` | 可选。用于 fake send service、fake receive event source。real send/receive 通过 public API 消费。 |
| `composables` | 面向 task 页面的 UI-facing 组合。负责任务列表展示、进度展示、start/pause/resume/stop 按钮状态、配置表单。不拥有 lifecycle 逻辑。 |
| `components` | 任务列表、进度条、配置对话框、trigger 条件编辑器等 UI。组件通过 props/events/composables 使用 task 能力。 |
| `fixtures` | TaskDefinition fixture、TaskStepDefinition fixture（含各 step 类型）、WaitCondition fixture、lifecycle fixture、SCOE 模式 fixture、legacy oracle。 |

### 4.12 Validation plan

**Static scan**：

- `features/task/core` 无 Vue/Pinia/Electron/platform/Node 依赖。
- task 不 import send/receive/frame/connection/SCOE/status/result/report/northbound internal state。
- task 不硬编码 SCOE target 或 northbound 语义。
- 页面组件不直接创建 task lifecycle。

**Vitest unit**：

- Lifecycle 状态机：created → running → paused → running → stopped/completed/failed 的所有合法和非法转换。
- WaitCondition 匹配：frameId/fieldId/operator/threshold 的各种组合。
- 多态 step 执行分发：send-step、wait-condition-step、delay-step 的正确执行路径。
- Progress 计算：单 step、多 step、多 iteration、混合 step 类型。
- Error policy：retry（含计数和延迟）、skip、stop、pause 行为；wait-condition 超时触发 onTimeout。
- Service：完整 start → executeSteps → complete 流程，使用 fake send service 和 fake receive event source。

**Fixture test**：

- 定时任务完整执行：N 次 iteration → completed。
- 触发任务：WaitCondition 匹配 → send-step → 多次触发 → maxTriggerCount。
- 序列任务：ordered execution → delay-step → completed。
- **SCOE 模式**：send-step → wait-condition-step（条件匹配）→ send-step（确认帧）→ completed。
- **wait-condition 超时**：send-step → wait-condition-step（超时）→ onTimeout 策略生效。
- Pause/resume 不丢失 progress，订阅正确重建。
- Stop 产生 stopped（不是 completed）。
- Error policy 各分支覆盖（send-step 失败和 wait-condition 超时）。

**Oracle comparison**：

- 旧 `taskConfigUtils.ts` 的配置提取输出可沉淀为 legacy oracle。
- 旧 `strategyValidation.ts` 的校验输出可沉淀为 trigger condition oracle。

**Fake adapter test**：

- Fake send service：返回各种 SendResult kind。
- Fake receive event source：产生匹配/不匹配事件。
- 验证 task service 对各种组合的处理。

**Manual checklist**：

- 定时/触发/序列发送对话框可用。
- 任务启动/暂停/恢复/停止按钮状态正确。
- 进度和统计展示正确。
- 任务列表展示运行状态。
- 错误信息可见（发送失败、target 不可用）。

**Runtime validation**：

- task service 装配和清理。
- 定时任务在真实环境中的执行间隔准确性。
- 触发任务与真实 receive 事件的匹配。
- 多任务并发执行时的行为。

**Hardware validation**：

- 定时发送到真实 target 的完整链路。
- 触发发送在真实接收后的响应。
- 发送失败时 error policy 的真实表现。

Cannot claim from this design：

- task implementation complete.
- real hardware task execution complete.
- SCOE task integration complete.
- northbound task control complete.
- report/result/northbound delivery closure complete.

### 4.13 Deferred / blockers

**Deferred**：

- Concrete TaskDefinition / TaskStepDefinition schema。
- WaitCondition 完整运算符列表和表达式支持。
- Task config 持久化格式和迁移（归 storage + task 联合确认）。
- Task execution history 窗口大小和归档策略。
- 旧 task config JSON 兼容范围。
- expression runtime 在 task field values 中的角色。
- northbound 外部 task 命令到 task service 的完整映射。
- 多任务并发时的资源竞争和优先级策略。
- SCOE 任务是否出现在用户可见的任务列表中。
- wait-condition-step 超时后 SCOE 领域状态更新方式。
- SCOE 定时状态循环（旧代码 1 秒轮询）在新模型中的归属和表达方式——可能是 SCOE 自己的领域行为（SCOE feature 内部定时器），不映射为 task step。
- maxStepResultHistory 的可配置性和默认值确认。
- timed + wait-condition-step 组合的 UX 表现（warning 级别信息如何展示给用户）。
- 多任务同时往同一 target 发帧时的 task-level 协调策略。首轮依赖 send QueueModel 保证 transport-level FIFO，不引入 task-level 调度器。后续如有 runtime 并发证据（SCOE 命令与用户定时任务同时发往同一下位机），再在 task service 层增加 target lock 或优先级机制。参见 `2026-05-06-outbound-routing-and-response-decisions.md` D4。

**Blockers for implementation**：

- send service 尚未实现，task 无法进行集成验证。
- send design 的 SendRequest/SendResult 最终形态待确认。
- receive trigger event 的最终 event 形态待确认。
- connection bridge 实现完成后才能验证真实 target 发送链路。

**Blockers for acceptance**：

- 缺少 send implementation。
- 缺少真实 hardware validation。
- 缺少 SCOE 和 northbound 的集成验证。

## 5. Open questions

### 5.1 SCOE 与 task 的边界（已锁定）

SCOE 和 task 是同一类东西：都是"收到指令 → 执行一系列操作（发送帧）"。区别仅在于入口适配。

已锁定决策：

1. **SCOE 不需要自己的执行器。** `useScoeCommandExecutor` 的编排逻辑完全由 task 承接。SCOE 翻译领域命令为 TaskDefinition（triggerSource = scoe-command），通过 task public service 创建执行。

2. **SCOE 命令执行是三个 step：**
   - send-step（执行命令帧）
   - wait-condition-step（等待 SCOE 完成条件：收到特定响应帧+字段匹配）
   - send-step（发送确认帧）

3. **完成条件等待和确认帧发送是 task step 类型，不是 SCOE 特有逻辑。** wait-condition-step 是通用的 step 类型，SCOE 只是定义了条件内容。

4. **SCOE 领域逻辑留在 SCOE feature：** 命令解析（指令码 → step 定义）、完成条件定义、确认帧配置、SCOE 状态管理。SCOE 订阅 task lifecycle event 更新自己的领域状态（commandSuccessCount 等）。

5. **SCOE 任务是否出现在用户可见的任务列表中：** deferred。需要用户确认。

### 5.2 多态 step 的扩展性

未来可能新增的 step 类型：

- `receive-step`：显式等待并接收一帧（当前通过 wait-condition-step 覆盖）。
- `parallel-step`：并行执行多个 sub-steps（当前不支持）。
- `branch-step`：根据条件选择执行路径（当前不支持）。

首轮只实现 send / wait-condition / delay。新增 step 类型时只需扩展 TaskStepKind 和 executeSteps 的 switch，不改变引擎核心。

### 5.3 result/report 与 task 的边界

1. TaskInstanceCompletion 是否直接进入 result feature？
   - 建议：task 输出 TaskInstanceCompletion 作为内部事实。result feature 消费它并构建 case/task result truth。report feature 从 result 和 storage 读取素材生成报告。
   - task 不生成 report，不定义 result schema，不对外交付。

2. northbound 如何获得 task 状态？
   - northbound 通过 selector 读取 task projection，不直接访问 task internal state。外部 task/control 语义由 northbound 翻译。

### 5.4 本地 task 与 northbound task 的映射

1. 本地任务和甲方任务共享同一个 TaskDefinition 模型吗？
   - 建议：共享 core lifecycle 和 scheduling 模型。northbound 通过 runtime 翻译外部请求为 TaskDefinition，task service 不区分来源。
   - 但 northbound task 可能有额外的控制语义（pause/continue/abort），这些需要在 task lifecycle 中预留，但语义解释归 northbound。

2. `startTestCaseList` 的粒度？
   - 按 charter 暂按 task start 处理。如果后续确认是部分 case list start，task service 需要支持 subset start。本轮列为 deferred。

### 5.5 Trigger condition 表达能力

1. Trigger condition 是否支持跨帧条件（如"帧 A 的字段 X > 10 且帧 B 的字段 Y == 'ok'"）？
   - 建议：首轮只支持单帧单字段条件。多条件组合和表达式 trigger 由后续版本按需扩展。

2. Trigger condition 的 source 过滤是否需要支持多 source？
   - 建议：首轮只支持单 source 或 all-sources。

## 6. Implementation confirmation questions

实现前必须确认以下问题：

1. **send service 是否已实现并提供了稳定的 SendRequest/SendResult 接口？** — task 依赖 send public service。
2. **receive trigger event 的最终 event 形态是否已确认？** — trigger 模式依赖 receive 输出。
3. **TaskDefinition 持久化归谁？** — task owns config semantics，storage/platform owns persistence。需要在 storage design 中确认。
4. **expression runtime 归属是否已确认？** — task field values 是否需要 expression 计算。
5. **旧 task config JSON 样例是否可用？** — 作为 migration fixture 输入。
6. **error policy 的默认值是什么？** — 建议默认 stop-on-first-failure，用户可配置为 retry/pause/skip。
7. **任务并发上限是否需要限制？** — 建议首轮不限制，后续按 runtime 证据决定。

## 7. Answers to send design open questions

基于 task design（通用执行引擎定位），回答 send design §5 的 open questions：

### 7.1 Write queue 归属

**回答：send owns transport-level write queue。**

- send 拥有轻量 transport-level write queue，保证同一 target 的 write 顺序。
- task 拥有 step-level 序列编排（step 执行顺序、间隔、条件）。
- 两者不冲突：task await SendResult 后再发下一个 send-step，send queue 只处理 transport-level 的并发 write。
- task 不感知 send queue 的存在。

### 7.2 SendResult 同步/异步

**回答：Promise\<SendResult\> 为主，可选 event emission。**

- send public service 返回 `Promise<SendResult>` 作为主要调用方式。
- task 的 send-step 使用 `await sendService.execute(request)` 获取结果。
- send 可选 emit SendResult event 供其他消费者（status/storage/result）订阅。
- 这保证了 task 可以按 step 顺序推进，同时不阻塞 event-driven 的消费者。

### 7.3 Send failure 是否影响 task lifecycle

**回答：task 决定，send 不参与。**

- send 只输出 SendResult（含 error kind 和详情）。
- task 根据 `errorPolicy` 决定如何处理 send-step 失败：retry、skip、stop 或 pause。
- wait-condition-step 超时同样适用 errorPolicy。
- send 不了解 task lifecycle，不写 task state。

### 7.4 Send instance 配置持久化归谁

**回答：send own config / settings / storage 联合确认，不归 frame。**

- per-frame 的"发送配置模板"（如默认字段值、target 偏好）如果需要持久化，可能归 send own config 或 settings。
- 不归 frame：frame 只 owns 静态帧定义，不拥有发送配置。
- 具体归口在实现阶段由 send/settings/storage design 联合确认。
- TaskDefinition 本身归 task own config，持久化经 storage。

### 7.5 Send 是否了解 task 的存在

**回答：不。**

- send 只接收 SendRequest（含 context 字段供追踪），不区分调用方。
- context 中的 source/taskId/stepIndex 是纯信息性的，send 不基于它们改变行为。

### 7.6 wait-condition-step 如何获取 receive 事件

**回答：task service 通过 receive public API 订阅 ReceiveInputEvent。**

- task service 在创建时通过依赖注入接收 receive event source。
- wait-condition-step 执行时订阅事件，在 task/core 中匹配 WaitCondition。
- pause 时取消订阅，resume 时重建。
- runtime 只负责服务装配时把 receive event source 注入 task service，不参与事件分发。

### 7.7 SCOE 完成条件和确认帧如何表达

**回答：作为 task 的 step 序列。**

- SCOE 命令 = TaskDefinition（triggerSource = scoe-command），steps = [send-step, wait-condition-step, send-step]。
- 完成条件 = wait-condition-step 的 WaitCondition（由 SCOE 定义具体内容）。
- 确认帧 = 最后一个 send-step（由 SCOE 定义 frameId 和 fieldValues）。
- task 不理解"SCOE 完成条件"的语义，只执行 wait-condition-step 的通用匹配逻辑。

## 8. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-task/rewrite-task-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、boundary guards、owner/not owner、core types、service contract、state shape、cross-feature contracts、fake adapter boundary、validation plan 和 open questions，不能把本轮文档外的旧代码结构升级为新实现合同。
