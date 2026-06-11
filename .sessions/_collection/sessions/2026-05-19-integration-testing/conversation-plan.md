# 集成测试：完整对话规划 + 提示词

> 7 轮对话，5 轮可并行，总计约 60 个子 agent

## 并行关系

```
对话 1（历史）──┐
对话 2（feature 上）──┤
对话 3（feature 下）──┼──→ 对话 6（综合）──→ 对话 7+（实施）
对话 4（旧代码）──┤
对话 5（新代码接缝）──┘
```

对话 1-5 完全独立，可以同时开 5 个 Claude Code 对话并行跑。对话 6 等前 5 个全部完成后再开。

---

## 对话 1：历史讨论提取

**专题文件**：`.sessions/2026-05-19-integration-testing/S001-historical-extraction.md`
**Agent 数**：12 个，4 批 × 3

### 提示词

```
## 任务

调研 rewrite 项目中集成测试的验收承诺现状，从 26 天的历史讨论记录中提取所有验收标准、已知缺口和测试期望，产出事实报告，不做任何设计或实施。

## 调研范围

1. 每个阶段（S001-S015）承诺了什么验收标准？
2. 哪些验收标准有单测证据（列具体 tests 数量和文件名）？
3. 哪些验收标准只有"已通过"结论但无具体测试证据？
4. 所有标记为 known-gaps / deferred / 推迟 / 待后续 的条目
5. 所有涉及"真实硬件验证"、"runtime validation"、"端到端"的提及
6. 跨 feature 交互中哪些只在集成时才出现（单元测不到的接缝）

## 子 agent 策略

4 批，每批 3 个 agent 并行。

### 批次 1

#### Agent 1：S001 + S002（架构奠基 + 基础 feature）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S001-architecture-codestable-foundation.md`、`S002-first-features-and-review.md`
- 回答：
  1. S001 的 16 条质量红线（R1-R16）中，哪些直接要求集成测试级别的验证？
  2. S001 第 10 节"Northbound 独立定位"中的所有"不得"项，哪些需要集成测试证明合规？
  3. S002 的 7 个基础 feature 各自的 Verdict 和具体 tests 数量？
  4. 交叉审查 M1（ReadonlyDeep 重复）修复后的验证证据？
  5. Send/Task/SCOE/Result 的 design 完成后，验收标准具体是什么？

#### Agent 2：S003 + S004（三线并行 + 密集讨论日）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S003-send-bridge-scoe-three-lanes.md`、`S004-task-service-settings-runtime-wiring.md`
- 回答：
  1. S003 三线并行各自的验收证据是什么？Bridge Phase 1-3 的 pass-with-known-gaps 具体 gaps？
  2. S003 执行引擎统一决策的 6 项（D1-D6），哪些有测试证明、哪些只有文档？
  3. S004 的 19 个对话中，task service 层实现修复了哪些 bug？这些 bug 是否暗示集成缺陷？
  4. S004 settings 完整闭环的验证方式？Runtime wiring 三连的测试覆盖？
  5. S004 架构文档 34 处同步，是否引入了文档-代码不一致风险？

#### Agent 3：S005 + S014（架构审计 + 主控对话）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S005-receive-real-design-and-audit.md`、`S014-runtime-real-master-control.md`
- 回答：
  1. S005 的 6 维度审计结果：1 违规 + 10 风险的具体内容，哪些需要集成测试覆盖？
  2. S005 旧系统三线调研发现了什么？新旧覆盖矩阵中 P0/P1/P2 缺口是什么？
  3. S014 主控对话 7 阶段每个阶段留下的未决项？
  4. S014 阶段 6（事件恢复）中丢失的 14 个文件，恢复后是否全部验证？
  5. S014 阶段 7 的进度盘点，哪些 feature 声称 100% 完成但缺少 runtime 证据？

### 批次 2

#### Agent 4：S007（Real Feature 实施期）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S007-real-feature-implementation.md`
- 回答：
  1. Expression Engine 112 tests 覆盖了什么能力？没覆盖什么（特别是集成到 receive/send/task 时）？
  2. Frame-real 验收中"L2 消费者测试通过（receive 9 pass + runtime 28 pass）"具体指什么？
  3. Receive-real Phase 1-4 各阶段的测试数量？Phase 4 背压测试的验证方式？
  4. Platform-network-transport 的 9 条 acceptance criteria 中，AC1-AC3 需要"手动网络验证"具体指什么？
  5. Connection 580+ tests 和 Send-real 100 tests 是单元级还是集成级？
  6. Task-real brainstorm 和 Command-ingress brainstorm 锁定的设计决策，哪些还没实现？

