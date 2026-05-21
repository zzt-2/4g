# [S001] Agent 10 — Quality Rules 测试要求提取

> 2026-05-19 | 集成测试历史提取 | Agent 10
> 来源：`codestable/quality/rewrite-quality-rules.md`

## 目标

从 rewrite 质量规则文档中提取三类测试相关事实：
1. §8 Minimum Test Expectations 9 项 fixture 的覆盖状态
2. §9 Quality Gate 中集成测试级别才能覆盖的检查项
3. §10 Current Evidence Notes 中需集成测试证明"已消灭"的旧代码事实

---

## 1. §8 Minimum Test Expectations — 9 项优先 fixture 覆盖状态

来源：§8 第 374-383 行

| # | fixture 名称 | 现有测试文件 | 覆盖状态 |
|---|---|---|---|
| 1 | frame asset 校验和迁移输入输出 | `frame/__tests__/frame-core.spec.ts`（349 行）：含 `isLegacyFrameConfigJson`、`migrateLegacyFrameConfig`、`validateExpressionDefinition`、`validateFrameAsset`、`validateFrameAssetCollection` 及多 fixture | **已覆盖，core 单测级别充分** |
| 2 | receive bytes -> match -> fields -> expression/result | `receive/__tests__/receive-core.spec.ts`（115 行）：`processReceiveBatch` + 多 batch fixture；`receive/__tests__/expression-pass.spec.ts`：表达式集成 pass；`receive/__tests__/receive-fake-input.spec.ts`：fake adapter 测试 | **已覆盖 core 单测和 fake adapter，但 receive 完整管线（bytes 解析 -> match -> expression -> result）的端到端集成测试待确认是否在 runtime routing-tick 中补齐** |
| 3 | send frame build -> target request -> result | `send/__tests__/send-core.spec.ts`（223 行）：`buildFrame`、`calculateChecksum` 等；`send/__tests__/send-frame-resolver.spec.ts`（371 行）：`resolveFieldValues`、`evaluateFieldExpressions`；`send/__tests__/send-integration.spec.ts`（555 行）：service + state + fake writer 端到端 | **已覆盖，core + resolver + service 集成三层都有** |
| 4 | timed send / task state transition | `task/__tests__/task-core.spec.ts`（532 行）：`canTransition`、`transition`、`isTerminal`、`calculateProgress` + 多 taskDef fixture；`task/__tests__/task-condition-system.spec.ts`（424 行）；`task/__tests__/task-readiness.spec.ts`（256 行） | **已覆盖 core 单测级别，task state transition 充分** |
| 5 | SCOE command parse / checksum / completion condition | `command-ingress/__tests__/scoe-protocol-adapter.spec.ts`（491 行）：`validateChecksums`、parse、function code validation；`command-ingress/__tests__/task-builder.spec.ts`：completion condition 构建；`command-ingress/__tests__/command-ingress-integration.spec.ts`（373 行） | **已覆盖，SCOE 解析 + checksum + completion 均有单测和集成测试** |
| 6 | storage/history/CSV/legacy JSON migration | `storage-local-baseline/__tests__/storage-core-oracle.spec.ts`（86 行）：`normalizeStorageLocalRecord`、legacy JSON 处理；`storage-local-baseline/__tests__/storage-fake-adapter.spec.ts`（57 行）；storage service/state/selector 测试 | **已覆盖 core + fake adapter，CSV 导出和 history 查询的端到端集成测试待确认** |
| 7 | status mapping | `status/__tests__/status-core-service-state-selector.spec.ts`（498 行）：`deriveOverallHealthLevel`、`deriveConnectionHealth`、`deriveReceiveHealth`、`evaluateIndicatorRole`、`deriveIndicatorProjection` | **已覆盖 core + service + selector，层级完整** |
| 8 | result/report object generation | `result/__tests__/judge.spec.ts`（129 行）：`judgeCaseVerdict`、`isStepFailed`；`report/__tests__/report-core.spec.ts`（105 行）：`generateReport`、`mapSteps` | **已覆盖单测级别，result 判定 + report 生成分开测试。但 result->report 的集成管线（判定结果流入报告生成）待确认是否有跨 feature 集成测试** |
| 9 | northbound request/response mapping | **rewrite/src/features/northbound/ 目录不存在**；全局搜索 `northbound` 无匹配文件 | **未实现，无测试覆盖。这是已知的未启动 feature** |

