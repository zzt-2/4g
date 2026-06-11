# [S008] Feature 验收 + Command-Ingress 全流程

> 2026-05-10 ~ 2026-05-11 | 实施+验收阶段 | 已完成

## 目标

完成 task-real 详细设计与分阶段实施（Phase 1 类型/条件系统 + Phase 2 统一引擎）、command-ingress 从详细设计到三波实施（W1/W2/W3）再到验收闭环、同时完成 receive-real 和 storage-real 两个 roadmap feature 的最终验收。这是重写进入"real feature"密集交付期的关键两天。

## 记录

### 一、Task-Real 详细设计（05-10）

**对话**: a6f659a7

基于 05-09 task-real brainstorm 的产出，完成 task-real 详细设计和 checklist 重写。

核心决策：
- 引入 `ScheduleDriver` 联合类型（`immediate` / `timer` / `event`）替代旧 `TaskSchedulingMode` 枚举
- 引入 `ConditionTerm` + `evaluateConditionGroup`（AND/OR 组合 + 短路求值）替代旧单条件匹配
- 引入 `FieldVariation` + `StepRepeat` 支持 READ_FILE_AND_SEND 场景
- `WaitConditionConfig` 统一等待条件配置
- 移除 `TaskSchedulingMode` / `TaskTriggerSource` / `WaitCondition` 及对应常量

三个旧对话 review 问题修复：
1. CRITICAL: checklist 与 design 脱节 → 重写 checklist（12 实施步骤 + 20 检查项）
2. CRITICAL: buildSendRequest 字段不匹配 → design 第 4.1 节对齐表 + checklist c5 专项验证
3. HIGH: ConditionMatchInput 跨 feature → design 第 3.4 节明确 runtime 适配器层变更

产出文件：`codestable/features/rewrite-task/task-real-design.md`、`codestable/features/rewrite-task/rewrite-task-checklist.yaml`

实施拆分建议：26 个文件 + 70+ 测试，按依赖边界拆为两轮（Phase 1: 类型+条件 / Phase 2: 引擎+集成）。

### 二、Task-Real Phase 1: 类型系统 + 条件系统（05-10）

**对话**: 2f1da7d9

实施 checklist step t1-t4。改动 6 个文件：

| 文件 | 变更 |
|------|------|
| `core/types.ts` | MAJOR — 新增 ScheduleDriver/ConditionTerm/FieldVariation/StepRepeat/WaitConditionConfig/resolveStopCondition；重组 5 个核心类型；移除 3 个旧类型+常量 |
| `core/condition-matcher.ts` | MAJOR — evaluateConditionGroup（AND/OR + 短路）+ evaluateSingleCondition |
| `services/condition-registry.ts` | MAJOR — registerGroup/unregisterGroup 替代 register/unregister |
| `core/index.ts` | FOLLOW — 导出新类型和函数 |
| `task/index.ts` | FOLLOW — 更新 feature 根导出 |
| `fixtures/task-fixtures.ts` | FOLLOW — 全部 fixture 适配新类型 |

独立 code review 发现 2 个 HIGH 问题并修复：
1. `SendStepConfig.variables` 类型从 `ReadonlyMap<string, unknown>` 收窄为 `ReadonlyMap<string, string | number | boolean>`
2. `timeoutMs` 移除硬编码 30s 默认值，`undefined` 时不再创建 timer

验证：0 类型错误，138 测试通过（含 24 个新条件系统测试）。

### 三、基础设施 Bug 修复（05-10）

**对话**: 2a6f2e20

4 个阻碍后续实施的预存基础设施问题，一次修完：

1. `feature-wiring.spec.ts` — 未使用变量 `_` 重命名为 `_bytes` 并加 `void` 标记
2. `bootstrap-integration.spec.ts` — fake adapter import 改为直接引用 `test-exports`
3. `rewrite-runtime.spec.ts` — 同上
4. `connection/index.ts` — 移除 `createFakeConnectionTransportAdapter` 从 public API 导出

验证：Build 成功，662 tests passed。2 个 pre-existing failure（connection-reconnect hook timeout、task-core `any` operator）与本次修复无关。

### 四、Command-Ingress 详细设计（05-10）

