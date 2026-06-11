# 集成测试体系建立

> 状态: dormant | 时间跨度: 2026-05-19 ~ 2026-05-20 | 最后更新: 2026-05-20 (对话 13 收尾)

## 目标

为 rewrite 系统建立集成测试体系。输入来源：26 天的讨论记录、10+ feature 设计文档、旧系统可观测行为、新系统实际代码。产出：结构化集测清单 + 可执行的端到端测试。

## 进展线索

- **S001** 历史讨论提取 — 12 个 agent 并行提取完成，合并报告已写入
  - 核心发现：835 tests 全部单元级+fake adapter级，零跨 feature 集成测试；十级验证 taxonomy 覆盖 Level 1-3 充分、Level 6-10 零覆盖
  - P0 缺口：端到端数据通路（6 条链路无测试）、Selector 不可变性（5 个 feature 浅拷贝）、持久化层（无自动 save + 软删除 bug + 恢复空转）、Composite Adapter（null dereference + 无测试）
  - P1 缺口：6 条 Feature 间接缝、6 项 Quality Gate 检查、条件匹配一致性、globalParams 推迟、文档-代码 drift
  - 13 项待确认需综合阶段核实
- **S002** Feature 设计文档提取 — 从 codestable/features/ 下所有 design.md + checklist.yaml 提取验收标准和跨 feature 交互契约
  - 对话 2 完成（上）：9 个 agent 覆盖 frame/connection/receive/send/expression-engine/runtime-wiring/settings/storage-local-baseline/display/status。关键发现：expression engine 最完整（29 条验收+性能已验证）、frame-real 6/6 done、storage 验证全部 pending、routingTick 是核心集成接缝、globalParams 推迟影响全局统计依赖、身份标识统一未完成（display/status 仍在用 groupId/dataItemId）
  - 对话 3 完成（下）：9 个 agent 覆盖 task/task-real/command-ingress/result-report/northbound/执行引擎/出站路由/feature 交互矩阵/旧系统行为。关键发现：task 70+ 单测覆盖充分但 Phase 2 类型重组未实施、command-ingress 25/25 checklist 全 done、result 有设计偏离（事件机制改 onSettled、类型大幅简化）、report 无独立 design、northbound 大部分能力未实现、43 条 feature 交互路径零集成测试覆盖、16 个 P0/P1/P2 集成测试接缝已识别
- **S003** 旧系统可观测行为提取 — 从旧代码提取必须保留的可观测行为，作为 oracle 来源
  - 对话 4 完成：9 agent 并行（3 批 × 3），覆盖 receive/send/SCOE/task/连接/表达式/解析/存储/历史/CSV/帧定义/状态指示/设置/路由
  - 核心发现：~236 条可观测行为，~194 条保留，~33 条排除，~9 条需重新设计
  - 3 个旧页面在新系统缺失（存储管理、历史分析、系统设置）
  - SCOE 命令执行运行时链路在 renderer 侧未找到完整实现
  - 高速存储分流是关键架构决策（匹配数据不转发渲染进程）
  - 11 项旧系统已知缺陷标记为不复制
  - 6 个高价值 oracle 样本文件已识别
- **S004** 新系统接缝审计 — 对话 5 完成（9 agent 并行，3 批 × 3），覆盖 bridges/adapters/platform/routingTick/service seams/persistence/connection lifecycle/receive pipeline/现有测试
  - 核心发现：7 项高风险 + 10 项中风险 + 5 项低风险 = 22 个接缝
  - 高风险：fanOutToStorage 未 await（bug）、事件截断丢失（EVENT_LIMIT=50）、LazyPersistence 启动竞态、save 无调用方、TCP 事件队列溢出、readModel 空（功能缺失）、drainEvents null dereference
  - 按测试类型：9 个适合 fake adapter 集成、3 个需真 TCP、3 个时序/持久化、2 个需先修 bug
