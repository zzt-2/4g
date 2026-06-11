# [S001] 历史讨论提取 — 验收承诺、已知缺口与测试期望

> 2026-05-19 | 集成测试准备 | 事实报告
> 来源：S001-S015 session notes + quality rules + review checklist + H002 handoff + 实际代码
> 12 个 agent 并行提取，4 批 × 3

## 目标

从 26 天的历史讨论记录中提取所有验收标准、已知缺口和测试期望，为集成测试范围清单提供事实输入。不做任何设计或实施。

---

## 一、测试层级覆盖现状

### 1.1 十级验证 taxonomy 覆盖情况

| Level | 类型 | 覆盖状态 | 证据 |
|-------|------|---------|------|
| 1 | static scan | 有覆盖 | pnpm lint 可执行；各 feature checklist 引用 |
| 2 | Vitest unit | 充分覆盖 | 54+ spec 文件，835 tests passed |
| 3 | fixture test | 充分覆盖 | 11 个 feature 有 fixtures/ 目录 |
| 4 | oracle comparison | 极少 | 仅 storage-core-oracle.spec.ts 1 个文件 |
| 5 | fake adapter test | 初步覆盖 | connection/storage/send/receive 有 fake adapter |
| 6 | manual checklist | 无实质覆盖 | 无已执行的 checklist 记录或截图 |
| 7 | runtime validation | 无覆盖 | 无运行态验证记录 |
| 8 | hardware validation | 无覆盖 | 无真实串口/TCP/SCOE 设备验证记录 |
| 9 | package validation | 无覆盖 | 无打包态验证记录 |
| 10 | customer validation | 无覆盖 | 无甲方联调记录 |

**来源**：Agent 11（§14 分析）

### 1.2 测试规模基线

| 阶段 | 测试数量 | 来源 |
|------|---------|------|
| S002 七大基础 feature | 153 tests (16 suites) | Agent 1 |
| S003 Send + Bridge | 249 + 153 tests | Agent 2 |
| S004 Task core | 330 tests (+81 新) | Agent 1 |
| S007 Expression Engine | 112 tests (8 spec) | Agent 4 |
| S007 Connection | 580+ tests | Agent 4 |
| S007 Send-real | ~100 tests | Agent 4 |
| S008 Task-real Phase 2 | 748 tests | Agent 5 |
| S008 Command-ingress 验收 | 803 tests (全项目) | Agent 5 |
| S010 修复后实测 | 835 passed / 0 failed / 1 unhandled | Agent 6 |
| S014 汇总 | 803 + routing-tick 15 + expression 330 | Agent 8 |

**关键判断**：全部测试为单元级 + fake adapter 级，零跨 feature 集成测试。

---

## 二、P0 集成测试缺口

### T-P0-1：端到端数据通路

**来源**：S005 审计 R-8/R-9、S004 跨 feature 缺口汇总、Agent 12 TCP 接线验证

缺失的完整链路测试：

1. **connection event → receive input source**：runtime bridge 存在但桥接集成无测试
2. **receive → task (condition match)**：ReceiveEventSourceBridge 存在但端到端无测试
3. **task → send (step execution)**：task service 调用 sendService.execute 后端到端无测试
4. **send → connection/transport write**：send-integration 用 fake adapter，不穿透到 connection
5. **task → result (TaskInstanceCompletion)**：result 未实现，素材入口验证缺失
6. **command-ingress → task → send → connection**：完全不存在

**S005 原文**（审计最高优先级）："端到端测试覆盖缺失 — 缺少 fake adapter → routingTick → receive → task → send → result 的完整链路"

**TCP 环路**：代码接线已完成（composite adapter + real-network-adapter），但无任何实际运行证据。H002 handoff 描述的手动验证步骤从未执行或记录。

### T-P0-2：Selector 不可变性

**来源**：S005 审计 R-1~R-4、CLAUDE.md "Selector 不可变约束"硬规则

5 个 feature 的 selector 返回浅拷贝，嵌套对象可被外部修改：