### 关键发现

- **7/9 已有单测覆盖**（frame、receive、send、task、SCOE、storage、status）
- **result/report 有单测但跨 feature 集成待补**（#8）
- **northbound 完全未启动**（#9），属于规划中但尚未实施的 feature
- 所有已有测试均为 Vitest 单测/fake adapter 级别，**不覆盖真实串口、TCP/UDP、打包态、HTTP/FTP、customer validation**

---

## 2. §9 Quality Gate — 集成测试级别才能覆盖的检查项

来源：§9 第 396-421 行

### 2.1 进入实现前（第 397-403 行）

| 检查项 | 集成测试级别? | 说明 |
|---|---|---|
| 确认目标功能域和目录归口 | 否 | 设计阶段静态检查 |
| 确认是否涉及 northbound gap 或 SCOE 例外 | 否 | 设计阶段静态检查 |
| 确认旧行为 oracle 来源 | 部分 | oracle comparison 需要集成测试级别 fixture 对比，但 oracle 来源确认本身是设计活动 |
| 确认直接合同和边界护栏 | 否 | 设计阶段静态检查 |
| 确认 validation level / fixture / fake adapter / manual checklist / runtime blocker | 部分 | fake adapter test 是集成测试级别；runtime/hardware blocker 需要更高层级验证 |

### 2.2 实现过程中（第 406-412 行）

| 检查项 | 集成测试级别? | 说明 |
|---|---|---|
| 不新增裸 IPC | **是** | 需要 preload + main 集成测试验证 IPC 通道均为 typed API |
| 不新增跨 feature 内部状态写入 | **是** | 需要跨 feature 集成测试验证状态隔离 |
| 不绕过 feature public API | **是** | 需要跨模块 import 分析 + 集成测试验证访问路径 |
| 不把平台能力引入 core | 部分 | static scan 可部分覆盖；但 core + adapter 集成运行时需验证无 platform 泄漏 |
| 不把运行统计写回静态资产 | **是** | 需要 runtime 集成测试验证统计更新不污染 frame list 等静态对象 |
| 不把 store/composable/组件扩成业务 service | 部分 | 静态分析为主；但运行时需验证 composable 不承载业务规则 |
| 不把未讨论字段写成长期契约 | 否 | 设计审查级别 |

### 2.3 完成前（第 416-421 行）

| 检查项 | 集成测试级别? | 说明 |
|---|---|---|
| 提供验证证据 | 是（汇总） | 需要集成测试结果作为证据的一部分 |
| completion template 各层级结果说明 | **是** | fixture test、oracle comparison、fake adapter test 均属于集成测试层级 |
| 未验证 runtime/hardware/package/customer 项说明 | 否 | 是文档活动 |
| candidate to drop / deferred 项说明 | 否 | 是文档活动 |
| 不用 Vitest 宣称硬件/打包/HTTP 完成 | N/A | 是声明约束，非测试层级 |

### 集成测试级别的关键覆盖项汇总

以下 6 项是**只有集成测试才能有效覆盖**的 Quality Gate 检查：

