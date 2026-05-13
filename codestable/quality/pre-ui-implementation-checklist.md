# Pre-UI Implementation Checklist

> **Purpose**: UI 实施前最后一个代码改动对话的直接合同。
> **Scope**: 只包含需要在 UI 实施前完成的代码修改项。UI 实施本身不在此列。
> **Generated**: 2026-05-13
> **Test baseline**: 811 PASS / 5 FAIL（4 receive expression-integration + 1 task skip-step 全局偶发）
> **Note**: 用户此前记录的 12 个失败（7 reconnect + 4 expression + 1 bootstrap）中，reconnect 和 bootstrap 已修复。当前实际 5 个失败。

## Execution Phases

| Phase | 含义 | 阻断性 |
|-------|------|--------|
| **A** | 代码修复（测试失败、文件残留、代码重复） | 阻断后续所有阶段 |
| **B** | 精简清理（死 surface、类型重复、可序列化） | 不阻断 UI，但应在 UI 前清理 |
| **C** | Service gap（UI 前置的 service 方法缺失） | 阻断对应页面 UI 实施 |
| **D** | 基础设施（UnoCSS、文档更新、checklist 回写） | 不阻断 UI，但应同步完成 |
| **Post-UI** | Task-real 类型重组、Connection real bridge 等 | UI 后再执行 |

---

## Phase A: Code Fixes（7 项）

### A1. Receive 表达式集成 pass
- **Feature**: receive
- **来源**: 全量测试 4 FAIL（`receive/__tests__/expression-pass.spec.ts` L376, L394, L412, L461）
- **描述**: receive processor 未实现表达式后处理 pass（compile→evaluate→mark fields）。测试期望输出含 `expressionApplied`/`expressionError` 字段，但 processor 未产生这些字段。Expression engine 本身 112 测试全绿，缺的是 receive 侧集成。
- **涉及文件**: `receive/services/` 或 `core/` 的 processor 逻辑
- **工作量**: 中（2-3h）
- **依赖**: 无
- **状态**: 未开始

### A2. Task skip-step 全局运行时测试隔离
- **Feature**: task
- **来源**: 全量测试 1 FAIL（`task/__tests__/task-service-state-selector.spec.ts` L379）
- **描述**: `skip-step policy continues to next step` 单独运行通过，全局运行失败。疑似测试间共享 state 未隔离。
- **涉及文件**: `task/__tests__/task-service-state-selector.spec.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### A3. Connection selectors/ 目录物理删除
- **Feature**: connection
- **来源**: code-simplification-audit §7 C-S2 执行记录 + 代码验证
- **描述**: 审计声称 selectors/ 已删除，但文件仍存在于磁盘。含与 service 重复的 `matchesTarget`/`toSummary`/`selectReconnectStatus` + 3 个重复 interface（`ConnectionSummary`/`ConnectionTargetQuery`/`ReconnectStatus`）。无外部消费方。
- **涉及文件**: `connection/selectors/connection-selectors.ts`, `connection/selectors/index.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### A4. Connection mapBridgeEvent 代码重复
- **Feature**: connection
- **来源**: 代码验证
- **描述**: `real-serial-adapter.ts` 内部有 `mapBridgeEvent`+`toAdapterErrorKind` 独立副本，与 `internal/map-bridge-event.ts` 完全相同。应删除 serial adapter 内副本，统一从 internal/ 导入。
- **涉及文件**: `connection/adapters/real-serial-adapter.ts` L19-78, `connection/adapters/internal/map-bridge-event.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### A5. Connection clone.ts 文件残留
- **Feature**: connection
- **来源**: code-simplification-audit §7 C-S1 执行记录
- **描述**: clone.ts 逻辑已简化为 deepClone helper（JSON round-trip），但文件仍存在（65行）。审计声称"-83 行"但文件未删。
- **涉及文件**: `connection/core/clone.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 部分完成（逻辑已简化但文件未删）