| Feature | 风险 | 来源 |
|---------|------|------|
| display | selector 返回浅拷贝，星座图/波形图数据可被外部修改 | S005-R1 |
| storage | selector 返回浅拷贝，存储记录可被外部修改 | S005-R2 |
| frame | selector 返回浅拷贝，帧定义可被外部修改 | S005-R3 |
| task/status | selector 返回浅拷贝，任务状态可被外部修改 | S005-R4 |

**S005 结论**：需要在集成级验证 selector 返回值修改后不影响 feature 内部状态。

### T-P0-3：持久化层

**来源**：Agent 9（S012+S015 分析）、Agent 12（fanOutToStorage 分析）

| 缺口 | 严重度 | 详情 |
|------|--------|------|
| 运行时无自动 save 触发点 | 高 | 所有运行时修改仅在内存，关闭即丢 |
| connections/settings 恢复空转 | 高 | load() 读取但 initPersistenceAsync 只恢复 frames |
| 软删除有 bug | 中 | readMaterial 不检查 .deleted 标记；delete 不更新 _index.json |
| 启动中崩溃丢数据 | 中 | LazyPersistence delegate 未设置前 save 走 no-op |
| fanOutToStorage 写入内存 fake adapter | 中 | feature-wiring.ts 硬编码 createFakeLocalMaterialAdapter() |

### T-P0-4：Composite Adapter 边界

**来源**：Agent 12

| 问题 | 详情 |
|------|------|
| disconnect null dereference | serialAdapter 和 networkAdapter 都 undefined 时抛 TypeError |
| write 路由策略不一致 | connect 用 kind 路由，write 用试错策略 |
| 无独立单元测试 | 搜索无任何 composite adapter 测试文件 |

---

## 三、P1 集成测试缺口

### T-P1-1：Feature 间接缝

**来源**：Agent 2（S003+S004 跨 feature 缺口）、Agent 4（S007 跨 feature 缺口）、Agent 5（S008 集成分析）

| 接缝 | 当前覆盖 | 缺口 |
|------|---------|------|
| receive → expression engine | expression-pass.spec.ts (23 tests, fixture) | 非真实帧配置 |
| send → expression engine | send-frame-resolver.spec.ts (19 tests) | 未验证 compileConditional vs compileGroup 差异 |
| send → frame public API | 无 | send 调用 frame 的跨 feature 测试完全缺失 |
| task → send (ports DI) | 有单测 | 端到端执行路径无测试 |
| settings → 7 个下游 feature | settings 闭环但消费方无集成测试 | 分布式配置消费验证缺失 |
| expression → task | 完全不存在 | task 侧表达式集成测试零覆盖 |

### T-P1-2：架构边界约束

**来源**：Agent 1（R2/R5/R8）、Agent 10（Quality Gate 6 项）、Agent 11（§9 red flags）

**Quality Gate 中只有集成测试才能覆盖的 6 项**：

1. IPC 通道类型安全（无裸 invoke/send/on）
2. 跨 feature 状态隔离（不直接写其他 feature 内部 state）
3. feature public API 访问路径
4. 统计更新不污染静态资产
5. core 层无 platform 依赖泄漏
6. receive/send 主链与下游显式交互

**已验证的正向约束**（§9 red flags 已避免）：
- receive 不直接启动 task 或写入任务完成状态
- send 成功不直接写 report 或 northbound response
- SCOE 特例不沉积在通用 receive/send 主链里

### T-P1-3：条件匹配一致性

**来源**：Agent 3（S005 旧系统三线调研）

旧系统有三套独立的条件匹配系统（SCOE 完成条件、表达式 condition、任务触发条件），新架构决策统一到 shared/condition-operators/ 纯函数。需验证 3 个消费方（receive/task/command-ingress）对统一条件匹配的使用一致性。

### T-P1-4：globalParams 推迟影响

**来源**：Agent 5（S008 receive-real 验收）

receive 表达式引擎无法消费全局配置参数，依赖 globalParams 的匹配规则和下游桥接测试受限。expression-engine 集成测试中 globalParams 路径无法覆盖。

### T-P1-5：文档-代码不一致风险

**来源**：Agent 2（S004 34 处同步）、Agent 7/8（S011 系统性缺少验证证据）

