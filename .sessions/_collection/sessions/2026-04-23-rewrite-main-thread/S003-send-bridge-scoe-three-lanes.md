# [S003] Claude Code 迁移、Send/Bridge/SCOE 三线并行

> 2026-05-06 | 实现阶段 | 已完成

## 目标

从 OpenAI Codex 迁移到 Claude Code，在同一日完成三条并行工作线的推进：

1. Send feature 设计与实现
2. Connection Bridge 平台桥接实现
3. SCOE 设计与出站路由决策

同时在并行对话中推进 Task core 实现和 Result design，以及 Expression Engine shared/ 纯 TypeScript 实现。

## 记录

### 迁移背景

项目此前在 OpenAI Codex 中推进了 S001（架构边界锁定）和 S002（七大基础 feature 实现）。因 Codex 配额耗尽，工作迁移到 Claude Code。迁移时产出了完整 handoff：

- `.sessions/rewrite-claude-handoff/2026-05-06-rewrite-handoff.md`
- `.sessions/rewrite-claude-handoff/2026-05-06-codex-session.md`（完整对话导出）

Handoff 包含：协作偏好、硬规则、当前进度、已知 gap、推荐下一步提示词。

### 线 1: Send Feature

**设计完成**：

- `codestable/features/rewrite-send/rewrite-send-design.md`
- `codestable/features/rewrite-send/rewrite-send-checklist.yaml`（10 steps + 16 checks）
- 核心定位：send owns 单帧发送生命周期（构帧 -> target 解析 -> transport write -> 结果输出）
- send 不了解 task 存在，只接收 `SendRequest + context`

**实现完成**：

- 20 suites / 249 tests（+96 新 send tests），lint 通过，边界检查通过
- 结构：core（types/encode/checksum/validation/clone）+ adapters（ports/fake）+ fixtures + state + selectors + services + index.ts
- Verdict: `pass-with-known-gaps`（真实硬件/runtime 验证 deferred by design）

**Send-Task 边界确认**：

- task owns 调度/编排/序列/pause/resume/stop/retry
- send owns 单帧执行（build -> write -> result）
- send 不 import task internal state，task 不 import send internal state
- 所有发送经 send public service，触发方是 task/runtime 而非 receive

**SendPage 帧列表过滤修复**：direction 值从 `o_send` 改为 `send`。

### 线 2: Connection Bridge

**Bridge Gate Checklist 结果**：

- G1 serialport 兼容性: PASS
- G2 electron-rebuild 流程: PASS
- G3 Vite external 配置: **BLOCK**（需添加 serialport + bindings-cpp 到 rollupOptions.external）
- G4 asarUnpack 配置: **BLOCK**（需添加 `**/*.node` + serialport 目录）
- G5 typed preload bridge shape: PASS
- G6 main resource lifecycle: PASS
- G7 queue/batch 参数: PASS（保守默认值：maxBatchBytes=4096, maxBatchWindowMs=50, maxQueueDepth=100）
- G8 现有测试: PASS（153 tests）

**Phase 1-3 完成**：

- 改动范围：`shared/platform-bridge.ts`（transport bridge 类型）、`main/serial-handlers.ts`（IPC handlers）、preload（typed bridge）、`platform/transport.ts`（facade）、`connection/adapters/real-serial-adapter.ts`
- Verdict: `pass-with-known-gaps`（WSL2 无真实串口、TCP/UDP adapter 未实现、packaged build 未验证）

**高风险项记录**：

- R1: serialport 13 需源码编译（C++ 工具链已齐备）
- R2: WSL2 无法枚举真实串口（开发态用 virtual/mock，最终 Linux 原生）
- R3: asar 打包后 `.node` 路径（需精确 asarUnpack）

**M1 修复**：bridge 实现中发现的问题已修正。

### 线 3: SCOE 设计 + 出站路由

**SCOE 设计完成**：

- `codestable/features/rewrite-scoe/rewrite-scoe-design.md` + checklist.yaml
- SCOE 定位为"外部指令适配器"模式的第一个实现，定义 `ExternalCommandAdapter` 通用模式供 northbound 复用
- SCOE 不需要自己的执行器，翻译命令为 `TaskDefinition` 通过 task 执行

**出站路由决策完成**：

- `codestable/compound/2026-05-06-outbound-routing-and-response-decisions.md`
- 四个核心决策：
  - D1: SCOE 命令帧 targetId 来自 `ScoeCommand` 配置，指向下位机连接
  - D2: Northbound targetId 通过 `deviceId` 映射或 `defaultTargetId`
  - D3: 首轮确认帧只支持固定值（expression runtime deferred）
  - D4: 首轮不做 task-level 并发协调，依赖 send QueueModel
- 三条出站路径（用户/SCOE/Northbound）统一汇聚到 `TaskDefinition -> taskService` 同一入口
- 所有特化配置跟着业务 owner 走，Runtime 不持有业务配置

### 执行引擎统一决策

这是本阶段最重要的跨 feature 决策。

- `codestable/compound/2026-05-06-task-scoe-send-execution-engine-unification.md`
- task 的定位从"本地发送任务调度"调整为**通用执行引擎**
- 核心职责：接收一个执行计划（step 序列），按顺序执行，处理错误，追踪进度
- `TaskStepDefinition` 多态化：
  - `send-step`：构帧 -> 通过 send service 发送 -> 得到 `SendResult`
  - `wait-condition-step`：订阅 receive 事件，等待条件满足或超时
  - `delay-step`：等待指定时长
