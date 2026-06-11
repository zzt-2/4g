# [S007] Real Feature 实施期

> 2026-05-08 ~ 2026-05-09 | 实施阶段 | 已完成

## 目标

从"骨架"到"真实能力"的关键转折。在基础 feature 的 core/service/state/selector 骨架（153 tests 基线）和 runtime wiring 完成之后，集中 12 个对话完成 5 个 feature 的真实数据流接入：expression engine 全流程、frame-real 能力完善、receive-real 四阶段管线、connection 真实传输、send-real 完整 pipeline，以及 task-real 和 command-ingress 两个 brainstorm 锁定下一阶段方向。

## 记录

### 一、Expression Engine 全流程（05-08 下午）

**对话**: d673b857（brainstorm）+ 32712ad1（impl）

从 brainstorm 到 design 到 impl 到 accept 的完整闭环，用时 2 个对话。

**Brainstorm 核心产出**：

- 旧系统表达式引擎事实整理（~1385 行，`new Function()` 动态构造，Kahn 拓扑排序，LRU(50)+5min 缓存）
- 18 个真实配置文件样本分析：零函数调用（无 sin/cos/sqrt），全为算术表达式 + 条件分支
- 6 个设计决策锁定：AST parser 不用 BNF（手写递归下降）、预编译 + 依赖排序复用、条件用 `compileConditional`、数学函数最小集、API 表面 3 个函数（compile/evaluate/dependency）

**实现产出**（16 个新文件）：

```
rewrite/src/shared/expression/
  types.ts, tokenizer.ts, parser.ts, compile.ts,
  evaluate.ts, functions.ts, dependency.ts, index.ts,
  _internal.ts（内部类型封装）
  __tests__/  8 个 spec 文件
```

**验收**：112 测试全绿，tsc 零错误，性能 P1（10000 次 evaluateGroup < 50ms）/ P2（1000 次 compileGroup < 100ms）通过。零 Vue/Pinia/Electron 依赖。

**沉淀**：brainstorm 文档、learning 文档（旧系统模式 + parser 陷阱）、项目 memory 更新。

### 二、Frame-Real 实施（05-08 下午）

**对话**: b9ff125e

按 frame-real-design.md 实施，完善帧定义 feature 的真实数据能力。

**改动范围**（11 个文件）：

- `core/types.ts`：扩展 `FrameFieldDefinition` 增加 expression/condition 相关字段
- `core/clone.ts`：深拷贝适配新字段
- `core/legacy-normalizers.ts`：旧 JSON 格式迁移适配
- `core/validation-expression.ts` / `validation-frame.ts`：表达式条件验证
- `services/frame-asset-service.ts`：帧资产管理服务
- `index.ts`：公开 API 扩展
- `fixtures/frame-fixtures.ts`：测试 fixture 更新
- `__tests__/frame-core.spec.ts` + `frame-service-state-selector.spec.ts`：测试更新

**关键决策**：`getFrame(id)` 返回深拷贝（Selector 不可变约束），`getSnapshot()` 完整快照，L2 消费者测试通过（receive 9 pass + runtime 28 pass）。

**验收结论**：9 节全部勾选，8 个验收场景全部有单测证据，17 处外部引用全部通过 index.ts public API。

### 三、Receive-Real Phase 1：表达式集成（05-08 下午）

**对话**: 5b7cd403

按 receive-real-roadmap.md §4.1-4.3 实施。

**改动范围**（9 个文件）：

- `receive/core/types.ts`：`ReceiveParsedFieldValue` 增加 `expressionApplied: boolean` + `expressionError?: string`；新增 `FrameExpressionCompiled` 等 4 个缓存类型
- `receive/core/expression-pass.ts`（**新文件**）：预编译 + 运行时求值 + Kahn 排序集成
- `receive/core/field-parser.ts`：解析产出增加 `expressionApplied: false`
- `receive/core/processor.ts`：集成表达式求值 pass
- `receive/core/index.ts`：导出扩展
- `receive/services/receive-service.ts`：service 层适配
- `__tests__/expression-pass.spec.ts`（**新文件**）：表达式集成专项测试

**验收**：23 测试通过，lint 零新增错误。

### 四、Platform-Network-Transport 实施（05-08 下午）

**对话**: 367208f8

为 renderer 提供 TCP/UDP 传输能力的 platform facade，连接 connection feature 与 Electron main 进程。

**改动范围**（8 个文件，3 个新文件）：

- `rewrite/src-electron/main/network-handlers.ts`（**新文件**）：Managed 连接类型 + batch 基础设施 + event emission + intentionalDisconnect 集合 + cleanup
- `rewrite/src-electron/preload/index.ts`（**新文件**）：preload IPC 路由（`connectionTypes` Map + discriminated union 分发 serial/network）
- `rewrite/src/platform/transport.ts`（**新文件**）：renderer 侧传输 facade
- `rewrite/src-electron/main/index.ts`：注册 network handlers
- `rewrite/src/features/connection/adapters/real-serial-adapter.ts`：适配新 transport
- `rewrite/src/platform/index.ts` + `rewrite/src/shared/platform-bridge.ts`：facade 导出