- **S005** 集测范围综合（S006 文件）— 对话 6 完成
  - 排除：835+ 单测覆盖的 feature 内部逻辑、纯 UI、真实硬件、northbound、未实现功能
  - 前置修复 4 项：BF-1 fanOutToStorage await、BF-2 save 调用方、BF-3 drainEvents null、BF-4 connections/settings 恢复
  - S001 的 13 项待确认全部解决
  - 36 条集测项：P0×10（数据通路核心+回环+事件溢出）+ P1×12（重要接缝+消费者顺序+出站路由+bootstrap+多源并发）+ P2×14（边界情况+timeout策略+断开联动+模板联动+display projection+storage CRUD）
  - 按类型：真 TCP 3 项（含 send→receive 回环）、fake adapter 13 项、Vitest 集成 18 项、时序/持久化 2 项
  - 关键补充：T001b（send→receive TCP 回环，帧级 loopback 验证 checksum/factor/expression/length 完整 round-trip）
  - 后续追加计划已记录（§十）：功能完善 9 项、northbound 6 项、打包态/硬件 4 项
  - 实施对话规划（§十一）：6 个对话，每个对话必须先读规范+feature 文档再写测试
  - 5 个实施批次：Batch 0（修复 bug）→ Batch 1（14 项独立可并行）→ Batch 2（基线通路+回环）→ Batch 3（端到端链路）→ Batch 4（边界）
- **S006** 集测实施 — 对话 7 完成（Batch 0+1-A），对话 8 完成（Batch 1-B），对话 9 完成（Batch 1-C + Batch 2-A），对话 10 完成（Batch 2-B），对话 11 完成（Batch 3）
  - BF-1 修复：routing-tick.ts fanOutToStorage 加 await
  - BF-3 验证：当前代码已有 null 保护，无实际 bug（可能是 S005 误报或已修复）
  - 对话 7 产出：6 文件 107 tests
  - 对话 8 产出：5 文件 83 tests
  - 对话 9 产出：3 测试文件 + 1 helper + 1 bug fix = 54 tests
    - tcp-receive-datapath.spec.ts：T001（10）+ T001c（3）= 13 tests — 真实 TCP 接收数据通路 + 事件队列溢出
    - tcp-send-receive-loopback.spec.ts：T001b（11 tests）— send→receive TCP 回环（checksum/factor/byte-order/length round-trip）
    - frame-migration-checksum-direction.spec.ts：T019（7）+ T021（13）+ T022（4）+ T024e（6）= 30 tests
    - helpers/node-net-transport-facade.ts：TCP 测试共享基础设施
    - Bug fix：frame-matcher.ts 缺少 `case 'any': return true`，导致 any operator 永不匹配
  - 对话 10 产出：3 测试文件 29 tests — Batch 2-B（task→send 执行链 + fanOut 扇出 + 消费者顺序 + 出站路由 + 多源并发）
    - task-send-execution-chain.spec.ts：T003（8 tests）— 端到端 task→send 执行链（lifecycle/bytes/progress/multi-step/stop/remove）
    - fanout-consumer-order.spec.ts：T002（5）+ T016b（5）= 10 tests — fanOut 扇出正确性 + 消费者顺序
    - outbound-routing-multi-source.spec.ts：T016c（5）+ T016e（6）= 11 tests — 出站路由 + 多源并发 fieldKey 冲突
    - T016b 已知 gap：command-ingress 尚未集成到 routingTick，消费者顺序测试文档化该缺失
    - T016e 已知 gap：fieldKey(frameId:fieldId) 无来源区分，文档化为 S005 M10
  - 对话 11 产出：5 测试文件 32 tests — Batch 3（端到端条件链 + command-ingress 完整链 + timer/event driver + 错误隔离）
    - condition-match-task-send-chain.spec.ts：T004（6 tests）— 条件匹配→task→send 链（匹配触发/不触发/AND 组合/stop/step 结果/snapshot）
    - command-ingress-task-ack-chain.spec.ts：T005（6 tests）— SCOE LOAD→SEND_FRAME→task→ACK 链（完整生命周期/阶段校验/错误统计/日志/批量/dispose）
    - task-timer-driver.spec.ts：T012（6 tests）— timer driver 循环执行（迭代次数/无初始延迟/边界/stop/单次/多次）
    - task-event-driver.spec.ts：T013（6 tests）— event driver 条件触发（匹配触发/不匹配/cooldown/maxIterations/stop/AND 多条件）
    - routing-tick-error-isolation.spec.ts：T016（8 tests）— routingTick 错误隔离（4 个 known-gap 文档化 + 4 个正常路径验证）
    - T005 发现：onSettled 竞态（CI 内部也调用 onSettled，测试用 pollUntil 绕过）；task stopped 时不触发 resolveSettle
    - T016 known-gaps：storage 失败阻塞 bridge emit、display 失败阻塞全部下游、bridge handler 无异常隔离
  - 全部集成测试：305 tests passing，lint 0 new errors
  - 已覆盖集测项：T001 ✅ T001b ✅ T001c ✅ T002 ✅ T003 ✅ T004 ✅ T005 ✅ T006 ✅ T007 ✅ T008 ✅ T009 ✅ T010 ✅ T011 ✅ T012 ✅ T013 ✅ T014 ✅ T015 ✅ T016 ✅ T016b ✅ T016c ✅ T016d ✅ T016e ✅ T019 ✅ T021 ✅ T022 ✅ T024e ✅ T024g ✅
