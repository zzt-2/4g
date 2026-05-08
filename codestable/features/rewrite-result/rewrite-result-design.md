---
doc_type: feature-design
feature: rewrite-result
status: draft
date: 2026-05-06
summary: 东方红上位机重写中 result feature 的 owner scope、核心类型、结果聚合规则、与 task/send/receive/storage/status/report/northbound 的交互契约和边界定义。
---

# Rewrite result feature design

## 1. Direct contract

本设计只依据以下正式工件判断范围和完成度：

1. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
2. `codestable/architecture/rewrite-target-structure.md`
3. `codestable/architecture/rewrite-system-architecture.md`
4. `codestable/architecture/rewrite-feature-boundaries.md`
5. `codestable/architecture/rewrite-feature-interaction-matrix.md`
6. `codestable/quality/rewrite-quality-rules.md`
7. `codestable/quality/rewrite-review-checklist.md`
8. `codestable/features/rewrite-task/rewrite-task-design.md`
9. `codestable/features/rewrite-send/rewrite-send-design.md`
10. `codestable/features/rewrite-receive/rewrite-receive-design.md`
11. `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-design.md`
12. `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
13. `codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`

`codestable/architecture/rewrite-target-structure.md` 仍是 canonical 架构基线。task design 固定 task 输出 TaskInstanceCompletion 作为内部 lifecycle 事实；send design 固定 send 输出 SendResult；receive design 固定 receive 输出 parsed field values 和 trigger candidate。

## 2. Boundary guards

- 本轮是 Lane A design，只产出 design/checklist，不写实现代码。
- result owns 内部结果事实（case result truth、task result truth、执行摘要、结果归因和聚合规则）。
- result does not own report 文件生成、HTTP/FTP 交付、外部响应语义、外部 schema/枚举/错误码、northbound delivery closure。
- result ≠ report。result 定义内部事实；report 从 result + storage 读取素材生成文件。
- result ≠ storage。result 定义事实模型；storage 负责持久化。
- result 不冻结 northbound 外部 schema、错误码或 TestReport 格式。
- result 不拥有 send/receive/task/connection/SCOE 的运行事实，只消费它们的 public event/selector。
- 跨 feature 只通过 public API、runtime 编排、显式事件或只读 selector 交互。
- 统计 read model 禁止写回 frame definition、field definition 或其他静态资产。
- 旧 `src/`、`src-electron/` 只作为 evidence、oracle 或 migration input。

## 3. Evidence summary

### 3.1 Contract evidence

- target structure 定义 `features/result` 为内部结果归口、用例结果事实、执行摘要的 owner；不拥有报告文件交付和外部响应语义。
- target structure §13 固定 result/report/delivery 三段分离：result owns 内部结果事实，report owns 报告对象和报告文件生成，northbound owns 对外交付。
- feature boundaries 明确 result 的 owner：内部 case result、task result summary、执行摘要和结果归因；不拥有 report file generation、HTTP/FTP delivery、external response semantics。
- interaction matrix 明确 `result -> report/status/northbound/pages` 为只读输出方向；`task -> result`、`receive -> result`、`send -> result`、`SCOE -> result` 为上游素材输入方向。
- task design 定义 TaskInstanceCompletion（kind: completed/stopped/failed，summary: steps total/succeeded/failed/skipped，durationMs，startedAt，finishedAt）作为任务完成事实输出。
- send design 定义 SendResult（kind: sent/build-error/target-unavailable/transport-error/timeout/cancelled）作为单次发送结果输出。
- receive design 定义 ReceiveMatchedFrameSummary、ReceiveFieldValueSnapshot 作为解析结果输出。
- quality rules R12 要求 result/report/delivery 三段分离，history/CSV 不等同 TestReport，northbound 从内部投影。

### 3.2 Upstream public API evidence

task public API 将提供：
- `TaskInstanceCompletion`：任务完成事实（kind、summary、durationMs、时间戳）。
- `TaskStepResult`：per-step 执行结果（含 send-step 的 SendResult、wait-condition-step 的匹配结果）。
- `selectTaskInstance(id)`：任务实例只读快照。
- `selectTaskProgress(id)`：进度快照。
- Task lifecycle event：任务终态事件。

send public API 将提供：
- `SendResult`：发送结果（kind、bytesBuilt、bytesSent、timestamp、error）。
- `selectSendStatistics`：发送统计只读快照。
- SendResult event：发送结果事件。

receive public API 将提供：
- `ReceiveMatchedFrameSummary`：匹配的接收帧摘要。
- `ReceiveFieldValueSnapshot`：字段值快照。
- `ReceiveInputEvent`：接收事件流。

### 3.3 Legacy evidence

旧系统事实只用于保留可观测行为和识别迁移风险，不作为新架构：

- 旧系统没有独立 result feature。结果事实分散在 receive store（接收统计）、send store（发送统计）、SCOE store（命令成功/失败计数）、history/CSV（本地导出）和 globalStatsStore 中。
- 旧 `receiveFramesStore` 同时维护 frameStats、receivedPackets、matchCount、unmatchedCount 和 field last values。这些是 receive read model 的散落，不是 result truth。
- 旧 `sendFrameInstancesStore` 维护 sendStats（success/fail counts）。这是 send read model，不是 result truth。
- 旧 `scoeStore` 维护 commandSuccessCount/commandErrorCount。这是 SCOE domain state，不是 result truth。
- 旧 `globalStatsStore` 是全局统计的大杂烩，新架构中应拆归各 feature read model + status summary。
- 旧 history/CSV 导出只是 storage 本地记录，不等于 result truth 或 report 闭环。
- **核心 gap**：旧系统没有"用例执行结果"这一层概念。定时/触发/序列发送完成后没有统一的"这个任务成功了还是失败了"的判定和记录。SCOE 命令有成功/失败计数但只是 SCOE 内部状态，不进入通用结果体系。新 result feature 要补齐的就是这个 gap。

## 4. Design

### 4.1 Owner scope and not-owner scope

| 分类 | result owner | result not owner |
| --- | --- | --- |
| 用例结果判定 | 基于 TaskInstanceCompletion 构建用例级结果事实（CaseResult）。判定规则归 result。 | task lifecycle 状态机、step 执行逻辑、error policy。 |
| 任务结果摘要 | 基于 TaskInstanceCompletion + per-step 素材构建任务级结果摘要（TaskResultSummary）。 | task progress 实时计算、task statistics read model。 |
| 结果归因 | 记录结果的素材来源（哪个 send result 导致了 step 失败、哪个 receive 匹配满足了 wait-condition）。 | send result truth、receive parse truth、task step execution truth。 |
| 结果聚合 | 按 case / task / 时间范围聚合结果，提供只读 result read model。 | report object 生成、TestReport schema、northbound 外部格式。 |
| 结果状态 | result 本身的 lifecycle（collecting → finalized → archived）。 | storage persistence lifecycle、report generation lifecycle、northbound delivery transaction。 |
| 结果查询 | 提供只读 selector 供 pages/status/report/northbound 读取。 | pages UI state、status health summary、report file preparation。 |

**result 的核心职责是：把 task/send/receive/SCOE 的执行素材归因为内部结果事实，并提供结果查询能力。result 不是执行引擎，不是报告生成器，不是交付管道。**

### 4.2 Result material sources

result 消费以下上游素材构建内部事实：

| 素材来源 | 提供方 | 素材内容 | result 如何使用 |
| --- | --- | --- | --- |
| TaskInstanceCompletion | task | kind (completed/stopped/failed)、summary (steps total/succeeded/failed/skipped)、durationMs、时间戳 | 作为 CaseResult 和 TaskResultSummary 的主事实来源。result 根据 kind 映射内部结果判定。 |
| TaskStepResult | task (per-iteration per-step) | send-step: SendResult；wait-condition-step: matched/matchedValue/timedOut；delay-step: completed | 作为结果归因的细粒度素材。result 不重新执行 step 逻辑，只记录和归因。 |
| SendResult | send (经 task step) | kind (sent/build-error/target-unavailable/transport-error/timeout/cancelled)、bytesBuilt、bytesSent | 嵌套在 TaskStepResult 中。send failure 归因为 step failure 的根因。result 不直接消费独立 SendResult event，只消费经 task 包装的 step result。 |
| ReceiveFieldValueSnapshot | receive (经 task wait-condition-step) | frameId、fieldId、value | 嵌套在 TaskStepResult 的 matchedValue 中。receive 匹配成功作为 step pass 的证据。result 不直接消费 receive event 构建结果。 |

**关键设计决策：result 不直接消费独立的 send result event 和 receive event。result 的主要素材来源是 task 输出的 TaskInstanceCompletion 和 TaskStepResult。send/receive 的原始事实经 task step 包装后才进入 result。**

理由：

1. send 和 receive 的原始事件粒度太细，直接消费会导致 result 需要自己聚合和关联。
2. task 已经完成了 step 级聚合（把 SendResult 包装进 TaskStepResult.sendResult，把 receive 匹配包装进 TaskStepResult.matched/matchedValue）。
3. 只有经过 task 编排的执行才有"用例/任务结果"的概念。独立的手动发送不属于用例结果（手动发送的结果是 send result，不进入 result）。

**例外：SCOE 命令结果**

SCOE 命令经 task 编排执行（triggerSource = scoe-command），TaskInstanceCompletion 包含 SCOE 命令执行结果。result 不区分 task 的 triggerSource，统一处理。SCOE 领域状态（commandSuccessCount 等）归 SCOE feature，result 不重复维护。

### 4.3 Core types

本轮不冻结最终类型名和字段 schema，只定义类型职责和分类。

**CaseResult** — 用例执行结果（result 的核心事实）：

- `id`：结果实例 ID。
- `taskDefinitionRef`：引用的 TaskDefinition（name、triggerSource、schedulingMode）。
- `kind`：passed / failed / stopped / partial。
  - passed：task completed 且所有 steps succeeded（summary.stepsFailed === 0）。
  - failed：task failed，或 task completed 但有 steps failed 且 error policy 导致结果不可接受。
  - stopped：task 被主动停止（TaskInstanceCompletion.kind === stopped）。
  - partial：task completed 但有 steps skipped 或 wait-condition timed-out，结果需要人工审查。
- `verdictSource`：结果判定的依据类型（auto / manual）。
  - auto：由 result aggregation rule 自动判定。
  - manual：需要人工确认或覆盖（后续支持）。
- `summary`：复用 TaskInstanceCompletion.summary（stepsTotal、stepsSucceeded、stepsFailed、stepsSkipped）。
- `durationMs`：执行耗时。
- `startedAt`、`finishedAt`：起止时间。
- `stepDetails`：CaseStepDetail[]（per-step 归因详情）。
- `finalizedAt`：结果 finalize 时间。

**CaseStepDetail** — 用例中单 step 的归因详情：

- `stepIndex`、`iteration`。
- `kind`：与 TaskStepKind 对应。
- `outcome`：passed / failed / skipped / timed-out。
- `sendResult`：send-step 的 SendResult（如有）。
- `conditionMatch`：wait-condition-step 的匹配结果（matched、matchedValue、timedOut）。
- `rootCause`：失败根因分类（transport-error / build-error / target-unavailable / condition-timeout / cancelled / none）。
- `notes`：可选补充信息（如 expression 评估结果，后续支持）。

**TaskResultSummary** — 任务级结果摘要（面向列表和 UI）：

- `taskDefinitionRef`：引用的 TaskDefinition。
- `totalCases`：执行次数。
- `passedCases`、`failedCases`、`stoppedCases`、`partialCases`：各状态计数。
- `lastResult`：最近一次 CaseResult 快照。
- `lastRunAt`：最近执行时间。
- `totalDurationMs`：累计执行耗时。

**ResultAggregationRule** — 结果聚合规则（result/core 纯 TypeScript）：

- `stepFailurePolicy`：step 失败时 case result 的判定策略。
  - `any-fail → failed`：任一 step 失败则 case failed（默认）。
  - `all-fail → failed`：所有 step 都失败才 case failed，否则 partial。
  - `threshold`：失败 step 数超过阈值才 failed，否则 partial。
- `skipPolicy`：step 被跳过时 case result 的判定策略。
  - `skip-is-pass`：跳过的 step 视为 passed（默认）。
  - `skip-is-partial`：有 step 被跳过则 case partial。
- `timeoutPolicy`：wait-condition 超时时的判定策略。
  - `timeout-is-fail`：超时视为失败（默认）。
  - `timeout-is-partial`：超时视为需审查。
- `stoppedPolicy`：task 被停止时的判定。
  - `stopped-is-stopped`：直接标记 stopped，不做进一步判定（默认，也是唯一合理选项）。

聚合规则默认值覆盖大多数场景（any-fail → failed + skip-is-pass + timeout-is-fail + stopped-is-stopped），后续可按 task definition 或 settings 配置覆盖。

**ResultLifecycleStatus**：

- `collecting`：素材正在收集中（task 仍在运行）。
- `finalized`：结果已判定完成。
- `archived`：结果已归档（经 storage 持久化后）。

**ResultReadModel** — 结果查询 read model：

- 按 task definition、triggerSource、时间范围、result kind 索引。
- 提供聚合查询（通过率、平均耗时、失败分布）。
- 有限窗口，超出部分由 storage 持久化。

### 4.4 Result aggregation flow

```
TaskInstanceCompletion (task event)
  → result service 接收
  → 从 TaskInstanceCompletion 提取素材：
      kind、summary、durationMs、时间戳
  → 从 TaskStepResult[] 提取 per-step 归因：
      遍历 stepResults，为每个 step 构建 CaseStepDetail
      - send-step: outcome based on SendResult.kind
          sent → passed
          build-error / target-unavailable / transport-error / timeout / cancelled → failed
          rootCause = 对应 kind
      - wait-condition-step: outcome based on matched/timedOut
          matched → passed
          timedOut + onTimeout=fail → failed
          timedOut + onTimeout=continue → passed
          timedOut + onTimeout=skip → skipped
          rootCause = condition-timeout or none
      - delay-step: always passed
  → 应用 ResultAggregationRule 判定 CaseResult.kind
  → 构建 CaseResult
  → 更新 TaskResultSummary
  → 更新 ResultReadModel
  → emit CaseResultFinalized event（供 report/status/northbound 消费）
  → 标记 lifecycle = finalized