#### Agent 5：S008（Feature 验收期）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S008-feature-acceptance-and-command-ingress.md`
- 回答：
  1. Task-real Phase 1 验收 PASS 的证据？Phase 2 验收 PASS-WITH-KNOWN-GAPS 的 known-gaps？
  2. Task-real 间歇性测试失败的根因？30-40% 套件间歇性失败是否已解决？
  3. Command-ingress W1/W2/W3 各波的测试数量？W2 中 CRITICAL 修复是否需要回归保护？
  4. Command-ingress 验收 PASS 时 803 tests 是否包含跨 feature 集成？
  5. Receive-real 最终验收的 globalParams 推迟，对集成测试的影响？
  6. Storage-real 的 6 个外部依赖 gap 具体是什么？

#### Agent 6：S009 + S010（简化 + 测试修复）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S009-simplification-audit-and-ui-design.md`、`S010-test-fix-send-task-simplification.md`
- 回答：
  1. 代码简化审计 5 个 feature 的发现：clone 重复、selector 死 surface、validation 重复——这些简化是否引入回归风险？
  2. Send/Task 简化实施的 S-S1~S-S3、T-S1~T-S2 是否全部完成？
  3. S010 的 66 个测试失败根因分析？修复后哪些还没跑通？
  4. S010 第 76 行列出的 7 项待验证风险，当前状态？
  5. Receive processor 中间状态（unused import）是否已清理？

### 批次 3

#### Agent 7：S011 上半（Wave 0-4 + 审计）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S011-ui-infrastructure-and-pages.md`（重点 05-13 部分）
- 回答：
  1. Wave 0 Task 类型重组 30 项，是否全部有测试？
  2. Wave 1-3 expression 集成到 receive 的验证方式？
  3. Wave 4 基础设施中 connection selectors dead surface 删除（142 行），是否导致回归？
  4. 设计-代码对齐审计发现的 8 个不一致，修复后是否验证？

#### Agent 8：S011 下半（6 页面 + 审计修复）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S011-ui-infrastructure-and-pages.md`（重点 05-15 部分）
- 回答：
  1. 85 文件大提交后 build/lint/test 的具体结果？
  2. 47 项 UI 审计中 P0 的 3 项（任务编辑弹窗拆分、发送编辑弹窗加 QForm、CI 高亮弹窗 @hide 清理）是否影响数据通路？
  3. Service 完成度调查确认"10 个 feature service 层全部 100%"——证据是什么？逐个 feature 列出？
  4. SendPage P0 Bug（direction 值错误）修复后是否有回归测试？

#### Agent 9：S012 + S015（持久化 + 集测起点）
- 读：`.sessions/2026-04-23-rewrite-main-thread/S012-persistence-and-process-organization.md`、`S015-integration-testing.md`
- 回答：
  1. LazyPersistence 模式在什么场景下数据会丢？（启动中崩溃、save 时机未设计）
  2. RealLocalMaterialAdapter 软删除策略（写 .deleted 文件）是否测试过？
  3. 只实现了 frames 的启动加载，connections 和 settings 的恢复状态？
  4. S015 已列的 10 个集测维度，是否有遗漏或多余？

### 批次 4

#### Agent 10：质量规则中的测试要求
- 读：`codestable/quality/rewrite-quality-rules.md`（全文）
- 回答：
  1. §8 Minimum Test Expectations 列出的 9 项优先 fixture，每一项的当前覆盖状态？
  2. §9 Quality Gate 的实施前/中/后检查项，哪些是集成测试级别才能覆盖的？
  3. §10 Current Evidence Notes 中的 8 条旧代码事实，哪些需要在集成测试中证明"新系统已消灭"？

#### Agent 11：审查清单中的验证层级
- 读：`codestable/quality/rewrite-review-checklist.md`（重点 §8 高频数据、§9 Receive/Send、§14 Oracle）
- 回答：
  1. §14 的 10 级验证 taxonomy 中，rewrite 项目当前覆盖到了哪几级？
  2. §8 高频数据 checklist 中的每一项，是否需要真 TCP 集成测试？
  3. §9 Receive/Send checklist 中的 red flags，新系统是否真正避免了每一个？

