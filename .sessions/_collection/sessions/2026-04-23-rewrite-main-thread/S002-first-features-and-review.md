# [S002] 七大基础 feature 实现与交叉审查

> 2026-04-29 ~ 2026-05-06 | 实现阶段 | 已完成

## 目标

在架构基线（S001）锁定的骨架上，完成七大基础 feature 的小闭环（design -> checklist -> impl -> test），并通过交叉审查确认质量门禁。同时推进 send/task/SCOE 设计、connection bridge 真实平台对接、表达式引擎实现等多条并行工作线，将重写从"架构就绪"推进到"核心 service 层可工作"。

## 记录

### 七大基础 feature 小闭环

以下七个 feature 均完成了 design -> checklist -> impl -> test 闭环，产物包括 `codestable/features/rewrite-{name}/` 下的 design.md + checklist.yaml，以及 `rewrite/src/features/{name}/` 下的 TypeScript 实现。

| Feature | 归口 | 关键产出 | 测试规模 | Verdict |
| --- | --- | --- | --- | --- |
| frame | 静态帧资产、字段/表达式定义、校验、legacy 迁移 pilot | core/service/state/selector/public index | 含在总计内 | pass-with-known-gaps |
| settings | 配置事实、默认值、normalize、snapshot | config facts/defaults/normalize/snapshot | 含在总计内 | pass-with-known-gaps |
| storage-local-baseline | 本地素材/历史/CSV 候选、fake adapter 边界 | core/fake adapter/history/CSV/material | 含在总计内 | pass-with-known-gaps |
| connection | 传输配置、运行时连接事实、lifecycle/error/event、fake/real transport port 边界 | transport-only fake adapter/state/service/selectors | 含在总计内 | pass-with-known-gaps |
| receive | receive 匹配、解析输出、receive 运行时事实、统计/read model | receive matching/read model/fake input | 含在总计内 | pass-with-known-gaps |
| status | 健康摘要、状态指示器、状态 read model/UI-safe snapshot | health summary/indicator read model/UI-safe snapshot | 15 files / 127 tests | pass-with-known-gaps |
| display | 展示偏好、table/chart/constellation 投影、UI-safe display snapshot | display preferences and table/chart/constellation projection | 16 suites / 153 tests | pass-with-known-gaps |

累计基线：16 suites / 153 tests 通过，lint 通过，rg 边界检查通过。

所有 feature 的 known-gaps 均为"真实硬件/runtime 验证 deferred by design"，不代表缺陷。Feature 结构统一遵循：

```text
core/     -- 纯 TypeScript，零 Vue/Pinia/Electron 依赖
state/    -- Pinia store
services/ -- feature 内 service
selectors/ -- 只读快照
fixtures/ -- 测试素材
__tests__/ -- 单测
index.ts  -- public API surface
```

### 交叉审查

对 receive / status / display / connection 四个 feature 及 connection bridge implementation design 进行独立交叉审查，审查结果为 **PASS-WITH-KNOWN-GAPS**。

**Critical / High：无。**

**Medium（M1）：ReadonlyDeep\<T\> 在 6 个 feature 各自重复定义。**
- 位置：connection/frame/settings/storage-local-baseline/status/display 的 core/types.ts
- 修复：抽取到 `rewrite/src/shared/types/readonly-deep.ts`，各 feature 改为 import
- M1 已在同一阶段内修复完成

**Low（备查，不阻塞）：**
- L1: NormalizedTransportEventInput 内联复杂 Omit 交叉类型（connection/core/types.ts）
- L2: Display chartHistory Map 内部可变（封装内不导出）
- L3: Status BufferedMaterial 内部可变数组（封装内不导出）