```

**实时 vs 延迟**：

- result 只在 task 完成后（TaskInstanceCompletion 到达时）才构建 CaseResult。
- task 运行期间的 progress 不进入 result，留在 task progress selector。
- 不排除后续支持"运行中结果快照"（collecting 状态），但首轮只支持 task 完成后的 result 构建。

### 4.5 Service contract

```
ResultService:
  // 内部方法，由 runtime/event 路由调用
  handleTaskCompletion(completion: TaskInstanceCompletion) → void

  // 查询
  getCaseResult(caseResultId) → CaseResult | null
  getTaskResultSummary(taskDefinitionRef) → TaskResultSummary | null
  queryResults(filter: ResultQueryFilter) → ResultReadModel

  // 生命周期
  clearResults(filter?) → void  // 清理 transient result read model
  archiveResults(filter?) → Promise<void>  // 触发 storage 持久化
```

**handleTaskCompletion 是 result 的唯一素材入口**。所有上游素材经 TaskInstanceCompletion 包装后进入 result。

### 4.6 State shape and selector surface

| 状态类别 | 写入 owner | 读取方 | reset / lifecycle | 设计约束 |
| --- | --- | --- | --- | --- |
| CaseResult instances | result service（单点写入） | pages、status、report、northbound（通过只读 selector/event） | finalized 后不可变；archived 后从 storage 按需加载 | 不保存 task/send/receive/SCOE 的内部 state |
| TaskResultSummary | result service 增量更新 | pages、status（通过只读 selector） | 随 CaseResult 更新；可 clear/reset | 不写回 task definition 或其他静态资产 |
| ResultReadModel | result service 增量更新 | pages、report（通过只读 selector） | 有限窗口；超出由 storage 持久化 | 不等同于 report 或 northbound 投影 |
| Aggregation rules | result core 默认值 + settings/definition 覆盖 | result service | 低频更新；持久化归 settings/storage | 不是运行事实 |
| UI snapshot | pages / result composables | UI 组件 | 页面生命周期 | 不定义 result truth |

**Selector surface**：

- `selectCaseResults`：结果列表（支持 filter：taskDefinitionRef、triggerSource、kind、时间范围）。
- `selectCaseResult(id)`：单个结果快照。
- `selectTaskResultSummary(ref)`：任务级结果摘要。
- `selectResultStatistics`：聚合统计（通过率、平均耗时、失败分布）。
- `selectResultSnapshot`：面向 UI 的安全聚合 snapshot。

Selector 不暴露可变 state 引用、内部 service 实例或 task/send/receive 内部状态。

### 4.7 Cross-feature interaction contracts

#### task → result（消费 TaskInstanceCompletion）

| 维度 | 契约 |
| --- | --- |
| 方向 | task 输出 TaskInstanceCompletion event，result 消费 |
| task 提供 | TaskInstanceCompletion（kind、summary、durationMs、时间戳）+ TaskStepResult[]（per-step 归因素材） |
| result 行为 | 基于 completion + stepResults 构建 CaseResult，应用聚合规则判定 |
| 禁止 | result import task internal state；result 写入 task state；result 决定 task lifecycle |

#### send → result（经 task step 间接消费）

| 维度 | 契约 |
| --- | --- |
| 方向 | send result 经 TaskStepResult.sendResult 间接到达 result |
| result 行为 | 提取 SendResult.kind 作为 step outcome 判定和 rootCause 归因 |
| 禁止 | result 直接订阅独立 SendResult event；result import send internal state；result 定义 send 失败的业务含义 |

#### receive → result（经 task step 间接消费）

| 维度 | 契约 |
| --- | --- |
| 方向 | receive 匹配结果经 TaskStepResult.conditionMatch 间接到达 result |
| result 行为 | 提取 matched/matchedValue/timedOut 作为 wait-condition-step 的 outcome |
| 禁止 | result 直接订阅 ReceiveInputEvent；result import receive internal state；result 定义 receive 匹配语义 |

#### SCOE → result（经 task completion 统一消费）

| 维度 | 契约 |
| --- | --- |
| 方向 | SCOE 命令经 task 编排，TaskInstanceCompletion 统一到达 result |
| result 行为 | 不区分 triggerSource，统一处理所有 TaskInstanceCompletion |
| 禁止 | result 为 SCOE 硬编码特殊结果判定；result 维护 SCOE 领域状态（commandSuccessCount 等） |

#### result → report（提供结果素材）

| 维度 | 契约 |
| --- | --- |
| 方向 | result 提供只读 CaseResult selector/event，report 消费 |
| result 提供 | CaseResult（含 stepDetails）、TaskResultSummary、ResultReadModel |
| report 行为 | 从 result + storage 读取素材生成报告对象和报告文件 |
| 禁止 | result 生成报告文件；result 冻结报告 schema；result 了解报告交付语义 |

#### result → status（提供结果驱动的状态素材）

| 维度 | 契约 |
| --- | --- |
| 方向 | result 提供只读 result selector，status 消费 |
| result 提供 | CaseResult event、result statistics selector |
| status 行为 | 基于 result 事实构建状态指示和健康摘要 |
| 禁止 | result 写入 status read model；result 定义状态指示规则 |

#### result → northbound（提供内部结果投影）

| 维度 | 契约 |
| --- | --- |
| 方向 | result 提供只读 result selector，northbound 消费 |
| result 提供 | CaseResult、TaskResultSummary 只读快照 |
| northbound 行为 | 从 result 投影构建外部响应、结果上报、状态查询回复 |
| 禁止 | result 冻结外部 schema/枚举/错误码；result 了解 HTTP/FTP 语义；result 执行对外交付 |

#### result → pages（提供 UI 展示素材）

| 维度 | 契约 |
| --- | --- |
| 方向 | result 提供只读 selector，pages 消费 |
| result 提供 | CaseResult 列表、TaskResultSummary、result statistics |
| pages 行为 | 通过 result composables 展示结果列表、详情、统计 |
| 禁止 | pages 定义 result truth；pages 直接 import result internal state |

#### result → storage（结果持久化）

| 维度 | 契约 |
| --- | --- |
| 方向 | result 请求 storage 持久化 CaseResult |
| result 提供 | CaseResult 数据 |
| storage 行为 | 持久化 result material、管理文件生命周期 |
| 禁止 | result 直接写文件；result 定义 storage 路径策略 |

### 4.8 Result 与 report 的边界

| 维度 | result | report |
| --- | --- | --- |
| 职责 | 定义内部结果事实、聚合规则和结果查询 | 从 result + storage 读取素材生成报告对象和报告文件 |
| 数据方向 | result → report（只读 selector/event） | report 读取 result，不反向写入 |
| Schema | 内部 CaseResult/TaskResultSummary，不冻结外部格式 | 报告对象 schema 由 report design 定义，可能包含甲方要求的字段 |
| Lifecycle | CaseResult finalized 后不可变 | 报告文件生成是独立 lifecycle |
| 验证 | fixture 可覆盖聚合规则和归因逻辑 | 报告格式需 customer validation |

result 是 report 的素材源之一。report 还需要从 task（execution context）、storage（history material）和 settings（report template）读取额外素材。result 不替代这些素材源。

### 4.9 Result 与 northbound 的边界

| 维度 | result | northbound |
| --- | --- | --- |
| 职责 | 内部结果事实 | 外部投影、对外交付、外部错误语义转换 |
| 数据方向 | result → northbound（只读 selector） | northbound 从 result 投影，不反向写入 |
| Schema | 内部 CaseResult，不冻结外部格式 | 外部响应格式由 northbound design 定义，可能包含甲方要求的字段映射 |
| 错误码 | 内部 rootCause 分类（transport-error / build-error 等） | 外部错误码映射由 northbound 负责 |
| 交付 | 不执行任何对外交付 | HTTP/FTP 交付闭环归 northbound |

northbound 从 result 读取内部事实后，按甲方 schema 翻译和投影。result 不了解 northbound 的存在，不冻结任何外部格式。

### 4.10 Target internal layering

| 层 | 目标职责 |
| --- | --- |
| `core` | 纯 TypeScript。负责 ResultAggregationRule 判定算法、CaseStepDetail 归因逻辑、CaseResult 构建、ResultReadModel 聚合计算。不依赖 Vue、Pinia、Electron、platform、Node、task/send/receive/SCOE store。 |
| `services` | result 用例入口。负责 handleTaskCompletion、result query、clear/archive。通过显式依赖注入接收 task event source 和 storage service。 |
| `state` | CaseResult instances、TaskResultSummary、ResultReadModel、只读 selector。state action 保持薄层。不保存 task/send/receive/SCOE 状态。 |
| `adapters` | 可选。用于 fake task completion source、fake storage writer。real task/storage 通过 public API 消费。 |
| `composables` | 面向结果页面的 UI-facing 组合。负责结果列表、筛选、详情展示、统计展示。不拥有结果判定逻辑。 |
| `components` | 结果列表、结果详情、统计面板、归因展示等 UI。组件通过 props/events/composables 使用 result 能力。 |
| `fixtures` | TaskInstanceCompletion fixture（各种 kind/summary 组合）、TaskStepResult fixture（各 step 类型 + 各种 outcome）、aggregation rule fixture（各种 policy 组合）、legacy observable behavior oracle。 |

### 4.11 Runtime involvement

result 需要 runtime 参与：

- **事件路由**：runtime 将 TaskInstanceCompletion event 路由到 result service.handleTaskCompletion。
- **服务装配**：runtime 创建 result service，注入 task event source、storage service。
- **生命周期**：app startup/shutdown 时清理 transient result state。
- **跨 feature 路由**：CaseResultFinalized event → report/status/northbound。

runtime 不得：

- 实现结果聚合逻辑或归因算法。
- 决定 CaseResult.kind。
- 解释 SendResult 的业务含义。
- 变成 result/task/report/northbound 的总编排器。

### 4.12 Platform involvement

result 不直接访问 platform：

- 结果聚合在 renderer TypeScript 完成，不需要 platform 能力。
- 持久化通过 storage public service。
- result 不新增 platform / preload / main API。

### 4.13 Legacy observable behavior ledger

| 旧可观测行为 | owner feature | 处理策略 | evidence source | validation level |
| --- | --- | --- | --- | --- |
| 定时/触发/序列发送完成后用户可见最终状态（完成/停止/错误）。 | task lifecycle + result | preserve (task provides completion, result provides verdict) | `src/composables/frames/sendFrame/useSendTaskExecutor.ts`、`src/stores/frames/sendTasksStore.ts` | fixture test, manual checklist |
| SCOE 命令成功/失败计数可见。 | SCOE domain state + result provides per-case verdict | preserve (SCOE owns domain counter; result provides unified result) | `src/stores/scoeStore.ts` | fixture test, hardware validation |
| 发送统计（成功/失败数）可见。 | send statistics read model | preserve as send-owned; result not replacing | `src/stores/frames/sendFrameInstancesStore.ts` | fixture test |
| 接收统计（命中/未匹配/错误）可见。 | receive statistics read model | preserve as receive-owned; result not replacing | `src/stores/frames/receiveFramesStore.ts` | fixture test |
| 全局统计面板展示收发和系统统计。 | status summary from multiple sources | preserve as status-owned aggregation; result provides result stats only | `src/stores/globalStatsStore.ts` | fixture test, manual checklist |
| 旧系统没有统一的"任务执行结果"展示。 | result (new) | preserve gap recognition; result fills this gap | N/A | fixture test, manual checklist |

### 4.14 Validation plan

**Static scan**：

- `features/result/core` 无 Vue/Pinia/Electron/platform/Node 依赖。
- result 不 import task/send/receive/SCOE/status/report/northbound internal state。
- result 不硬编码外部 schema/枚举/错误码。

**Vitest unit**：

- Aggregation rule：各种 policy 组合下 CaseResult.kind 判定。
- CaseStepDetail 归因：send-step 各 outcome、wait-condition-step 各 outcome、delay-step。
- TaskResultSummary：增量更新逻辑。
- ResultReadModel：聚合查询和 filter。

**Fixture test**：

- task completed + all steps passed → CaseResult.kind = passed。
- task completed + some steps failed + any-fail policy → CaseResult.kind = failed。
- task completed + some steps failed + all-fail policy → CaseResult.kind = partial (if not all failed)。
- task completed + steps skipped + skip-is-partial policy → CaseResult.kind = partial。
- task stopped → CaseResult.kind = stopped。
- task failed → CaseResult.kind = failed。
- wait-condition timeout + timeout-is-partial → CaseResult.kind = partial。
- Mixed step types (send + wait-condition + delay) 正确归因。

**Manual checklist**：

- 结果列表页面入口可达（如后续实现）。
- 结果详情展示 step 归因。
- 结果统计展示通过率和失败分布。

**Cannot claim from this design**：

- result implementation complete.
- report/customer closure complete.
- northbound external result delivery complete.

### 4.15 Deferred / blockers

**Deferred**：

- Concrete CaseResult / CaseStepDetail / TaskResultSummary schema。
- ResultAggregationRule 按 TaskDefinition 或 settings 配置覆盖的 UI 和存储方式。
- "Running result snapshot"（collecting 状态）是否需要。
- Manual verdict / override 是否需要、如何实现。
- Result read model 窗口大小和归档策略。
- Result 页面的完整 UI 设计。
- 旧 history/CSV 中是否有可提取的 legacy result oracle。
- expression evaluation 在归因详情中的角色。
- result statistics 与 status global stats 的边界（后续 status design 确认）。

**Blockers for implementation**：

- task service 需要输出 TaskInstanceCompletion event。
- TaskStepResult 的最终形态待 task 实现确认。
- storage service 需要 result material 持久化能力。

**Blockers for acceptance**：

- 缺少 task implementation。
- 缺少 report/northbound design 确认 result 是素材源。
- 缺少 customer validation 确认外部结果语义。

## 5. Open questions

### 5.1 手动发送的结果是否进入 result

当前设计：手动发送（send 页面单次发送）不经过 task，不产生 TaskInstanceCompletion，因此不进入 result。手动发送的结果留在 send result selector。

问题：是否需要为手动发送创建"轻量用例结果"？例如用户发送一帧后想看到"这帧有没有成功"的用例级判定。

建议：首轮不进入 result。手动发送的 SendResult 已包含足够信息。后续如需统一展示，可通过 status 或页面层组合 send selector。

### 5.2 result statistics 与 status global stats 的边界

result own result statistics（通过率、失败分布等）。status own 系统级健康摘要。两者可能重叠。

建议：result 只 own 与"用例/任务执行结果"相关的统计。系统级收发统计、连接统计、设备统计留在 send/receive/connection 各自的 read model，由 status 汇总。后续 status design 锁定边界。

### 5.3 多 iteration 的结果判定

timed 模式的 task 可能执行多 iteration。每次 iteration 都有独立的 stepResults。

问题：CaseResult 是覆盖所有 iteration 还是 per-iteration？

建议：首轮 CaseResult 覆盖整个 TaskInstanceCompletion。summary 汇总所有 iteration 的 step 统计。per-iteration 详情通过 stepDetails（含 iteration index）保留。如果需要 per-iteration result，后续扩展。

### 5.4 TaskDefinition 变更后的结果关联

TaskDefinition 可能在任务执行后被用户修改。CaseResult 引用的 taskDefinitionRef 如何处理？

建议：CaseResult 记录 taskDefinitionRef（id + name + 版本快照或 definition hash）。result 不追踪 definition 变更历史，只记录执行时的快照。完整变更追踪由 storage 持久化时处理。

## 6. Result / Report / Northbound boundary summary

| 维度 | result | report | northbound |
| --- | --- | --- | --- |
| 定位 | 内部结果事实层 | 文件/格式层 | 对外交付层 |
| Owns | CaseResult、TaskResultSummary、aggregation rules、result read model | 报告对象、报告文件生成、素材归集 | 外部投影、对外交付、外部错误语义转换 |
| Does not own | 报告文件、外部格式、交付动作 | 内部结果 truth、HTTP/FTP 交付 | 内部 truth、报告生成、文件准备 |
| 素材源 | task completion event | result + storage + task + settings | task + result + status + report + storage |
| 消费者 | report、status、northbound、pages | northbound、storage、pages | 甲方系统 |
| Schema 冻结 | 内部 schema，可自由演化 | 报告对象 schema 待 customer confirmation | 外部 schema 由甲方定义 |
| 验证 | fixture 可覆盖 | customer validation 必需 | customer + runtime validation 必需 |

**核心原则**：结果事实先在 result 内部归口。报告从 result + storage 读取素材生成文件。交付动作由 northbound 承接。三段分离，不互相穿透。

## 7. Checklist entry

后续 `cs-feat-impl` 入口以 `codestable/features/rewrite-result/rewrite-result-checklist.yaml` 为准。实现阶段必须先重新确认本设计中的 direct contract、boundary guards、owner/not owner、core types、result aggregation flow、state shape、cross-feature contracts、result/report/northbound boundary 和 open questions，不能把本轮文档外的旧代码结构升级为新实现合同。
