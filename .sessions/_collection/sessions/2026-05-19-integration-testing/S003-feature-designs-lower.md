# [S003] Feature 设计文档提取（下）：Task / Command-Ingress / Result-Report / Northbound / 执行引擎

> 2026-05-19 | 设计文档提取 | 完成
> 9 个 agent，3 批 × 3，覆盖 task / task-real / command-ingress / result-report / northbound / 执行引擎 / 出站路由 / feature 交互矩阵 / 旧系统行为

## 目标

从 task、command-ingress、result、report、northbound 相关设计文档和 compound 决策文档中提取所有验收标准、跨 feature 交互契约和测试期望。

## 记录

### 1. Task Feature（通用执行引擎）

**来源**：`codestable/features/rewrite-task/rewrite-task-design.md`、`rewrite-task-checklist.yaml`

#### 1.1 核心验收标准

| 验收项 | 标准 | 证据位置 |
|--------|------|----------|
| 通用执行引擎 | 接收 step 序列，按序执行，处理错误，追踪进度 | design.md §4.1 |
| 触发来源无关性 | 不区分来源（UI/定时器/receive/SCOE/northbound），执行逻辑统一 | design.md §2 |
| Step 多态化 | send-step / wait-condition-step / delay-step 三种 | design.md §4.1 |
| Lifecycle | created→running→paused→running→stopped/completed/failed；stop 后状态为 stopped | design.md §4.1 |
| 错误策略统一 | retry / skip / stop / pause 适用于所有 step 类型 | design.md §4.1 |
| 条件匹配 | wait-condition 和 trigger 共用，支持 AND/OR 组合 | design.md §4.1 |

#### 1.2 ScheduleDriver 4 种模式

| 模式 | 验收条件 |
|------|----------|
| immediate（顺序） | 无 stopCondition，执行完所有 steps 后 completed |
| timer（定时固定 N 次） | timer(intervalMs) + stopCondition.maxIterations=N |
| timer（定时无限） | timer(intervalMs)，无 stopCondition，直到用户 stop |
| event（条件触发） | event(conditions)，条件匹配后执行 steps，cooldown + maxTriggerCount |

#### 1.3 交互契约

| 方向 | 交互方式 |
|------|---------|
| task→send | `SendServiceProvider.execute(req): Promise<SendResult>` |
| task→receive | `ReceiveEventSource` adapter port 订阅事件 |
| task→frame | `FrameAssetReader` 只读查询帧定义 |
| task→result | emit `TaskInstanceCompletion`（实际用 `onSettled`） |

#### 1.4 Checklist 实现状态

- 16 个核心步骤全部已实现（t1-t16）
- 23 个关键检查项大部分已实现（c1-c23）
- 70+ 单测通过
- **Phase 2 待实现**：ScheduleDriver 类型重组、统一 runTask、step.repeat、fieldVariations、exitCondition
- **Phase 3 待实现**：TimerService platform 实现（Web Worker）

#### 1.5 待确认项

- TimerService 在 platform/ 下的具体位置
- SCOE 任务是否出现在用户可见任务列表
- maxStepResultHistory 的可配置性
- 多任务并发时 target-level 协调策略
- 旧 task config JSON 兼容范围

---

### 2. Task-Real Design

**来源**：`codestable/features/rewrite-task/task-real-design.md`、`task-real-brainstorm.md`

#### 2.1 增量验收标准

| 能力 | 验收条件 | 实现状态 |
|------|----------|----------|
| ScheduleDriver | discriminated union: immediate/timer/event | ⏸️ Phase 2 |
| ConditionTerm.logicOperator | AND/OR 短路评估 | ✅ 已实现 |
| evaluateConditionGroup | 纯函数，O(1) 查找 | ✅ 已实现 |
| FieldVariation | 按轮次注入 field values | ⏸️ Phase 2 |
| StepRepeat | send step 单步重复 | ⏸️ Phase 2 |
| TaskStopCondition.exitCondition | 条件退出 | ⏸️ Phase 2 |
| 统一 runTask | 替代三循环，driver + stopGuard | ⏸️ Phase 2 |

#### 2.2 关键设计决策（9 项）

