# [S004] Task Service 层 / Settings / Runtime Wiring 实施

> 2026-05-07 | 实施阶段 | 已完成
> 2026-05-18 续接 — 补全归档

## 目标

补全 S002/S003/S005 中缺失的 05-07 19 个对话产出。S005 覆盖了审计和 receive-real brainstorm，S002/S003 有 task core / result / SCOE / outbound routing 的摘要级记录，但 task service 层实现、settings 完整闭环、runtime wiring 三连（设计→实施→审查）、task review/fix 链、架构文档同步等大量工作未深入归档。

## 记录

### 一、Send/Task/SCOE 交叉讨论与统一执行引擎（90ec2772, 2.6M）

新系统最大单对话（2.6M），对 send/task/SCOE 三 feature 做交叉设计审查，推动统一执行引擎决策。

**核心发现**：SCOE 和 task 本质相同 — 外部指令触发一系列帧发送。旧系统中 SCOE 有独立执行器、独立帧实例管理、独立条件系统，全部需要消灭。

**统一执行引擎决策**：

| # | 决策 | 结论 |
|---|------|------|
| D1 | 执行引擎归属 | task = 通用执行引擎，SCOE/northbound/本地 task 共用 |
| D2 | step 多态化 | send-step / wait-condition-step / delay-step |
| D3 | 入站解析路径 | SCOE/northbound 指令不走 receive，走各自独立解析 |
| D4 | 出站路由统一 | 所有下位机帧经同一 send queue |
| D5 | 条件匹配算子 | 提取到 shared/condition-operators/ |
| D6 | 表达式引擎 | 归口 shared/，纯 TS 纯函数 |

**大规模修订**：task design（定位改为"通用执行引擎"）、send design（与统一引擎对齐）、SCOE design（基于 task 统一引擎定义命令解析和 targetId）、task checklist（完全同步）。

产出：`codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`、`2026-05-06-outbound-routing-and-response-decisions.md`。

### 二、Task Service/State/Selectors 层实现（8eba86f6, 1.8M）

task core 330 tests 之上实现运行时层。

**新增文件**：
- `adapters/ports.ts` — SendServicePort / ReceiveEventSourcePort 接口
- `adapters/fake-send-service.ts` + `fake-receive-event-source.ts` — 测试 fakes
- `state/task-state.ts` — Pinia store（TaskInstanceState）
- `selectors/task-selectors.ts` — selectTaskList / selectTaskHistory / selectActiveTasks
- `services/task-service.ts` — create/start/pause/resume/cancel + settle 循环

**实现过程修复**：
- selectTaskHistory 缺少导入
- retry 递归错误（retry 应调原始 step executor 而非自身）
- 非触发模式缺少 receive event 订阅
- settle 函数未检查 paused 状态
- trigger 循环迭代间丢事件竞态
- retry 测试中 500ms delay 超时

**关键设计**：TaskService 通过 ports 依赖注入 SendService 和 ReceiveEventSource，保持 core 层纯净。settle 循环按 step 类型分发：send-step → send port / wait-condition → receive port / delay → setTimeout。lint + test + boundary scan 全通过。

### 三、Task Review + 交叉检查（6a215c9e, 936K）

task 实现 review + send/task 交叉检查。确认 task service 和 send service 的交互边界正确。

### 四、Task 修复链（82f14354 + bee82f35 + ab39640e + 41383900）

**82f14354**（842K）：task 实现修复 + stopCondition 合并 + 代码质量清理。

**bee82f35**（162K）：task-service 731 行拆成 6 模块（types/ports/execution/lifecycle/progress/index）。

**ab39640e**（99K）：shared 层提取 — cloneUnknownValue + defaultNow + compareValues 从多 feature 去重到 shared/。

**41383900**（285K）：as 断言修复 + validation/legacy 拆分。

### 五、交叉审查修复批次（f5966b15, 607K）

4 个子任务并行修复审查发现的问题，遇 429 限流。

### 六、出站路由 Brainstorm（2c202b62, 1.1M）

send/task/SCOE 三 feature 跨 feature 出站路由问题。三种来源的出站帧可能走同一个下位机连接。

**4 个决策**：

| # | 决策 | 结论 |
|---|------|------|
| D1 | SCOE 命令帧 targetId | 指向下位机连接 target（非 SCOE 自己的连接） |
| D2 | 三种出站路径统一模型 | 外部系统 → 指令翻译 → TaskDefinition → task → 结果回传 |
| D3 | 确认帧策略 | 首轮固定值 |
| D4 | 特化配置归属 | 按 owner feature 归属 |

SCOE design 5 处修订，task design 3 处修订。三条具体场景 walkthrough（用户定时/SCOE 命令/Northbound 任务）。

产出：`codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`。

### 七、Result Feature 设计（8bbc2fe8, 811K）

result feature 的 design + checklist。

**核心决策**：
- result owns 内部结果事实（CaseResult / TaskResultSummary / aggregation rules）
- TaskInstanceCompletion 是 result 的唯一素材入口
- Result/Report/Northbound 三层分离：result（事实层）→ report（格式层）→ northbound（交付层）