#### Agent 12：H002 TCP 接线验证状态
- 读：`.sessions/2026-04-23-rewrite-main-thread/H002-local-tcp-loopback-handoff.md`、`rewrite/src/features/connection/adapters/composite-adapter.ts`、`rewrite/src/app/rewriteRuntime.ts`
- 回答：
  1. Composite adapter 的实现是否完整？哪些边界情况没覆盖？
  2. Bootstrap 同时创建 serial + network adapter 后，wireFeatures 是否正确路由？
  3. fanOutToStorage 调用加了之后，storage bridge 是否真正写入数据？
  4. 有没有实际跑过 TCP 环路的证据？

## 汇报要求

- 中文，facts-first
- 每条发现标注来源 note 编号和段落
- 不确定标注"待确认"
- 最终产出写入 `.sessions/2026-05-19-integration-testing/S001-historical-extraction.md`
```

---

## 对话 2：Feature 设计文档提取（上）

**专题文件**：`.sessions/2026-05-19-integration-testing/S002-feature-designs-upper.md`
**Agent 数**：9 个，3 批 × 3

### 提示词

```
## 任务

调研 rewrite 项目中 5 个核心 feature 的设计文档，提取所有验收标准、跨 feature 交互契约和测试期望，产出事实报告，不做任何设计或实施。

## 调研范围

从 codestable/features/ 下的 design.md + checklist.yaml（如有 brainstorm.md 也读）提取：
1. 每个 feature 的验收标准原文
2. 跨 feature 交互契约（依赖哪些 feature、被哪些 feature 消费）
3. checklist 中的测试项
4. 已标注的 known-gaps 和 deferred 项

## 子 agent 策略

3 批，每批 3 个 agent 并行。

### 批次 1

#### Agent 1：frame feature
- 读：`codestable/features/rewrite-frame/` 下所有 .md 和 .yaml
- 读：`codestable/features/rewrite-frame-real/` 下所有 .md 和 .yaml（如存在）
- 读：`rewrite/src/features/frame/index.ts`（public API surface）
- 回答：
  1. frame design 的验收标准逐条列出
  2. frame 被哪些 feature 消费？消费方式（通过 public API 还是通过其他方式）？
  3. frame-real design 的增量验收标准？
  4. checklist 中标注的测试项，哪些已实现、哪些未实现？
  5. 帧定义全局唯一约束在设计层面如何保证？集成测试能否验证？

#### Agent 2：connection feature
- 读：`codestable/features/rewrite-connection/` 下所有 .md 和 .yaml
- 读：`codestable/features/rewrite-connection-complete/` 下所有 .md 和 .yaml（如存在）
- 读：`rewrite/src/features/connection/index.ts`
- 回答：
  1. connection design 的验收标准逐条列出
  2. connection 与 platform/transport 的交互契约？
  3. connection-complete 的增量验收标准？
  4. TCP/UDP 连接的 lifecycle 设计，哪些状态转换需要集成测试？
  5. composite adapter 加入后，设计文档是否需要更新？

#### Agent 3：receive feature
- 读：`codestable/features/rewrite-receive/` 下所有 .md 和 .yaml
- 读：`codestable/features/receive-real-pipeline/` 下所有 .md 和 .yaml（如存在）
- 读：`rewrite/src/features/receive/index.ts`
- 回答：
  1. receive design 的验收标准逐条列出
  2. receive-real-pipeline roadmap 的各阶段验收标准？
  3. receive 消费 frame 的方式？与 expression engine 的集成契约？
  4. 扇出到 display/storage/task 的设计，每个扇出路径的验收条件？
  5. globalParams 收集推迟的影响范围？

### 批次 2

#### Agent 4：send feature
- 读：`codestable/features/rewrite-send/` 下所有 .md 和 .yaml
- 读：`codestable/features/send-real/` 下所有 .md 和 .yaml（如存在）
- 读：`rewrite/src/features/send/index.ts`
- 回答：
  1. send design 的验收标准逐条列出
  2. send-real design 的 9 步 pipeline 验收标准？
  3. send 与 connection 的交互契约（transportWriter、targetResolver）？
  4. send 与 frame 的交互契约（frameReader）？
  5. checksum/patch 的边界情况（CRC32、length field backfill）需要什么级别的测试？

#### Agent 5：expression engine
- 读：`codestable/features/2026-05-08-expression-engine/` 下所有 .md 和 .yaml
- 读：`rewrite/src/shared/expression/index.ts`
- 读：`rewrite/src/shared/expression/__tests__/` 下所有 spec 文件名（不需要读内容，只看测试覆盖了哪些模块）
- 回答：
  1. expression engine design 的验收标准逐条列出
  2. 112 tests 覆盖了哪些能力？（从 spec 文件名推断）
  3. expression 集成到 receive/send/task 时的契约变化？
  4. 性能要求（P1/P2）的具体数值和当前验证状态？
  5. shared/ 纯 TS 约束的验证方式？