1. 去掉 IterationControl → stopCondition + step.repeat
2. step.repeat 只加在 send step 上
3. OR 组合保留（旧系统有完整支持）
4. correlate 不做（adapter 内部 resolve）
5. FieldValueSpec.expression 不做（归 send）
6. fieldVariations 自动决定 maxIterations
7. 单帧发送走同引擎（immediate + 一个 send step）
8. SCOE 保持"翻译成 TaskDefinition"单一职责
9. TimerService 放 platform facade（Web Worker 实现）

#### 2.3 UI 依赖关系

**关键结论**：UI 不依赖 task-real 类型重组，可基于旧类型体系完成实施。Phase 2 类型变更集中在一个 26 文件 PR 内。

---

### 3. Command-Ingress Feature

**来源**：`codestable/features/rewrite-command-ingress/` 三份文档

#### 3.1 验收标准

| 验收项 | 标准 |
|--------|------|
| TransportEventConsumer | 接口与 design §1.1 一致 |
| ProtocolAdapter | canHandle/parse/consume 接口签名 |
| 两阶段状态机 | phase 1 只匹配 LOAD(0x01)，phase 2 全部可识别 |
| 6 种 handler | LOAD/UNLOAD/HEALTH/LINK/SEND_FRAME/READ_FILE_AND_SEND |
| TaskBuilder | SEND_FRAME→immediate，READ_FILE_AND_SEND→timer+fieldVariations |
| 消费者链 | routingTick 中 command-ingress 先于 receive 消费 |
| Selector 不可变性 | 返回 readonly 深拷贝快照 |

#### 3.2 Checklist 状态

**25/25 项全部 done**，3 波次（Wave 1 Core Protocol → Wave 2 Handlers → Wave 3 Integration）。

#### 3.3 测试覆盖

- **scoe-protocol-adapter.spec.ts**：功能码 0x01/0x02/0x05、标识符验证、校验和、边界测试
- **task-builder.spec.ts**：SEND_FRAME 翻译（delay+wait-condition）、READ_FILE_AND_SEND 翻译（fieldVariations+maxIterations）、参数化条件索引对齐
- **command-ingress-integration.spec.ts**：完整生命周期（LOAD→SEND_FRAME→ACK→UNLOAD）、服务方法、Reader 方法
- **migration.spec.ts**：migrateGlobalConfig、migrateFrameInstances、migrateCompletionConditions（6 种旧运算符映射）、migrateCommand
- **其他**：handler.spec.ts、send-ack-frame.spec.ts、data-recorder.spec.ts、highlight.spec.ts、highlight-v2.spec.ts、command-log.spec.ts、validation.spec.ts

#### 3.4 待确认项

- TimerService 位置（与 task-real 共用）
- 卫星配置持久化接入时机
- satelliteConfigs 数据源

---

### 4. Result + Report Features

**来源**：`codestable/features/rewrite-result/` 三份文档

#### 4.1 Result 验收标准

| 验收项 | 标准 | 实现状态 |
|--------|------|----------|
| core/ 无外部依赖 | 无 Vue/Pinia/Electron/Node 依赖 | ✅ |
| judgeCaseVerdict | 纯函数，基于 TaskExecutionSummary 判定 passed/failed/stopped | ✅ |
| ResultService.collectResult | 接收终态 TaskInstanceState | ✅ |
| Selector 不可变性 | 只读快照 | ✅ |
| Runtime 编排 | task 终态时自动触发 result 收集 | ❌ 未实现 |
| Storage 持久化 | archiveResults | ❌ 未实现 |
| TaskResultSummary 聚合 | — | ❌ YAGNI 掉 |
| ResultReadModel 窗口查询 | — | ❌ YAGNI 掉 |

#### 4.2 设计偏离

- **事件机制被移除**：从 TaskInstanceCompletion 事件改为 `onSettled` + runtime 编排
- **类型大幅简化**：CaseResult → CaseVerdict，移除聚合类型
- **Report 无独立 design.md**：设计内容散落在 result design 和 brainstorm 中

#### 4.3 Report Feature

- 已实现 `generateReport()` 硬编码函数和 `ReportJson` 类型
- MVP 只支持 JSON 输出
- 无独立设计文档
- 与 storage 集成未实现

#### 4.4 三层分离（Result / Report / Northbound）

| 层 | Owns | 不 Owns |
|----|------|---------|
| Result | 内部结果事实、归因规则 | 报告文件、外部格式、交付动作 |
| Report | 报告对象生成、素材归集 | 内部 truth、HTTP/FTP 交付 |
| Northbound | 外部投影、对外交付 | 内部 truth、报告生成 |