**四项审查任务结论：**
1. Public API 互相拉扯：PASS，四 feature 均遵守类型+工厂+selector 规则，无 mutable 导出
2. status/display 底层事实越界：PASS，均自定义扁平输入 material，不 import 底层 feature
3. connection bridge design readiness：PASS-WITH-KNOWN-GAPS，design 达到 ready 门槛
4. 边界检查：PASS，零越界、零内部 subpath 穿透、零平台依赖泄漏

### M1 ReadonlyDeep 修复

新建 `rewrite/src/shared/types/readonly-deep.ts`，6 个 feature 的 core/types.ts 改为从 shared import。验证：153 tests 通过，lint 通过，rg 边界检查不变。这是 shared/ 层的首次提取，验证了"同一模式在 2+ feature 中出现时提取到 shared"的规则。

### Send Feature

**设计完成。** 产出 `codestable/features/rewrite-send/rewrite-send-design.md` + `rewrite-send-checklist.yaml`（10 steps + 16 checks）。

核心决策：send owns 单帧发送生命周期（构帧 -> target 解析 -> transport write -> 结果输出）。

与 task 的边界建议：
- task owns 调度/编排/序列/pause/resume/stop/retry
- send owns 单帧执行（build -> write -> result）
- send 不了解 task 存在，只接收 SendRequest + context
- task 不 import send internal state

**实现完成。** 20 suites / 249 tests（+96 新 send tests），lint 通过，边界检查通过。结构：core（types/encode/checksum/validation/clone）+ adapters（ports/fake）+ fixtures + state + selectors + services + index.ts。Verdict: pass-with-known-gaps。

### Task Feature

**设计完成。** 产出 `codestable/features/rewrite-task/rewrite-task-design.md` + `rewrite-task-checklist.yaml`。

核心决策：
- task = 通用执行引擎（不是"本地发送调度"）
- task owns 调度模式（timed/trigger/sequence）、用例执行上下文、lifecycle（created -> running -> paused -> stopped/completed/failed）、进度追踪、错误策略
- stop ≠ completed（重要：northbound 要求 stopped 状态）
- error policy：retry/skip/stop/pause，默认 stop-on-first-failure

**Core 实现完成。** 21 suites / 330 tests（+81 新 task core tests），lint 通过，边界检查通过。

文件：core/types.ts + lifecycle.ts + condition-matcher.ts + progress.ts + clone.ts + fixtures/task-fixtures.ts + \_\_tests\_\_/task-core.spec.ts。

关键：condition matcher 使用自有 ConditionMatchInput 类型，不依赖 receive 内部。

### 执行引擎统一决策

产出文档：`codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`

核心决策：
- task = 通用执行引擎
- step 多态化：send-step / wait-condition-step / delay-step
- SCOE 不需要自己的执行器，翻译命令为 TaskDefinition 通过 task 执行
- 条件匹配归 task/core，wait-condition 和 trigger 共用

场景映射：
- 本地定时：[send-step] x N
- 本地触发：[wait-condition-step] -> [send-step]
- 本地序列：[send-step, delay-step, send-step, ...]
- SCOE 命令：[send-step(命令帧), wait-condition-step(完成条件), send-step(确认帧)]
- Northbound 用例：[send-step, delay-step, ...] 序列

### Connection Bridge

**Bridge Prep 完成。** Gate Checklist：
- G1 serialport 兼容性：PASS
- G2 electron-rebuild 流程：PASS
- G3 Vite external 配置：初始 BLOCK，后解锁
- G4 asarUnpack 配置：初始 BLOCK，后解锁
- G5 typed preload bridge shape：PASS
- G6 main resource lifecycle：PASS
- G7 queue/batch 参数：PASS（保守默认值：maxBatchBytes=4096, maxBatchWindowMs=50, maxQueueDepth=100）
- G8 现有测试：PASS（153 tests）

**Bridge Phase 1-3 实现。** 改动涉及：
- shared/platform-bridge.ts（transport bridge 类型）
- main/serial-handlers.ts（IPC handlers）
- preload（typed bridge）
- platform/transport.ts（facade）
- connection/adapters/real-serial-adapter.ts

