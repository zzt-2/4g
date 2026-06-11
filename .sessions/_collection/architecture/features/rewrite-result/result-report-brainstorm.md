---
doc_type: brainstorm
feature: rewrite-result
date: 2026-05-12
status: finalized
summary: result-report brainstorm，修正后的 MVP 方案。大幅简化已有 design 中的过度设计。
---

# Result-Report Brainstorm (2026-05-12)

## 1. 已有 design 评估

已有 `rewrite-result-design.md`（530 行）和 `rewrite-result-checklist.yaml`。经 code-reviewer + critic 双轮自检，确认以下问题：

| 项目 | 已有 design 的做法 | 问题 |
|------|-------------------|------|
| CaseResult | 独立类型，含 kind/verdictSource/summary/stepDetails/lifecycle | 与 TaskExecutionSummary 重叠，pass/fail 判断是纯函数不需要独立类型 |
| TaskResultSummary | 跨执行聚合（totalCases/per-kind counts/lastResult） | 无 MVP 消费者，task 已有 history + statistics，YAGNI |
| ResultReadModel | 独立 read model + query filter | task selectors 已提供 instance/progress/history/statistics，多余 |
| ResultAggregationRule | 可配置策略（any-fail/all-fail/threshold + skip/timeout/stopped policy） | MVP 用最简规则，不需要可配置策略 |
| Report 模板系统 | 未设计但 brainstorm 曾提议"模板引擎+可配置映射" | 甲方格式未确认，建模板引擎是为不存在的需求做优化 |
| TaskInstanceCompletion 事件 | 假设 task 会 emit 此事件 | task 没有事件发射机制，也不需要新建——用 onSettled() + runtime 编排即可 |
| 报告素材 | result + storage + settings + frame | MVP 只需 TaskInstanceState |
| Checklist 步骤数 | 22 步 | 远超 Lane B 8 步上限 |

## 2. 修正后的 MVP 方案

### 2.1 要做什么

**result/ feature（结果收集）**：
- runtime 编排：task 终态时（onSettled resolve），runtime 将 terminal TaskInstanceState 传给 result
- 纯函数 `judgeCaseVerdict(summary: TaskExecutionSummary): 'passed' | 'failed' | 'stopped'` — 归因判断
- 内存 state map：存储已收集的结果事实（instanceId → verdict + timestamp）
- 只读 selector：暴露结果快照给 UI / report / northbound

**report/ feature（报告生成）**：
- 硬编码 `generateReport(instance: TaskInstanceState, verdict: CaseVerdict): ReportJson` 函数
- 内部数据模型与输出 JSON 格式分离（output format 是独立的映射函数，好改）
- 通过 platform facade 写文件
- MVP 只支持 JSON 输出

### 2.2 不做什么

- 不建模板引擎（等甲方改了 3 次再说）
- 不建 TaskResultSummary 聚合（YAGNI）
- 不建 ResultReadModel（用 task selectors）
- 不建独立 CaseResult 类型（用 TaskExecutionSummary + 纯函数）
- 不建事件发射机制（用 onSettled + runtime 编排）
- 不跨 4 个 feature 收集报告素材（MVP 只用 TaskInstanceState）
- 不做 CSV/PDF（MVP 只 JSON）
- 不冻结甲方 schema
- 不把 history/CSV 等同 TestReport
- 不把 northbound deviceId 等同串口 target
- 不在 main process 放结果/报告语义
- 不为手动操作建独立结果通道（没有这个业务场景）

### 2.3 上游 feature 接口需求

| Feature | 需要的接口 | 当前状态 | 改动量 |
|---------|-----------|---------|-------|
| task | `onSettled(id): Promise<void>` | 已有 | 不改 |
| task | `getInstance(id): TaskInstanceState` | 已有 | 不改 |
| task | `selectTaskHistory()` | 已有 | 不改 |
| runtime | 编排 wiring：task 终态 → result 收集 | 新增 | routing-tick 或 bridge 中加几行 |
| platform | 文件写入 facade | 待确认 | report 写文件用 |

**关键**：不需要 task feature 做任何改动。不需要新增事件类型。

### 2.4 归因规则（MVP）

```
task completed + steps 全 pass        → passed
task completed + 有 step fail         → failed
task failed                           → failed
task stopped                          → stopped
```

partial 状态预留但不实现。归因规则是纯函数，放在 `result/core/`。

### 2.5 报告格式策略

```typescript
// 内部模型（稳定）
interface CaseVerdict {
  readonly instanceId: string;
  readonly verdict: 'passed' | 'failed' | 'stopped';
  readonly judgedAt: string;
}

// 输出格式（可变，甲方改格式只动这里）
function mapToOutputFormat(instance: TaskInstanceState, verdict: CaseVerdict): ReportJson {
  // 硬编码的 JSON 结构
  // 甲方改格式时只修改此函数
}
```

`generateReport` 和 `mapToOutputFormat` 分离。甲方改格式只需修改映射函数。

### 2.6 Lane 判定

**Lane A: Fastforward**。

理由：修正后核心逻辑约 50 行，不需要完整 design/checklist 闭环。直接用 cs-feat-ff 或 Lane A 快速通道。

已有 530 行 design 不丢弃——作为参考材料，但不作为直接合同。MVP 完成后如需扩展（聚合、模板、PDF、northbound），再以它为基础进入 Lane B。

## 3. 开放问题

| # | 问题 | 默认行为 | 何时需确认 |
|---|------|---------|-----------|
| O1 | 甲方 JSON TestReport 格式 | 硬编码内部格式 | 甲方确认后 |
| O2 | report 文件存储路径 | platform facade 默认路径 | settings feature 就绪后 |
| O3 | result 内存 state 是否持久化 | MVP 不持久化，断电丢失 | 有需求时加 |
| O4 | task 多次执行同一 definition 的结果展示 | 用 task history selector | UI 页面设计时 |
| O5 | SCOE 外部命令结果与手动 task 结果是否需要区分 | 不区分，统一走 task → result | northbound 设计时 |

## 4. 给下一阶段的输入

### 4.1 Lane A 实施可直接使用的清单

1. 创建 `rewrite/src/features/result/` 目录结构（core/ + services/ + state/ + index.ts）
2. 实现 `result/core/judge.ts`：`judgeCaseVerdict` 纯函数 + 单测
3. 实现 `result/state/result-state.ts`：内存 map 存储 verdict
4. 实现 `result/services/result-service.ts`：`collectResult(instance)` 入口
5. 实现 `result/selectors/`：暴露只读快照
6. 创建 `rewrite/src/features/report/` 最小目录结构
7. 实现 `report/core/generate.ts`：`generateReport` + `mapToOutputFormat`
8. 在 runtime 层加 task 终态 → result 收集的编排 wiring
9. 单测 + lint + build 验证

### 4.2 从已有 design 可复用的部分

- §3 Evidence summary（事实证据）
- §4.6 result → storage 交互（未来扩展参考）
- §4.7 result → report 交互（API 边界参考）
- §4.9 测试策略（fixture 思路）

### 4.3 从已有 design 不复用的部分

- CaseResult 独立类型 → 改为 TaskExecutionSummary + 纯函数
- TaskResultSummary 聚合 → 砍掉
- ResultReadModel → 砍掉
- ResultAggregationRule 可配置策略 → 改为硬编码规则
- TaskInstanceCompletion 事件 → 改为 onSettled + runtime 编排