**关键决策**：cleanup 并行调用两个 handler + 二次 clear 防泄漏；future HTTP/FTP transport 可复用同一 routing 模式。

**验收**：9 条 acceptance criteria 全部有证据（AC1-AC3 需手动网络验证）。

**沉淀**：2 个 trick 文档（preload IPC 路由模式、main handler 模板）、3 个预存 issue 记录。

### 五、Receive-Real Brainstorm（05-09 上午）

**对话**: e862ac7f

receive-real 是 rewrite 最复杂的 feature。brainstorm 锁定 5 个关键决策 + 2 子 feature 拆分。

**5 个锁定决策**：

| # | 决策 | 结论 |
|---|------|------|
| D1 | 表达式求值位置 | 独立阶段（field-parser 后） |
| D2 | read model owner | receive 持有（表达式闭环需跨帧参数） |
| D3 | 扇出模型 | runtime/bridge 分发（receive 不感知消费者） |
| D4 | 背压 | routingTick 预算截断 + 各 feature 独立节流 |
| D5 | 星座图通道 | 不需要特殊通道（bytes 解析 + display 侧 I/Q 提取） |

**拆分**：receive-real-pipeline（完整管线）+ receive-real-highspeed（推迟，背压压测、高速存储短路）。

**审查修正**：两轮审查发现 ExpressionDefinition 结构与实际代码不符、§4 大量重定义已有类型、FieldGroupMapping 和 FrameExpressionCache 过度设计。全部修正后产出 roadmap。

### 六、Receive-Real Phase 2+3：Read Model + 扇出接线（05-09 上午）

**对话**: ebd93ac3

按 roadmap §4.4-4.9 实施。

**改动范围**（10 个文件，4 个新文件）：

- `runtime/bridges/receive-display-bridge.ts`（**新文件**）：receive 到 display 的扇出 bridge
- `runtime/bridges/receive-storage-bridge.ts`（**新文件**）：receive 到 storage 的扇出 bridge
- `runtime/routing-tick.ts`（**新文件**）：runtime 级路由 tick，drain inputSource 后扇出到 display/storage
- `runtime/__tests__/routing-tick.spec.ts`（**新文件**）：routing tick 测试
- `receive/core/processor.ts`：产出 Outcome 扩展
- `receive/core/types.ts`：read model 类型定义
- `receive/state/receive-state.ts`：read model 状态管理
- `receive/services/receive-service.ts`：service 层适配
- `runtime/feature-wiring.ts`：bridge 注册
- `runtime/index.ts`：导出扩展

**验收**：roadmap §4.4-4.9 全部条款实现到位，1 个预存 bug 修复（`field.name` → `field.fieldName`）。

### 七、Receive-Real Phase 4：背压基础（05-09 上午）

**对话**: 6f45750d

按 roadmap §4.10 实施背压基础——routingTick 预算截断。

**改动范围**（3 个文件）：

- `runtime/routing-tick.ts`：新增 `RoutingTickOptions` 接口（`maxEventsPerTick?: number`），签名增加可选 options 参数，drain 后用 `slice(0, max)` 截断，默认 50
- `runtime/index.ts`：导出 `RoutingTickOptions`，签名透传 options
- `runtime/__tests__/routing-tick.spec.ts`：3 个新增测试

**验收**：15 个测试通过（含 3 个新增），37 个 runtime 测试全绿。

### 八、Connection 实施（05-09）

**对话**: 3e685291

按 rewrite-connection-design.md 实施，完善连接 feature 的真实传输能力。

**改动范围**（11 个文件，1 个新文件）：

- `connection/adapters/internal/map-bridge-event.ts`（**新文件**）：bridge event 到 connection 内部事件映射
- `connection/adapters/real-serial-adapter.ts`：适配 platform transport
- `connection/core/types.ts`：扩展连接类型
- `connection/core/lifecycle.ts`：生命周期管理增强
- `connection/core/clone.ts`：深拷贝适配
- `connection/selectors/connection-selectors.ts`：selector 更新
- `connection/index.ts`：公开 API 扩展
- `connection/fixtures/connection-fixtures.ts`：测试 fixture 更新
- `connection/__tests__/connection-state-service-selector.spec.ts`：测试更新

**验收**：580+ 测试通过，9/9 项设计-代码对齐，10 条验收场景全部有证据。CONN-RUNTIME-001/002、CONN-HW-001 待真实 TCP/UDP 环境验证。

### 九、Send-Real 实施（05-09）

**对话**: 6b13628a

按 send-real-design.md + checklist 实施，完成发送帧从用户输入到字节流出的完整 pipeline。

**改动范围**（14 个文件，3 个新文件）：