#### Agent 6：runtime wiring
- 读：`codestable/features/2026-05-07-runtime-wiring/` 下所有 .md 和 .yaml
- 读：`rewrite/src/runtime/index.ts`、`rewrite/src/runtime/feature-wiring.ts`
- 回答：
  1. runtime wiring design 的验收标准逐条列出
  2. event-driven 架构（routingTick）的验收条件？
  3. 5 条缺失数据通路的修复状态？
  4. runtime 与各 feature 的装配契约（wireFeatures 接口）？
  5. routingTick 预算截断的验收条件？

### 批次 3

#### Agent 7：settings feature
- 读：`codestable/features/rewrite-settings/` 下所有 .md 和 .yaml
- 读：`rewrite/src/features/settings/index.ts`
- 回答：
  1. settings design 的验收标准逐条列出
  2. settings 作为 7 个下游 feature 的配置输入源，契约是什么？
  3. normalize/validation 的测试覆盖？
  4. 持久化集成状态？

#### Agent 8：storage-local-baseline feature
- 读：`codestable/features/rewrite-storage-local-baseline/` 下所有 .md 和 .yaml
- 读：`rewrite/src/features/storage-local-baseline/index.ts`
- 回答：
  1. storage design 的验收标准逐条列出
  2. adapter port 模式的验证？
  3. RealLocalMaterialAdapter 的验证状态？
  4. 与 platform file facade 的集成契约？
  5. 6 个外部依赖 gap 具体是什么？

#### Agent 9：display + status features
- 读：`codestable/features/rewrite-display/` 下所有 .md 和 .yaml
- 读：`codestable/features/rewrite-status/` 下所有 .md 和 .yaml
- 读：`rewrite/src/features/display/index.ts`、`rewrite/src/features/status/index.ts`
- 回答：
  1. display design 的验收标准？特别是 table/chart/constellation projection
  2. status design 的验收标准？
  3. 身份标识统一（groupId→frameId, dataItemId→fieldId）的实施状态？
  4. display 与 receive 的扇出 bridge 验收？

## 汇报要求

- 中文，facts-first
- 每条发现标注来源文件路径和段落
- 不确定标注"待确认"
- 最终产出写入 `.sessions/2026-05-19-integration-testing/S002-feature-designs-upper.md`
```

---

## 对话 3：Feature 设计文档提取（下）

**专题文件**：`.sessions/2026-05-19-integration-testing/S003-feature-designs-lower.md`
**Agent 数**：9 个，3 批 × 3

### 提示词

```
## 任务

调研 rewrite 项目中 task/command-ingress/result/report 四个 feature 的设计文档，提取所有验收标准、跨 feature 交互契约和测试期望，产出事实报告。

## 子 agent 策略

3 批，每批 3 个 agent 并行。

### 批次 1

#### Agent 1：task feature（核心）
- 读：`codestable/features/rewrite-task/` 下所有 .md 和 .yaml
- 读：`rewrite/src/features/task/index.ts`
- 回答：
  1. task design 的验收标准逐条列出（通用执行引擎定位）
  2. ScheduleDriver 4 种模式的验收条件？
  3. step 多态化（send-step/wait-condition-step/delay-step）的验收？
  4. condition-matcher 的 AND/OR 组合验证？
  5. task 与 send/receive 的交互契约（ports 依赖注入）？

#### Agent 2：task-real design
- 读：`codestable/features/rewrite-task/task-real-design.md`（如存在）
- 读：`rewrite/src/features/task/core/types.ts`（看 ScheduleDriver/ConditionTerm 等新类型）
- 回答：
  1. task-real 的详细设计验收标准？
  2. Phase 1（类型+条件）和 Phase 2（统一引擎）各自的 checklist？
  3. FieldVariation + StepRepeat 的验收条件？
  4. TimerService port 的设计？
  5. 间歇性测试失败的根因和解决方案？

#### Agent 3：command-ingress feature
- 读：`codestable/features/rewrite-command-ingress/` 下所有 .md 和 .yaml
- 读：`rewrite/src/features/command-ingress/index.ts`
- 回答：
  1. command-ingress design 的验收标准逐条列出
  2. SCOE protocol adapter（两阶段状态机）的验收？
  3. 6 种 handler 的验收条件？
  4. TaskBuilder 的翻译逻辑验收（ScoeCommand → TaskDefinition）？
  5. 消费者链（routingTick integration）的验收？