- **S006** 集测实施 — 对话 12 完成（Batch 4）
  - 对话 12 产出：6 测试文件 38 tests — Batch 4（error strategies + timeout 策略 + AND/OR 短路 + task 并发 + writer 事件 + lifecycle 边界 + disconnect→pause + drain 阻塞 + display projection）
    - task-error-strategies.spec.ts：T017（5）+ T024b（3）= 8 tests — error policy（stop/pause/skip/retry exhausted/retry succeeds）+ onTimeout vs errorPolicy（continue/skip/fail）
    - condition-and-or-short-circuit.spec.ts：T018（9 tests）— AND/OR 短路求值（AND false 短路/OR true 短路/混合左结合/空条件/null 值/单条件）
    - task-concurrent-writer-events.spec.ts：T020（3）+ T023（3）= 6 tests — task 并发无交叉污染 + stop 不影响其他 + writer write-accepted 事件依赖
    - connection-lifecycle-boundaries.spec.ts：T024（3）+ T024d（2）= 5 tests — lifecycle 边界（重复 connect/已断开 disconnect/lifecycle 状态）+ known-gap：disconnect 不 auto-pause task
    - drain-input-source-blocking.spec.ts：T024c（3 tests）— 1000 事件 drain（无错误/5s 内完成/counters 准确）
    - display-projection.spec.ts：T024f（7 tests）— table 过滤/chart series/scatter I/Q/不可变/clearProjection
    - T024d known-gap：connection disconnect 不会自动 pause 活跃 task（task 只在下次 send 时因 target 不可用而失败）
    - T024d 发现：errorPolicy 'stop'/'pause' 不 resolve settle promise，需用 pollUntil 替代 onSettled（与 T005 一致）
  - 全部集成测试：343 tests passing（305 + 38），lint 0 new errors
  - 已覆盖集测项：全部 36 条 P0-P2 集测项已完成 ✅
    T001 ✅ T001b ✅ T001c ✅ T002 ✅ T003 ✅ T004 ✅ T005 ✅ T006 ✅ T007 ✅ T008 ✅ T009 ✅ T010 ✅ T011 ✅ T012 ✅ T013 ✅ T014 ✅ T015 ✅ T016 ✅ T016b ✅ T016c ✅ T016d ✅ T016e ✅ T017 ✅ T018 ✅ T019 ✅ T020 ✅ T021 ✅ T022 ✅ T023 ✅ T024 ✅ T024b ✅ T024c ✅ T024d ✅ T024e ✅ T024f ✅ T024g ✅

## 未决项

- 集测范围清单已产出（S006 文件），36 条 P0-P2 项
- 实施对话规划已完成（S006 §十一），6 个对话逐步覆盖
- 每个对话必须先读规范+feature 文档+本专题日志再写测试
- BF-1 已修复 ✅、BF-3 已验证无 bug ✅、BF-2（save 调用方）和 BF-4（connections/settings 恢复）归 feature 实施计划
- northbound / task-real Phase 2 / 高速存储分流 / result runtime 编排 集成测试 blocked 待功能实现
- 功能完善和 northbound 闭环后的追加集测计划已记录（S006 §十）
- 真 TCP 测试在 CI 环境（WSL2 / Windows）的兼容性待验证

## 已确认结论