1. **IPC 通道类型安全**：验证 preload 暴露的所有通道均为 typed API，无裸 invoke/send/on（对应 R5、R6）
2. **跨 feature 状态隔离**：验证 feature A 不直接写入 feature B 的内部 state（对应 R2、R7）
3. **feature public API 访问路径**：验证所有跨 feature 调用走 public API（对应 R2、R14）
4. **统计更新不污染静态资产**：验证 receive/send 事件触发统计更新后，frame list 等静态对象未被修改（对应 R13）
5. **core 层无 platform 依赖泄漏**：core 模块在运行时不调用任何 platform/adapter/Electron 能力（对应 R3）
6. **receive/send 主链与下游显式交互**：验证 receive 解析结果通过显式输出传递给 task/storage/status，而非同步副作用链（对应 R8）

---

## 3. §10 Current Evidence Notes — 需集成测试证明"已消灭"的旧代码事实

来源：§10 第 426-434 行，共 7 条旧代码事实（非 8 条，文档中实际为 7 条）

| # | 旧代码事实 | 新系统替代机制 | 集成测试证明需求 |
|---|---|---|---|
| 1 | `receiveFramesStore` 承接接收+SCOE+触发发送，职责边界偏宽（3 处引用） | receive core 纯函数 + command-ingress SCOE 处理 + runtime 编排 | **需要**：证明 receive 主链不直接触发 send/task，SCOE 进入 receive 走显式领域入口；routing-tick.spec.ts 部分覆盖但需补充 SCOE 路径 |
| 2 | 串口/网络高频数据逐包穿透 main->renderer->store | batch + buffer 策略 + platform facade | **需要**：证明高频数据经批处理后到达 renderer，非逐包；当前无真实串口/网络集成测试，此条**无法在 Vitest 中完成**，需要 runtime validation |
| 3 | preload 暴露面和文件/path API 边界需要收口 | typed platform facade | **需要**：证明 preload 只暴露 typed API，无裸 IPC；可通过静态 import 分析 + preload 集成测试覆盖 |
| 4 | `networkHandlers` 内嵌高速存储分流 | storage feature + 事件驱动 | **需要**：证明存储分流不是硬编码在数据接收路径中，而是通过显式事件/接口触发；**需要 runtime/hardware validation** |
| 5 | `scoeStore` 同时承担配置持久化+状态+连接+发送+测试工具 | command-ingress feature + task feature | **需要**：证明 SCOE 配置、连接生命周期、发送调度、测试工具状态分别归口到不同 feature；command-ingress 集成测试部分覆盖 |
| 6 | `useUnifiedSender` 跨 store 更新统计 + 硬编码 SCOE UDP | send service + send integration test | **已部分覆盖**：`send-integration.spec.ts`（555 行）验证 send service 不跨 store 写统计；但 SCOE UDP target 的显式化需 SCOE 集成测试补充 |
| 7 | 发送 UI 组件直接创建并启动 task | task service + composable 分层 | **需要**：证明 UI 组件只通过 composable 调用 task service 公开 API，不直接创建/启动 task 状态机；**需要 manual checklist 或 E2E 集成测试** |

### 关键发现

- **第 2、4 条**（高频数据逐包穿透、高速存储分流）涉及真实串口/网络/TCP 路径，Vitest 无法覆盖，需要 runtime validation 或 hardware validation
- **第 3 条**（preload 收口）可通过 preload 文件的静态分析 + 集成测试覆盖
- **第 7 条**（UI 直接启动 task）需要 manual checklist 或 E2E 测试验证
- **第 1、5、6 条**已部分有单测/集成测试覆盖，但需要补充跨 feature 交互路径的专门测试用例

### 特别注意

文档标题说"8 条旧代码事实"，但实际内容为 7 条（第 427-434 行）。7 条中有 5 条明确需要集成测试级别验证才能证明旧模式已消灭。

---

## 后续

- 本报告是纯事实提取，不做改进建议
- northbound (#9 fixture) 尚未启动，不需要当前轮集成测试关注
- 第 2、4 条旧代码事实的 runtime/hardware validation 独立于 Vitest 测试体系，应单独规划
- result->report 跨 feature 集成测试（#8 fixture）的缺失程度需对照实际业务流程确认