### 批次 2

#### Agent 4：command-ingress 详解
- 读：`rewrite/src/features/command-ingress/core/protocol-adapter.ts`
- 读：`rewrite/src/features/command-ingress/core/task-builder.ts`
- 读：`rewrite/src/features/command-ingress/__tests__/scoe-protocol-adapter.spec.ts`（只看 describe 块和 it 块的描述）
- 回答：
  1. 协议解析的测试覆盖了哪些功能码？
  2. TaskBuilder 翻译了哪些命令类型？每种类型的测试？
  3. 迁移脚本的验证覆盖？

#### Agent 5：result + report features
- 读：`codestable/features/rewrite-result/` 下所有 .md 和 .yaml
- 读：`codestable/features/rewrite-report/` 下所有 .md 和 .yaml（如存在）
- 读：`rewrite/src/features/result/index.ts`、`rewrite/src/features/report/index.ts`
- 回答：
  1. result design 的验收标准？
  2. Result/Report/Northbound 三层分离的验证？
  3. TaskInstanceCompletion 作为唯一素材入口的验证？
  4. report feature 的设计状态（是否已有 design.md）？

#### Agent 6：northbound feature
- 读：`codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`
- 读：`.sessions/2026-05-18-northbound-integration/` 下所有文件（如果有）
- 回答：
  1. northbound 的 gap 清单？
  2. 甲方 4 接口闭环决策的具体内容？
  3. 哪些 northbound 能力需要在集成测试中覆盖？
  4. MVP 6 接口的状态？

### 批次 3

#### Agent 7：跨 feature 交互矩阵
- 读：`codestable/architecture/rewrite-feature-interaction-matrix.md`（如存在）
- 读：`codestable/architecture/rewrite-feature-boundaries.md`
- 回答：
  1. 所有 feature 之间的交互路径？
  2. 哪些交互路径有测试覆盖、哪些没有？
  3. 哪些交互是 runtime 编排（bridge）、哪些是直接 public API 调用？

#### Agent 8：统一执行引擎决策
- 读：`codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
- 读：`codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`
- 回答：
  1. 统一执行引擎 6 项决策各自的验证方式？
  2. 出站路由 4 个决策的验证？
  3. 三条出站路径（用户/SCOE/Northbound）的集成测试需求？

#### Agent 9：旧系统调研事实
- 读：`codestable/compound/2026-05-07-old-system-investigation-scoe-expression-visualization.md`（如存在）
- 回答：
  1. 旧 SCOE 的 22 文件功能清单中哪些行为必须保留？
  2. 旧表达式引擎的 1385 行中哪些行为必须保留？
  3. 旧可视化 1074 行中哪些行为必须保留？

## 汇报要求

- 中文，facts-first
- 每条发现标注来源文件路径和段落
- 不确定标注"待确认"
- 最终产出写入 `.sessions/2026-05-19-integration-testing/S003-feature-designs-lower.md`
```

---

## 对话 4：旧系统可观测行为提取

**专题文件**：`.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md`
**Agent 数**：9 个，3 批 × 3

### 提示词