- S004 中 4 个子 agent 并行编辑 4 份架构文档共 34 处修改，无交叉审查证据
- TransportEventSnapshot 缺 bytes 字段是文档-代码 drift 的实际先例
- S011 所有 Wave 和页面实现的描述都是声明性的"完成"/"落地"，缺少验证证据

---

## 四、P2 集成测试缺口

### T-P2-1：间歇性测试失败

**来源**：Agent 5（S008 Q2）、Agent 6（S010 Q3）

- task-real 间歇性 30-40% 套件失败，根因是 runExecutionLoop fire-and-forget + 真实 setTimeout 泄漏
- 部分修复后失败模式从 STACK_TRACE_ERROR 改善为状态断言失败，但未根治
- routing-tick.spec.ts 有 1 个 unhandled rejection（fanOutToStorage 中 storage service 为 undefined）
- 在 S009-S015 中未见解决记录

### T-P2-2：Storage-real 外部依赖 gap

**来源**：Agent 5（S008 Q6）

6 个 gap：真实文件系统适配器、Electron 平台集成、打包态 data path、大数据量性能、高速存储最终模型、report/northbound delivery 边界。大部分需要 runtime/hardware validation。

### T-P2-3：旧 JSON 迁移验证

**来源**：Agent 10（§10 第 1 条）

frame service 有 importLegacyFrames 方法，但导入旧 JSON 后新 frame definition 的字段类型/校验规则保持新模型语义的验证需要集成级测试。

### T-P2-4：Task service 层集成风险

**来源**：Agent 2（S004 Q3）

S004 记录的 6 个 task service bug 中 5 个是集成缺陷（import 缺失、retry 递归、receive 订阅缺失、paused 状态未检查、竞态丢事件），均在 core 单测通过后 service 聚合时才暴露。task-service 层是集成风险集中区域。

---

## 五、未实现功能（不归入当前集测范围）

以下功能仅有设计文档，无代码实现，不纳入集成测试清单：

| 功能 | 状态 | 来源 |
|------|------|------|
| Task-Real 5 个设计决策 | 全部未实现 | Agent 4 (S007) |
| Command-Ingress 4 个决策 + 4 个 CRITICAL | 全部未实现 | Agent 4 (S007) |
| Northbound (result/report/delivery) | 完全未启动 | Agent 1, Agent 10 |
| 高速存储短路 | deferred | Agent 4 (S007) |
| ECharts 渲染组件 | 未实现 | Agent 8 (S011) |
| receive-real-highspeed 背压压测 | 显式推迟 | Agent 4 (S007) |
| UDP adapter | 待确认是否实现 | Agent 9 (S015) |

---

## 六、质量规则中的集成测试需求汇总

### 6.1 质量红线 (R1-R16) 需集成测试的条目

**直接要求集成测试**（来源 Agent 1）：

| 规则 | 要点 |
|------|------|
| R2 | Feature 归口显式，禁止跨 feature 内部写入 |
| R5 | Electron 能力边界必须窄 |
| R8 | Receive/Send 主链保持显式输入输出 |
| R10 | Northbound 必须是边界层 |
| R11 | Result/Report/Delivery 三者必须分开 |

**集成层面有附加价值**：R3/R7/R9/R12/R13

### 6.2 Northbound "不得"项

**来源**：Agent 1（S001 第 10 节）

5 项全部需要集成测试证明合规（但 northbound 未实现，当前无法执行）：
1. deviceId 不得等同串口/网口 target
2. setTestTask 不得等同旧本地 send task
3. result/report/delivery 三层不得混淆
4. 旧 history/CSV 不得等同 TestReport
5. northbound 不得是 feature 快捷方式

### 6.3 旧代码事实需证明"已消灭"

**来源**：Agent 10（§10，实际 7 条）