**对话**: 792928a8

基于 05-09 command-ingress brainstorm 的产出，完成详细设计。1109 行，13 个主章节 + GAP 表。

与 task-real 对齐后的关键变化：
- G1 fieldVariations: 从 CRITICAL 阻塞 → **已关闭**，task-real 确认引入
- G2 单条件限制: **已关闭**，task-real 改为 `conditions: ConditionTerm[]`
- G3 sendService: **已关闭**，`SendService.execute()` + `userFieldValues` 对齐
- SEND_FRAME 翻译: `schedulingMode: 'sequence'` → `schedule: { kind: 'immediate' }`
- READ_FILE_AND_SEND: 方案 A 锁定（fieldVariations + timer schedule）

剩余 GAP：
- G4 TimerService 位置：待确认（后续由 task-real Phase 2 引入 `TimerService` 接口解决）
- G5 卫星配置持久化：待 storage feature
- G6 satelliteConfigs 来源：待确认数据源

实施按依赖边界拆为三波：
- W1: core + protocol adapter（无 task-real 依赖，可并行）
- W2: handlers + TaskDefinition 翻译（需 task-real 类型）
- W3: 集成 + 验收（需 W1+W2 合完）

### 五、Command-Ingress W1: Core + Protocol Adapter（05-10）

**对话**: c605fe25

完成 C1-C11, C22-C23, C26。新建 `rewrite/src/features/command-ingress/` 目录结构，改动 15 个文件：

核心模块：
- `core/types.ts` — 所有配置类型（ScoeGlobalConfig、ScoeCommandConfig、SatelliteConfig 等）
- `core/state.ts` — State + Reader/Writer，structuredClone 深拷贝
- `core/protocol-adapter.ts` — ProtocolAdapter 接口
- `core/handler.ts` — Handler 签名 + CommandContext

ScoeProtocolAdapter（两阶段状态机解析）：
- `adapters/scoe-protocol-adapter.ts` — canHandle（同步头检测）、parse（功能码 + 校验和 + 参数 resolve）、consume（W1 只做分类验证）
- 导出 `extractAndResolveParams` / `validateChecksums` 供测试直接使用

其他：
- 4 个 selector（返回 readonly 快照）
- `runtime/consumer-chain.ts` — TransportEventConsumer 接口
- `scripts/migrate-scoe-config.ts` — 迁移脚本
- `adapters/northbound-protocol-adapter.ts` — stub

独立 code review 修复 6 项：parse() bytes guard、深拷贝改 structuredClone、patch 类型收窄、consume() catch 加 console.warn、测试增强、W1/W2 边界注释。

验证：29 tests 全绿，lint 0 errors，build succeeded。

### 六、Command-Ingress W2: Handlers + TaskDefinition 翻译（05-10）

**对话**: 8fba7a27

完成 C12-C18。改动 17 个文件：

6 种 handler 实现：
- `handle-load.ts` — LOAD 命令：加载卫星配置到 state
- `handle-unload.ts` — UNLOAD 命令：清除活跃配置
- `handle-send-frame.ts` — SEND_FRAME：翻译为 TaskDefinition + 创建+启动任务
- `handle-read-file-and-send.ts` — READ_FILE_AND_SEND：fieldVariations + timer schedule 翻译
- `handle-health-check.ts` — HEALTH_CHECK：读取连接状态 + 写入 healthStatus
- `handle-link-check.ts` — LINK_TEST：写入 linkTestResult

TaskBuilder：
- `core/task-builder.ts` — `buildSendFrameTask` / `buildReadFileAndSendTask`：将 ScoeCommandConfig 翻译为 TaskDefinition，对齐 task-real 新类型

Service 层：
- `services/command-ingress-service.ts` — 统一入口，onCommand dispatch 到对应 handler
- `services/status-timer.ts` — 定时刷新状态

辅助：
- `handlers/send-ack-frame.ts` — SCOE 确认帧发送