- 54 个 spec 文件全部是单元级 + fake adapter 测试，feature 间接缝零覆盖
- H002 已完成 TCP 接线，composite adapter 可用，数据通路物理上已通
- connection-network-adapter.spec.ts 已有 Node `net` 模块先例，可在 Vitest 中直接起 TCP

## 当前位置

S001 对话 1 完成、S002 对话 2-3 完成、S003 对话 4 完成、S004 对话 5 完成、S005 对话 6（综合排除）完成。S006 对话 7-12 完成（343 tests passing）。全部 36 条集测项已完成。对话 13 收尾 + 规划下一阶段。

## 下一阶段规划

### 线 1：修测试中发现的 bug（Lane A 快速修复）

| Bug | 严重度 | 影响 |
|-----|--------|------|
| onSettled 竞态（CI 内部也调 onSettled） | 高 | task 执行结果不可靠 |
| errorPolicy stop/pause 不 resolve settle promise | 高 | task 无法正常终止 |

单个对话完成，修完后跑 343 tests 回归。

### 线 2：rewrite 主线推进（按顺序）

1. **task-real Phase 2**（类型重组、统一引擎、step.repeat、fieldVariations、exitCondition）
2. **缺失页面**（存储管理、历史分析、系统设置）
3. **甲方 northbound 对接**（4 接口闭环）
4. **打包态验证**

**前置**：线 2 的第 1、2 项（task-real Phase 2 + 缺失页面）需要先开一个专门的分析对话，确定实际工作量和依赖关系，再规划实施。

## 对话规划

### 对话 1：历史讨论提取（S001）

输入：`.sessions/2026-04-23-rewrite-main-thread/` 下所有 S###.md 和 H###.md

子 agent 策略：
- Agent 1：读 S001-S005 + S014，提取架构级验收承诺和质量规则中与测试相关的段落
- Agent 2：读 S006-S008，提取 feature 实施期的验收结论、known-gaps、测试数量
- Agent 3：读 S009-S012，提取 UI 阶段的审计发现、已知 bug、技术债

产出格式：每条提取结果含 { 来源 note, feature, 具体行为描述, 验收结论, 已有测试证据, 缺口 }

### 对话 2-3：Feature 设计文档提取（S002）

输入：`codestable/features/` 下所有 design.md + checklist.yaml + brainstorm.md

子 agent 策略（每轮 3 agent，按 feature 分组）：
- 对话 2：frame / connection / receive / send / expression-engine
- 对话 3：task / command-ingress / storage / settings / display / status

产出：每条含 { feature, 验收标准原文, 跨 feature 交互契约, checklist 中测试项, 已实现/未实现 }

### 对话 4：旧系统可观测行为提取（S003）

输入：`src/` 下旧代码（stores/components/handlers）

子 agent 策略：
- Agent 1：读旧 receive/send 相关代码，提取数据流行为
- Agent 2：读旧 SCOE/task 相关代码，提取命令执行行为
- Agent 3：读旧 storage/history/CSV 代码，提取持久化行为

产出：每条含 { 旧行为描述, 代码位置, 新系统对应 feature, oracle 来源, 保留/排除 }

### 对话 5：新系统接缝审计（S004）

输入：`rewrite/src/runtime/` + `rewrite/src/features/*/adapters/` + `rewrite/src/features/*/services/`

子 agent 策略：
- Agent 1：读所有 bridge 文件，分析数据流向和断裂风险
- Agent 2：读 composite-adapter + real-network-adapter + real-serial-adapter，分析 adapter 路由边界
- Agent 3：读 persistence.ts + bootstrap，分析启动加载和保存时机

产出：接缝清单 + 每个接缝的测试建议

### 对话 6：综合 + 排除（S005）

合并 S001-S004 所有提取结果，去重、排除已有单测覆盖的项、分级优先级。

产出：最终集测范围清单（文件形式，作为 S006 的直接合同）

### 对话 7+：集测实施（S006）

按 S005 的清单写测试。每轮对话覆盖一批。

## 附属文件

- `conversation-plan.md` — 7 轮对话完整规划 + 全部提示词
- `H001-scope-extraction-handoff.md` — 对话 1 提示词（模板 6 格式，conversation-plan 中已包含完整版）
- `H001-post-integration-testing-handoff.md` — **集测完成后交接文档**，后续线 1 线 2 对话的必读入口