### A6. Command-Ingress status-timer.ts 文件残留
- **Feature**: command-ingress
- **来源**: code-simplification-audit §7 CI-S3 执行记录 + 代码验证
- **描述**: 逻辑已内联到 service（L109 setInterval），但 `status-timer.ts` 仍存在于磁盘。
- **涉及文件**: `command-ingress/services/status-timer.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 部分完成（逻辑已内联但文件未删）

### A7. Task selector 返回值 readonly 执行强化
- **Feature**: task
- **来源**: design-code-alignment-audit §5 H2, §2.6
- **描述**: 返回类型声明为 `ReadonlyTaskInstanceState` 但实际用 `{ ...instance } as ReadonlyTaskInstanceState`——spread 只做浅拷贝，嵌套对象（`definitionRef`/`stepResults`）仍可变。
- **涉及文件**: `task/selectors/task-selectors.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 部分完成（类型声明存在但运行时未强制）

---

## Phase B: Simplification Cleanup（5 项）

### B1. Frame dead surface 决策
- **Feature**: frame
- **来源**: code-simplification-audit §3 死 surface (frame); design-code-alignment-audit §1.3 NEEDS_REVIEW + M8
- **描述**: `FRAME_INPUT_TYPES`/`FrameInputType` 已从 public index.ts 移除但类型定义仍在 `core/types.ts`。`deserializeFrames` 已导出但零外部消费方。需决策：删除还是降为内部。
- **涉及文件**: `frame/core/types.ts` L15,24; `frame/index.ts` L50; `frame/services/frame-asset-service.ts` L236
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### B2. Connection dead surface + 类型重复清理
- **Feature**: connection
- **来源**: design-code-alignment-audit §1.6; code-simplification-audit §3; 代码验证
- **描述**: ① `createRealNetworkAdapter`/`getReconnectPolicy`/`nextReconnectDelay`/`createFakeConnectionTransportAdapter` 无外部消费方（仅内部测试使用），需决策是否降为内部 export。② `ConnectionSummary`/`ConnectionTargetQuery`/`ReconnectStatus` 在 service 和 core/types.ts 之间重复定义。A3 删除 selectors/ 后 selector 侧重复消除，但 service/types.ts 之间仍重复。
- **涉及文件**: `connection/adapters/real-network-adapter.ts`, `connection/core/reconnect.ts`, `connection/index.ts`, `connection/core/types.ts` L199-216, `connection/services/connection-service.ts` L34-39
- **工作量**: 小（<30min）
- **依赖**: A3

### B3. Command-Ingress HighlightRule 可序列化
- **Feature**: command-ingress
- **来源**: UI audit CI-G4; code-simplification §7 CI-S2
- **描述**: `HighlightRule.match` 是 function，无法序列化到 JSON。需改为数据驱动的 `HighlightRuleConfig`。
- **涉及文件**: `command-ingress/core/highlight.ts`, `command-ingress/core/types.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### B4. Command-Ingress dead surface 决策
- **Feature**: command-ingress
- **来源**: code-simplification-audit §3
- **描述**: `createNorthboundProtocolAdapter`/`buildReadFileAndSendTask`/`buildWaitConditions`/`startStatusTimer` 无外部消费方。旧 NorthboundProtocolAdapter stub 已删，需判断是否重建占位。
- **涉及文件**: `command-ingress/adapters/`, `command-ingress/core/task-builder.ts`, `command-ingress/services/status-timer.ts`
- **工作量**: 小（<30min）
- **依赖**: A6

### B5. Send doc audit 差异修正
- **Feature**: send
- **来源**: design-code-alignment-audit §5 M4
- **描述**: design brainstorm §2.5 写 `compileGroup+evaluateGroup`，代码实际使用 `compileConditional+evaluateConditional`。需更新文档。
- **涉及文件**: `codestable/features/rewrite-send/send-real-brainstorm.md`
- **工作量**: 小（<15min）
- **依赖**: 无
- **状态**: 未开始

---

## Phase C: Service Readiness Gaps（6 项）

### C1. [Task] G1: updateTask 方法
- **Feature**: task
- **来源**: pages-task-send-command-design D-T11 Service Readiness Audit
- **描述**: UI 编辑任务需要 `updateTask(instanceId, partial)` 方法。当前 `TaskService` 接口无此方法。
- **涉及文件**: `task/services/task-service.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### C2. [Task] G2: 历史记录 elapsedMs 派生
- **Feature**: task
- **来源**: pages-task-send-command-design D-T11 Service Readiness Audit
- **描述**: `selectTaskHistory` 返回 `ReadonlyTaskInstanceState[]`，instance 上有 `startedAt`/`completedAt` 但无 `elapsedMs`。UI 需要展示耗时。可通过 progress 获取或 selector 层额外派生。
- **涉及文件**: `task/selectors/task-selectors.ts`
- **工作量**: 小（<30min）
- **依赖**: A7