- `send/core/frame-resolver.ts`（**新文件**）：`frameToBuildInput` 提取 + `resolveFieldValues` / `evaluateFieldExpressions` / `applyFactor` 三个纯函数
- `send/core/index.ts`（**新文件**）：core 层导出
- `send/index.ts`（**新文件**）：feature 公开 API
- `send/core/types.ts`：扩展 `SendFieldEncodingDef`（factor/defaultValue/configurable/expressionConfig/validOption），`SendRequest` 迁移到 `userFieldValues`
- `send/core/validation.ts`：验证逻辑适配新类型
- `send/services/send-service.ts`：pipeline 重写为 9 步（validate → resolve frame → resolve field values → apply factor → build buffer → post-build patch → resolve target → transport write → emit result）
- `send/adapters/ports.ts`：适配器接口更新
- `send/adapters/index.ts`：导出扩展
- `send/fixtures/send-fixtures.ts`：测试 fixture 更新
- `__tests__/send-frame-resolver.spec.ts`（19 tests）、`send-checksum-patch.spec.ts`（20 tests）、`send-integration.spec.ts`（10 tests）

**关键设计决策**：表达式用 `compileConditional`（不是 `compileGroup`），factor 发送用 `/`（`rawValue = value / factor`），checksum 值超出字段字节宽度返回 build-error，非 configurable 字段用户输入静默忽略，本期不做 FIFO queue。

**验收**：100 tests 全绿，架构文档已更新 send/ 行。

### 十、Task-Real Brainstorm（05-09 晚）

**对话**: 7f84ea7a

讨论循环引擎、步骤执行、条件集成、结果产出、SCOE 复用等 8 个议题。

**核心结论**：

- 循环引擎三种策略（单次/固定次数/条件循环）统一为 `SchedulingDriver` 接口
- step 多态化：send-step / condition-step / delay-step / command-step 统一为 `TaskStepDefinition`
- 条件集成：step 内条件用 `ConditionTerm`（WaitCondition 重命名 + `logicOperator` 扩展），验证了 OR 在旧系统中确实被使用（UI AND/OR 下拉 + 运行时短路逻辑）
- Task 调用 Send 时传 `context: { source: 'task', taskId, stepIndex }`
- TimerService 放 platform/（具体位置待确认）

**审查修正**：SendRequest.context 缺失、文件清单不准（26 个非 6-8）、OR 使用需证据链、非 task 场景需说明。4 项全部修正后产出 brainstorm 文档。

### 十一、Command-Ingress Brainstorm（05-09 晚）

**对话**: e41319c9

统一外部系统命令接入 feature 的 brainstorm（旧 SCOE TCP 协议 + 新甲方 HTTPS 接口）。

**核心结论**：

- 两种协议适配器（TCP/SCOE 和 HTTPS/新甲方）统一为 `ProtocolAdapter` 抽象
- 命令映射到 task 执行引擎的 step（复用 task feature 的 step 多态化）
- 帧实例迁移方案 A（命令配置映射 + `ScoeCommandFrameMapping`，运行时从 frame feature 获取帧定义构造 send-step）
- 三层分发改为**消费者链**（routingTick 定义 `TransportEventConsumer` 接口，依次调用消费者，routingTick 不评估领域条件）

**4 个 CRITICAL 修正**：routingTick 违反架构原则（三层分发改消费者链）、SCOE 帧实例迁移方案未分析、TCP server 能力确认可用、SCOE 行为覆盖不完整（补充 LOAD 门控两阶段状态机、每秒状态机轮询、参数化索引对齐）。

**沉淀**：command-ingress-brainstorm.md，覆盖度从 17/20 更新为 20/23。

### 总览

| 工作线 | 对话数 | 新增文件 | 编辑文件 | 测试 |
|--------|--------|----------|----------|------|
| Expression Engine | 2 | 16 | 5 | 112 pass |
| Frame-Real | 1 | 0 | 11 | 28+ pass |
| Receive-Real (Phase 1-4) | 4 | 8 | 16 | 37+ pass |
| Platform-Network-Transport | 1 | 3 | 5 | build pass |
| Connection | 1 | 1 | 10 | 580+ pass |
| Send-Real | 1 | 3 | 11 | 100 pass |
| Task-Real Brainstorm | 1 | 0 | 0 | N/A |
| Command-Ingress Brainstorm | 1 | 0 | 0 | N/A |
| **合计** | **12** | **31** | **58** | **857+** |

## 后续

- Task-Real 详细设计与实施在 05-10 完成（Phase 1-2 + 验收）
- Command-Ingress 详细设计与实施在 05-10 ~ 05-11 完成（W1-W3 + 验收）
- Storage-Real 验收在 05-11 完成
- S010 记录 05-12 的 Send/Task 简化和测试修复
- 未完成项：高速存储短路、真实串口/SCOE/TCP 硬件验证、TimerService 具体位置
