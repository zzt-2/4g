# [S005] Receive-Real 设计与架构审计

> 2026-05-07 ~ 2026-05-08 | 设计阶段 | 已完成

## 目标

在 9 个 feature 骨架完成、330+ 测试通过、runtime wiring 完成的基础上，做三件事：

1. **全面架构审计**：在下一阶段（让 runtime 真正跑起来）之前，对已有代码做 6 维度并行风险扫描，确认核心边界原则执行到位。
2. **Receive-Real brainstorm**：receive-real 是新系统最复杂的 feature，需在动手设计前锁定管线架构、扇出模型、背压策略等关键决策。
3. **旧系统调研与覆盖矩阵**：对照旧系统全部可观测行为，确认新系统覆盖情况，识别 P0/P1/P2 缺口。

同期并行完成了表达式引擎学习、Platform 扩展 brainstorm（TCP/UDP 传输能力）、以及依赖审计。

## 记录

### 一、6 维度架构审计（2026-05-07）

6 个维度并行审计，覆盖 feature 边界隔离、store 单点写入、runtime 职责、shared 层纯净性、platform 边界、测试质量。

**审计总览**：

| 维度 | 评分 | 违规 | 风险 |
|------|------|------|------|
| Feature 边界隔离 | A+ | 0 | 0 |
| Store 单点写入 | 85/100 | 0 | 4 |
| Runtime 职责 | 9/10 | 0 | 0 |
| Shared 层纯净性 | 基本合规 | 0 | 2 |
| Platform 边界 | 9/10 | 0 | 1 |
| 测试质量 | 良好 | 1 | 3 |

**总计：1 个违规、10 个风险。** 整体结论是架构根基扎实，核心边界原则执行良好。

**唯一违规（V-1）**：`task-service-state-selector.spec.ts` 直接导入内部 state 模块，绕过 public API。修复方向是通过 feature 的 public API 测试。

**关键风险项**：
- **R-1/R-2/R-3/R-4**：多个 selector（display、storage、frame、task/status）返回浅拷贝，嵌套对象可能被外部修改。这是 selector 不可变约束的最大潜在风险点。
- **R-8**：端到端测试覆盖缺失。虽有 routing-tick.spec.ts 和 feature-wiring.spec.ts，但缺少 fake adapter → routingTick → receive → task → send → result 的完整链路。

**合规确认**：
- Feature 边界隔离完全合规：所有 9 个 feature 通过 index.ts 导出 public API，0 跨 feature 内部目录 import。
- 依赖层级清晰：L0（frame/settings/storage）→ L1（connection）→ L2（receive/send）→ L3（task）。
- Runtime 纯 composition root，0 业务判断逻辑。
- Store 单点写入：36 个写入点全部归口正确。

产出文档：`codestable/compound/2026-05-07-architecture-audit-report.md`

### 二、Feature 间依赖审计（2026-05-07）

静态代码分析，验证 rewrite 代码是否遵守"features 间只通过 public API 交互"的架构约束。

**结论：整体健康度 A（优秀）——零违规。**

依赖矩阵形成 DAG（无环）：

```
frame (L0) ← receive (L2) ← task (L3)
              ↑                ↑
connection (L1) ← send (L2) ←┘
```

关键数据：
- 17 处跨 feature import 全部通过目标 feature 的 index.ts（public API）
- 16/17 是 type-only import，唯一 value import 是 `cloneFrameField`（建议评估是否提取到 shared/）
- 独立 feature（零跨 feature 依赖）：connection、display、settings、status、storage-local-baseline
- 4 个 bridge 文件均为纯适配器，将 producer 接口转换为 consumer 接口

与旧系统对比：旧系统 19 个 store 双向乱串、循环依赖（receiveFramesStore 动态导入 sendTasksStore 和 dataDisplayStore 规避循环）；新系统通过 feature isolation + public API + runtime bridge 完全规避。

产出文档：`codestable/compound/2026-05-07-dependency-audit-result.md`