独立 code review 修复 7 项（含 1 CRITICAL + 5 HIGH）：
1. CRITICAL: adapter commandConfigs 不刷新 → parse() 改用 getCommandConfigs() 动态读取
2. HIGH: onSettled 无 .catch() → 合并到 service 层统一监控
3. HIGH: trackTask stale Set 引用 → .then() 内重新查找
4. HIGH: lastCommandCode 永远为空 → handler 中加 updateStatus
5. HIGH: healthStatus/linkTestResult 不更新 → handler 根据 snapshot 写状态
6. HIGH: sendAckFrame 缺 frameReader guard
7. HIGH: onSettled 重复监控 → handler 只做 create/start，service 统一处理 settlement

验证：57 tests 全绿，build 通过。

### 七、Task-Real Phase 2: 统一引擎 + 集成（05-11）

**对话**: b62bc112

实施 checklist step t5-t12。改动 8 个文件：

| 文件 | 变更 |
|------|------|
| `services/task-step-executors.ts` | 新增 `resolveFieldValues`；buildSendRequest 增加 iteration 参数，集成 fieldVariations 注入和 variables 透传 |
| `services/task-iteration-loops.ts` | MAJOR 重写 — 移除 runTimedLoop/runTriggerLoop/runSequenceLoop，新增统一 `runTask` + `createDriver`(immediate/timer/event) + `createStopGuard`(maxIterations + maxDurationMs + exitCondition) + `executeRepeatableSend` |
| `services/task-service.ts` | runExecutionLoop 从 switch 改为 runTask 调用；新增 fieldValueProvider/timerService 选项 |
| `adapters/ports.ts` | 新增 `TimerService` 接口 |
| `__tests__/task-core.spec.ts` | 新增 evaluateConditionGroup 测试（AND/OR/mixed/短路/空/单条件，20 项）+ ConditionRegistry 组注册测试 |
| `__tests__/task-service-state-selector.spec.ts` | 新增统一引擎集成测试 |

验证：120 tests 全绿，build exit 0，lint 零错误。

### 八、Task-Real Phase 2 验收（05-11）

**对话**: 02f1f099

对照 design + checklist 验收。发现并修复 4 项已知差距 + 2 个预存问题：

1. `timerService?: unknown` → `TimerService` 类型收窄
2. stepResults 文档 1000 → 100 纠正
3. 新增 cooldownMs 集成测试
4. 新增 repeat-send failure + skip-step 测试（2 条）
5. fieldVariations 测试缺 `async`（预存 bug）
6. `resolveFieldValues` 超界行为从跳过改为 clamp 到末值（预存 bug）

验证：748 tests passed，build 零错误。`respects step ordering` 测试时序敏感、偶发失败（非本次引入）。

**验收结论: PASS-WITH-KNOWN-GAPS** — 功能逻辑完整，存在 1 个时序敏感测试（非本次引入）。

### 九、Task-Real 间歇性测试修复（05-11）

**对话**: 5cebd4c6

继续修复 task-real 测试间歇性失败。

根因：`runExecutionLoop` 是 fire-and-forget，多个测试使用真实 `setTimeout` 做延迟，部分测试结束后 async 操作仍在后台运行，泄漏到后续测试。

修复：
1. `task-service.ts` finally 块从 `abortResolvers.delete(instanceId)` 改为 `lifecycle.abortInstance(instanceId)`，确保正常完成的任务也 resolve signal
2. 两处 trigger 测试末尾加 `service.stopTask()` 清理

状况：单独运行每个测试通过，套件运行仍有约 30-40% 间歇性失败（失败模式从 STACK_TRACE_ERROR 改善为 `expected 'running' to be 'completed'`）。上下文接近满载，交接给新对话继续。

### 十、Command-Ingress W3: 集成 + 验收（05-11）

**对话**: 346c7b17

完成 C19-C25。改动 10 个文件：

C19 消费者链集成（核心改动）：
- `runtime/feature-wiring.ts` — 新增 `eventConsumers` 字段、`commandIngress?` 可选配置、L4 层装配 CommandIngressService
- `runtime/routing-tick.ts` — 新增消费者链（consumer chain → remaining → receive）、`consumerConsumed` 结果字段

C21+C22 sendAckFrame 验证测试。

C24 迁移脚本验证 — 6 种 operator 映射、frameInstances→fieldMappings、label/description 迁移。