产出：`codestable/features/rewrite-result/rewrite-result-design.md` + checklist.yaml。

### 八、Settings Feature 设计+实现（f385efdf, 1.3M）

settings 完整闭环（cs-feat-design → cs-feat-impl），7 个下游 feature 的配置输入源。

**3 个 explore 子 agent 并行摸底**，审查现有代码、分析归属边界、确认缺失项。

**配置项归属**：
- settings owns：recording（autoStartRecording / csvDefaultOutputPath / csvSaveIntervalMinutes）、storage（maxHistoryHours / storagePath / enableAutoCleanup）、general（updateInterval）
- 延迟项：status display / connection 配置换后续确认
- 用户明确要求"全局性的配置，尽量集中到 settings"

**实现**（4 步 checklist）：
1. 扩展 core/types.ts（新增 StorageConfig + GeneralConfig）、defaults.ts、clone.ts
2. 新建 core/normalize.ts（path-based 错误码如 `settings.storage.maxHistoryHours.invalidPositiveNumber`）、validation.ts
3. 更新 selectors/settings-selectors.ts、services/settings-service.ts、fixtures、index.ts
4. 新建测试 — 覆盖 recording/storage/general 三组配置全部验收场景

验证：lint + build + vitest 全通过。

产出：`codestable/features/rewrite-settings/rewrite-settings-design.md`（重写）+ checklist.yaml。

### 九、Runtime Wiring 三连（51ee159d + 0d35c532 + bdcba568）

**51ee159d**（1.0M）— cs-feat-design 阶段：

产出 `codestable/features/2026-05-07-runtime-wiring/runtime-wiring-design.md` + checklist.yaml。

摸底结论：当前 runtime 仅 140 行聚合 3 个 feature 只读端口，零事件路由、零生命周期管理、零跨 feature 编排。识别 5 条缺失数据通路（connection→receive、send frame write、routing、lifecycle、settings distribution）。

用户否决首轮 tick() 轮询模型，要求改为 event-driven。删 EventRouter 状态机 → 无状态 routingTick()。删 lifecycle.ts → 合并到 index.ts。

**0d35c532**（1.4M）— cs-feat-impl 阶段：

新增 6 个 runtime 文件 + 3 个测试文件：
- `bridges/connection-to-receive.ts` — 连接事件桥接到 receive 输入源
- `bridges/connection-backed-writer.ts` — 连接支持的帧写入器
- `bridges/connection-backed-target-resolver.ts` — target 解析桥接
- `bridges/receive-event-source-bridge.ts` — receive 事件源桥接
- `feature-wiring.ts` — feature 装配主文件
- `routing-tick.ts` — 无状态 routingTick() 纯函数

23 个测试全部通过（feature-wiring 14 + routing-tick 6 + rewrite-runtime 3）。build + lint 通过。修复 design 与代码不匹配（TransportEventSnapshot 缺 bytes 字段）。

**bdcba568**（664K）— review + 修复：

runtime wiring 审查 S1-S9 全 PASS。修复发现的问题。

### 十、架构文档同步（945c7e92, 1.1M）

将近期 compound 决策和 feature design 变更同步回 4 份架构文档。

4 个并行子 agent 编辑 4 份文档，共 34 处修改：
- `rewrite-target-structure.md` — 7 处（task 系统定义、feature 表 4 行、边界例外、放置示例）
- `rewrite-system-architecture.md` — 4 处（feature 表 4 行）
- `rewrite-feature-boundaries.md` — 8 处（边界表 4 行 + owner notes 4 节）
- `rewrite-feature-interaction-matrix.md` — 15 处（矩阵行 8 + 风险 2 + 禁止项 1 + pre-design gates 4）

核心变更：task 从"独立能力域"升级为"通用执行引擎"，send 缩窄为单帧发送，新增 SCOE/指令接入 feature，receive 补充 condition matching 职责。

### 十一、甲方需求初步分析（221bdf1c, 121K）

甲方接口事实基础建立。为后续 northbound 专题（05-18）提供初始素材。

### 十二、主线对话（fedf307e, 1.2M）

05-06~05-07 跨两天的主线对话，串联审查门、send design、task design、SCOE design、bridge prep、result design、runtime wiring design。建立了 6 个 memory 文件（user_role / rewrite_goals / hard_boundaries / reading_list / review_result / send_and_bridge）。产出统一执行引擎决策。

### 十三、杂项

- **df00647f**（174K）：rtk 工具安装
- **39bcd7fe**（921K）：task feature core 层实现 — 330 tests（已在 S003 记录摘要）

## 后续

- Task service 通过 ports 完成依赖注入，下游 SCOE/northbound adapter 可直接接入
- Settings 闭环完成，下游 feature 可消费配置
- Runtime wiring event-driven 架构就绪，为 real feature 实施奠定基础
- 延迟项：status display 配置、connection 配置换后续确认
- 甲方分析素材已建立，待 05-18 northbound 专题正式推进