### 三、旧系统调研：SCOE、表达式引擎、可视化（2026-05-07）

三个子 agent 并行读旧代码，为新设计提供证据。

**SCOE 调研**：
- SCOE 数据流：接收源 → receiveFramesStore → scoeFrame.ts（帧识别→校验和→参数解析）→ useScoeCommandExecutor.ts（策略模式执行器）→ waitForCompletionConditions（异步轮询 100ms）
- SCOE 通过 `isSCOEFrame` 标记从全局帧模板筛选，但有独立的帧实例管理 store 和完全独立的完成条件系统
- 需要消灭：跨 store 循环依赖、重复帧实例管理、SCOE 逻辑硬编码在通用接收流程、测试工具耦合核心 store
- 可复用模式：策略模式执行器映射、统一执行上下文/返回值、分层验证流程

**表达式引擎调研**：
- 旧系统 1385 行，核心文件 useExpressionCalculator.ts + useFrameExpressionManager.ts + fieldValidation.ts
- 4 种数据源：CURRENT_FIELD / FRAME_FIELD / GLOBAL_STAT / SCOE_DATA
- 已实现 Kahn 算法拓扑排序（解决并行计算顺序问题），缓存策略 configHash + 5 分钟 LRU
- 性能瓶颈：接收帧字段计算是高频路径（每帧 1 次），使用 `new Function` 构造函数动态求值
- 缺失：无预编译机制、无表达式级缓存

**可视化调研**：
- 星座图特殊数据管道：hex → extractValuesFromHex → collectConstellationFieldData → ECharts scatter
- 关键隐患：星座图无长期数据量上限，高频帧+长刷新间隔=内存累积
- 值得借鉴：CircularBuffer 循环缓冲区、ECharts 增量更新、时间格式化批量缓存

**交叉发现**：
- 三套独立的条件匹配系统（SCOE 完成条件、表达式 condition、任务触发条件）→ 新架构已决策统一到 shared/condition/ 纯函数 + 各 feature 自管触发
- 可复用共用件：拓扑排序、条件匹配逻辑、校验和计算、循环缓冲区、hex 解析

产出文档：`codestable/compound/2026-05-07-old-system-investigation-scoe-expression-visualization.md`

### 四、新旧系统覆盖矩阵（2026-05-07）

旧系统 10 个页面、19 个 store、50+ IPC channel 全面扫描。

**覆盖度统计**：

| 类别 | 数量 | 占比 |
|------|------|------|
| 已实现 | 16 | 44% |
| 已设计未实现 | 11 | 31% |
| 完全未覆盖 | 5 | 14% |
| 刻意不保留 | 10 | -- |

**核心领域层（frame/connection/receive/send/task/storage/settings/status）已高质量完成**。

**三个关键缺口**：
1. **Platform Facade 缺失**：renderer 无法访问桌面能力（串口只写了一半）
2. **页面层完全空白**：用户无法使用任何功能
3. **Northbound 完全未启动**：报告/HTTPS/FTP 全部未实现

**旧系统最大教训**：19 个 store 的循环依赖和跨 store 直接读写。新系统通过 feature isolation + public API + runtime bridge 完全规避。

刻意不保留的 10 项：SCOE 独立帧列表、SCOE 独立执行器、全局 window.electron、Store 间直接 import、main 进程业务逻辑、dataDisplayStore 混存、旧 stop→completed 语义、串口 target 等同 deviceId、timerManager:onCustomEvent 裸事件总线、旧 JSON 格式作核心模型。

产出文档：`codestable/compound/2026-05-07-old-new-system-coverage-matrix.md`

### 五、表达式引擎学习（2026-05-08）

从 18 个生产配置文件中提取真实表达式模式的事实：

1. **零数学函数调用**：所有表达式只用四则运算，没有 sin/cos/sqrt/pow。引擎仍提供 Math.* 函数表。
2. **中文变量名是常态**：`速度`、`距离`、`光速`、`帧距`等。tokenizer 必须用 `\p{ID_Start}`/`\p{ID_Continue}` Unicode 属性。
3. **条件多分支是核心模式**：典型 5 个 `{condition, expression}` 对按序短路求值，必须纳入引擎核心。
4. **大数常数常见**：`13743895344000`（~2^37*125）、`299792458`（光速）。IEEE 754 double 精度足够。