```
## 任务

调研 rewrite 项目的旧系统代码，提取所有必须保留的可观测业务行为，作为集成测试的 oracle 来源。产出事实报告。

## 调研范围

从旧代码（`src/`）中提取：
1. 旧系统的用户可见行为（页面操作、数据流、定时任务、SCOE 命令等）
2. 每个行为在新系统中的对应 feature
3. 可作为 oracle 的旧代码位置
4. 保留/排除建议

## 子 agent 策略

3 批，每批 3 个 agent 并行。

### 批次 1

#### Agent 1：旧 receive/send 数据流
- 读：`src/stores/frames/receiveFramesStore.ts`（重点看数据流入、解析、统计、触发逻辑）
- 读：`src/composables/frames/sendFrame/useUnifiedSender.ts`（发送流程）
- 回答：
  1. 旧 receive 的完整数据流路径（从串口/网络收到字节 → 解析 → 展示 → 触发）？
  2. 旧 send 的完整流程（从用户点击 → 构帧 → 发送 → 结果）？
  3. receiveFramesStore 承载了哪些不应该在一个 store 里的职责？
  4. useUnifiedSender 的 SCOE UDP target 特判具体逻辑？
  5. 这些行为的 oracle 来源（可以录制的输入输出样本）？

#### Agent 2：旧 SCOE/task 执行
- 读：`src/stores/scoeStore.ts`（配置 + 状态 + 连接 + 发送 + 测试工具）
- 读：`src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue`（定时发送）
- 读：`src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue`（触发发送）
- 回答：
  1. 旧 SCOE 的完整命令处理流程（接收 → 解析 → 执行 → 确认）？
  2. 旧定时发送的完整流程？
  3. 旧触发发送的条件判断逻辑？
  4. SCOE 测试工具的录制/回放行为？
  5. 这些行为的 oracle 来源？

#### Agent 3：旧连接管理
- 读：`src/stores/serialStore.ts`（串口连接生命周期）
- 读：`src/stores/netWorkStore.ts`（网络连接生命周期）
- 读：`src-electron/main/ipc/networkHandlers.ts`（main 进程网络处理）
- 回答：
  1. 旧串口连接的完整生命周期（打开 → 配置 → 收发 → 断开 → 重连）？
  2. 旧 TCP/UDP 连接的完整生命周期？
  3. 旧网络接收中的高速存储分流逻辑？
  4. 连接状态在 UI 上的展示行为？
  5. 这些行为的 oracle 来源？

### 批次 2

#### Agent 4：旧表达式/解析
- 读：`src/utils/expressionEngine.ts`（如存在）或 grep 找到旧表达式引擎代码
- 读：`src/utils/frames/frameParser.ts`（如存在）或 grep 找到旧帧解析代码
- 回答：
  1. 旧表达式引擎的核心行为？（求值、依赖排序、缓存）
  2. 旧帧解析的核心行为？（字节到字段、applyFactor）
  3. 旧条件判断的核心行为？（AND/OR 组合、触发条件）
  4. 有哪些旧配置文件样本可以作为 oracle？

#### Agent 5：旧存储/历史/CSV
- 读：`src/stores/historyDataStore.ts`（如存在）
- 读：旧 CSV 导出/导入相关代码
- 回答：
  1. 旧历史数据的存储和查询行为？
  2. 旧 CSV 导出的格式和行为？
  3. 旧数据导入的行为？
  4. 这些在新系统中的对应 feature？

#### Agent 6：旧帧定义管理
- 读：`src/stores/frames/framesConfigStore.ts`（如存在）
- 读：`src/stores/frames/frameInstanceStore.ts`（如存在）
- 回答：
  1. 旧帧定义的 CRUD 行为？
  2. 旧帧实例的管理行为？
  3. 旧帧导入/导出的格式和行为？
  4. 旧 JSON 格式与新格式的差异？

### 批次 3

#### Agent 7：旧状态展示
- 读：旧状态指示、健康检查相关代码
- 回答：
  1. 旧连接状态指示的具体展示行为？
  2. 旧健康检查的行为？
  3. 旧统计展示的行为？

#### Agent 8：旧设置/配置
- 读：旧设置相关 store 或配置文件
- 回答：
  1. 旧系统的配置项完整清单？
  2. 每个配置项在新系统中的对应？
  3. 配置持久化的旧行为？

#### Agent 9：旧系统页面入口完整清单
- 读：`src/router/` 下路由配置
- 读：旧系统侧边栏/导航组件
- 回答：
  1. 旧系统所有页面入口和路由？
  2. 每个入口在新系统中的对应路由？
  3. 是否有入口在新系统中缺失？

## 汇报要求

- 中文，facts-first
- 每条行为标注旧代码位置（文件:行号）
- 每条行为标注新系统对应 feature
- 标注 oracle 来源（代码位置/配置文件样本/截图/可录制）
- 最终产出写入 `.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md`
```

---

## 对话 5：新系统接缝审计

**专题文件**：`.sessions/2026-05-19-integration-testing/S005-new-system-seam-audit.md`
**Agent 数**：9 个，3 批 × 3

### 提示词