---

### 5. Northbound

**来源**：`codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md`、`.sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md`

#### 5.1 甲方 4 接口闭环映射

| 接口 | 方向 | 映射 | 状态 |
|------|------|------|------|
| setTestTask | 甲方→我们 | testCase → 一个 task | 逻辑通 |
| controlTestTask | 甲方→我们 | abort/pause/continue/stop → task 控制 | 通 |
| testCaseResultReport | 我们→甲方 | task 终态 verdict → success/fail/tbd | 有基础需接线 |
| msgReport | 我们→甲方 | step 完成 → stepInfo | 缺 step 事件（G1） |

#### 5.2 已拍板决策

1. testCase = task 映射
2. parallel=true 层同时 createTask + startTask
3. parallel=false 层顺序执行等 onSettled
4. immediate 始终 true — 收到直接执行
5. isEnd 始终 true — 一次下发全部 testCaseInfo
6. HTTPS server 放 main process，业务逻辑在 renderer
7. northbound 做独立 feature
8. result 不改动，northbound 自己接线

#### 5.3 Gap 清单

| 缺失项 | 影响 | 改动范围 |
|--------|------|----------|
| step 级事件通知 | msgReport 无驱动源 | task 执行循环加回调 hook |
| HTTPS outbound client | 无法 POST 数据 | platform facade 新增 |
| FTP 上传 | 文件上传无通道 | platform facade 新增 |
| result 自动收集 | 需手动调 collectResult | northbound feature 接线 |
| 报告生成 | 只有 placeholder | northbound feature 实现 |
| 身份体系 | 无权威 deviceId 编码来源 | 待甲方确认 |
| 心跳机制 | 无心跳计时器/协议 | 需实现 |

---

### 6. 统一执行引擎决策

**来源**：`codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`

| 决策 | 内容 | 验证方式 |
|------|------|----------|
| D1 | task 定位为通用执行引擎 | 多种触发来源测试 |
| D2 | TaskStepDefinition 多态化 | 三种 step 类型执行测试 |
| D3 | 5 种场景映射 | 端到端 step 序列测试 |
| D4 | SCOE 不需要自己的执行器 | 集成测试验证通过 task 执行 |
| D5 | send 不变 | 契约测试 |
| D6 | 条件匹配归 task/core | 单元测试 |

**实现状态**：文档为 draft 状态，决策只有文档定义。

---

### 7. 出站路由决策

**来源**：`codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`

| 决策 | 内容 |
|------|------|
| D1 | SCOE 命令帧 targetId 来自 frameInstances 配置 |
| D2 | Northbound 任务 targetId 来自 deviceTargetMap 映射 |
| D3 | 确认帧只支持固定值，首轮不支持遥测选取 |
| D4 | 首轮不做 task-level 并发协调，依赖 send QueueModel |

**三条出站路径**：
1. 用户路径：UI→TaskDefinition→执行→进度追踪
2. SCOE 路径：TCP 接收→协议解析→TaskDefinition→执行→确认帧发送
3. Northbound 路径：HTTP 接收→JSON 解析→TaskDefinition→执行→回报

---

### 8. Feature 交互矩阵

**来源**：`codestable/architecture/rewrite-feature-interaction-matrix.md`、`rewrite-feature-boundaries.md`

#### 8.1 交互规模

- **13 个 feature，43 条交互路径**
- Runtime 编排：高频数据路由、生命周期装配、跨 feature 路由、结果归集
- 直接 Public API：低频 command/query、只读 selector

#### 8.2 测试覆盖缺口

- 硬件验证：真实串口/TCP/UDP、SCOE 真实设备、高频数据链路
- 打包态验证：打包态 data path 写入/备份/清理
- 客户验收：northbound HTTP/FTP 交付、JSON TestReport
- 高速存储短路：high-speed storage 命中后是否短路普通链路

#### 8.3 风险注册

- Runtime 容易变成全局业务中心（receive/task/northbound/SCOE 的扇出风险）
- Public API 过重（frame/connection/receive/task/storage/status/display/northbound）
- 旧代码跨写（serialStore→receiveFramesStore、receiveFramesStore 多职责、useUnifiedSender 多写）

---

### 9. 旧系统必须保留的行为

**来源**：`codestable/compound/2026-05-07-old-system-investigation-scoe-expression-visualization.md`