手写 parser 关键陷阱：一元负号必须加 `unary := ('-'|'+')? primary`；变量/函数名冲突通过语法消歧（标识符后跟 `(` → 函数调用）解决。

性能实测：手写 parser + 编译为 JS 闭包，单表达式预编译后求值 < 1us，50 表达式批量拓扑求值 < 20us。高频 receive 场景完全够用，不需要 Web Worker。

表达式引擎 feature 已完成并通过 acceptance（`rewrite/src/shared/expression/`）。待集成到 receive/task/send 三个 feature。

产出文档：`codestable/compound/2026-05-08-learning-expression-engine-impl.md`

### 六、Platform 扩展 Brainstorm（2026-05-08）

TCP/UDP 传输能力在 main/preload/facade 三层全部缺失（类型已定义，零实现）。TCP/UDP 是 connection-complete 的前置依赖，而 connection-complete 又是 receive-real 和 send-real 的前置依赖。

**四层架构（和串口模式一致）**：
1. main process — `network-handlers.ts`：用 Node.js `net`/`dgram` 管理真实 socket
2. preload — 扩展 TransportBridge：新增 TCP/UDP 方法
3. shared 类型 — 扩展 `platform-bridge.ts`：新增方法签名
4. facade — 扩展 TransportFacade：暴露新连接方法

倾向方向：统一 `connect` 入口，TCP/UDP 参数通过 discriminated union 区分。理由是 `disconnect`/`write`/`cleanup` 已经按 connectionId 多态，和 `ConnectionTransportAdapter` 的 `connect(config)` 模式一致。

硬约束：main 不承载任何业务逻辑。

**依赖顺序**：platform-expansion (Wave 1) → connection-complete (Wave 2) → receive-real + send-real (Wave 3)。

产出文档：`codestable/compound/2026-05-08-platform-expansion-brainstorm.md`

### 七、Receive-Real Brainstorm（2026-05-08）

核心管线设计：

```
refreshFrameReferences → 预编译表达式 Map<frameId, CompiledGroup>
ingestBatch → 帧匹配 → 字段解析(raw+factor) → 表达式求值(独立pass) → 更新read model → 产出Outcome
routingTick → drainInputSource → 预算截断 → 扇出(display/storage/task/unmatched)
```

**已锁定 5 个决策**：

| # | 决策 | 结论 | 依据 |
|---|------|------|------|
| D1 | 表达式求值位置 | 独立阶段（field-parser 后） | 需要跨帧参数+全局参数，field-parser 不该知道 |
| D2 | read model owner | receive 持有 | 表达式闭环需要跨帧参数 |
| D3 | 扇出模型 | runtime/bridge 分发 | receive 不感知消费者 |
| D4 | 背压 | routingTick 预算截断 + 各 feature 独立节流 | 多层协作 |
| D5 | 星座图通道 | 不需要特殊通道 | bytes 解析 + display 侧 I/Q 提取 |

**拆分 2 个子 feature**：
1. **receive-real-pipeline**：完整管线（匹配→解析→表达式→read model→扇出），1 个 design，checklist 分阶段
2. **receive-real-highspeed**（推迟）：背压压测、星座图吞吐、高速存储短路

**4 个留空项（已有具体建议）**：
1. 全局参数来源：按 key 分归属，receive 在表达式求值前从各 selector 收集构造 VariableMap
2. display/storage 节流：display 由 routingTick 频率控制（默认 1000ms），storage 按批次聚合写入
3. routingTick 预算 N 值：初始 N=50 硬编码常量，串口 115200bps 约 115 帧/秒，N=50 单 tick 阻塞 < 5ms
4. 高速存储短路：pipeline 阶段走标准路径，highspeed 阶段视压测结果登记边界例外