```
## 任务

调研 rewrite 项目新系统的 runtime 接缝、adapter 边界和持久化时序，识别所有集成级别的断裂风险。产出事实报告。

## 调研范围

从 rewrite/src/runtime/、features/*/adapters/、features/*/services/ 中识别：
1. 所有 bridge 的数据流向和可能的断裂点
2. composite adapter 的边界情况
3. persistence 的时序风险
4. routingTick 的竞态和背压风险

## 子 agent 策略

3 批，每批 3 个 agent 并行。

### 批次 1

#### Agent 1：所有 bridge 文件逐个审计
- 读：`rewrite/src/runtime/bridges/` 下所有 .ts 文件
- 对每个 bridge 回答：
  1. 接收什么输入、产出什么输出
  2. 输入为空时的行为
  3. 下游失败时的错误传播
  4. 高频数据下的缓冲/节流机制
  5. 需要什么集成测试覆盖

#### Agent 2：composite adapter + real adapters 审计
- 读：`rewrite/src/features/connection/adapters/composite-adapter.ts`
- 读：`rewrite/src/features/connection/adapters/real-network-adapter.ts`
- 读：`rewrite/src/features/connection/adapters/real-serial-adapter.ts`
- 回答：
  1. composite adapter 的 config.kind 路由是否覆盖所有 TransportKind？
  2. serial adapter 不可用时，serial 连接的错误行为？
  3. network adapter 的 TCP server/client 模式差异？
  4. UDP write 无 remoteHost/remotePort 时的错误行为？
  5. drainEvents() 的批量行为和可能的竞态？

#### Agent 3：platform facade + main handlers 审计
- 读：`rewrite/src/platform/transport.ts`
- 读：`rewrite/src-electron/main/network-handlers.ts`
- 读：`rewrite/src-electron/preload/index.ts`（transport 部分）
- 回答：
  1. platform facade 的缓存/单例行为？
  2. main TCP server 的 client 连接/断开事件传播？
  3. preload IPC 的 serial vs network 路由逻辑？
  4. 批量传输的 batch 参数和窗口行为？

### 批次 2

#### Agent 4：routingTick 数据流审计
- 读：`rewrite/src/runtime/routing-tick.ts`
- 读：`rewrite/src/runtime/__tests__/helpers.ts`（看 mock 结构）
- 回答：
  1. drainAdapterEvents → filter data → drainInputSource → fanOut 的完整链路
  2. 100ms 间隔下的背压风险？如果一次 drain 产出大量事件会怎样？
  3. maxEventsPerTick=50 截断后，被截断的事件是否丢失？
  4. receiveService.drainInputSource 的内部行为（同步还是异步、是否缓冲）？
  5. fanOutToDisplay 和 fanOutToStorage 的错误隔离？

#### Agent 5：feature service 交互接缝
- 读：`rewrite/src/features/send/services/send-service.ts`（看 transportWriter 和 targetResolver 调用点）
- 读：`rewrite/src/features/task/services/task-service.ts`（看 sendService 和 receiveEventSource 调用点）
- 读：`rewrite/src/features/command-ingress/services/command-ingress-service.ts`（看 taskService 和 sendService 调用点）
- 回答：
  1. send-service 调用 transportWriter.write 时的错误传播？
  2. task-service 调用 sendService.execute 后的结算逻辑？
  3. command-ingress-service 创建 task 后的监控逻辑？
  4. 这些 service 间交互的集成测试缺口？

#### Agent 6：persistence 时序审计
- 读：`rewrite/src/runtime/persistence.ts`
- 读：`rewrite/src/app/rewriteRuntime.ts`（LazyPersistence 部分）
- 回答：
  1. LazyPersistence setDelegate 前后的行为差异？
  2. load() 并发读三个文件的错误隔离？
  3. save*() 系列方法的触发时机？（当前只有手动）
  4. frames 启动加载后 replaceFrames 的副作用？
  5. connections 和 settings 的启动恢复缺失的影响？

### 批次 3

#### Agent 7：connection service lifecycle 审计
- 读：`rewrite/src/features/connection/services/` 下所有 .ts 文件
- 回答：
  1. connect → connected → data flow → disconnect 的完整生命周期
  2. reconnect 机制的当前状态？
  3. 多连接并发时的 adapter 共享行为？
  4. autoConnect 的实现状态？

#### Agent 8：receive pipeline 接缝审计
- 读：`rewrite/src/features/receive/core/processor.ts`
- 读：`rewrite/src/features/receive/core/expression-pass.ts`
- 回答：
  1. processor 的完整处理链（match → parse → expression → output）
  2. expression pass 失败时的错误传播？
  3. read model 更新频率和竞态风险？

#### Agent 9：现有集成测试覆盖审计
- 读：`rewrite/src/runtime/__tests__/feature-wiring.spec.ts`（看测试了什么）
- 读：`rewrite/src/runtime/__tests__/routing-tick.spec.ts`（看 mock 了什么）
- 读：`rewrite/src/runtime/__tests__/bootstrap-integration.spec.ts`
- 回答：
  1. 现有 runtime 测试覆盖了哪些集成场景？
  2. mock 替代了哪些真实依赖？
  3. 哪些 mock 在真实环境下行为可能不同？
  4. 给出"现有测试已覆盖"和"需要新集成测试"的分界线

## 汇报要求

- 中文，facts-first
- 每条发现标注文件路径和行号
- 对每个接缝给出风险等级（高/中/低）和建议的测试类型
- 最终产出写入 `.sessions/2026-05-19-integration-testing/S005-new-system-seam-audit.md`
```