#### 9.1 SCOE 必须保留

| 行为 | 旧代码位置 | 新系统对应 |
|------|-----------|-----------|
| 校验和计算（累加取模 256） | `scoeFrame.ts:310-358` | shared/checksum/ |
| 6 种指令执行策略 | `useScoeCommandExecutor.ts:80-87` | command-ingress handler |
| 100ms 异步轮询条件等待 | `scoeFrame.ts:501-540` | task wait-condition-step |
| 参数解析（偏移/长度/选项匹配） | `scoeFrame.ts` | command-ingress protocol-adapter |

#### 9.2 表达式引擎必须保留

| 行为 | 新系统对应 |
|------|-----------|
| 4 种数据源（CURRENT_FIELD/FRAME_FIELD/GLOBAL_STAT/SCOE_DATA） | shared/expression/ |
| 拓扑排序执行（Kahn 算法） | shared/expression/ |
| 循环依赖检测+并行回退 | shared/expression/ |
| 数学函数（sin/cos/sqrt/log/pow 等 12 种） | shared/expression/ |
| 多条件表达式（ConditionalExpression） | shared/expression/ |

#### 9.3 可视化必须保留

| 行为 | 新系统对应 |
|------|-----------|
| 星座图 hex 按位宽解析（有符号数） | shared/parse/ 或 display feature |
| 循环缓冲区（容量动态调整） | shared/buffer/ 或 display feature |
| 星座图 I/Q 数据收集 | display feature |
| ECharts 增量更新模式 | display feature |
| 数据窗口裁剪和采样 | display feature |

#### 9.4 明确排除

- SCOE 独立帧列表、独立完成条件系统
- 表达式引擎 store 依赖
- `Record<string, unknown>` 传参
- 硬编码定时器、星座图无上限累积
- 跨 store 循环依赖、测试工具耦合核心 store

---

### 10. 综合发现：集成测试关键接缝

#### 10.1 P0 数据通路（必须端到端测试）

1. **task→send 执行链**：TaskDefinition 创建 → send-step 执行 → SendResult 返回 → 进度更新
2. **task→receive 条件链**：wait-condition-step 订阅 → receive 事件匹配 → 条件满足/超时
3. **command-ingress→task 链**：SCOE 事件消费 → 协议解析 → TaskBuilder 翻译 → task 创建执行 → ACK 发送
4. **routingTick 消费者链**：connection data events → command-ingress consume(remaining) → receive drainInputSource
5. **result 收集链**：task onSettled → result collectResult → verdict 判定
6. **northbound 闭环**：HTTPS 接收 → task 创建 → 执行 → verdict → POST 回报（大部分未实现）

#### 10.2 P1 重要接缝

7. **task 定时循环**：timer driver → intervalMs → 多 iteration → stopCondition
8. **task 条件触发**：event driver → receive 事件 → 条件匹配 → cooldown → maxTriggerCount
9. **command-ingress 两阶段状态机**：LOAD → phase 转换 → 全命令可用 → UNLOAD 重置
10. **出站路由**：targetId 来源（frameInstances vs deviceTargetMap）→ 正确路由到下位机/SCOE
11. **result→report 生成**：TaskInstanceState + CaseVerdict → ReportJson

#### 10.3 P2 边界情况

12. **task 错误策略**：retry/skip/stop/pause 在各 step 类型上的正确应用
13. **onTimeout 与 errorPolicy 两层交互**：continue/skip 不触发 errorPolicy，fail 才触发
14. **condition AND/OR 短路**：多条件组合的求值顺序和短路行为
15. **task 并发**：多 task 实例同时执行，共享 send service 的 QueueModel
16. **persistence 时序**：LazyPersistence setDelegate 前后的行为差异

---

## 后续

- 本文件是对话 3（Feature 设计文档提取下）的产出，与 S002（对话 2，Feature 设计文档提取上）合并后供对话 6（S006 综合）使用
- 所有发现需在综合阶段与 S001（历史讨论提取）交叉验证，去除已有单测覆盖的项
- northbound 大部分能力未实现，集成测试应标记为 blocked 待实现
- task-real Phase 2 类型和引擎重组尚未实施，相关集成测试应标记为 pending
- 旧系统行为 oracle 来源已列出具体代码位置，供 S004（旧系统可观测行为提取）进一步细化