- 场景映射：
  - 本地定时：`[send-step] x N`
  - 本地触发：`[wait-condition-step] -> [send-step]`
  - 本地序列：`[send-step, delay-step, send-step, ...]`
  - SCOE 命令：`[send-step(命令帧), wait-condition-step(完成条件), send-step(确认帧)]`
  - Northbound：`[send-step, delay-step, ...]` 序列
- 条件匹配归 `task/core`（纯 TypeScript），wait-condition 和 trigger 共用
- send 不变，只做单帧发送
- QueueModel 不受影响，transport-level FIFO

### Task Core 实现

- 21 suites / 330 tests（+81 新 task core tests），lint 通过，边界检查通过
- 文件：core/types.ts + lifecycle.ts + condition-matcher.ts + progress.ts + clone.ts + fixtures/task-fixtures.ts + `__tests__/task-core.spec.ts`
- condition matcher 使用自有 `ConditionMatchInput` 类型，不依赖 receive 内部

### Result Design

- `codestable/features/rewrite-result/rewrite-result-design.md` + checklist.yaml
- result owns 内部结果事实（CaseResult、TaskResultSummary、aggregation rules）
- `TaskInstanceCompletion` 是 result 的唯一素材入口
- Result/Report/Northbound 三层分离原则：
  - result（内部事实层）-> report（文件/格式层）-> northbound（对外交付层）
  - 三段分离，不互相穿透

### Expression Engine

- `rewrite/src/shared/expression/` 下纯 TypeScript 实现
- 已实现 API：compileExpression/evaluate、compileConditional/evaluateConditional、compileGroup/evaluateGroup（含 Kahn 拓扑排序）、defaultMathFunctions（13 个 Math.* 简名函数）
- 零 Vue/Pinia/Electron 依赖，零 store 依赖
- 待后续集成到 receive/task/send 三个 feature

### 产出汇总

| 产出 | 数量 | 关键工件 |
| --- | --- | --- |
| Send design + 实现 | 249 tests | rewrite-send-design.md, send service |
| Bridge Phase 1-3 | 实现完成 | platform-bridge.ts, serial-handlers.ts, real-serial-adapter.ts |
| SCOE design | 文档完成 | rewrite-scoe-design.md |
| 出站路由决策 | 4 项决策 | outbound-routing-and-response-decisions.md |
| 执行引擎统一决策 | 跨 feature 决策 | task-scoe-send-execution-engine-unification.md |
| Task core | 330 tests | task core types/lifecycle/condition-matcher |
| Result design | 文档完成 | rewrite-result-design.md |
| Expression engine | shared/ 实现 | rewrite/src/shared/expression/ |
| Design 更新 | send v2 + task v2 | 两份 design 文档已修订 |

### 决策过程补充（从 JSONL 回溯）

从 15 个 05-06 对话中提取的关键决策过程，补充 S003 原有摘要：

**1. SCOE 入站路径决策（19d0d283, 1.7M）**：用户提供 9 点审查意见，最大开放问题是入站路径。AI 原方案有三种路径，用户拍板"SCOE/northbound 指令码不走 receive"，SCOE adapter 自做协议解析。这是架构级决策，影响 receive 边界和 runtime 路由设计。另锁定 ExternalCommandAdapter 提取到 shared/（推翻 AI 原方案放 SCOE/core）。

**2. Task 执行引擎统一（5fc9a082, 1.4M）**：用户引入 `task-scoe-send-execution-engine-unification.md` 要求审查。2 轮审查发现 checklist 未同步、StepResult 类型缺失。锁定：single 模式合并到 sequence（single = sequence with 1 step）、TaskTriggerSource 只保留在 Definition、TaskStepResult 定义多态联合类型。context 耗尽后续接。

**3. Send DI 模式沉淀（57c2cfa9, 1.2M）**：send 消费 frame/connection 通过 ports.ts 定义的接口，core 层完全不感知其他 feature。用户要求"沉淀一下文档"，产出 `codestable/compound/2026-05-06-learning-cross-feature-di-via-ports.md`。此模式成为后续 task/SCOE/result 的参考模板。

**4. 交叉审查发现 ReadonlyDeep 重复（e4d1cd4d, 454K）**：4 feature 交叉审查发现 `ReadonlyDeep<T>` 在 6 个 feature 各自定义，定为中优先级修复。结论：0 Critical/0 High, 1 Medium(M1), 3 Low。

**5. Bridge G3/G4 解锁（5a8b59b0, 976K）**：package.json 添加 serialport + @electron/rebuild，quasar.config.ts 添加 Vite external + asarUnpack。verify-serialport 通过（枚举 8 端口），153 tests passed。M1 ReadonlyDeep 同时修复。

**6. Shared 提取（141ad298, 249K）**：condition-operators（ComparisonOperator + compareValues, 8 算子 34 tests）和 timer（TimerRegistry, 11 tests）提取到 shared/。198 tests passed。

## 后续

1. **Task service/state/selectors 实现是下一步最大缺口**：task core 已完成，但 service 层尚未实现；send 已实现，task 实现依赖 send public API
2. **Expression Engine 集成**：需在 receive（替代 applyFactor）、task（扩展 condition-matcher）、send（buildFrame 前批量解析）三个 feature 中分别集成
3. **Connection Bridge G3/G4 仍 blocked**：Vite external + asarUnpack 配置改动需要真实环境验证
4. **Result 实现需 task 完成后启动**：`TaskInstanceCompletion` 是 result 的唯一素材入口
5. **Northbound design 尚未启动**：出站路由决策已为 northbound design 打下基础，但正式 design 文档未写
6. **SCOE 实现需 task service 就绪后启动**：SCOE 翻译命令为 `TaskDefinition`，依赖 task service 的完整公开 API