G3/G4 解锁：package.json 新增 serialport 和 @electron/rebuild，quasar.config.ts 配置 Vite external + asarUnpack。验证：rebuild 成功、SerialPort.list() 枚举 8 端口、153 tests 通过。

Verdict: pass-with-known-gaps（WSL2 无真实串口、TCP/UDP adapter 未实现、packaged build 未验证）。

### SCOE Design

产出 `codestable/features/rewrite-scoe/rewrite-scoe-design.md` + `rewrite-scoe-checklist.yaml`。

核心决策：SCOE 是"外部指令适配器"模式的第一个实现，定义了 ExternalCommandAdapter 通用模式供 northbound 复用。

### Outbound Routing 决策

产出 `codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`。

4 个决策：
- D1: SCOE 命令帧 targetId 来自 ScoeCommand 配置，指向下位机连接
- D2: Northbound targetId 通过 deviceId 映射或 defaultTargetId
- D3: 首轮确认帧只支持固定值（expression runtime deferred）
- D4: 首轮不做 task-level 并发协调，依赖 send QueueModel

### Result Feature

**设计完成。** 产出 `codestable/features/rewrite-result/rewrite-result-design.md` + `rewrite-result-checklist.yaml`。

核心决策：
- result owns 内部结果事实（CaseResult、TaskResultSummary、aggregation rules）
- result 不直接消费独立 send/receive event，所有素材经 TaskInstanceCompletion + TaskStepResult 统一进入
- Result / Report / Northbound 三层分离：result（内部事实层）-> report（文件/格式层）-> northbound（对外交付层）
- TaskInstanceCompletion 是 result 的唯一素材入口

### 表达式引擎

**实现完成。** 位于 `rewrite/src/shared/expression/`，纯 TypeScript，零 Vue/Pinia/Electron 依赖。

已实现 API：
- compileExpression / evaluate -- 单表达式编译+求值
- compileConditional / evaluateConditional -- 多分支条件表达式
- compileGroup / evaluateGroup -- 批量表达式（含 Kahn 拓扑排序）
- defaultMathFunctions -- 13 个 Math.* 简名函数

待集成到三个消费方：
1. Receive：替代 field-parser.ts:applyFactor
2. Task：扩展 condition-matcher.ts:evaluateCondition
3. Send：encode.ts:buildFrame 前批量解析

设计文档：`codestable/features/2026-05-08-expression-engine/expression-engine-design.md`

### 三线并行

本阶段末期（05-06），三条工作线并行推进并全部完成：

1. **Send 实现**：20 suites / 249 tests，pass-with-known-gaps
2. **Connection Bridge Phase 1-3**：真实串口桥接实现，pass-with-known-gaps
3. **SCOE 设计 + Outbound Routing 决策**：design + checklist + 4 个 routing 决策锁定

### Codex -> Claude Code 工具迁移

本阶段始于 OpenAI Codex，因 quota 耗尽在中途迁移到 Claude Code。迁移产出：
- `.sessions/rewrite-claude-handoff/2026-05-06-codex-session.md`（477K 完整对话记录）
- `.sessions/rewrite-claude-handoff/2026-05-06-rewrite-handoff.md`（结构化交接文档）

交接文档覆盖：即时读取顺序、协作偏好、硬规则、当前进度摘要、已知 gaps 和 blockers、当前代码结构、feature owner 汇总、下一步建议及可直接使用的 Claude Code 提示词。

## 后续

- Task service/state/selectors 实现是下一步最大缺口（依赖 send public API）
- Result 实现可在 task 完成后启动
- 表达式引擎待集成到 receive/send/task 三个消费方
- Bridge 真实硬件验证（串口、TCP/UDP、packaged build）pending
- Receive-real 实现未启动
- SCOE 实现未启动
- Northbound / Report / file delivery 未启动