关键事实：表达式引擎编译阶段已做依赖排序（Kahn 算法），运行时只需 evaluateGroup。变量来源 4 种：CURRENT_FIELD / FRAME_FIELD / GLOBAL_STAT / SCOE_DATA。display 已有 ingestSourceMaterial API，storage 已有 appendLocalRecords API，receive→task bridge 已完成。

### 八、6 Feature 交叉审查（c02eb89d, 1.0M）

send/receive/frame/connection/task/SCOE 六个 feature 只读交叉审查（SCOE 无代码，实际审五 feature）。

**发现 16 项问题**：1 critical（cloneUnknownValue 在 receive 和 frame 各有完全相同实现），12 fixed，1 partially fixed，2 low-priority not fixed，1 accepted as design。

**修复提示词 4 份**：
- A: shared clone 提取 + frame 公开 clone
- B: receive public API 补 selectByDirection
- C: task selector 不可变修复
- D: connection 变量名规范化

修复后复核：零回归。

**优先级确认**：settings 优先（7 个 feature 配置输入源）→ runtime 编排 → real adapter。

### 九、Condition-Matching 设计+实现（c666ecc3, 482K）

fastforward 路径，发现 shared/condition-operators/ 已有 8 个运算符（compareValues + ComparisonOperator + 168 tests），无需从零开始。

**3 项改动**：
1. FieldCondition 类型从 shared/ 移到 task feature（带业务语义"从哪个帧哪个字段取值"）
2. 补 contains 运算符到 compareValues() + 6 条测试
3. 清理 shared/condition-operators/ 只留纯匹配

**不加的东西**：range（between）— 旧系统范围场景通过表达式引擎复合条件实现；逻辑组合 AND/OR — 多条件组合是调用方业务逻辑。

### 十、Bootstrap 设计+实现（7c66f720, 754K）

让 runtime 真正跑起来：AppShell 启动时 adapter 选择、routingTick 定时驱动、端到端集成测试骨架。

**4 个文件改动**：
- `runtime/index.ts` — tick driver（startTickDriver/stopTickDriver），destroy 自动清理
- `app/rewriteRuntime.ts` — bootstrapRewriteRuntime()：检测 platform bridge → real/noOp adapter → 创建 runtime
- `app/AppShell.vue` — 调用 bootstrap + startTickDriver，unmount 自动清理
- `runtime/__tests__/bootstrap-integration.spec.ts` — 3 个集成测试

Tick driver 用 setInterval 实现，platform bridge 存在时选 real serial adapter，否则选 noOp。

### 十一、Frame-Real 设计更新（fad72400, 751K）

更新 2026-04-30 旧 frame design，对齐后续多项架构决策。

**自审发现 7 个实质缺口**，最关键：factor 字段缺失（旧数据 1918 处使用，新类型完全没有）。

**关键决策**：
- 保留 factor 字段
- identifierRules 的 startIndex/endIndex 迁移时归一化数字字符串混用
- checksumMethod 枚举化
- selector 浅拷贝改 structuredClone() 深拷贝

产出：更新后 `frame-real-design.md`（status: approved）+ `frame-real-checklist.yaml`（6 步）。

### Git 提交

- `2c0b451` (2026-05-08)：`refactor: 部分重写完成，继续重写中`

## 后续

1. **Receive-real 进入 cs-feat-design**：brainstorm 结论作为直接合同输入，需产出 `receive-real-pipeline-design.md` + checklist
2. **Platform expansion 进入 cs-feat-design**：TCP/UDP 四层架构已锁定，需产出 design + checklist
3. **审计风险修复**：P0 端到端集成测试骨架需在下一阶段开始前补充；selector 浅拷贝在各 feature 填肉时逐个排查
4. **`cloneFrameField` 值 import**：建议评估是否提取到 shared/，消除唯一跨 feature value import
5. **表达式引擎集成**：receive（替代 applyFactor）、task（扩展 condition-matcher）、send（buildFrame 前批量解析）三个集成点待后续 feature 实现时推进