| # | 旧代码事实 | 验证方式 |
|---|----------|---------|
| 1 | receiveFramesStore 承接接收+SCOE+触发 | 集成测试 + routing-tick.spec.ts 补充 |
| 2 | 高频数据逐包穿透 | runtime/hardware validation |
| 3 | preload 裸暴露 | 静态分析 + preload 集成测试 |
| 4 | networkHandlers 内嵌高速存储分流 | runtime/hardware validation |
| 5 | scoeStore 多职责混合 | command-ingress 集成测试补充 |
| 6 | useUnifiedSender 跨 store 写统计 | send-integration.spec.ts 已部分覆盖 |
| 7 | UI 直接启动 task | manual checklist / E2E 测试 |

### 6.4 S015 集测维度评估

**来源**：Agent 9

S015 列出 10 个维度均为必要，但有三处可能遗漏：
1. **错误路径/异常恢复**：10 个维度全走 happy path，缺少 error path 覆盖
2. **表达式引擎跨 feature 集成**：可能需要独立测试矩阵
3. **Selector 不变性边界测试**：CLAUDE.md 硬规则但维度中无覆盖

可能多余：第 2 维度（UDP 环路）——待确认 UDP adapter 是否已实现。

---

## 七、Service 完成度评估

**来源**：Agent 3（S014）、Agent 8（S011）

S014 声称"10 个 service 全部 100% 完成"。实际含义：service/core 层 API + 单元测试通过，不等于 runtime 可操作性。

| Feature | Service 完成声称 | Runtime 证据缺口 |
|---------|-----------------|-----------------|
| storage | 100% | "完全没接持久化"，fanOutToStorage 写入 fake adapter |
| receive | 100%（阶段 3 时 ~40%） | receive-real pipeline 设计+实现完成但端到端无测试 |
| send | 100% | 真实串口/网络发送能力未验证 |
| task | 100% | 端到端执行链路（receive→task→send）未验证 |
| connection | 100% | TCP/UDP transport 真实连接未验证 |
| display | 100% | 缺 ECharts 渲染组件 |

---

## 八、待确认项汇总

| # | 待确认项 | 来源 |
|---|---------|------|
| 1 | Wave 0 Task 类型重组 30 项逐项测试覆盖 | Agent 7 |
| 2 | Expression 集成到 receive 的具体验证方式 | Agent 7 |
| 3 | 85 文件大提交 (1ae3a6c) 后 build/lint/test 精确结果 | Agent 8 |
| 4 | Service 100% 声称中"10 个"vs 实际 11 个的数量口径 | Agent 8 |
| 5 | Task 间歇性测试失败当前状态（S009-S015 无记录） | Agent 5 |
| 6 | Command-ingress W2 CRITICAL 修复的回归测试覆盖 | Agent 5 |
| 7 | Storage-real 6 个 gap 精确列表 | Agent 5 |
| 8 | UDP adapter 是否已实现 | Agent 9 |
| 9 | 34 处文档同步后 post-sync 验证 | Agent 2 |
| 10 | S014 阶段 6 丢失 14 文件的恢复完整性 | Agent 3 |
| 11 | S005 覆盖矩阵"完全未覆盖 5 项"具体内容 | Agent 3 |
| 12 | real-serial-adapter 对未知 connectionId 的 write 行为 | Agent 12 |
| 13 | FrameDirection 类型定义是否能编译期捕获 'o_send' | Agent 8 |

---

## 附属文件

- `S001-agent1-s001-s002.md` — Agent 1 产出
- `S001-agent2-s003-s004.md` — Agent 2 产出
- `S001-agent3-s005-s014.md` — Agent 3 产出
- `S001-agent4-s007.md` — Agent 4 产出
- `S001-agent5-s008.md` — Agent 5 产出
- `S001-agent6-s009-s010.md` — Agent 6 产出
- `S001-agent7-s011-upper.md` — Agent 7 产出
- `S001-agent8-s011-lower.md` — Agent 8 产出
- `S001-agent9-s012-s015.md` — Agent 9 产出
- `S001-agent10-quality-rules.md` — Agent 10 产出
- `S001-agent11-review-checklist.md` — Agent 11 产出
- `S001-agent12-h002-tcp.md` — Agent 12 产出

## 后续

- 本报告作为 S006（集测范围综合）的直接输入
- 13 项待确认需在综合阶段逐一核实
- 未实现功能不纳入当前集测范围，待后续 feature 实施时补充