### C3. [Task] G3: stopAll() 返回 stoppedCount
- **Feature**: task
- **来源**: pages-task-send-command-design D-T11 Service Readiness Audit
- **描述**: `stopAll()` 当前返回 `void`。UI 需要知道停了多少个任务。
- **涉及文件**: `task/services/task-service.ts` L249-258
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### C4. [Command-Ingress] CI-G1: 命令执行日志
- **Feature**: command-ingress
- **来源**: pages-task-send-command-design D-CI1 Service Readiness Audit
- **描述**: 无 `CommandLogEntry` 类型和 `CommandLogRecorder`。UI 命令执行日志 DataTable 无数据源。
- **涉及文件**: `command-ingress/services/`（扩展 service）, `command-ingress/core/types.ts`
- **工作量**: 中（1-2h）
- **依赖**: 无
- **状态**: 未开始

### C5. [Command-Ingress] CI-G2: 测试工具原始接收数据
- **Feature**: command-ingress
- **来源**: pages-task-send-command-design D-CI2 Service Readiness Audit
- **描述**: service 未暴露 testDataRecorder，adapter consume 时未同步记录 raw bytes。测试工具无法查看原始接收数据。
- **涉及文件**: `command-ingress/services/command-ingress-service.ts`, `command-ingress/adapters/scoe-protocol-adapter.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### C6. [Command-Ingress] CI-G3: sendTestData 方法
- **Feature**: command-ingress
- **来源**: pages-task-send-command-design D-CI3 Service Readiness Audit
- **描述**: 无 `sendTestData(hexString)` 方法。测试工具发送区无法发送 HEX 数据。
- **涉及文件**: `command-ingress/services/command-ingress-service.ts`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

---

## Phase D: Infrastructure & Documentation（7 项）

### D1. UnoCSS spacing scale 映射
- **Feature**: 基础设施
- **来源**: CLAUDE.md 规范（"UnoCSS theme 中的 spacing scale 映射到与 `--rw-space-*` 相同的设计值"）
- **描述**: `uno.config.ts` 只有空壳 `presetUno()`，无 theme.spacing 定义。CLAUDE.md 要求 `gap-3` 和 `var(--rw-space-3)` 视觉一致。spacing token 值在 `uno.config.ts` theme 中维护。
- **涉及文件**: `rewrite/uno.config.ts`
- **工作量**: 中（1-2h）
- **依赖**: 无
- **状态**: 未实施

### D2. Connection checklist 状态回写
- **Feature**: connection
- **来源**: 代码验证
- **描述**: 17 个 checklist item 全部仍为 pending，但实际 core/service/state/adapter 层已通过验收。
- **涉及文件**: `codestable/features/rewrite-connection/rewrite-connection-checklist.yaml`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### D3. Bootstrap checklist 状态回写
- **Feature**: bootstrap/runtime
- **来源**: 代码验证
- **描述**: 5 个 step 仍为 pending，但代码已全部实现。
- **涉及文件**: `codestable/features/bootstrap/bootstrap-checklist.yaml`
- **工作量**: 小（<30min）
- **依赖**: 无
- **状态**: 未开始

### D4. Frame 验收文档路径更新
- **Feature**: frame
- **来源**: acceptance L24, L67; design-code-alignment-audit M6
- **描述**: 验收文档中 `core/legacy.ts` 路径需更新为 `core/legacy-normalizers.ts`。
- **涉及文件**: `codestable/features/rewrite-frame/frame-real-acceptance.md`
- **工作量**: 小（<15min）
- **依赖**: 无
- **状态**: 未开始

### D5. 设计文档更新（7 处 API 名称/签名差异）
- **Feature**: 跨 feature
- **来源**: design-code-alignment-audit M1-M8
- **描述**: 设计文档与代码实际 API 名称/签名不一致。含：Connection `selectConnectionSummaries` 过时引用（M1）、expression API 名称 `compileConditional` vs 文档写的 `compileGroup`（M4）、Frame 验收路径（M6）等。
- **涉及文件**: 多份 design 文档
- **工作量**: 小（<1h）
- **依赖**: 无
- **状态**: 未开始

### D6. Report feature 补测试
- **Feature**: report
- **来源**: 测试结果
- **描述**: report feature 零测试文件。其他已验收 feature 均有测试覆盖。
- **涉及文件**: `rewrite/src/features/report/`（需新建 `__tests__/`）
- **工作量**: 中（1-2h）
- **依赖**: 无
- **状态**: 未开始

### D7. Receive-display bridge 类型对齐
- **Feature**: runtime
- **来源**: design-code-alignment-audit L4
- **描述**: `receive-display-bridge.ts` 使用 `frameId`/`fieldId` 构造 `DisplayFieldMaterial`，但该类型字段名是 `groupId`/`dataItemId`。存在 TS 编译错误。当前零消费方不阻断，但应在 UI 前修。
- **涉及文件**: `rewrite/src/runtime/bridges/receive-display-bridge.ts`
- **工作量**: 小（<15min）
- **依赖**: 无
- **状态**: 未修

---

## Post-UI: 延后到 UI 后执行（3 组）

### PU1. Task-real 核心类型重组（~30 项）— 已移至 Wave 0

**已整合到 `codestable/features/pre-ui-service-design.md` Wave 0 (W0-1~W0-9)，与 UI 前其他 service 改动一起执行。**

task G1-G3（updateTask/elapsedMs/stopAll 返回值）合并到 W0-6 一起实施。

### PU2. Connection Real Bridge（main/preload/platform）
- **Feature**: connection
- **来源**: bridge-implementation-design 全文
- **描述**: Serial/TCP/UDP 真实平台链路。含：main process transport handler、preload typed bridge、platform facade transport primitive、native dependency setup（serialport + electron-rebuild + Vite external + asarUnpack）、event model/queue/backpressure、UDP 多目标 writeTo 扩展。当前只有 fake adapter + real adapter 骨架（依赖 TransportFacade 但 platform 层仍是 stub）。
- **涉及文件**: `rewrite/src/platform/`, `rewrite/src-electron/main/`, `rewrite/src-electron/preload/`, `rewrite/package.json`, `quasar.config.ts`
- **工作量**: 大（8-16h）
- **依赖**: Connection 页面 UI 基本完成后

### PU3. Command-Ingress routingTick 消费者链集成
- **Feature**: command-ingress + runtime
- **来源**: design §1.1-1.3 / checklist C1, C19
- **描述**: `routing-tick.ts` 仍硬编码 `dataEvents→receive`，未实现消费者链模式。`feature-wiring.ts` 无 `eventConsumers` 字段。`RoutingTickResult` 未扩展 `consumerConsumed` 统计。
- **涉及文件**: `runtime/routing-tick.ts`, `runtime/feature-wiring.ts`, `runtime/consumer-chain.ts`
- **工作量**: 中（1-3h）
- **依赖**: 无

### PU4. Connection 暂缓策略决策（5 项）
- **Feature**: connection
- **来源**: design §4.3 ledger, §4.13 deferred
- **描述**: ① Serial option update while connected 策略未定 ② TCP \r\n split ownership 未定 ③ High-speed storage short-circuit boundary 未登记为 runtime exception ④ SCOE fixed TCP server / UDP source/target exception 未登记 ⑤ Northbound deviceId 与 transport target separation 未澄清。另含：Serial 自动重连写死 disabled 需启用时改代码+补 discovery 前置检查。
- **涉及文件**: 跨 feature 设计
- **工作量**: 中（需讨论决策）
- **依赖**: PU2

---

## 已完成项概要

### Frame（核心全部完成）
- FR-NOUN-001~005 全部完成, FR-ORCH-001~003 全部完成
- F-S1/F-S2 简化完成, F-R1 readiness 补丁完成
- SC1-SC8 验收场景全过, 39 测试全绿

### Connection（core/service 完成, real bridge 未开始）
- C-S1 clone 简化完成, C-S2 selectors 逻辑已内联（文件未删 → A3）
- C-R1~C-R4 readiness 补丁完成
- Reconnect 策略核心实现完成, 65 测试全绿（7 reconnect 失败已修复）

### Send（核心全部完成）
- SC1-SC17 全部 17 个验收场景通过
- 构帧管线 9 步 pipeline 完整
- `evaluateFieldPreview` + `evaluateFieldPreviewForUI` 已实现并 re-export
- S-S1/S-S2/S-S3 简化完成, 68 测试全绿

### Task（基础功能完成, 类型重组未开始）
- `ConditionTerm` + `evaluateConditionGroup` AND/OR 已实现
- `ConditionRegistry.registerGroup`/`unregisterGroup` 已实现
- Readiness 补丁全部完成（validateTaskDefinition +55行, step builders +75行, selectActiveInstances +5行, retryTask/stopAll +35行, serialize/deserialize +20行）
- 70+ 基础 + 31 readiness 测试通过

### Command-Ingress（核心完成, routingTick 未集成）
- C2-C18 core/adapter/handler 全部实现
- CI-S1~S3 简化执行, CI-R1~R5 readiness 补丁完成
- 114 测试全绿

### Runtime + Bootstrap
- Runtime wiring 完整实现（28 测试全绿）
- AppShell 集成完成（`bootstrapRewriteRuntime()` + `startTickDriver()` + `onUnmounted destroy()`）
- Bootstrap 全链路已实现（3 测试全绿）
- Platform File Facade 已实现（`readTextFile`/`writeTextFile`/`showSaveDialog`/`showOpenDialog`）

### Shared / Expression Engine
- 112 测试全绿, 引擎本身已验收
- Receive 侧表达式集成 pass 未实现（→ A1）

### 已验收 Feature 测试状态

| Feature | PASS | FAIL | 说明 |
|---------|------|------|------|
| receive | 19 | 4 | expression-integration |
| storage-local-baseline | 14 | 0 | |
| display | 49 | 0 | |
| status | 26 | 0 | |
| settings | 23 | 0 | |
| result | 13 | 0 | |
| report | 0 | 0 | 零测试 |
| **总计** | **811** | **5** | |

---

## 工作量汇总

| Phase | 项数 | 预估总工时 | 阻断性 |
|-------|------|-----------|--------|
| A: Code Fixes | 7 | ~4h | 阻断后续 |
| B: Simplification | 5 | ~2h | 不阻断 UI |
| C: Service Gaps | 6 | ~4h | 阻断对应页面 |
| D: Infrastructure | 7 | ~4h | 不阻断 UI |
| **Pre-UI 合计** | **25** | **~14h** | |
| Post-UI | 4 组 | ~20h+ | UI 后执行 |