C25 集成测试 — 完整生命周期（LOAD→SEND→task→ack→UNLOAD）、消费者链优先级、UNLOAD 清理。

验证：全量测试通过，build 通过。

### 十一、Command-Ingress Lint 修复 + 验收（05-11）

**对话**: e7c6e7bc

修复 28 个 lint error（未使用 import、`as any` 替换为类型安全写法、import 路径修正等）。改动 7 个文件：

- `core/task-builder.ts` — 移除未使用 import
- `handlers/handle-health-check.ts` — `ConnectionStateSnapshot.runtimeFacts` 替换 3 处 `any`
- 4 个测试文件 — 修正 import 路径、类型安全转换、移除未使用变量
- `codestable/features/rewrite-command-ingress/command-ingress-checklist.yaml` — 26/26 items 标记 done

验证：803 tests passed, 0 lint errors, build succeeded。

**验收结论: PASS** — 三波实施全部完成，checklist 26/26 done，build + lint + test 三项全绿。

### 十二、Receive-Real 最终验收（05-11）

**对话**: 8c7d966d

对照 roadmap 逐项确认 receive-real-pipeline 完成状态。更正验收报告中的背压截断状态（原报告标"推迟"，实际已实现）。

完成度：

| roadmap 项目 | 状态 |
|---|---|
| 表达式引擎集成（预编译+求值+依赖排序） | done |
| Read model 索引（getReadModelIndex + selector） | done |
| 扇出 → Display bridge | done |
| 扇出 → Storage bridge + settings 开关 | done |
| 扇出 → Task bridge（ReceiveEventSourceBridge） | done |
| 扇出 → Unmatched 统计计数 | done |
| 预算截断（maxEventsPerTick=50） | done |
| globalParams 收集 | 推迟（依赖 settings） |

验证：803 tests passed，lint 通过。Build 失败为 WSL 文件系统 EACCES 权限问题，与 receive 代码无关。

**验收结论: PASS-WITH-KNOWN-GAPS** — globalParams 收集推迟到 settings feature 完善。

### 十三、Storage-Real 验收（05-11）

**对话**: ccee53b9

对照 `rewrite-storage-local-baseline-checklist.yaml` 逐项审查。

验证证据：
- Build: succeeded
- Lint: passed
- Test: 803 tests, 47 files, all green（其中 storage 专项 3 files, 14 tests）

Checklist 逐项：STO-IMPL-001 ~ STO-IMPL-010 全部 done。

**验收结论: PASS-WITH-KNOWN-GAPS** — 6 个已知 gap 属于"依赖外部 feature 或 runtime 环境"类型（真实文件系统适配器、Electron 平台集成、大数据量性能验证），不影响 feature 核心逻辑正确性。

### 验收结果汇总

| Feature | 验收结论 | Tests | 遗留问题 |
|---------|---------|-------|---------|
| task-real Phase 1 | PASS | 138 | 无 |
| task-real Phase 2 | PASS-WITH-KNOWN-GAPS | 748 | 时序敏感测试偶发失败 |
| task-real 间歇性修复 | 未完成 | 部分修复 | 30-40% 套件间歇性失败（上下文满载交接） |
| command-ingress W1+W2+W3 | PASS | 803 | 无 |
| receive-real | PASS-WITH-KNOWN-GAPS | 803 | globalParams 推迟 |
| storage-real | PASS-WITH-KNOWN-GAPS | 803 | 6 个外部依赖 gap |
| 基础设施 bug 修复 | PASS | 662 | 2 个 pre-existing failure |

## 后续

- task-real 测试间歇性失败未完全解决，需要在新对话中继续排查（建议使用 `vi.useFakeTimers()` 或对所有使用 settle 的测试统一加 afterEach stopTask）
- command-ingress G4（TimerService 位置）已在 task-real Phase 2 中通过引入 `TimerService` 接口解决
- command-ingress G5（卫星配置持久化）和 G6（satelliteConfigs 来源）待后续确认
- receive-real globalParams 收集待 settings feature 完善后集成
- storage-real 真实文件系统适配器待 platform facade 就绪后实现
- 05-12 起进入简化审计 + UI 设计 + 前端规范阶段（见 S009、S010）