---

## 对话 6：综合 + 排除 + 优先级（等 1-5 全部完成后）

**专题文件**：`.sessions/2026-05-19-integration-testing/S006-test-scope-synthesis.md`
**Agent 数**：1-2（本对话以主线程综合为主）

### 提示词

```
## 任务

综合 S001-S005 所有提取结果，去重、排除已有单测覆盖的项、分级优先级，产出最终集测范围清单。

## 必读

1. `.sessions/2026-05-19-integration-testing/S001-historical-extraction.md`
2. `.sessions/2026-05-19-integration-testing/S002-feature-designs-upper.md`
3. `.sessions/2026-05-19-integration-testing/S003-feature-designs-lower.md`
4. `.sessions/2026-05-19-integration-testing/S004-legacy-observable-behaviors.md`
5. `.sessions/2026-05-19-integration-testing/S005-new-system-seam-audit.md`

## 排除规则

以下条目排除出集测清单：
- 已有 815+ 单测覆盖的 feature 内部逻辑
- 纯 UI 展示/样式问题（归 manual checklist）
- 涉及真实串口/SCOE 硬件的验证（归 hardware validation）
- 涉及甲方 northbound HTTP/FTP 的验证（归 customer validation）

## 产出格式

每条集测项含：
- ID（T001, T002...）
- 标题
- 覆盖的 feature 列表
- 测试类型：真 TCP / fake adapter / Vitest 集成 / manual checklist
- 优先级：P0（数据通路核心）/ P1（重要接缝）/ P2（边界情况）
- 依赖：需要哪些前置条件
- oracle 来源：从 S004 中引用
- 对应的质量规则条目（R1-R16）

## Lane 判定

Lane B：综合分析任务，产出一份文档，单对话可完成。
```

**状态：✅ 完成。** 产出 36 条集测项（P0×10 + P1×12 + P2×14），后续追加计划（功能完善 9 项 + northbound 6 项 + 硬件 4 项），实施对话规划 6 个对话。详见 S006 §十、§十一。

---

## 对话 7-12：集测实施

**详细规划**：见 S006-test-scope-synthesis.md §十一（集测实施对话规划）

每个对话**必须**在开始前读完以下内容再写测试：
1. 通用必读：quality-rules + target-structure + S006（直接合同）+ S005（接缝详情）
2. 按 feature 追加的 feature design 文档
3. 本专题的 topic-index.md 和前序对话完成状态

### 对话 7：Batch 0 修复 + Batch 1-A（T006, T007, T008, T016d, T024g）— ✅ 完成
### 对话 8：Batch 1-B（T009, T010, T011, T014, T015）
### 对话 9：Batch 1-C + Batch 2-A（T019, T021, T022, T024e, T001, T001b, T001c）
### 对话 10：Batch 2-B（T003, T002, T016b, T016c, T016e）
### 对话 11：Batch 3（T004, T005, T012, T013, T016）
### 对话 12：Batch 4（T017, T018, T020, T023, T024, T024b, T024c, T024d, T024f）

### 提示词模板（每轮复用）

```
## 任务

按 S006 集测范围清单实施第 N 批集成测试。

## 直接合同

- `.sessions/2026-05-19-integration-testing/S006-test-scope-synthesis.md`
- 本批覆盖的测试项：{列出 T### 编号}

## 边界护栏

- `codestable/quality/rewrite-quality-rules.md`
- `codestable/architecture/rewrite-target-structure.md`

## 实施前检查

1. 直接合同已列出
2. 覆盖旧系统可观测行为：{从 S004 引用}
3. 涉及 feature 归口：{列出}
4. 外部只通过 public API：确认
5. 涉及 Electron/preload/main：否（Vitest 中用 Node net/dgram）
6. 涉及 SCOE/northbound/高速数据：{是/否}
7. 验证方式：pnpm build + pnpm lint + pnpm test

## 实施规则

- TCP 测试用 Node `net` 模块，参考 `connection-network-adapter.spec.ts` 模式
- 不引入新依赖，只用 Vitest + Node 内置模块
- 测试文件放在 `rewrite/src/__tests__/integration/` 下
- 每个测试文件覆盖 1-3 个相关测试项
- 测试必须可重复运行，不依赖外部服务

## 子 agent 策略

{根据本批具体测试项拆分}

## 使用 skill

cs-feat-impl
```
